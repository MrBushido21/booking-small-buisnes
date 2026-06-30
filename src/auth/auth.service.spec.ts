import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { TokenService } from './jwt.service';
import { AuthEntity } from './entities/auth.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ResetTokenEntity } from './entities/reset-token.entity';
import { hashPassword, matchPassword } from '../utils/utils';

// Подменяем работу с bcrypt, чтобы тесты не зависели от реального хеширования
jest.mock('src/utils/utils', () => ({
  hashPassword: jest.fn(),
  matchPassword: jest.fn(),
}));

const hashPasswordMock = hashPassword as jest.Mock;
const matchPasswordMock = matchPassword as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;

  const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

  let tokenService: { generateTokens: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let authRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; update: jest.Mock };
  let refreshRepo: { save: jest.Mock; delete: jest.Mock };
  let resetRepo: { save: jest.Mock; find: jest.Mock; delete: jest.Mock };
  let manager: { delete: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    tokenService = { generateTokens: jest.fn().mockResolvedValue(tokens) };
    manager = { delete: jest.fn(), save: jest.fn() };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    authRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), update: jest.fn() };
    refreshRepo = { save: jest.fn(), delete: jest.fn() };
    resetRepo = { save: jest.fn(), find: jest.fn(), delete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TokenService, useValue: tokenService },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(AuthEntity), useValue: authRepo },
        { provide: getRepositoryToken(RefreshTokenEntity), useValue: refreshRepo },
        { provide: getRepositoryToken(ResetTokenEntity), useValue: resetRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAndSaveTokens', () => {
    it('без type — сохраняет refresh через refreshRepo, без транзакции', async () => {
      const result = await service.createAndSaveTokens('1', 'user@mail.com');

      expect(tokenService.generateTokens).toHaveBeenCalledWith({ sub: '1', email: 'user@mail.com' });
      expect(refreshRepo.save).toHaveBeenCalledWith({ jwt_refresh: tokens.refreshToken, user_id: '1' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result).toEqual(tokens);
    });

    it('с type="transaction" — атомарно удаляет старый и сохраняет новый refresh', async () => {
      const result = await service.createAndSaveTokens('1', 'user@mail.com', 'transaction');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(RefreshTokenEntity, { user_id: '1' });
      expect(manager.save).toHaveBeenCalledWith(RefreshTokenEntity, {
        jwt_refresh: tokens.refreshToken,
        user_id: '1',
      });
      expect(refreshRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual(tokens);
    });
  });

  describe('create', () => {
    it('бросает ConflictException, если email уже занят', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1' });
      hashPasswordMock.mockResolvedValue('hashed');

      await expect(service.create({ email: 'user@mail.com', password: 'p' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('создаёт пользователя и возвращает токены', async () => {
      hashPasswordMock.mockResolvedValue('hashed');
      authRepo.findOne.mockResolvedValue(null);
      authRepo.save.mockResolvedValue({ id: '1', email: 'user@mail.com' });

      const result = await service.create({ email: 'user@mail.com', password: 'p' });

      expect(authRepo.save).toHaveBeenCalledWith({ email: 'user@mail.com', password: 'hashed', role: 'owner' });
      expect(result).toEqual(tokens);
    });
  });

  describe('login', () => {
    it('бросает UnauthorizedException, если пользователь не найден', async () => {
      authRepo.findOne.mockResolvedValue(null);

      await expect(service.login({ email: 'no@mail.com', password: 'p' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('бросает UnauthorizedException при неверном пароле', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com', password: 'hash' });
      matchPasswordMock.mockResolvedValue(false);

      await expect(service.login({ email: 'user@mail.com', password: 'bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('возвращает токены при корректных данных', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com', password: 'hash' });
      matchPasswordMock.mockResolvedValue(true);

      const result = await service.login({ email: 'user@mail.com', password: 'secret' });

      expect(matchPasswordMock).toHaveBeenCalledWith('secret', 'hash');
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toEqual(tokens);
    });
  });

  describe('changePassword', () => {
    const user = { id: '1', email: 'user@mail.com', password: 'hash' } as AuthEntity;

    it('бросает UnauthorizedException при неверном текущем пароле', async () => {
      matchPasswordMock.mockResolvedValue(false);

      await expect(
        service.changePassword({ currentPass: 'bad', newPassword: 'new' }, user),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepo.update).not.toHaveBeenCalled();
    });

    it('обновляет пароль и возвращает новые токены', async () => {
      matchPasswordMock.mockResolvedValue(true);
      hashPasswordMock.mockResolvedValue('new-hash');

      const result = await service.changePassword({ currentPass: 'old', newPassword: 'new' }, user);

      expect(authRepo.update).toHaveBeenCalledWith({ id: '1' }, { password: 'new-hash' });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toEqual(tokens);
    });
  });

  describe('forgotPass', () => {
    it('ничего не делает, если пользователь не найден', async () => {
      authRepo.findOne.mockResolvedValue(null);

      const result = await service.forgotPass('no@mail.com');

      expect(result).toBeUndefined();
      expect(resetRepo.save).not.toHaveBeenCalled();
    });

    it('сохраняет токен сброса и возвращает ссылку, если пользователь найден', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com' });

      const result = await service.forgotPass('user@mail.com');

      expect(resetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: '1', email: 'user@mail.com', change_pass_token: expect.any(String) }),
      );
      expect(result).toContain('reset-password?token=');
    });
  });

  describe('changeForgotenPass', () => {
    it('бросает BadRequestException, если пользователь по email не найден', async () => {
      authRepo.findOne.mockResolvedValue(null);

      await expect(
        service.changeForgotenPass({ email: 'no@mail.com', token: 'bad', newPassword: 'new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('бросает BadRequestException, если ни один токен не совпал', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com' });
      resetRepo.find.mockResolvedValue([{ change_pass_token: 'hash', user_id: '1' }]);
      matchPasswordMock.mockResolvedValue(false);

      await expect(
        service.changeForgotenPass({ email: 'user@mail.com', token: 'bad', newPassword: 'new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('бросает BadRequestException, если срок действия токена истёк', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com' });
      resetRepo.find.mockResolvedValue([
        { change_pass_token: 'hash', user_id: '1', pass_token_expired_at: new Date(Date.now() - 1000) },
      ]);
      matchPasswordMock.mockResolvedValue(true);

      await expect(
        service.changeForgotenPass({ email: 'user@mail.com', token: 'expired', newPassword: 'new' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('меняет пароль, удаляет коды юзера и возвращает новые токены', async () => {
      authRepo.findOne.mockResolvedValue({ id: '1', email: 'user@mail.com' });
      resetRepo.find.mockResolvedValue([
        { change_pass_token: 'hash', user_id: '1', pass_token_expired_at: new Date(Date.now() + 60_000) },
      ]);
      matchPasswordMock.mockResolvedValue(true);
      hashPasswordMock.mockResolvedValue('new-hash');

      const result = await service.changeForgotenPass({
        email: 'user@mail.com',
        token: 'valid',
        newPassword: 'new',
      });

      expect(matchPasswordMock).toHaveBeenCalledWith('valid', 'hash');
      expect(authRepo.update).toHaveBeenCalledWith({ id: '1' }, { password: 'new-hash' });
      expect(resetRepo.delete).toHaveBeenCalledWith({ user_id: '1' });
      expect(result).toEqual(tokens);
    });
  });
});
