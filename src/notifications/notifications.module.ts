import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BookingEntity } from "src/buisnes/entities/booking.entity";
import { NotificationsProcessor } from "./notifications.processor";
import { MailerService } from "./mailer.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: 'emails' }),
    TypeOrmModule.forFeature([BookingEntity]),
  ],
  providers: [NotificationsProcessor, MailerService],
})
export class NotificationsModule {}