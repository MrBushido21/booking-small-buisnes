import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { WorkTimeDto } from './work-time.dto';

export class WeekDto {
  @ApiProperty({ type: WorkTimeDto, description: 'Расписание мастера по дням недели (пустой день = выходной)' })
  @ValidateNested() @Type(() => WorkTimeDto)
  work_time!: WorkTimeDto;
}
