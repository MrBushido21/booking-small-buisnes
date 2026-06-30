import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from './normalize-email.decorator';

export class ChangeForgottenPasswordDto {
  @ApiProperty({ example: 'user@mail.com', description: 'Email пользователя, для которого сбрасываем пароль' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ description: 'Токен сброса пароля из письма' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NewP@ssw0rd', minLength: 6, description: 'Новый пароль (минимум 6 символов)' })
  @IsString()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  newPassword!: string;
}
