import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from './normalize-email.decorator';

export class LoginDto {
  @ApiProperty({ example: 'user@mail.com', description: 'Email пользователя' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd', description: 'Пароль' })
  @IsString()
  @MinLength(6)
  password!: string;
}
