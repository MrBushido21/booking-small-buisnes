// Грузим .env (POSTGRES_*, JWT_*) ДО импорта AppModule —
// TypeOrmModule.forRoot читает process.env в момент вычисления метаданных модуля.
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthEntity } from '../src/auth/entities/auth.entity';
import { RefreshTokenEntity } from '../src/auth/entities/refresh-token.entity';

/**
 * Проверяем гонку (race condition) в регистрации.
 *
 * Уязвимость в текущем коде:
 *  - AuthEntity.email объявлен как @Column() БЕЗ unique: true — БД не запрещает дубли.
 *  - AuthService.create() делает check-then-act: findOne -> (пауза на await) -> save,
 *    без транзакции и блокировки.
 *
 * Если послать N одинаковых email одновременно, несколько запросов успеют
 * пройти findOne (все получат null) ещё до того, как первый сделает save,
 * и в БД появится несколько пользователей с одним email.
 */
describe('Регистрация — гонка по одинаковому email (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const email = `race_${Date.now()}@mail.com`;
  const password = 'P@ssw0rd';
  const CONCURRENCY = 10;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // подчищаем за собой, чтобы прогон можно было повторять
    if (dataSource?.isInitialized) {
      const users = await dataSource.getRepository(AuthEntity).find({ where: { email } });
      for (const u of users) {
        await dataSource.getRepository(RefreshTokenEntity).delete({ user_id: u.id });
      }
      await dataSource.getRepository(AuthEntity).delete({ email });
    }
    await app?.close();
  });

  it(`шлёт ${CONCURRENCY} одновременных регистраций одного email`, async () => {
    const server = app.getHttpServer();

    console.log(`\n[RACE] Отправляю ${CONCURRENCY} одновременных регистраций для "${email}"`);

    // Promise.all => все запросы уходят без ожидания друг друга = настоящая параллельность
    const statuses = await Promise.all(
      Array.from({ length: CONCURRENCY }).map((_, i) =>
        request(server)
          .post('/auth/registration')
          .send({ email, password })
          .then((res) => {
            console.log(`[RACE] запрос #${i} -> HTTP ${res.status}`);
            return res.status;
          })
          .catch((e) => {
            console.log(`[RACE] запрос #${i} -> сетевая ошибка: ${e.message}`);
            return -1;
          }),
      ),
    );

    const created = statuses.filter((s) => s === 201).length;
    const conflict = statuses.filter((s) => s === 409).length;
    const other = statuses.filter((s) => s !== 201 && s !== 409).length;

    // Считаем напрямую в БД — это и есть истина в последней инстанции
    const rowsInDb = await dataSource.getRepository(AuthEntity).count({ where: { email } });

    console.log('\n[RACE] ================ ИТОГ ================');
    console.log(`[RACE] 201 Created  : ${created}`);
    console.log(`[RACE] 409 Conflict : ${conflict}`);
    console.log(`[RACE] прочее       : ${other}`);
    console.log(`[RACE] записей в БД с этим email: ${rowsInDb}`);
    if (rowsInDb > 1) {
      console.log('[RACE] >>> ГОНКА ВОСПРОИЗВЕЛАСЬ: создано несколько пользователей с одним email!');
    } else {
      console.log('[RACE] >>> Дублей нет (в этот раз). Попробуй увеличить CONCURRENCY и повторить.');
    }
    console.log('[RACE] ======================================\n');

    // Ожидаемое КОРРЕКТНОЕ поведение: ровно одна запись.
    // Если тест падает (rowsInDb > 1) — значит защиты от дублей нет, уязвимость подтверждена.
    expect(rowsInDb).toBe(1);
  });
});
