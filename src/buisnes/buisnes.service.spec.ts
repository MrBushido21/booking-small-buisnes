import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BuisnesService } from './buisnes.service';
import { AuthService } from 'src/auth/auth.service';
import { AuthEntity } from 'src/auth/entities/auth.entity';
import { BuisnesEntity } from './entities/buisne.entity';
import { MasterEntity } from './entities/master.entity';
import { ServicesEntity } from './entities/services.entity';
import { BookingEntity } from './entities/booking.entity';

const owner = { id: 'owner-1', email: 'owner@mail.com', role: 'owner' } as AuthEntity;
const master = { id: 'master-auth-1', email: 'm@mail.com', role: 'master' } as AuthEntity;

describe('BuisnesService', () => {
  let service: BuisnesService;

  let authService: { createMaster: jest.Mock; login: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let masterTxRepo: { create: jest.Mock; save: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let buisnesRepo: { findOne: jest.Mock; save: jest.Mock };
  let masterRepo: { findOne: jest.Mock; update: jest.Mock };
  let servicesRepo: { find: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let bookingRepo: { find: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    authService = { createMaster: jest.fn(), login: jest.fn() };
    masterTxRepo = { create: jest.fn((x) => x), save: jest.fn((x) => x) };
    manager = { getRepository: jest.fn().mockReturnValue(masterTxRepo) };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    buisnesRepo = { findOne: jest.fn(), save: jest.fn((x) => x) };
    masterRepo = { findOne: jest.fn(), update: jest.fn() };
    servicesRepo = { find: jest.fn(), save: jest.fn((x) => x), findOne: jest.fn() };
    bookingRepo = { find: jest.fn(), save: jest.fn((x) => x) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuisnesService,
        { provide: AuthService, useValue: authService },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(BuisnesEntity), useValue: buisnesRepo },
        { provide: getRepositoryToken(MasterEntity), useValue: masterRepo },
        { provide: getRepositoryToken(ServicesEntity), useValue: servicesRepo },
        { provide: getRepositoryToken(BookingEntity), useValue: bookingRepo },
      ],
    }).compile();

    service = module.get<BuisnesService>(BuisnesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buisnes_create', () => {
    it('master → ForbiddenException (403)', async () => {
      await expect(
        service.buisnes_create({ title: 'A', address: 'B' }, master),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner → сохраняет салон с owner_id', async () => {
      await service.buisnes_create({ title: 'A', address: 'B' }, owner);
      expect(buisnesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'A', address: 'B', owner_id: 'owner-1' }),
      );
    });
  });

  describe('services_create', () => {
    const dto = { service: 'Стрижка', duration: 60, price: 500, buisnes_id: 'b1' };

    it('master → ForbiddenException (403)', async () => {
      await expect(service.services_create(dto, master)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner, но салон не его → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue(null);
      await expect(service.services_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
      // ищем строго по owner_id — чужой салон не найдётся
      expect(buisnesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'b1', owner_id: 'owner-1' } });
    });

    it('owner своего салона → создаёт услугу', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      await service.services_create(dto, owner);
      expect(servicesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'Стрижка', duration: 60, price: 500, buisnes_id: 'b1' }),
      );
    });
  });

  describe('masters_create', () => {
    const dto = {
      email: 'm@mail.com', password: 'secret', name: 'Аня', specialism: 'Маникюр',
      description: 'опыт', photo: '/uploads/a.jpg',
      work_time: {}, services: [{ id: 's1' }], buisnes_id: 'b1',
    };

    it('master → ForbiddenException (403)', async () => {
      await expect(service.masters_create(dto, master)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('owner, но салон не его → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue(null);
      await expect(service.masters_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('часть услуг не найдена → NotFoundException', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      servicesRepo.find.mockResolvedValue([]); // запросили s1, не нашли ничего
      await expect(service.masters_create(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner → создаёт аккаунт и мастера в одной транзакции', async () => {
      buisnesRepo.findOne.mockResolvedValue({ id: 'b1', owner_id: 'owner-1' });
      servicesRepo.find.mockResolvedValue([{ id: 's1' }]);
      authService.createMaster.mockResolvedValue({ id: 'acc-1' });

      await service.masters_create(dto, owner);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(authService.createMaster).toHaveBeenCalledWith('m@mail.com', 'secret', manager);
      expect(masterTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Аня', auth_id: 'acc-1', buisnes_id: 'b1' }),
      );
    });
  });

  describe('master_post_week', () => {
    const dto = { work_time: { monday: { open: '09:00', close: '18:00' } } };

    it('мастер по токену не найден → NotFoundException', async () => {
      masterRepo.findOne.mockResolvedValue(null);
      await expect(service.master_post_week(dto, master)).rejects.toBeInstanceOf(NotFoundException);
      expect(masterRepo.update).not.toHaveBeenCalled();
    });

    it('обновляет только свою запись (по auth_id из токена)', async () => {
      masterRepo.findOne
        .mockResolvedValueOnce({ id: 'm1', auth_id: 'master-auth-1' }) // проверка существования
        .mockResolvedValueOnce({ id: 'm1', work_time: dto.work_time }); // возврат обновлённого

      await service.master_post_week(dto, master);

      expect(masterRepo.update).toHaveBeenCalledWith(
        { auth_id: 'master-auth-1' },
        { work_time: dto.work_time },
      );
    });
  });

  describe('master_login', () => {
    it('возвращает токены', async () => {
      authService.login.mockResolvedValue({
        auth_id: 'master-auth-1', accessToken: 'a', refreshToken: 'r',
      });

      const result = await service.master_login({ email: 'm@mail.com', password: 'p' });

      expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
    });
  });

  describe('createBooking', () => {
    // сервис 60 мин
    const svc = { id: 's1', service: 'Стрижка', duration: 60 };

    // рабочее время на ВСЕ дни недели — чтобы тест не зависел от того, на какой день выпадет дата
    const allWeek = (open: string, close: string) => ({
      monday: { open, close }, tuesday: { open, close }, wednesday: { open, close },
      thursday: { open, close }, friday: { open, close }, saturday: { open, close },
      sunday: { open, close },
    });

    // мастер с услугой s1, таймзона UTC (local == UTC → рассуждать проще)
    const makeMaster = (work_time: object) => ({
      id: 'master-1',
      services: [{ id: 's1' }],
      work_time,
      buisnes: { timezone: 'UTC' },
    });

    // будущая дата, выровненная по сетке: +7 дней, ровно 10:00:00.000 UTC
    const futureAt = (h: number, m: number, s = 0) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      d.setUTCHours(h, m, s, 0);
      return d.toISOString();
    };

    const args = (starts_at: string) =>
      ['master-1', 's1', starts_at, 'Иван', '+380000000000'] as const;

    it('услуга не найдена → NotFoundException', async () => {
      servicesRepo.findOne.mockResolvedValue(null);
      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('мастер не найден → NotFoundException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(null);
      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('услуга не принадлежит мастеру → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue({ ...svc, id: 's-other' });
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      // service_id в аргументах = 's1', а master.services = [{id:'s1'}], но найденная услуга — 's-other'
      await expect(
        service.createBooking('master-1', 's-other', futureAt(10, 0), 'Иван', '+380000000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('кривая дата → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      await expect(service.createBooking(...args('не-дата'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('время в прошлом → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      await expect(service.createBooking(...args('2020-01-06T10:00:00Z'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('время не кратно 15 минутам → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      await expect(service.createBooking(...args(futureAt(10, 7)))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('мастер не работает в этот день → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster({})); // пустое расписание = выходной каждый день
      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('услуга не влезает до конца рабочего дня → BadRequestException', async () => {
      servicesRepo.findOne.mockResolvedValue(svc); // 60 мин
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '10:30'))); // закрытие в 10:30
      // старт 10:00 + 60 мин = 11:00 > 10:30
      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('валидная бронь → сохраняет с вычисленным ends_at', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      const starts_at = futureAt(10, 0);

      await service.createBooking(...args(starts_at));

      const saved = bookingRepo.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        master_id: 'master-1',
        service_id: 's1',
        service_name: 'Стрижка',
        client_name: 'Иван',
      });
      // ends_at = starts_at + 60 мин
      expect(saved.ends_at.getTime() - saved.starts_at.getTime()).toBe(60 * 60_000);
    });

    it('гонка: база кинула 23P01 → ConflictException (409)', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      // эмулируем отказ EXCLUDE-constraint no_overlap на параллельной вставке
      bookingRepo.save.mockRejectedValue({ code: '23P01' });

      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(ConflictException);
    });

    it('гонка: deadlock 40P01 → ConflictException (409)', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      // при ОДНОВРЕМЕННОЙ вставке двух пересекающихся броней база кидает deadlock
      bookingRepo.save.mockRejectedValue({ code: '40P01' });

      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toBeInstanceOf(ConflictException);
    });

    it('прочие ошибки БД не глотаются', async () => {
      servicesRepo.findOne.mockResolvedValue(svc);
      masterRepo.findOne.mockResolvedValue(makeMaster(allWeek('09:00', '18:00')));
      bookingRepo.save.mockRejectedValue({ code: '23505' }); // unique_violation — не наш случай

      await expect(service.createBooking(...args(futureAt(10, 0)))).rejects.toMatchObject({ code: '23505' });
    });
  });
});
