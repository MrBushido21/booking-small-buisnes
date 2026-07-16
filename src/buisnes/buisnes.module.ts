import { Module } from '@nestjs/common';
import { BuisnesService } from './buisnes.service';
import { BuisnesController } from './buisnes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../guard/guard';
import { BuisnesEntity } from './entities/buisnes.entity';
import { ServicesEntity } from './entities/services.entity';
import { MasterEntity } from './entities/master.entity';
import { BookingEntity } from './entities/booking.entity';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([BuisnesEntity, ServicesEntity, MasterEntity, BookingEntity]),
    BullModule.registerQueue({ name: 'emails' }),
    AuthModule,
  ],
  controllers: [BuisnesController],
  providers: [ BuisnesService, JwtAuthGuard],
})
export class BuisnesModule {}
