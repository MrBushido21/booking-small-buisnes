import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class CancelBookingDto {
    @ApiProperty({example: "uuid", description: "Booking Id"})
    @IsNotEmpty()
    @IsUUID()
    id!:string

    @ApiProperty({example: "uuid", description: "Master Id"})
    @IsNotEmpty()
    @IsUUID()
    master_id!:string
    
    @ApiProperty({example: "uuid", description: "Buisnes Id"})
    @IsNotEmpty()
    @IsUUID()
    buisnes_id!:string
    
}