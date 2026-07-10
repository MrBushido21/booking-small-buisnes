import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class GetBookingDto {
    @ApiProperty({example: "uuid", description: "ID master"})
    @IsNotEmpty()
    @IsUUID()
    master_id!:string

    @ApiProperty({example: "2026-07-20", description: "Date of booking"})
    @IsNotEmpty()
    date!:string
    
    @ApiProperty({example: "uuid", description: "ID service"})
    @IsNotEmpty()
    @IsUUID()
    service_id!:string
}