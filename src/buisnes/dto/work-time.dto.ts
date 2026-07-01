import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, Matches, ValidateNested } from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayScheduleDto {
  @ApiProperty({ example: '09:00', description: 'Начало рабочего дня, HH:MM' })
  @Matches(TIME_RE, { message: 'Время должно быть в формате HH:MM' })
  open!: string;

  @ApiProperty({ example: '18:00', description: 'Конец рабочего дня, HH:MM' })
  @Matches(TIME_RE, { message: 'Время должно быть в формате HH:MM' })
  close!: string;
}

// Каждый день опционален: отсутствие дня = выходной
export class WorkTimeDto {
  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  monday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  tuesday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  wednesday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  thursday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  friday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  saturday?: DayScheduleDto;

  @ApiPropertyOptional({ type: DayScheduleDto })
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  sunday?: DayScheduleDto;
}
