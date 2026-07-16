import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { ResetTokenEntity } from "./auth/entities/reset-token.entity";
import { BookingEntity } from "./buisnes/entities/booking.entity";

@Injectable()
export class CronService {
    private readonly logger = new Logger(CronService.name);

    constructor(
        @InjectRepository(ResetTokenEntity)
        private readonly resetRepo: Repository<ResetTokenEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepo: Repository<BookingEntity>,
    ) { }

    // раз в час удаляем все просроченные reset-токены ОДНИМ запросом
    @Cron(CronExpression.EVERY_HOUR)
    async cleanExpiredTokens() {
        const result = await this.resetRepo.delete({
            pass_token_expired_at: LessThan(new Date()),
        });
        if (result.affected) {
            this.logger.log(`Удалено просроченных reset-токенов: ${result.affected}`);
        }
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async bookingStatusUpdate() {
        const result = await this.bookingRepo.update(
            {status: "confirmed", ends_at: LessThan(new Date())}, {status: "completed"}
        )
        if (result.affected) {
            this.logger.log(`Закрыто выполненых работ: ${result.affected}`);
        }
    }
}