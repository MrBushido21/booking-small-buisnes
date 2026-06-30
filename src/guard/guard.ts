import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { AuthEntity } from "../auth/entities/auth.entity";
import { Repository } from "typeorm";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AuthEntity)
    private readonly authRepo: Repository<AuthEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Токен не передан');
    }

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Невалидный или истёкший токен');
    }

    // юзер реально существует в БД (не удалён) + берём актуальную роль
    const user = await this.authRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    request.user = user;  // кладём юзера С РОЛЬЮ из БД в request
    return true;
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}