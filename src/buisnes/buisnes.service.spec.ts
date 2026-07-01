import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BuisnesService } from './buisnes.service';
import { AuthService } from 'src/auth/auth.service';
import { AuthEntity } from 'src/auth/entities/auth.entity';
import { BuisnesEntity } from './entities/buisne.entity';
import { MasterEntity } from './entities/master.entity';
import { ServicesEntity } from './entities/services.entity';

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
  let servicesRepo: { find: jest.Mock; save: jest.Mock };

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
    servicesRepo = { find: jest.fn(), save: jest.fn((x) => x) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuisnesService,
        { provide: AuthService, useValue: authService },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(BuisnesEntity), useValue: buisnesRepo },
        { provide: getRepositoryToken(MasterEntity), useValue: masterRepo },
        { provide: getRepositoryToken(ServicesEntity), useValue: servicesRepo },
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
    it('возвращает токены и профиль мастера', async () => {
      authService.login.mockResolvedValue({
        auth_id: 'master-auth-1', accessToken: 'a', refreshToken: 'r',
      });
      masterRepo.findOne.mockResolvedValue({ id: 'm1', auth_id: 'master-auth-1' });

      const result = await service.master_login({ email: 'm@mail.com', password: 'p' });

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'a',
          refreshToken: 'r',
          master: { id: 'm1', auth_id: 'master-auth-1' },
        }),
      );
    });
  });
});
