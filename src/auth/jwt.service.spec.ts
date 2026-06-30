import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './jwt.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(async () => {
    jwtService = { signAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService, { provide: JwtService, useValue: jwtService }],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTokens', () => {
    it('подписывает access и refresh токены и возвращает их', async () => {
      jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

      const payload = { sub: '1', email: 'user@mail.com' };
      const result = await service.generateTokens(payload);

      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        payload,
        expect.objectContaining({ expiresIn: '1h' }),
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        payload,
        expect.objectContaining({ expiresIn: '7d' }),
      );
      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });
  });
});
