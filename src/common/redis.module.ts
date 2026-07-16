import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD,
      }),
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule {}