// .env грузим ДО AppModule: TypeOrmModule.forRoot читает process.env при сборке модуля.
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthEntity } from '../src/auth/entities/auth.entity';
import { RefreshTokenEntity } from '../src/auth/entities/refresh-token.entity';
import { BuisnesEntity } from '../src/buisnes/entities/buisnes.entity';
import { BookingEntity } from '../src/buisnes/entities/booking.entity';

/**
 * E2E: весь путь клиента вокруг брони.
 *
 * В отличие от юнит-тестов тут НЕТ моков: поднимается настоящее приложение,
 * настоящий Postgres и настоящий Redis. Проверяем то, что юнит проверить не может:
 * реальную валидацию DTO, реальные HTTP-статусы и реальную гонку в БД.
 *
 * Требует поднятых Postgres и Redis (как для обычного запуска приложения).
 * Запуск: npm run test:e2e
 */
describe('Buisnes: слоты и брони (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // уникальные email на каждый прогон → тесты можно гонять повторно
  const stamp = Date.now();
  const ownerEmail = `owner_${stamp}@mail.com`;
  const masterEmail = `master_${stamp}@mail.com`;
  const password = 'P@ssw0rd';

  let ownerToken: string;
  let buisnesId: string;
  let serviceId: string;
  let masterId: string;

  // день брони: +14 дней от сегодня. Салон в UTC → local == UTC, считать проще.
  const day = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at = (hhmm: string) => `${day}T${hhmm}:00.000Z`;

  // второй день: рабочие часы 09:00–13:00 первого дня разбираются тестами броней
  // до последнего слота, а тестам очереди нужен свободный. Проще взять отдельный день.
  const day2 = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at2 = (hhmm: string) => `${day2}T${hhmm}:00.000Z`;

  // рабочее время на все дни недели — тест не зависит от того, на какой день выпало +14
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        .map((d) => [d, { open, close }]),
    );

  const booking = (starts_at: string, over: object = {}) => ({
    master_id: masterId,
    service_id: serviceId,
    starts_at,
    client_name: 'Иван',
    client_phone: '+380777777777',
    ...over,
  });

  beforeAll(async () => {
    // Rate limit мешает: на /booking стоит 5 запросов в минуту с одного IP, а тесты шлют
    // больше. Сам лимит проверяется отдельно, здесь он только шумит 429-ми.
    //
    // Почему именно spyOn прототипа, а не overrideGuard/overrideProvider: гвард повешен
    // как { provide: APP_GUARD, useClass: ThrottlerGuard }. Nest собирает глобальные
    // гварды по токену APP_GUARD особым механизмом на бутстрапе, и подмена провайдера
    // его не перехватывает. Заглушка на прототипе работает независимо от DI.
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // повторяем настройку из main.ts, иначе валидация DTO в тестах не работает
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const server = app.getHttpServer();

    // --- ARRANGE: собираем салон целиком, как это сделал бы живой владелец ---

    const reg = await request(server)
      .post('/auth/registration')
      .send({ email: ownerEmail, password })
      .expect(201);
    ownerToken = reg.body.accessToken;

    const salon = await request(server)
      .post('/buisnes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Салон ${stamp}`, address: 'Крещатик 1', timezone: 'UTC' })
      .expect(201);
    buisnesId = salon.body.id;

    const svc = await request(server)
      .post('/buisnes/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ service: 'Стрижка', duration: 60, price: 500, buisnes_id: buisnesId })
      .expect(201);
    serviceId = svc.body.id;

    const master = await request(server)
      .post('/buisnes/masters')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: masterEmail, password, name: 'Аня', specialism: 'Парикмахер',
        description: 'опыт', photo: '/uploads/a.jpg',
        work_time: allWeek('09:00', '13:00'),
        services: [{ id: serviceId }],
        buisnes_id: buisnesId,
      })
      .expect(201);
    masterId = master.body.id;
  });

  afterAll(async () => {
    // --- CLEANUP: без уборки повторный прогон будет мусорить в БД ---
    if (dataSource?.isInitialized) {
      await dataSource.getRepository(BookingEntity).delete({ master_id: masterId });
      // masters/services уйдут каскадом за салоном и аккаунтом
      await dataSource.getRepository(BuisnesEntity).delete({ id: buisnesId });
      const users = await dataSource.getRepository(AuthEntity)
        .createQueryBuilder('a')
        .where('a.email IN (:...emails)', { emails: [ownerEmail, masterEmail] })
        .getMany();
      for (const u of users) {
        await dataSource.getRepository(RefreshTokenEntity).delete({ user_id: u.id });
        await dataSource.getRepository(AuthEntity).delete({ id: u.id });
      }
    }
    await app?.close();
  });

  // ===========================================================================
  describe('GET /buisnes/slots', () => {
    it('невалидный query (не UUID / кривая дата) → 400 от ValidationPipe', async () => {
      await request(app.getHttpServer())
        .get('/buisnes/slots')
        .query({ master_id: 'не-uuid', date: '10.06.2030', service_id: serviceId })
        .expect(400);
    });

    it('свободный день → слоты с шагом 15 мин, последний влезает до закрытия', async () => {
      const res = await request(app.getHttpServer())
        .get('/buisnes/slots')
        .query({ master_id: masterId, date: day, service_id: serviceId })
        .expect(200);

      // работа 09:00–13:00, услуга 60 мин → старты с 09:00 по 12:00
      expect(res.body[0]).toBe('09:00');
      expect(res.body).toContain('12:00');
      expect(res.body).not.toContain('12:15'); // 12:15 + 60 = 13:15 > 13:00
    });
  });

  // ===========================================================================
  describe('POST /buisnes/booking', () => {
    it('невалидное тело (кривой телефон) → 400', async () => {
      await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('09:00'), { client_phone: '12345' }))
        .expect(400);
    });

    it('время не кратно 15 минутам → 400', async () => {
      await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('09:07')))
        .expect(400);
    });

    it('время вне рабочих часов → 400', async () => {
      await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('20:00')))
        .expect(400);
    });

    it('валидная бронь → 201, ends_at считает сервер (+60 мин)', async () => {
      const res = await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('09:00')))
        .expect(201);

      expect(res.body.id).toBeDefined();
      const ms = new Date(res.body.ends_at).getTime() - new Date(res.body.starts_at).getTime();
      expect(ms).toBe(60 * 60_000);
    });

    it('слот занят → 409, и он пропал из /slots (кэш сброшен)', async () => {
      // повтор той же брони
      await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('09:00')))
        .expect(409);

      const slots = await request(app.getHttpServer())
        .get('/buisnes/slots')
        .query({ master_id: masterId, date: day, service_id: serviceId })
        .expect(200);

      // 09:00 занято, а 09:15..09:45 пересекаются с 09:00–10:00 → первый свободный 10:00
      expect(slots.body).not.toContain('09:00');
      expect(slots.body[0]).toBe('10:00');
    });
  });

  // ===========================================================================
  describe('Гонка: два клиента жмут «записаться» на один слот одновременно', () => {
    it('ровно одна бронь в БД: один 201, второй 409', async () => {
      const server = app.getHttpServer();
      const slot = at('11:00'); // ещё свободен

      // Promise.all → запросы уходят не дожидаясь друг друга = настоящая параллельность
      const results = await Promise.all([
        request(server).post('/buisnes/booking').send(booking(slot)),
        request(server).post('/buisnes/booking').send(booking(slot)),
      ]);

      const statuses = results.map((r) => r.status).sort();
      console.log(`[RACE] статусы двух одновременных броней: ${statuses.join(', ')}`);

      expect(statuses).toEqual([201, 409]);

      // истина в последней инстанции — что реально лежит в БД
      const rows = await dataSource.getRepository(BookingEntity).count({
        where: { master_id: masterId, starts_at: new Date(slot), status: 'confirmed' },
      });
      expect(rows).toBe(1);
    });
  });

  // ===========================================================================
  describe('Идемпотентность (Idempotency-Key)', () => {
    it('повтор с тем же ключом не создаёт вторую бронь', async () => {
      const server = app.getHttpServer();
      const slot = at('12:00');
      const key = `idem-${stamp}`;

      const first = await request(server)
        .post('/buisnes/booking')
        .set('Idempotency-Key', key)
        .send(booking(slot))
        .expect(201);

      // тот же ключ, то же тело — как будто клиент нажал кнопку дважды / сеть моргнула
      const second = await request(server)
        .post('/buisnes/booking')
        .set('Idempotency-Key', key)
        .send(booking(slot));

      // либо вернули ту же бронь (200/201), либо честно сказали «уже обрабатывается» (409),
      // но дубля в БД быть не должно ни при каком раскладе
      expect([200, 201, 409]).toContain(second.status);

      const rows = await dataSource.getRepository(BookingEntity).count({
        where: { master_id: masterId, starts_at: new Date(slot), status: 'confirmed' },
      });
      expect(rows).toBe(1);
      expect(first.body.id).toBeDefined();
    });
  });

  // ===========================================================================
  describe('GET /buisnes/master/booking', () => {
    it('без токена → 401', async () => {
      await request(app.getHttpServer()).get('/buisnes/master/booking').expect(401);
    });

    it('мастер видит свои записи, сгруппированные по дате', async () => {
      const login = await request(app.getHttpServer())
        .post('/buisnes/login')
        .send({ email: masterEmail, password })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/buisnes/master/booking')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      // ключи — даты YYYY-MM-DD
      for (const k of Object.keys(res.body)) {
        expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  // ===========================================================================
  describe('PATCH /buisnes/booking/:id/cancel', () => {
    let bookingId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(at('10:00')))
        .expect(201);
      bookingId = res.body.id;
    });

    it('без токена → 401', async () => {
      await request(app.getHttpServer())
        .patch(`/buisnes/booking/${bookingId}/cancel`)
        .expect(401);
    });

    it('id не UUID → 400 (ParseUUIDPipe)', async () => {
      await request(app.getHttpServer())
        .patch('/buisnes/booking/не-uuid/cancel')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('чужой владелец → 403', async () => {
      const other = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({ email: `other_${stamp}@mail.com`, password })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/buisnes/booking/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${other.body.accessToken}`)
        .expect(403);

      // уборка чужого аккаунта
      const u = await dataSource.getRepository(AuthEntity)
        .findOne({ where: { email: `other_${stamp}@mail.com` } });
      if (u) {
        await dataSource.getRepository(RefreshTokenEntity).delete({ user_id: u.id });
        await dataSource.getRepository(AuthEntity).delete({ id: u.id });
      }
    });

    it('владелец → 200, статус cancelled, слот снова свободен', async () => {
      await request(app.getHttpServer())
        .patch(`/buisnes/booking/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const row = await dataSource.getRepository(BookingEntity)
        .findOne({ where: { id: bookingId } });
      expect(row?.status).toBe('cancelled');

      // отмена освободила 10:00 → он вернулся в выдачу слотов
      const slots = await request(app.getHttpServer())
        .get('/buisnes/slots')
        .query({ master_id: masterId, date: day, service_id: serviceId })
        .expect(200);
      expect(slots.body).toContain('10:00');
    });
  });

  // ===========================================================================
  // Очередь писем: тут настоящий Redis и настоящий BullMQ. Юнит проверяет, что
  // сервис зовёт add() с нужными аргументами; здесь — что задача реально легла
  // в Redis и её видно снаружи.
  // ===========================================================================
  describe('Очередь писем (BullMQ)', () => {
    let emailsQueue: Queue;
    let bookingId: string;
    const slot = at2('09:00');

    beforeAll(async () => {
      emailsQueue = app.get<Queue>(getQueueToken('emails'));

      const res = await request(app.getHttpServer())
        .post('/buisnes/booking')
        .send(booking(slot))
        .expect(201);
      bookingId = res.body.id;
    });

    afterAll(async () => {
      // не оставляем за собой задачи в общем Redis
      for (const name of ['booking-created', 'booking-cancelled', 'booking-remainder']) {
        await emailsQueue.remove(`${name}_${bookingId}`).catch(() => undefined);
      }
    });

    it('создали бронь → в очереди есть задача booking-created', async () => {
      const job = await emailsQueue.getJob(`booking-created_${bookingId}`);

      expect(job).toBeDefined();
      expect(job!.data).toEqual({ bookingId });
    });

    it('создали бронь → напоминание отложено ровно на «за час до начала»', async () => {
      const job = await emailsQueue.getJob(`booking-remainder_${bookingId}`);
      expect(job).toBeDefined();

      // delay у BullMQ — сколько ждать ОТ МОМЕНТА ПОСТАНОВКИ, а не абсолютное время.
      // Если сюда попадёт timestamp, письмо уедет на десятки лет вперёд и никто не заметит.
      const expected = new Date(slot).getTime() - 60 * 60 * 1000 - Date.now();
      expect(job!.opts.delay).toBeGreaterThan(expected - 60_000);
      expect(job!.opts.delay).toBeLessThan(expected + 60_000);
    });

    it('отменили бронь → напоминание снято из очереди', async () => {
      await request(app.getHttpServer())
        .patch(`/buisnes/booking/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // иначе клиент получит напоминание о брони, которой уже нет
      const reminder = await emailsQueue.getJob(`booking-remainder_${bookingId}`);
      expect(reminder).toBeUndefined();
    });

    it('отменили бронь → поставлена задача booking-cancelled', async () => {
      const job = await emailsQueue.getJob(`booking-cancelled_${bookingId}`);

      expect(job).toBeDefined();
      expect(job!.data).toEqual({ bookingId });
    });
  });
});
