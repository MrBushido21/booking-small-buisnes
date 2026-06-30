import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// Ловит ВСЕ исключения и приводит ответ к единому виду (envelope).
// @Catch() без аргументов = перехватывает любые ошибки, не только HttpException.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // HttpException несёт свой статус; всё остальное считаем 500
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // вытаскиваем человекочитаемое сообщение
    let message: string | string[] = 'Внутренняя ошибка сервера';
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      // getResponse() может вернуть строку или объект { message, error, statusCode }
      message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
    }

    // 5xx — это уже наш баг, его стоит залогировать со стеком
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
