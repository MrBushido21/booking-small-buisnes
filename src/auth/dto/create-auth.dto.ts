import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from './normalize-email.decorator';

export class CreateAuthDto {
  @ApiProperty({ example: 'user@mail.com', description: 'Email пользователя' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd', minLength: 6, description: 'Пароль (минимум 6 символов)' })
  @IsString()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;
}
