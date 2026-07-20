import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

/**
 * Проба живости для docker/оркестратора.
 *
 * Проверяет не «поднялся ли процесс», а «может ли приложение работать»:
 * процесс может отвечать на порту, когда БД уже отвалилась, — для балансировщика
 * это худший случай, он будет слать трафик в заведомо нерабочий инстанс.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  // мониторинг стучится часто — общий лимит 20/мин ему не подходит
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Состояние приложения и его зависимостей' })
  @ApiResponse({ status: 200, description: 'Postgres и Redis отвечают' })
  @ApiResponse({ status: 503, description: 'Хотя бы одна зависимость недоступна' })
  async check(@Res({ passthrough: true }) res: Response) {
    const [postgres, redis] = await Promise.all([
      this.probe(() => this.dataSource.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
    ]);

    const ok = postgres && redis;

    // Статус ставим руками, а не через ServiceUnavailableException: AllExceptionsFilter
    // приводит любую ошибку к своему формату и оставляет только message — details
    // до клиента не доедут, и мы не узнаем, что именно легло.
    // passthrough: true — Nest сам сериализует то, что вернём.
    //
    // 503, а не 200 с полем status: оркестратор смотрит на HTTP-код, а не в тело.
    res.status(ok ? 200 : 503);

    return {
      status: ok ? 'ok' : 'error',
      details: {
        postgres: postgres ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }

  /**
   * Зависшая проверка хуже упавшей: без таймаута /health будет висеть,
   * healthcheck отвалится по своему таймауту и мы не узнаем, кто именно умер.
   */
  private async probe(fn: () => Promise<unknown>, ms = 2000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), ms);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
