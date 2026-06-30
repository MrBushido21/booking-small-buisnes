import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AuthEntity } from './auth/entities/auth.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';
import { ResetTokenEntity } from './auth/entities/reset-token.entity';
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
  entities: [AuthEntity, RefreshTokenEntity, ResetTokenEntity],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
