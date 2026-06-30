import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthEntity } from './entities/auth.entity';
import { ConfigModule } from '@nestjs/config';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ResetTokenEntity } from './entities/reset-token.entity';
import { TokenService } from './jwt.service';
import { JwtAuthGuard } from '../guard/guard';
import { validateEnv } from '../env.validation';

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
      entities: [AuthEntity, RefreshTokenEntity, ResetTokenEntity],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([AuthEntity, RefreshTokenEntity, ResetTokenEntity]),
    // Секреты/время жизни задаются на каждый вызов sign/verify в TokenService и гарде
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
