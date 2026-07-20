// .env грузим ДО AppModule: TypeOrmModule.forRoot читает process.env при сборке модуля.
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E на пробу живости. Тут важно, что Postgres и Redis настоящие:
 * смысл /health именно в том, что он ходит в реальные зависимости.
 *
 * Требует поднятых Postgres и Redis. Запуск: npm run test:e2e
 */
describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // ThrottlerGuard тут НЕ глушим: проверяем в том числе, что мониторинг не ловит 429
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('зависимости живы → 200 и статус ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toEqual({
      status: 'ok',
      details: { postgres: 'up', redis: 'up' },
    });
  });

  it('без токена → всё равно 200 (проба не должна требовать авторизации)', async () => {
    // healthcheck докера не умеет ходить с Bearer-токеном
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('частые запросы не ловят 429 (@SkipThrottle)', async () => {
    // общий лимит — 20 запросов в минуту с IP. Мониторинг стучится чаще,
    // и 429 в ответ означал бы «сервис лежит», хотя он жив.
    const server = app.getHttpServer();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => request(server).get('/health')),
    );

    const statuses = [...new Set(results.map((r) => r.status))];
    expect(statuses).toEqual([200]);
  });
});
