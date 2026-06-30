import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldP@ssw0rd', description: 'Текущий пароль' })
  @IsString()
  @MinLength(6)
  currentPass!: string;

  @ApiProperty({ example: 'NewP@ssw0rd', minLength: 6, description: 'Новый пароль (минимум 6 символов)' })
  @IsString()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  newPassword!: string;
}
