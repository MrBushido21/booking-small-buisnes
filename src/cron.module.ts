import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResetTokenEntity } from './auth/entities/reset-token.entity';
import { CronService } from './cron.service';
import { BookingEntity } from './buisnes/entities/booking.entity';


@Module({
  imports: [TypeOrmModule.forFeature([ResetTokenEntity, BookingEntity])],
  providers: [CronService],
})
export class CronModule {}