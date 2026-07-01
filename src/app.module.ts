import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CronModule } from './cron.module';
import { BuisnesModule } from './buisnes/buisnes.module';

@Module({
  imports: [
    // глобальный лимит по умолчанию: не больше 20 запросов с одного IP за 60 сек
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    ScheduleModule.forRoot(),
    AuthModule,
    CronModule,
    BuisnesModule,
  ],
  providers: [
    // вешаем ThrottlerGuard на ВСЕ роуты приложения
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
