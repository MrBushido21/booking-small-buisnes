import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthEntity } from './entities/auth.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ResetTokenEntity } from './entities/reset-token.entity';
import { hashPassword, matchPassword } from '../utils/utils';
import { TokenService } from './jwt.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeForgottenPasswordDto } from './dto/change-forgotten-password.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: TokenService,
    private readonly dataSource: DataSource,
    @InjectRepository(AuthEntity)
    private readonly authRepo: Repository<AuthEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(ResetTokenEntity)
    private readonly resetRepo: Repository<ResetTokenEntity>
  ) { }

  async createAndSaveTokens(id: string, email: string, type?: "transaction") {
    const { accessToken, refreshToken } = await this.jwtService.generateTokens({ sub: id, email: email })
    if (type) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(RefreshTokenEntity, { user_id: id });
        await manager.save(RefreshTokenEntity, {
          jwt_refresh: refreshToken,
          user_id: id,
        });
      });
    } else {
      await this.refreshRepo.save({ jwt_refresh: refreshToken, user_id: id })
    }
    return { accessToken, refreshToken }
  }

  async create(body: CreateAuthDto) {
    const existing = await this.authRepo.findOne({ where: { email: body.email } })
    if (existing) throw new ConflictException('Пользователь с таким email уже существует');
    const hashedPass = await hashPassword(body.password)
    const user = await this.authRepo.save({ email: body.email, password: hashedPass, role: 'owner' })
    const { accessToken, refreshToken } = await this.createAndSaveTokens(user.id, user.email)
    return { accessToken, refreshToken }
  }

  async createMaster(email: string, password: string, manager: EntityManager) {
    const repo = manager.getRepository(AuthEntity)
    const existing = await repo.findOne({ where: { email } })
    if (existing) throw new ConflictException('Пользователь с таким email уже существует')
    const hashed = await hashPassword(password)
    return await repo.save(repo.create({ email, password: hashed, role: 'master' }))
  }

  async login(body: LoginDto) {
    const user = await this.authRepo.findOne({ where: { email: body.email } })
    if (!user) throw new UnauthorizedException("Неверный логин или пароль")
    const matchPass = await matchPassword(body.password, user.password)
    if (!matchPass) throw new UnauthorizedException("Неверный логин или пароль")
    
    const { accessToken, refreshToken } = await this.createAndSaveTokens(user.id, user.email, "transaction")
    if (user.role === "owner") {
      return { accessToken, refreshToken }
    } else {
      return { accessToken, refreshToken, auth_id: user.id }
    }
  }

  async changePassword(body: ChangePasswordDto, user: AuthEntity) {
    const matchPass = await matchPassword(body.currentPass, user.password)
    if (!matchPass) throw new UnauthorizedException("Неверный пароль")
    const hashedPass = await hashPassword(body.newPassword)
    await this.authRepo.update({ id: user.id }, { password: hashedPass })
    const { accessToken, refreshToken } = await this.createAndSaveTokens(user.id, user.email, "transaction")
    return { accessToken, refreshToken }
  }

  async forgotPass(email: string) {
    const user = await this.authRepo.findOne({ where: { email } })
    if (!user) return
    const rawToken = crypto.randomBytes(32).toString('hex');
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const hasedChangePassToken = await hashPassword(rawToken)
    await this.resetRepo.save({
      change_pass_token: hasedChangePassToken, user_id: user.id, email: user.email,
      pass_token_expired_at: new Date(Date.now() + FIFTEEN_MIN)
    })
    const link = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    // await this.mailService.send(
    //   user.email,
    //   'Восстановление пароля',
    //   `<p>Для сброса пароля перейдите по ссылке (действует 1 час):</p>
    //    <a href="${link}">${link}</a>`,
    // );
    return link // Что бы продемонстрировать и получить токен
  }

  async changeForgotenPass(body: ChangeForgottenPasswordDto) {
    const user = await this.authRepo.findOne({ where: { email: body.email } })
    if (!user) throw new BadRequestException('Не валидный токен')

    // токен в БД хеширован, поэтому берём все коды юзера и сверяем bcrypt-ом
    const records = await this.resetRepo.find({ where: { user_id: user.id } })
    let matched: ResetTokenEntity | undefined
    for (const rec of records) {
      if (!rec.change_pass_token) continue
      if (await matchPassword(body.token, rec.change_pass_token)) {
        matched = rec
        break
      }
    }
    if (!matched) throw new BadRequestException('Не валидный токен')
    if (matched.pass_token_expired_at && matched.pass_token_expired_at < new Date()) {
      throw new BadRequestException('Срок действия ссылки истёк')
    }

    const hashedPass = await hashPassword(body.newPassword)
    await this.authRepo.update({ id: user.id }, { password: hashedPass })
    // удаляем только коды сброса этого пользователя; рефреши пересоздаст createAndSaveTokens
    await this.resetRepo.delete({ user_id: user.id })

    const { accessToken, refreshToken } = await this.createAndSaveTokens(user.id, user.email, "transaction")
    return { accessToken, refreshToken }
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyRefresh(token);
      const { accessToken, refreshToken } = await this.createAndSaveTokens(payload.sub, payload.email, "transaction")
      return { accessToken, refreshToken }
    } catch (error) {
      throw new UnauthorizedException('Refresh-токен невалиден или истёк');
    }

  }

}
