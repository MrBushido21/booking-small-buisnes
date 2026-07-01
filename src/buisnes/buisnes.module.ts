import { Module } from '@nestjs/common';
import { BuisnesService } from './buisnes.service';
import { BuisnesController } from './buisnes.controller';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from 'src/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuisnesEntity } from './entities/buisne.entity';
import { ServicesEntity } from './entities/services.entity';
import { MasterEntity } from './entities/master.entity';
import { BookingEntity } from './entities/booking.entity';

@Module({
  imports: [
      // validate прогоняет process.env через схему на старте: нет секрета → приложение не поднимется
      ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        entities: [BuisnesEntity, ServicesEntity, MasterEntity, BookingEntity],
        synchronize: false,
      }),
      TypeOrmModule.forFeature([BuisnesEntity, ServicesEntity, MasterEntity, BookingEntity]),
  ],
  controllers: [BuisnesController],
  providers: [BuisnesService],
})
export class BuisnesModule {}
