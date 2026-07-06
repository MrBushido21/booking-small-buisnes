import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsTimezone } from '../../utils/is-timezone.validator';

export class CreateBuisneDto {
  @ApiProperty({ example: 'Салон красоты «Аврора»', description: 'Название салона' })
  @IsString() @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Киев, ул. Крещатик, 1', description: 'Адрес салона' })
  @IsString() @IsNotEmpty()
  address!: string;

  @ApiPropertyOptional({ example: 'Europe/Kyiv', description: 'IANA-таймзона салона (по умолчанию Europe/Kyiv)' })
  @IsOptional() @IsString() @IsTimezone()
  timezone?: string;
}
