import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingEntity } from 'src/buisnes/entities/booking.entity';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { DateTime } from 'luxon';
import { MailerService } from './mailer.service';

@Processor('emails')          // ← ровно то же имя, что в registerQueue
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectRepository(BookingEntity) private readonly bookingRepo: Repository<BookingEntity>,
    private readonly mailer: MailerService,   // твой сервис поверх nodemailer
    @Inject('REDIS') private readonly redis: Redis,
  ) {
    super();                                   // ← обязательно, иначе Nest ругнётся
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'booking-created':
        return this.onBookingCreated(job.data.bookingId);
      case 'booking-cancelled':
        return this.onBookingCancelled(job.data.bookingId)
      case 'booking-remainder':
        return this.onBookingRemaind(job.data.bookingId)
      default:
        this.logger.warn(`Неизвестный тип задачи: ${job.name}`);
    }
  }

  private async onBookingCreated(bookingId: string) {
    const booking = await this.bookingRepo.findOne({
        where: {id: bookingId},
        relations: {master: {buisnes: true, auth:true}, service: true}
    })
    if (!booking || booking.status !== "confirmed") return
    const tz = booking.master.buisnes.timezone
    const when = DateTime
    .fromJSDate(booking.starts_at, {zone: "utc"})
    .setZone(tz).toFormat("dd.MM.yyyy HH:mm")
    const masterMail = `К вам создана новая запись на ${when}, услуга: ${booking.service.service}`
    const userMail = `Вы записаны на ${when}, услуга: ${booking.service.service} 
    к мастеру ${booking.master.name}, по адресу ${booking.master.buisnes.address}.
    Длительность услуги:${booking.service.duration}мин, цена: ${booking.service.price}грн`
    await this.sendOnce(`sent:created:master:${booking.id}`, booking.master.auth.email, 'Новая запись', masterMail);
    if (booking.client_email) {
    await this.sendOnce(`sent:created:client:${booking.id}`, booking.client_email, 'Новая запись', userMail);
    }
    
  }

  private async onBookingCancelled(bookingId: string) {
    const booking = await this.bookingRepo.findOne({
        where: {id: bookingId},
        relations: {master: {buisnes: true, auth:true}, service: true}
    })
    if (!booking || booking.status !== "cancelled") return
    const tz = booking.master.buisnes.timezone
    const when = DateTime
    .fromJSDate(booking.starts_at, {zone: "utc"})
    .setZone(tz).toFormat("dd.MM.yyyy HH:mm")
    const masterMail = `Запись на ${when}, услуга: ${booking.service.service}, была отменена`
    await this.sendOnce(`sent:cancelled:master:${booking.id}`, booking.master.auth.email, 'Отмена записи', masterMail)
  }

  private async onBookingRemaind(bookingId: string) {
    const booking = await this.bookingRepo.findOne({
        where: {id: bookingId},
        relations: {master: {buisnes: true, auth:true}, service: true}
    })
    if (!booking || !booking.client_email || booking.status !== "confirmed") return
    const tz = booking.master.buisnes.timezone
    const when = DateTime
    .fromJSDate(booking.starts_at, {zone: "utc"})
    .setZone(tz).toFormat("dd.MM.yyyy HH:mm")
    const userMail = `Напоминаем что вы записаны на ${when}, услуга: ${booking.service.service} 
    к мастеру ${booking.master.name}, по адресу ${booking.master.buisnes.address}.
    Длительность услуги:${booking.service.duration}мин, цена: ${booking.service.price}грн`
    
    await this.sendOnce(`sent:reminder:client:${booking.id}`, booking.client_email, 'Напоминание', userMail);  
  }

  private async sendOnce(key: string, to: string, subject: string, html: string) {
    const first = await this.redis.set(key, '1', 'EX', 86400, 'NX');
  if (!first) return;
    try { 
        await this.mailer.send(to, subject, html);
    } catch (e) {
        await this.redis.del(key)
        throw e 
    }
  }
}