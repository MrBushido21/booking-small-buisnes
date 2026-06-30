import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../guard/guard';
import { AuthEntity } from './entities/auth.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    create: jest.Mock;
    login: jest.Mock;
    changePassword: jest.Mock;
    forgotPass: jest.Mock;
    changeForgotenPass: jest.Mock;
  };

  const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

  // Минимальный мок Express Response с поддержкой fluent-вызовов
  const mockResponse = (): Response => {
    const res = {} as Response;
    res.cookie = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    authService = {
      create: jest.fn(),
      login: jest.fn(),
      changePassword: jest.fn(),
      forgotPass: jest.fn(),
      changeForgotenPass: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('registration', () => {
    it('создаёт пользователя, ставит refresh-cookie и возвращает accessToken', async () => {
      authService.create.mockResolvedValue(tokens);
      const res = mockResponse();
      const body = { email: 'user@mail.com', password: 'secret' };

      await controller.registration(body, res);

      expect(authService.create).toHaveBeenCalledWith(body);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/auth/refresh' }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });
  });

  describe('login', () => {
    it('логинит пользователя, ставит cookie и возвращает accessToken', async () => {
      authService.login.mockResolvedValue(tokens);
      const res = mockResponse();
      const body = { email: 'user@mail.com', password: 'secret' };

      await controller.login(body, res);

      expect(authService.login).toHaveBeenCalledWith(body);
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', tokens.refreshToken, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });
  });

  describe('changePass', () => {
    const user = { id: '1', email: 'user@mail.com', password: 'hash' } as AuthEntity;
    const body = { currentPass: 'old', newPassword: 'new' };

    it('меняет пароль, когда user внедрён в request', async () => {
      authService.changePassword.mockResolvedValue(tokens);
      const res = mockResponse();
      const req = { user } as Request;

      await controller.changePass(req, res, body);

      expect(authService.changePassword).toHaveBeenCalledWith(body, user);
      expect(res.cookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });

    it('бросает UnauthorizedException, если user отсутствует в request', async () => {
      const res = mockResponse();
      const req = {} as Request;

      await expect(controller.changePass(req, res, body)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.changePassword).not.toHaveBeenCalled();
    });
  });

  describe('forgotPass', () => {
    it('вызывает сервис и возвращает информационное сообщение', async () => {
      authService.forgotPass.mockResolvedValue(undefined);
      const result = await controller.forgotPass({ email: 'user@mail.com' });

      expect(authService.forgotPass).toHaveBeenCalledWith('user@mail.com');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('сброс');
    });
  });

  describe('changeForgotenPass', () => {
    it('сбрасывает забытый пароль, ставит cookie и возвращает accessToken', async () => {
      authService.changeForgotenPass.mockResolvedValue(tokens);
      const res = mockResponse();
      const body = { email: 'user@mail.com', token: 'reset-token', newPassword: 'new' };

      await controller.changeForgotenPass(res, body);

      expect(authService.changeForgotenPass).toHaveBeenCalledWith(body);
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', tokens.refreshToken, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ accessToken: tokens.accessToken });
    });
  });
});
