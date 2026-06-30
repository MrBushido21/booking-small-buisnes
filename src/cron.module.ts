import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResetTokenEntity } from './auth/entities/reset-token.entity';
import { CronService } from './cron.service';


@Module({
  imports: [TypeOrmModule.forFeature([ResetTokenEntity])],
  providers: [CronService],
})
export class CronModule {}