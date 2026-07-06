import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthEntity } from './entities/auth.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ResetTokenEntity } from './entities/reset-token.entity';
import { TokenService } from './jwt.service';
import { JwtAuthGuard } from '../guard/guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthEntity, RefreshTokenEntity, ResetTokenEntity]),
    // Секреты/время жизни задаются на каждый вызов sign/verify в TokenService и гарде
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
  // AuthService нужен BuisnesService. JwtModule + TypeOrmModule (репозиторий
  // AuthEntity) экспортируем, чтобы JwtAuthGuard мог собраться в других модулях,
  // которые его применяют через @UseGuards.
  exports: [AuthService, JwtModule, TypeOrmModule],
})
export class AuthModule {}
