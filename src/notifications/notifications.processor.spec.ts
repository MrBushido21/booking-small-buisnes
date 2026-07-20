import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { BookingEntity } from 'src/buisnes/entities/booking.entity';
import { MailerService } from './mailer.service';
import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;

  let bookingRepo: { findOne: jest.Mock };
  let mailer: { send: jest.Mock };
  let redis: { set: jest.Mock; del: jest.Mock };

  // задача из очереди — воркеру приходит только id, всё остальное он берёт из БД
  const job = (name: string) => ({ name, data: { bookingId: 'b-1' } }) as unknown as Job;

  // салон в Киеве (летом UTC+3): 06:00Z в письме должно стать 09:00
  const makeBooking = (over: object = {}) => ({
    id: 'b-1',
    status: 'confirmed',
    starts_at: new Date('2030-06-10T06:00:00.000Z'),
    client_email: 'client@mail.com',
    master: {
      name: 'Аня',
      auth: { email: 'master@mail.com' },
      buisnes: { timezone: 'Europe/Kyiv', address: 'ул. Тестовая, 1' },
    },
    service: { service: 'Стрижка', duration: 60, price: 500 },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    bookingRepo = { findOne: jest.fn() };
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    redis = {
      set: jest.fn().mockResolvedValue('OK'), // 'OK' = письмо ещё не отправляли
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: getRepositoryToken(BookingEntity), useValue: bookingRepo },
        { provide: MailerService, useValue: mailer },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    processor = module.get<NotificationsProcessor>(NotificationsProcessor);
  });

  it('неизвестный тип задачи → писем нет', async () => {
    await processor.process(job('какая-то-ерунда'));
    expect(mailer.send).not.toHaveBeenCalled();
  });

  describe('booking-created', () => {
    it('бронь отменена → письмо не уходит', async () => {
      // задача могла пролежать в очереди, пока бронь отменяли
      bookingRepo.findOne.mockResolvedValue(makeBooking({ status: 'cancelled' }));

      await processor.process(job('booking-created'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('брони уже нет в БД → письмо не уходит', async () => {
      bookingRepo.findOne.mockResolvedValue(null);

      await processor.process(job('booking-created'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('шлёт мастеру и клиенту, время — в таймзоне салона', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking());

      await processor.process(job('booking-created'));

      expect(mailer.send).toHaveBeenCalledTimes(2);
      // 06:00 UTC = 09:00 по Киеву. В письме должно быть местное время, а не UTC
      expect(mailer.send).toHaveBeenCalledWith(
        'master@mail.com', 'Новая запись', expect.stringContaining('10.06.2030 09:00'),
      );
      expect(mailer.send).toHaveBeenCalledWith(
        'client@mail.com', 'Новая запись', expect.stringContaining('10.06.2030 09:00'),
      );
    });

    it('клиент не оставил email → письмо только мастеру', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ client_email: null }));

      await processor.process(job('booking-created'));

      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(mailer.send).toHaveBeenCalledWith('master@mail.com', 'Новая запись', expect.any(String));
    });
  });

  describe('booking-cancelled', () => {
    it('бронь всё ещё confirmed → письмо не уходит', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ status: 'confirmed' }));

      await processor.process(job('booking-cancelled'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('бронь отменена → письмо мастеру', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ status: 'cancelled' }));

      await processor.process(job('booking-cancelled'));

      expect(mailer.send).toHaveBeenCalledWith(
        'master@mail.com', 'Отмена записи', expect.stringContaining('была отменена'),
      );
    });
  });

  describe('booking-remainder', () => {
    it('бронь отменена → напоминание не уходит', async () => {
      // главная защита: напоминание висит в очереди с delay до самого часа X.
      // Если снять его не удалось — воркер обязан сам проверить статус перед отправкой.
      bookingRepo.findOne.mockResolvedValue(makeBooking({ status: 'cancelled' }));

      await processor.process(job('booking-remainder'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('клиент не оставил email → напоминание не уходит', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ client_email: null }));

      await processor.process(job('booking-remainder'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('бронь в силе → напоминание клиенту', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking());

      await processor.process(job('booking-remainder'));

      expect(mailer.send).toHaveBeenCalledWith(
        'client@mail.com', 'Напоминание', expect.stringContaining('10.06.2030 09:00'),
      );
    });
  });

  describe('защита от повторной отправки', () => {
    it('письмо уже отправляли → второй раз не шлём', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ client_email: null }));
      redis.set.mockResolvedValue(null); // SET NX не сработал — ключ уже стоит

      await processor.process(job('booking-created'));

      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('ставит ключ на сутки через SET NX', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ client_email: null }));

      await processor.process(job('booking-created'));

      expect(redis.set).toHaveBeenCalledWith('sent:created:master:b-1', '1', 'EX', 86400, 'NX');
    });

    it('SMTP упал → ключ снимается и ошибка летит наверх (BullMQ ретраит)', async () => {
      bookingRepo.findOne.mockResolvedValue(makeBooking({ client_email: null }));
      mailer.send.mockRejectedValue(new Error('SMTP timeout'));

      // без удаления ключа ретрай увидел бы «уже отправлено» и письмо потерялось бы навсегда
      await expect(processor.process(job('booking-created'))).rejects.toThrow('SMTP timeout');
      expect(redis.del).toHaveBeenCalledWith('sent:created:master:b-1');
    });
  });
});
