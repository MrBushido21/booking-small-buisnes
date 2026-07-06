import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CronModule } from './cron.module';
import { BuisnesModule } from './buisnes/buisnes.module';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    // validate прогоняет process.env через схему на старте: нет секрета → приложение не поднимется
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Единственный DataSource на всё приложение. autoLoadEntities подхватывает
    // всё, что зарегистрировано через forFeature в фиче-модулях.
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT) || 5432,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      autoLoadEntities: true,
      synchronize: false,
    }),
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
