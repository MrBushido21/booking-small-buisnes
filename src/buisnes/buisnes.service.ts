import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthEntity } from 'src/auth/entities/auth.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BuisnesEntity } from './entities/buisnes.entity';
import { Repository, In, DataSource, And, MoreThanOrEqual, LessThan, MoreThan } from 'typeorm';
import { MasterEntity } from './entities/master.entity';
import { ServicesEntity } from './entities/services.entity';
import { AuthService } from 'src/auth/auth.service';
import { CreateBuisneDto } from './dto/create-buisne.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateMasterDto } from './dto/create-master.dto';
import { WeekDto } from './dto/week.dto';
import { LoginDto } from 'src/auth/dto/login.dto';
import { BookingEntity } from './entities/booking.entity';
import { DateTime } from 'luxon';
import { addMinutes, dayWeek, toMin, toStr } from 'src/utils/utils';
import Redis from 'ioredis';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class BuisnesService {
  private readonly logger = new Logger(BuisnesService.name)
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    @InjectQueue('emails') private readonly emailsQueue: Queue,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
    @InjectRepository(BuisnesEntity)
    private readonly buisnesRepo: Repository<BuisnesEntity>,
    @InjectRepository(MasterEntity)
    private readonly masterRepo: Repository<MasterEntity>,
    @InjectRepository(ServicesEntity)
    private readonly servicesRepo: Repository<ServicesEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
  ) {

  }
  private async invalidateAvailability(master_id: string, starts_at: Date) {
    try {
      const day = starts_at.toISOString().slice(0, 10);
      const keys = await this.redis.keys(`avail:${master_id}:${day}:*`);
      if (keys.length) await this.redis.del(...keys);
    } catch (e) {
      console.error('Cache invalidation failed:', e);
    }
  }
  async buisnes_create(body: CreateBuisneDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    return await this.buisnesRepo.save({ title: body.title, address: body.address, timezone: body.timezone, owner_id: user.id })
  }
  async services_create(body: CreateServiceDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    const buisnes = await this.buisnesRepo.findOne({ where: { id: body.buisnes_id, owner_id: user.id } })
    if (!buisnes) throw new NotFoundException("Buisnes not found")
    return await this.servicesRepo.save({
      service: body.service, duration: body.duration, price: body.price, buisnes_id: body.buisnes_id
    })
  }
  async masters_create(body: CreateMasterDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    const buisnes = await this.buisnesRepo.findOne({ where: { id: body.buisnes_id, owner_id: user.id } })
    if (!buisnes) throw new NotFoundException("Buisnes not found")

    const ids = body.services.map(service => service.id);

    const foundServices = await this.servicesRepo.find({
      where: { id: In(ids), buisnes_id: body.buisnes_id }
    });

    if (foundServices.length !== ids.length) {
      const foundIds = foundServices.map(s => s.id);
      const missingIds = ids.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Services not found: ${missingIds.join(", ")}`);
    }
    return await this.dataSource.transaction(async (manager) => {
      // 1) аккаунт в auth — через ТОТ ЖЕ manager
      const account = await this.authService.createMaster(body.email, body.password, manager)

      // 2) мастер — тоже через manager
      const master = manager.getRepository(MasterEntity).create({
        name: body.name, specialism: body.specialism, description: body.description,
        photo: body.photo, work_time: body.work_time, services: foundServices,
        buisnes_id: body.buisnes_id,
        auth_id: account.id
      })
      return await manager.getRepository(MasterEntity).save(master)
    })
  }


  async master_login(body: LoginDto) {
    const master_account = await this.authService.login(body)
    return { accessToken: master_account.accessToken, refreshToken: master_account.refreshToken }
  }

  async master_post_week(body: WeekDto, user: AuthEntity) { // добавить id master в боди на случай если это владелец решил редактировать
    const master = await this.masterRepo.findOne({ where: { auth_id: user.id } })
    if (!master) throw new NotFoundException("Master not found")

    // трогаем только свою запись (auth_id из токена) → чужое расписание не редактируется
    await this.masterRepo.update({ auth_id: user.id }, { work_time: body.work_time })
    return this.masterRepo.findOne({ where: { auth_id: user.id }, relations: { bookings: true, services: true } })
  }

  //Метод что бы узнать все брони мастера 
  async getBookingTime(master: string,) { //date: string, service: string
    const from = new Date();                     // сегодня, сейчас
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 30);         // сегодня + 30 дней
    const bookings = await this.bookingRepo.find({
      where: {
        master_id: master,
        status: "confirmed",
        starts_at: And(MoreThanOrEqual(from), LessThan(to))
      },
      order: { starts_at: 'ASC' }
    })
    const map = new Map<string, { start: Date, end: Date }[]>()
    for (const booking of bookings) {
      const date = booking.starts_at.toISOString().slice(0, 10)
      if (!map.has(date)) map.set(date, [])
      map.get(date)?.push({ start: booking.starts_at, end: booking.ends_at })
    }
    return Object.fromEntries(map)
  }

  async getBookingFomDay(master_id: string, day: string, service_id: string) {
    const cacheKey = `avail:${master_id}:${day}:${service_id}`
    const cached = await this.redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    const master = await this.masterRepo.findOne({
      where: { id: master_id },
      relations: { buisnes: true },
    });
    if (!master) throw new NotFoundException('Master not found');

    const service = await this.servicesRepo.findOne({ where: { id: service_id } });
    if (!service) throw new BadRequestException('Invalid service');

    const tz = master.buisnes.timezone;

    const dayStart = DateTime.fromISO(day, { zone: tz }).startOf('day');
    if (!dayStart.isValid) throw new BadRequestException('Invalid day');
    const dayEnd = dayStart.plus({ days: 1 });

    const dayOfWeek = dayStart.weekday % 7;   // Luxon: 1=Пн..7=Вс → 0=Вс..6=Сб

    const bookings = await this.bookingRepo.find({
      where: {
        master_id,
        status: 'confirmed',
        starts_at: And(
          MoreThanOrEqual(dayStart.toJSDate()),
          LessThan(dayEnd.toJSDate()),
        ),
      },
      relations: { service: true },
});
    const masterWorkTimeInTheDay = master?.work_time[dayWeek[dayOfWeek].toLowerCase()]

    if (!masterWorkTimeInTheDay) {
      return [];   // в этот день мастер не работает
    }

    const busy = bookings.map(b => {
      const local = DateTime.fromJSDate(b.starts_at, { zone: 'utc' }).setZone(tz);
      const start = local.hour * 60 + local.minute;
      return { start, end: start + b.service.duration };
    });

    let startDay = toMin(masterWorkTimeInTheDay.open);
    let endDay = toMin(masterWorkTimeInTheDay.close);

    let x = startDay
    let duration = service.duration
    const slots: string[] = [];
    while (x + duration <= endDay) {
      const hit = busy.find(b => x < b.end && b.start < x + service.duration)
      if (hit) {
        x = hit.end
      } else {
        slots.push(toStr(x))
        x += 15
      }
    }
    await this.redis.set(cacheKey, JSON.stringify(slots), "EX", 60)
    return slots;
  }

  async createBooking(body: CreateBookingDto, idempotencyKey: string) {
    const idemRedisKey = idempotencyKey ? `idem:${idempotencyKey}` : null;
    if (idemRedisKey) {
      const acquired = await this.redis.set(idemRedisKey, "pending", "EX", 3600, "NX")
      if (!acquired) {
        // ключ уже занят другим запросом с тем же Idempotency-Key
        const cached = await this.redis.get(idemRedisKey);
        if (cached && cached !== 'pending') {
          return JSON.parse(cached);   // первый запрос закончил — отдаём его бронь
        }
        throw new ConflictException('Запрос уже обрабатывается, повторите через мгновение')
      }
    }

    const service = await this.servicesRepo.findOne({ where: { id: body.service_id } })
    if (!service) throw new NotFoundException('Service not found');
    const master = await this.masterRepo.findOne({
      where:
        { id: body.master_id },
      relations: { services: true, buisnes: true },
    })
    if (!master) throw new NotFoundException('Master not found');

    const isMasterService = master.services.some(service => service.id === body.service_id)
    if (!isMasterService) throw new BadRequestException('Master dont have this service')
    const start = new Date(body.starts_at);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Некорректная дата');
    }
    if (start.getTime() < Date.now()) {
      throw new BadRequestException('Нельзя записаться в прошлое');
    }
    const SLOT_STEP = 15;
    if (start.getUTCMinutes() % SLOT_STEP !== 0 || start.getUTCSeconds() !== 0) {
      throw new BadRequestException('Время должно быть кратно 15 минутам');
    }
    const end = new Date(start.getTime() + service.duration * 60_000);

    // всё сравниваем в таймзоне салона: work_time — это местное время салона
    const tz = master.buisnes.timezone;
    const local = DateTime.fromJSDate(start, { zone: 'utc' }).setZone(tz);

    // день недели тоже в зоне салона (23:00 UTC может быть уже следующий день локально)
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const daySchedule = master.work_time[days[local.weekday % 7]]; // luxon: 1=пн..7=вс → %7 даёт 0=вс
    if (!daySchedule) {
      throw new BadRequestException('Мастер не работает в этот день');
    }

    const [oh, om] = daySchedule.open.split(':').map(Number);
    const [ch, cm] = daySchedule.close.split(':').map(Number);
    const open = local.set({ hour: oh, minute: om, second: 0, millisecond: 0 });
    const close = local.set({ hour: ch, minute: cm, second: 0, millisecond: 0 });
    const endLocal = local.plus({ minutes: service.duration });

    if (local < open || endLocal > close) {
      throw new BadRequestException('Время вне рабочих часов мастера');
    }
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        await manager.findOne(MasterEntity, {
          where: { id: master.id },
          lock: { mode: "pessimistic_write" }
        })
        const conflict = await manager.findOne(BookingEntity, {
          where: {
            status: "confirmed",
            master_id: master.id,
            starts_at: LessThan(end),
            ends_at: MoreThan(start)
          }
        })
        if (conflict) throw new ConflictException('Слот занят');
        // 3.3 вставка — единственная, внутри транзакции
        return await manager.save(BookingEntity, {
          master_id: body.master_id,
          service_id: body.service_id,
          service_name: service.service,
          starts_at: start,
          ends_at: end,
          client_name: body.client_name,
          client_phone: body.client_phone,
          client_email: body.client_email,
        });
      });

      await this.invalidateAvailability(body.master_id, start)

       try {
        await this.queue(result, "booking-created")
        // remindAt — момент напоминания (за час до брони), delay — сколько ждать от «сейчас».
        // BullMQ ждёт именно относительные мс, абсолютный timestamp = отправка через ~56 лет.
        const remindAt = result.starts_at.getTime() - 60 * 60 * 1000
        const delay = remindAt - Date.now()
        if (delay > 0) await this.reminder(result, delay)
      } catch (e) {
        this.logger.error(`Не удалось поставить письмо в очередь для брони ${result.id}`, e);
      }

      if (idemRedisKey) {
        await this.redis.set(idemRedisKey, JSON.stringify(result), 'EX', 60);
      }
      return result

    } catch (e: any) {
      
      if (idemRedisKey) {
        await this.redis.del(idemRedisKey);
      }
      if (e.code === '23P01' || e.code === '40P01') {
        throw new ConflictException('Это время уже занято');
      }
      throw e;
    }
  }

  async cancellBooking(booking_id: string, owner_id: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id: booking_id },
      relations: { master: { buisnes: true } },
    });
    if (!booking) throw new NotFoundException("Booking not found");
    if (booking.master.buisnes.owner_id !== owner_id)
      throw new ForbiddenException("Not your booking");
    const cancellationDeadlineHours = booking.master.buisnes.cancellationDeadlineHours
    const deadline = booking.starts_at.getTime() - cancellationDeadlineHours * 60 * 60 * 1000;

    if (Date.now() > deadline) {
      throw new BadRequestException(`Bookings cannot be cancelled less than ${cancellationDeadlineHours} hours before the start time`);
    }
    const result = await this.bookingRepo.save({ ...booking, status: "cancelled" })
      try {
        await this.emailsQueue.remove(`booking-remainder_${booking_id}`);
      } catch (e) {
        this.logger.error(`Не удалось снять напоминание для брони ${booking_id}`, e);
      }
    await this.invalidateAvailability(booking.master_id, booking.starts_at)
    try {
        await this.queue(result, "booking-cancelled")
      } catch (e) {
        this.logger.error(`Не удалось поставить письмо в очередь для брони ${result.id}`, e);
      }
    return result
  }

  async queue (result:BookingEntity, event: 'booking-created' | 'booking-cancelled') {
    try {
        await this.emailsQueue.add(
          event,
          { bookingId: result.id },
          {
            jobId: `${event}_${result.id}`,   // дедупликация
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        );
      } catch (e) {
        // очередь недоступна — бронь всё равно создана, не роняем 201
        this.logger.error(`Failed to enqueue email for booking ${result.id}`, e);
      }
  }

  async reminder(result:BookingEntity, delay:number) {
    try {
        await this.emailsQueue.add(
          'booking-remainder',
          { bookingId: result.id },
          {
            jobId: `booking-remainder_${result.id}`,
            delay,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        );
      } catch (e) {
        // очередь недоступна — бронь всё равно создана, не роняем 201
        this.logger.error(`Failed to enqueue email for booking ${result.id}`, e);
      }
  }
}
