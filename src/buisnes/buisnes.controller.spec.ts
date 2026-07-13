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
    getBookingFomDay: jest.Mock;
    getBookingTime: jest.Mock;
    createBooking: jest.Mock;
    cancellBooking: jest.Mock;
  };

  const req = { user: { id: 'u1', role: 'owner' } } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    service = {
      buisnes_create: jest.fn(),
      services_create: jest.fn(),
      masters_create: jest.fn(),
      master_post_week: jest.fn(),
      master_login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
      getBookingFomDay: jest.fn(),
      getBookingTime: jest.fn(),
      createBooking: jest.fn(),
      cancellBooking: jest.fn(),
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

  // ---------------------------------------------------------------------------
  // Booking-роуты. Логики тут нет — проверяем ПРОВОДКУ: что контроллер верно
  // достаёт данные из query / body / req.user / заголовка и отдаёт их сервису.
  // ---------------------------------------------------------------------------

  describe('GET /buisnes/slots', () => {
    it('разбирает query и зовёт getBookingFomDay(master_id, date, service_id)', async () => {
      service.getBookingFomDay.mockResolvedValue(['09:00', '10:00']);

      const result = await controller.getBookingTime({
        master_id: 'm1', date: '2030-06-10', service_id: 's1',
      });

      // порядок аргументов позиционный — date и service_id легко перепутать местами
      expect(service.getBookingFomDay).toHaveBeenCalledWith('m1', '2030-06-10', 's1');
      expect(result).toEqual(['09:00', '10:00']);
    });
  });

  describe('GET /buisnes/master/booking', () => {
    it('берёт id мастера ИЗ ТОКЕНА, а не из запроса', async () => {
      await controller.getBookingTimeMaster(req);
      // защита: мастер не может подсунуть чужой id и посмотреть чужие записи
      expect(service.getBookingTime).toHaveBeenCalledWith('u1');
    });
  });

  describe('POST /buisnes/booking', () => {
    const body = {
      master_id: 'm1', service_id: 's1',
      starts_at: '2030-06-10T09:00:00.000Z',
      client_name: 'Иван', client_phone: '+380777777777',
    } as any;

    it('передаёт body и Idempotency-Key в сервис', async () => {
      await controller.createBooking(body, 'idem-123');
      expect(service.createBooking).toHaveBeenCalledWith(body, 'idem-123');
    });

    it('без Idempotency-Key тоже работает — заголовок необязательный', async () => {
      await controller.createBooking(body, undefined as any);
      expect(service.createBooking).toHaveBeenCalledWith(body, undefined);
    });
  });

  describe('PATCH /buisnes/booking/:id/cancel', () => {
    it('id брони — из пути, owner_id — из токена', async () => {
      await controller.cancellBooking('booking-1', req);
      expect(service.cancellBooking).toHaveBeenCalledWith('booking-1', 'u1');
    });
  });
});
