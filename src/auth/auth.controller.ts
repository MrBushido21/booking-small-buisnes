import { Controller, Post, Body, Patch, Res, UseGuards, Req, UnauthorizedException, HttpCode } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import type {Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../guard/guard';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangeForgottenPasswordDto } from './dto/change-forgotten-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Кладём refresh-токен в httpOnly cookie — на фронт отдаём только accessToken
  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });
  }

  @Post('registration')
  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiCreatedResponse({ description: 'Пользователь создан, возвращается accessToken' })
  @ApiConflictResponse({ description: 'Пользователь с таким email уже существует' })
  async registration(
    @Body() body: CreateAuthDto,
    @Res() res: Response
  ) {
    const { accessToken, refreshToken } = await this.authService.create(body);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken })
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })  // не больше 5 попыток входа в минуту с IP
  @ApiOperation({ summary: 'Вход по email и паролю' })
  @ApiCreatedResponse({ description: 'Успешный вход, возвращается accessToken' })
  @ApiUnauthorizedResponse({ description: 'Неверный логин или пароль' })
  async login(
    @Body() body: LoginDto,
    @Res() res: Response
  ) {
    const { accessToken, refreshToken } = await this.authService.login(body);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken })
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('change-password')
  @ApiOperation({ summary: 'Смена пароля авторизованным пользователем' })
  @ApiCreatedResponse({ description: 'Пароль изменён, возвращается новый accessToken' })
  @ApiUnauthorizedResponse({ description: 'Пользователь не авторизован или неверный текущий пароль' })
  async changePass(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: ChangePasswordDto
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Пользователь не авторизован');
    const { accessToken, refreshToken } = await this.authService.changePassword(body, user);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken })
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })  // не больше 3 запросов сброса в минуту с IP
  @ApiOperation({ summary: 'Запрос ссылки на сброс пароля' })
  @ApiOkResponse({ description: 'Если email существует, на него отправлено письмо' })
  async forgotPass(
    @Body() body: ForgotPasswordDto
  ) {
    // одинаковый ответ независимо от того, есть ли такой email — чтобы не палить наличие аккаунта
    const link = await this.authService.forgotPass(body.email);
    // link отдаём только для dev (письма пока нет); в проде это поле стоит убрать
    return { message: 'Если такой email существует, на него отправлена ссылка для сброса пароля', link };
  }

  @Patch('change-forgotten-password')
  @ApiOperation({ summary: 'Установка нового пароля по токену из письма' })
  @ApiCreatedResponse({ description: 'Пароль сброшен, возвращается accessToken' })
  @ApiBadRequestResponse({ description: 'Невалидный или просроченный токен' })
  async changeForgotenPass(
    @Res() res: Response,
    @Body() body: ChangeForgottenPasswordDto
  ) {
    const { accessToken, refreshToken } = await this.authService.changeForgotenPass(body);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken })
  }

  @Post('/refresh') 
  async refresh(
    @Req() req:Request,
    @Res() res: Response,
  ) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('Нет refresh-токена');
    
    const { accessToken, refreshToken } = await this.authService.refreshToken(token);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken })
  }
}
