import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from './normalize-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@mail.com', description: 'Email для отправки ссылки на сброс пароля' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;
}
