import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEmail, IsNotEmpty, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { NormalizeEmail } from 'src/auth/dto/normalize-email.decorator';
import { WorkTimeDto } from './work-time.dto';

// Ссылка на услугу мастера — валидируем только id
export class ServiceRefDto {
  @ApiProperty({ example: 'uuid', description: 'ID услуги' })
  @IsUUID()
  id!: string;
}

export class CreateMasterDto {
  @ApiProperty({ example: 'master@mail.com', description: 'Email мастера (логин)' })
  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd', minLength: 6, description: 'Пароль мастера' })
  @IsString() @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;

  @ApiProperty({ example: 'Анна', description: 'Имя мастера' })
  @IsString() @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Парикмахер', description: 'Специализация' })
  @IsString() @IsNotEmpty()
  specialism!: string;

  @ApiProperty({ example: '5 лет опыта', description: 'Описание' })
  @IsString()
  description!: string;

  @ApiProperty({ example: '/uploads/abc.jpg', description: 'Ссылка на фото (из POST /buisnes/upload)' })
  @IsString() @IsNotEmpty()
  photo!: string;

  @ApiProperty({ type: WorkTimeDto, description: 'Расписание по дням недели' })
  @ValidateNested() @Type(() => WorkTimeDto)
  work_time!: WorkTimeDto;

  @ApiProperty({ type: [ServiceRefDto], description: 'Услуги, которые оказывает мастер' })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ServiceRefDto)
  services!: ServiceRefDto[];

  @ApiProperty({ example: 'uuid', description: 'ID салона' })
  @IsUUID()
  buisnes_id!: string;
}
