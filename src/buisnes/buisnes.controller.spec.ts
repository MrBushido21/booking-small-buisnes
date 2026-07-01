import { Test, TestingModule } from '@nestjs/testing';
import { BuisnesController } from './buisnes.controller';
import { BuisnesService } from './buisnes.service';
import { JwtAuthGuard } from 'src/guard/guard';

describe('BuisnesController', () => {
  let controller: BuisnesController;
  let service: {
    buisnes_create: jest.Mock;
    services_create: jest.Mock;
    masters_create: jest.Mock;
    master_post_week: jest.Mock;
    master_login: jest.Mock;
  };

  const req = { user: { id: 'u1', role: 'owner' } } as any;

  beforeEach(async () => {
    service = {
      buisnes_create: jest.fn(),
      services_create: jest.fn(),
      masters_create: jest.fn(),
      master_post_week: jest.fn(),
      master_login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuisnesController],
      providers: [{ provide: BuisnesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BuisnesController>(BuisnesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('buisnes_create прокидывает body и req.user в сервис', () => {
    const body = { title: 'A', address: 'B' };
    controller.buisnes_create(body, req);
    expect(service.buisnes_create).toHaveBeenCalledWith(body, req.user);
  });

  it('services_create прокидывает body и req.user', () => {
    const body = { service: 'S', duration: 60, price: 100, buisnes_id: 'b1' };
    controller.services_create(body, req);
    expect(service.services_create).toHaveBeenCalledWith(body, req.user);
  });

  it('master_post_week прокидывает body и req.user', () => {
    const body = { work_time: {} };
    controller.master_post_week(body, req);
    expect(service.master_post_week).toHaveBeenCalledWith(body, req.user);
  });

  it('upload без файла → BadRequestException', () => {
    expect(() => controller.upload(undefined as any)).toThrow();
  });

  it('upload с файлом → возвращает url', () => {
    const result = controller.upload({ filename: 'abc.jpg' } as any);
    expect(result).toEqual({ url: '/uploads/abc.jpg' });
  });

  it('login ставит refresh-cookie и возвращает accessToken', async () => {
    const res = { cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    await controller.login({ email: 'm@mail.com', password: 'p' } as any, res);

    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'r', expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'a' });
  });
});
