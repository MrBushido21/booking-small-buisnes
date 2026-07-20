import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BuisnesService } from './buisnes.service';
import { AuthService } from 'src/auth/auth.service';
import { AuthEntity } from 'src/auth/entities/auth.entity';
import { BuisnesEntity } from './entities/buisnes.entity';
import { MasterEntity } from './entities/master.entity';
import { ServicesEntity } from './entities/services.entity';
import { BookingEntity } from './entities/booking.entity';

const owner = { id: 'owner-1', email: 'owner@mail.com', role: 'owner' } as AuthEntity;
const master = { id: 'master-auth-1', email: 'm@mail.com', role: 'master' } as AuthEntity;

describe('BuisnesService', () => {
  let service: BuisnesService;

  let authService: { createMaster: jest.Mock; login: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let masterTxRepo: { create: jest.Mock; save: jest.Mock };
  let manager: { getRepository: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let buisnesRepo: { findOne: jest.Mock; save: jest.Mock };
  let masterRepo: { findOne: jest.Mock; update: jest.Mock };
  let servicesRepo: { find: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let bookingRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; keys: jest.Mock };
  let emailsQueue: { add: jest.Mock; remove: jest.Mock };

  // то, что вернёт проверка пересечения внутри транзакции createBooking.
  // null = слот свободен. Тесты переопределяют, когда нужен конфликт.
  let bookingConflict: object | null;

  beforeEach(async () => {
    jest.clearAllMocks();
    bookingConflict = null;

    authService = { createMaster: jest.fn(), login: jest.fn() };
    masterTxRepo = { create: jest.fn((x) => x), save: jest.fn((x) => x) };

    manager = {
      getRepository: jest.fn().mockReturnValue(masterTxRepo),
      // createBooking зовёт findOne дважды: сначала блокирует мастера (MasterEntity),
      // потом ищет пересечение (BookingEntity). Различаем по сущности.
      findOne: jest.fn().mockImplementation((entity: unknown) =>
        Promise.resolve(entity === BookingEntity ? bookingConflict : { id: 'master-1' }),
      ),
      save: jest.fn().mockImplementation((_entity: unknown, data: object) =>
        Promise.resolve({ id: 'booking-1', ...data }),
      ),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };

    buisnesRepo = { findOne: jest.fn(), save: jest.fn((x) => x) };
    masterRepo = { findOne: jest.fn(), update: jest.fn() };
    servicesRepo = { find: jest.fn(), save: jest.fn((x) => x), findOne: jest.fn() };
    bookingRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn((x) => x) };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'), // 'OK' = ключ идемпотентности захвачен
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
    };

    // очередь писем: сервис только кладёт/снимает задачи, воркер тестируется отдельно
    emailsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      remove: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuisnesService,
        { provide: 'REDIS', useValue: redis },
        { provide: getQueueToken('emails'), useValue: emailsQueue },
        { provide: AuthService, useValue: authService },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(BuisnesEntity), useValue: buisnesRepo },
        { provide: getRepositoryToken(MasterEntity), useValue: masterRepo },
        { provide: getRepositoryToken(ServicesEntity), useValue: servicesRepo },
        { provide: getRepositoryToken(BookingEntity), useValue: bookingRepo },
      ],
    }).compile();

    service = module.get<BuisnesService>(BuisnesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Общие хелперы для booking-части
  // ---------------------------------------------------------------------------

  // сервис 60 мин
  const svc = { id: 's1', service: 'Стрижка', duration: 60 };

  // рабочее время на ВСЕ дни недели — тест не зависит от того, на какой день выпадет дата
  const allWeek = (open: string, close: string) => ({
    monday: { open, close }, tuesday: { open, close }, wednesday: { open, close },
    thursday: { open, close }, friday: { open, close }, saturday: { open, close },
    sunday: { open, close },
  });

  // мастер с услугой s1, таймзона UTC (local == UTC → рассуждать проще)
  const makeMaster = (work_time: object) => ({
    id: 'master-1',
    services: [{ id: 's1' }],
    work_time,
    buisnes: { timezone: 'UTC' },
  });

  describe('buisnes_create', () => {
    it('master → ForbiddenException (403)', async () => {
      await expect(
        service.buisnes_create({ title: 'A', address: 'B' }, master),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner → сохраняет салон с owner_id', async () => {
      await service.buisnes_create({ title: 'A', address: 'B' }, owner);
      expect(buisnesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'A', address: 'B', owner_id: 'owner-1' }),
      );
    });
  });

  describe('services_create', () => {
    const dto = { service: 'Стрижка', duration: 60, price: 500, buisnes_id: 'b1' };

    it('master → ForbiddenException (403)', async () => {
      await expect(service.services_create(dto, master)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner, но салон не его → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue(null);
      await expect(service.services_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
      // ищем строго по owner_id — чужой салон не найдётся
      expect(buisnesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'b1', owner_id: 'owner-1' } });
    });

    it('owner своего салона → создаёт услугу', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      await service.services_create(dto, owner);
      expect(servicesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'Стрижка', duration: 60, price: 500, buisnes_id: 'b1' }),
      );
    });
  });

  describe('masters_create', () => {
    const dto = {
      email: 'm@mail.com', password: 'secret', name: 'Аня', specialism: 'Маникюр',
      description: 'опыт', photo: '/uploads/a.jpg',
      work_time: {}, services: [{ id: 's1' }], buisnes_id: 'b1',
    };

    it('master → ForbiddenException (403)', async () => {
      await expect(service.masters_create(dto, master)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner, но салон не его → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue(null);
      await expect(service.masters_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('часть услуг не найдена → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      servicesRepo.find.mockResolvedValue([]); // запросили s1, не нашли ничего
      await expect(service.masters_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner → создаёт аккаунт и мастера в одной транзакции', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      servicesRepo.find.mockResolvedValue([{ id: 's1' }]);
      authService.createMaster.mockResolvedValue({ id: 'acc-1' });

      await service.masters_create(dto, owner);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(authService.createMaster).toHaveBeenCalledWith('m@mail.com', 'secret', manager);
      expect(masterTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Аня', auth_id: 'acc-1', buisnes_id: 'b1' }),
      );
    });
  });

  describe('master_post_week', () => {
    const dto = { work_time: { monday: { open: '09:00', close: '18:00' } } };

    it('мастер по токену не найден → NotFoundException', async () => {
      masterRepo.findOne.mockResolvedValue(null);
      await expect(service.master_post_week(dto, master)).rejects.toBeInstanceOf(NotFoundException);
      expect(masterRepo.update).not.toHaveBeenCalled();
    });

    it('обновляет только свою запись (по auth_id из токена)', async () => {
      masterRepo.findOne
        .mockResolvedValueOnce({ id: 'm1', auth_id: 'master-auth-1' }) // проверка существования
        .mockResolvedValueOnce({ id: 'm1', work_time: dto.work_time }); // возврат обновлённого

      await service.master_post_week(dto, master);

      expect(masterRepo.update).toHaveBeenCalledWith(
        { auth_id: 'master-auth-1' },
        { work_time: dto.work_time },
      );
    });
  });

  describe('master_login', () => {
    it('возвращает токены', async () => {
      authService.login.mockResolvedValue({
        auth_id: 'master-auth-1', accessToken: 'a', refreshToken: 'r',
      });

      const result = await service.master_login({ email: 'm@mail.com', password: 'p' });

      expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
    });
  });

  // ===========================================================================
  // GET /slots → getBookingFomDay
  // ===========================================================================
  describe('getBookingFomDay (свободные слоты на день)', () => {
    const day = '2030-06-10';

    // бронь занимает [from, from+duration) местного времени салона (тут UTC)
    const booking = (hhmm: string, duration: number) => ({
      starts_at: new Date(`${day}T${hhmm}:00.000Z`),
      service: { duration },
    });

    it('есть кэш → отдаёт его и в БД не ходит', async () => {
      redis.get.mockResolvedValue(JSON.stringify(['09:00', '10:00']));

      const slots = await service.getBookingFomDay('master-1', day, 's1');

      expect(slots).toEqual(['09:00', '10:00']);
      expect(masterRepo.findOne).not.toHaveBeenCalled();
      expect(bookingRepo.find).not.toHaveBeenCalled();
    });

    it('мастер не найден → NotFoundException', async () => {
      masterRepo.findOne.mockResolvedValue(null);
      await expect(service.getBookingFomDay('master-1', day, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('услуга не найдена → BadRequestException', async () => {
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      servicesRepo.findOne.mockResolvedValue(null);
      await expect(service.getBookingFomDay('master-1', day, 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('кривая дата → BadRequestException', async () => {
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      servicesRepo.findOne.mockResolvedValue(svc);
      await expect(service.getBookingFomDay('master-1', 'не-дата', 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('мастер не работает в этот день → пустой список', async () => {
      masterRepo.findOne.mockResolvedValue(makeMaster({})); // пустое расписание = выходной
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([]);

      await expect(service.getBookingFomDay('master-1', day, 's1')).resolves.toEqual([]);
    });

    it('день свободен → шаг 15 мин, последний слот успевает закрыться до close', async () => {
      // работа 09:00–11:00, услуга 60 мин → старты 09:00,09:15,09:30,09:45,10:00
      // 10:15 уже нельзя: 10:15+60 = 11:15 > 11:00
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '11:00')));
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([]);

      const slots = await service.getBookingFomDay('master-1', day, 's1');

      expect(slots).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00']);
    });

    it('есть бронь → пересекающиеся слоты выпадают', async () => {
      // работа 09:00–11:00, услуга 60 мин, занято 09:00–10:00 → остаётся только 10:00
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '11:00')));
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([booking('09:00', 60)]);

      const slots = await service.getBookingFomDay('master-1', day, 's1');

      expect(slots).toEqual(['10:00']);
    });

    it('ищет только confirmed-брони этого мастера за этот день', async () => {
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '11:00')));
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([]);

      await service.getBookingFomDay('master-1', day, 's1');

      expect(bookingRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ master_id: 'master-1', status: 'confirmed' }),
        }),
      );
    });

    it('кладёт результат в кэш на 60 секунд', async () => {
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '11:00')));
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([]);

      const slots = await service.getBookingFomDay('master-1', day, 's1');

      expect(redis.set).toHaveBeenCalledWith(
        `avail:master-1:${day}:s1`, JSON.stringify(slots), 'EX', 60,
      );
    });

    it('таймзона салона: бронь в 09:00 по Киеву блокирует киевские 09:00, а не UTC', async () => {
      // салон в Киеве (летом UTC+3). Бронь хранится в UTC = 06:00Z, локально = 09:00.
      masterRepo.findOne.mockResolvedValue({
        ...makeMaster(allWeek('09:00', '11:00')),
        buisnes: { timezone: 'Europe/Kyiv' },
      });
      servicesRepo.findOne.mockResolvedValue(svc);
      bookingRepo.find.mockResolvedValue([
        { starts_at: new Date('2030-06-10T06:00:00.000Z'), service: { duration: 60 } },
      ]);

      const slots = await service.getBookingFomDay('master-1', day, 's1');

      // локальные 09:00–10:00 заняты → остаётся 10:00
      expect(slots).toEqual(['10:00']);
    });
  });

  // ===========================================================================
  // GET /master/booking → getBookingTime
  // ===========================================================================
  describe('getBookingTime (записи мастера на 30 дней)', () => {
    it('группирует брони по дате', async () => {
      bookingRepo.find.mockResolvedValue([
        { starts_at: new Date('2030-06-10T09:00:00Z'), ends_at: new Date('2030-06-10T10:00:00Z') },
        { starts_at: new Date('2030-06-10T12:00:00Z'), ends_at: new Date('2030-06-10T13:00:00Z') },
        { starts_at: new Date('2030-06-11T09:00:00Z'), ends_at: new Date('2030-06-11T10:00:00Z') },
      ]);

      const result = await service.getBookingTime('master-1');

      expect(Object.keys(result)).toEqual(['2030-06-10', '2030-06-11']);
      expect(result['2030-06-10']).toHaveLength(2);
      expect(result['2030-06-11']).toHaveLength(1);
    });

    it('броней нет → пустой объект', async () => {
      bookingRepo.find.mockResolvedValue([]);
      await expect(service.getBookingTime('master-1')).resolves.toEqual({});
    });

    it('берёт только confirmed этого мастера, сортировка по времени', async () => {
      bookingRepo.find.mockResolvedValue([]);

      await service.getBookingTime('master-1');

      expect(bookingRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ master_id: 'master-1', status: 'confirmed' }),
          order: { starts_at: 'ASC' },
        }),
      );
    });
  });

  // ===========================================================================
  // POST /booking → createBooking
  // ===========================================================================
  describe('createBooking', () => {
    // будущая дата, выровненная по сетке: +7 дней, ровно h:m UTC
    const futureAt = (h: number, m: number, s = 0) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      d.setUTCHours(h, m, s, 0);
      return d.toISOString();
    };

    const body = (starts_at: string, over: object = {}) => ({
      master_id: 'master-1',
      service_id: 's1',
      starts_at: starts_at as unknown as Date,
      client_name: 'Иван',
      client_phone: '+380000000000',
      ...over,
    });

    const okMaster = () => makeMaster(allWeek('09:00', '18:00'));

    it('услуга не найдена → NotFoundException', async () => {
      servicesRepo.findOne.mockResolvedValue(null);
      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('мастер не найден → NotFoundException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(null);
      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('услуга не принадлежит мастеру → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue({ ...svc, id: 's-other' });
      masterRepo.findOne.mockResolvedValue(okMaster()); // у мастера только s1
      await expect(
        service.createBooking(body(futureAt(10, 0), { service_id: 's-other' }), ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('кривая дата → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      await expect(service.createBooking(body('не-дата'), '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('время в прошлом → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      await expect(service.createBooking(body('2020-01-06T10:00:00Z'), '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('время не кратно 15 минутам → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      await expect(service.createBooking(body(futureAt(10, 7)), '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('мастер не работает в этот день → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster({})); // выходной каждый день
      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('услуга не влезает до конца рабочего дня → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc); // 60 мин
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '10:30')));
      // старт 10:00 + 60 мин = 11:00 > 10:30
      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('валидная бронь → сохраняет с вычисленным ends_at', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());

      await service.createBooking(body(futureAt(10, 0)), '');

      // вставка идёт через manager внутри транзакции
      const [, saved] = manager.save.mock.calls[0];
      expect(saved).toMatchObject({
        master_id: 'master-1',
        service_id: 's1',
        service_name: 'Стрижка',
        client_name: 'Иван',
      });
      // ends_at считает сервер: starts_at + duration, клиенту не верим
      expect(saved.ends_at.getTime() - saved.starts_at.getTime()).toBe(60 * 60_000);
    });

    it('вставка идёт в транзакции с блокировкой мастера', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());

      await service.createBooking(body(futureAt(10, 0)), '');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(
        MasterEntity,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('слот уже занят (нашли пересечение) → ConflictException (409)', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      bookingConflict = { id: 'existing-booking' }; // пересечение найдено внутри транзакции

      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('гонка: EXCLUDE-constraint 23P01 → ConflictException (409)', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      manager.save.mockRejectedValue({ code: '23P01' });

      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(ConflictException);
    });

    it('гонка: deadlock 40P01 → ConflictException (409)', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      // при строго одновременной вставке Postgres кидает deadlock, а не 23P01
      manager.save.mockRejectedValue({ code: '40P01' });

      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toBeInstanceOf(ConflictException);
    });

    it('прочие ошибки БД не глотаются', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      manager.save.mockRejectedValue({ code: '23505' }); // unique_violation — не наш случай

      await expect(service.createBooking(body(futureAt(10, 0)), '')).rejects.toMatchObject({ code: '23505' });
    });

    it('успех → инвалидирует кэш слотов этого дня', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(okMaster());
      redis.keys.mockResolvedValue(['avail:master-1:2030-06-10:s1']);

      await service.createBooking(body(futureAt(10, 0)), '');

      expect(redis.keys).toHaveBeenCalledWith(expect.stringContaining('avail:master-1:'));
      expect(redis.del).toHaveBeenCalledWith('avail:master-1:2030-06-10:s1');
    });

    describe('идемпотентность (Idempotency-Key)', () => {
      it('ключ свободен → бронь создаётся, результат кэшируется под ключом', async () => {
        servicesRepo.findOne.mockResolvedValue(svc);
        masterRepo.findOne.mockResolvedValue(okMaster());

        const result = await service.createBooking(body(futureAt(10, 0)), 'key-1');

        // захват ключа: SET idem:key-1 pending EX 3600 NX
        expect(redis.set).toHaveBeenCalledWith('idem:key-1', 'pending', 'EX', 3600, 'NX');
        // сохранение результата под тем же ключом
        expect(redis.set).toHaveBeenCalledWith('idem:key-1', JSON.stringify(result), 'EX', 60);
      });

      it('повтор с тем же ключом, первый запрос закончил → отдаёт ту же бронь, второй раз не пишет', async () => {
        const firstResult = { id: 'booking-1', master_id: 'master-1' };
        redis.set.mockResolvedValue(null);                            // NX не сработал — ключ занят
        redis.get.mockResolvedValue(JSON.stringify(firstResult));     // но результат уже есть

        const result = await service.createBooking(body(futureAt(10, 0)), 'key-1');

        expect(result).toEqual(firstResult);
        expect(manager.save).not.toHaveBeenCalled(); // дубль не создан
      });

      it('повтор с тем же ключом, первый ещё в работе → ConflictException (409)', async () => {
        redis.set.mockResolvedValue(null);       // ключ занят
        redis.get.mockResolvedValue('pending');  // первый запрос ещё не закончил

        await expect(service.createBooking(body(futureAt(10, 0)), 'key-1')).rejects.toBeInstanceOf(ConflictException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('бронь упала → ключ освобождается, чтобы клиент мог повторить', async () => {
        servicesRepo.findOne.mockResolvedValue(svc);
        masterRepo.findOne.mockResolvedValue(okMaster());
        manager.save.mockRejectedValue({ code: '23P01' });

        await expect(service.createBooking(body(futureAt(10, 0)), 'key-1')).rejects.toBeInstanceOf(ConflictException);

        expect(redis.del).toHaveBeenCalledWith('idem:key-1');
      });
    });
  });

  // ===========================================================================
  // PATCH /booking/:id/cancel → cancellBooking
  // ===========================================================================
  describe('cancellBooking', () => {
    // бронь через N часов от текущего момента
    const bookingIn = (hours: number, deadlineHours = 3) => ({
      id: 'b-1',
      master_id: 'master-1',
      starts_at: new Date(Date.now() + hours * 60 * 60 * 1000),
      status: 'confirmed',
      master: { buisnes: { owner_id: 'owner-1', cancellationDeadlineHours: deadlineHours } },
    });

    it('бронь не найдена → NotFoundException', async () => {
      bookingRepo.findOne.mockResolvedValue(null);
      await expect(service.cancellBooking('b-1', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('чужой салон → ForbiddenException (403)', async () => {
      bookingRepo.findOne.mockResolvedValue(bookingIn(48));
      await expect(service.cancellBooking('b-1', 'owner-СТОРОННИЙ')).rejects.toBeInstanceOf(ForbiddenException);
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('позже дедлайна отмены → BadRequestException', async () => {
      // дедлайн 3 часа, а до начала остался 1 час → отменять поздно
      bookingRepo.findOne.mockResolvedValue(bookingIn(1, 3));
      await expect(service.cancellBooking('b-1', 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('владелец до дедлайна → статус cancelled', async () => {
      bookingRepo.findOne.mockResolvedValue(bookingIn(48, 3));

      await service.cancellBooking('b-1', 'owner-1');

      expect(bookingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b-1', status: 'cancelled' }),
      );
    });

    it('отмена освобождает слот → кэш этого дня сбрасывается', async () => {
      const booking = bookingIn(48, 3);
      bookingRepo.findOne.mockResolvedValue(booking);
      const day = booking.starts_at.toISOString().slice(0, 10);
      redis.keys.mockResolvedValue([`avail:master-1:${day}:s1`]);

      await service.cancellBooking('b-1', 'owner-1');

      expect(redis.del).toHaveBeenCalledWith(`avail:master-1:${day}:s1`);
    });
  });

  // ===========================================================================
  // Очередь писем (BullMQ): сервис только ставит и снимает задачи.
  // Само письмо отправляет воркер — он тестируется в notifications.processor.spec.ts.
  // ===========================================================================
  describe('очередь писем', () => {
    const bookingBody = (starts_at: string) => ({
      master_id: 'master-1',
      service_id: 's1',
      starts_at: starts_at as unknown as Date,
      client_name: 'Иван',
      client_phone: '+380000000000',
    });

    // фиксируем «сейчас», иначе delay не проверить точным равенством
    const freezeAt = (iso: string) => jest.useFakeTimers().setSystemTime(new Date(iso));

    beforeEach(() => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('создание брони', () => {
      it('ставит задачу booking-created с jobId по id брони', async () => {
        freezeAt('2030-06-10T09:00:00Z');

        await service.createBooking(bookingBody('2030-06-10T14:00:00Z'), '');

        expect(emailsQueue.add).toHaveBeenCalledWith(
          'booking-created',
          { bookingId: 'booking-1' },
          // jobId — дедупликация: повторная постановка той же задачи не создаст дубль письма
          expect.objectContaining({ jobId: 'booking-created_booking-1' }),
        );
      });

      it('ставит напоминание за час до начала — delay относительный, а не timestamp', async () => {
        freezeAt('2030-06-10T09:00:00Z');

        // бронь в 14:00 → напомнить в 13:00 → ждать от «сейчас» (09:00) ровно 4 часа
        await service.createBooking(bookingBody('2030-06-10T14:00:00Z'), '');

        const reminder = emailsQueue.add.mock.calls.find((c) => c[0] === 'booking-remainder');
        expect(reminder).toBeDefined();
        expect(reminder![2]).toMatchObject({
          jobId: 'booking-remainder_booking-1',
          delay: 4 * 60 * 60 * 1000,
        });
      });

      it('до брони меньше часа → напоминание не ставится', async () => {
        freezeAt('2030-06-10T09:30:00Z');

        // бронь в 10:00: момент напоминания (09:00) уже прошёл → delay отрицательный
        await service.createBooking(bookingBody('2030-06-10T10:00:00Z'), '');

        const names = emailsQueue.add.mock.calls.map((c) => c[0]);
        expect(names).toEqual(['booking-created']);
      });

      it('очередь недоступна → бронь всё равно создаётся', async () => {
        freezeAt('2030-06-10T09:00:00Z');
        emailsQueue.add.mockRejectedValue(new Error('Redis is down'));

        // письмо — не причина терять бронь: клиент уже записан, 201 не роняем
        await expect(
          service.createBooking(bookingBody('2030-06-10T14:00:00Z'), ''),
        ).resolves.toMatchObject({ id: 'booking-1' });
      });
    });

    describe('отмена брони', () => {
      const cancelled = () => ({
        id: 'b-1',
        master_id: 'master-1',
        starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
        status: 'confirmed',
        master: { buisnes: { owner_id: 'owner-1', cancellationDeadlineHours: 3 } },
      });

      it('снимает напоминание из очереди', async () => {
        bookingRepo.findOne.mockResolvedValue(cancelled());

        await service.cancellBooking('b-1', 'owner-1');

        // иначе клиенту придёт напоминание о брони, которой больше нет
        expect(emailsQueue.remove).toHaveBeenCalledWith('booking-remainder_b-1');
      });

      it('ставит задачу booking-cancelled', async () => {
        bookingRepo.findOne.mockResolvedValue(cancelled());

        await service.cancellBooking('b-1', 'owner-1');

        expect(emailsQueue.add).toHaveBeenCalledWith(
          'booking-cancelled',
          { bookingId: 'b-1' },
          expect.objectContaining({ jobId: 'booking-cancelled_b-1' }),
        );
      });

      it('очередь недоступна → отмена всё равно проходит', async () => {
        bookingRepo.findOne.mockResolvedValue(cancelled());
        emailsQueue.remove.mockRejectedValue(new Error('Redis is down'));
        emailsQueue.add.mockRejectedValue(new Error('Redis is down'));

        await expect(service.cancellBooking('b-1', 'owner-1')).resolves.toMatchObject({
          status: 'cancelled',
        });
      });
    });
  });
});
