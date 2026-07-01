import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AuthEntity } from './auth/entities/auth.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';
import { ResetTokenEntity } from './auth/entities/reset-token.entity';
import { BuisnesEntity } from './buisnes/entities/buisne.entity';
import { ServicesEntity } from './buisnes/entities/services.entity';
import { MasterEntity } from './buisnes/entities/master.entity';
import { BookingEntity } from './buisnes/entities/booking.entity';
import { validateEnv } from './env.validation';

// fail-fast и для CLI миграций: нет нужной переменной → миграции не запустятся
validateEnv(process.env);

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [AuthEntity, RefreshTokenEntity, ResetTokenEntity, BuisnesEntity, ServicesEntity, MasterEntity, BookingEntity],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
