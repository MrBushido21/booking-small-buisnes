import { PartialType } from '@nestjs/swagger';
import { CreateBuisneDto } from './create-buisne.dto';

export class UpdateBuisneDto extends PartialType(CreateBuisneDto) {}
