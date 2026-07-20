import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
      }),
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  /**
   * ioredis держит открытый сокет и переподключается сам — без явного quit()
   * соединение переживает app.close(). На проде это мешает graceful shutdown
   * (процесс не гасится по SIGTERM), в тестах — jest не может выйти после прогона.
   */
  async onModuleDestroy() {
    await this.redis.quit();
  }
}
