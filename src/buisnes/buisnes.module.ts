import { Module } from '@nestjs/common';
import { BuisnesService } from './buisnes.service';
import { BuisnesController } from './buisnes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../guard/guard';
import { BuisnesEntity } from './entities/buisne.entity';
import { ServicesEntity } from './entities/services.entity';
import { MasterEntity } from './entities/master.entity';
import { BookingEntity } from './entities/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BuisnesEntity, ServicesEntity, MasterEntity, BookingEntity]),
    // AuthService (createMaster/login) + экспортируемые JwtModule и репозиторий
    // AuthEntity, из которых собирается локальный JwtAuthGuard
    AuthModule,
  ],
  controllers: [BuisnesController],
  providers: [BuisnesService, JwtAuthGuard],
})
export class BuisnesModule {}
