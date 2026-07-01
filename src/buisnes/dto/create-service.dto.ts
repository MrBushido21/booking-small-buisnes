import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Стрижка мужская', description: 'Название услуги' })
  @IsNotEmpty()
  service!: string;

  @ApiProperty({ example: 60, description: 'Длительность услуги в минутах' })
  @IsInt() @Min(1)
  duration!: number;

  @ApiProperty({ example: 500, description: 'Цена услуги' })
  @IsNumber() @Min(0)
  price!: number;

  @ApiProperty({ example: 'uuid', description: 'ID салона, к которому относится услуга' })
  @IsUUID()
  buisnes_id!: string;
}
