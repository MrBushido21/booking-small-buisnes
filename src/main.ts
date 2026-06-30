import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser'
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // вырезает лишние поля
      forbidNonWhitelisted: true, // и кидает ошибку, если они есть
      transform: true,            // превращает payload в инстансы DTO
    }),
  );
  app.use(cookieParser());

  // единый формат всех ошибок
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Freelance API')
    .setDescription('API аутентификации и управления пользователями')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(Number(port));
  console.log(`server started on http://localhost:${port}/`);
  console.log(`swagger docs on http://localhost:${port}/docs`);
}
bootstrap();
