import { Controller, Post, Body, UseGuards, Req, UseInterceptors, UploadedFile, BadRequestException, Res, Get, Query, Patch, Param, UnauthorizedException, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BuisnesService } from './buisnes.service';
import { JwtAuthGuard } from 'src/guard/guard';
import type { Request, Response } from 'express';
import { photoMulterOptions } from 'src/common/upload.config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse,
  ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginDto } from 'src/auth/dto/login.dto';
import { CreateBuisneDto } from './dto/create-buisne.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateMasterDto } from './dto/create-master.dto';
import { WeekDto } from './dto/week.dto';
import { GetBookingDto } from './dto/get-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancell-booking.dto';

@ApiTags('buisnes')
@Controller('buisnes')
export class BuisnesController {
  constructor(private readonly buisnesService: BuisnesService) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Создать салон (только owner)' })
  @ApiForbiddenResponse({ description: 'Нет прав owner' })
  buisnes_create(@Body() body: CreateBuisneDto, @Req() req: Request) {
    return this.buisnesService.buisnes_create(body, req.user!);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('services')
  @ApiOperation({ summary: 'Создать услугу в своём салоне (только owner)' })
  @ApiForbiddenResponse({ description: 'Нет прав owner' })
  services_create(@Body() body: CreateServiceDto, @Req() req: Request) {
    return this.buisnesService.services_create(body, req.user!);
  }

  // Шаг 1 загрузки: файл → ссылка, которую кладут в photo при создании мастера.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить фото, вернёт { url }' })
  @UseInterceptors(FileInterceptor('photo', photoMulterOptions))
  upload(@UploadedFile() photo: Express.Multer.File) {
    if (!photo) throw new BadRequestException('Файл не передан');
    return { url: `/uploads/${photo.filename}` };
  }

  // Шаг 2: создание мастера обычным JSON, photo — ссылка из /upload
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('masters')
  @ApiOperation({ summary: 'Создать мастера в своём салоне (только owner)' })
  @ApiForbiddenResponse({ description: 'Нет прав owner' })
  masters_create(@Body() body: CreateMasterDto, @Req() req: Request) {
    return this.buisnesService.masters_create(body, req.user!);
  }

  // Мастер задаёт/меняет своё расписание (в т.ч. выходной). Правит только свою запись — по auth_id из токена.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('week')
  @ApiOperation({ summary: 'Мастер задаёт своё расписание' })
  master_post_week(@Body() body: WeekDto, @Req() req: Request) {
    return this.buisnesService.master_post_week(body, req.user!);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // не больше 5 попыток входа в минуту с IP
  @ApiOperation({ summary: 'Вход мастера по email и паролю' })
  @ApiCreatedResponse({ description: 'Успешный вход, возвращается accessToken' })
  @ApiUnauthorizedResponse({ description: 'Неверный логин или пароль' })
  async login(@Body() body: LoginDto, @Res() res: Response) {
    const { accessToken, refreshToken } = await this.buisnesService.master_login(body);
    this.setRefreshCookie(res, refreshToken);
    return res.status(201).json({ accessToken });
  }

  @Get('/booking')
  @ApiOperation({ summary: 'Просмтотр для юзера свободных слотов в конкретный день' })
  @ApiCreatedResponse({ description: 'Возвращает свободные слоты в конкретный день' })
  getBookingTime(@Query() query: GetBookingDto) {
    return this.buisnesService.getBookingFomDay(query.master_id, query.date, query.service_id);
  }


  @UseGuards(JwtAuthGuard)
  @Get('master/booking')
  @ApiOperation({ summary: 'Мастер просматривает свои записи' })
  @ApiCreatedResponse({ description: 'Возвращает все записи за 30 дней' })
  @ApiUnauthorizedResponse({ description: 'Неверный логин или пароль' })
  getBookingTimeMaster(
    @Req() req: Request
  ) {
    const master = req.user!
    const master_id = master.id
    return this.buisnesService.getBookingTime(master_id)
  }

  @Post('/booking')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Клиент делает бронь' })
  @ApiCreatedResponse({ description: 'Если успех возвращает данные о записи' })
  @ApiConflictResponse({ description: 'Слот занят или бронь уже существует' })
  createBooking(
    @Body() body: CreateBookingDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    return this.buisnesService.createBooking(body, idempotencyKey)
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/booking')
  @ApiOperation({ summary: 'Владелец отменяет бронь' })
  @ApiCreatedResponse({ description: 'Если успех возвращает данные о записи с новым статусом' })
  @ApiConflictResponse({ description: 'Слот занят или бронь уже существует' })
  cancellBooking(
    @Body() body: CancelBookingDto,
    @Req() req: Request
  ) {
    const owner = req.user
    const owner_id = owner!.id
    return this.buisnesService.cancellBooking(body.id, body.master_id, body.buisnes_id, owner_id)
  }
}
