import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsUUID, MinLength } from "class-validator"

export class CreateBookingDto {
    @ApiProperty({example: 'uiid', description: "Master Id"})
    @IsNotEmpty()
    @IsUUID()
    master_id!: string

    @ApiProperty({example: 'uiid', description: "Service Id"})
    @IsNotEmpty()
    @IsUUID()
    service_id!: string

    @ApiProperty({example: '2026-07-20T13:30:00.000Z', description: "Service start time"})
    @IsNotEmpty()
    starts_at!: Date

    @ApiProperty({example: 'Oleg', description: "User name"})
    @IsNotEmpty()
    @MinLength(3)
    client_name!: string

    @ApiProperty({example: '+380777777777', description: "User phone number"})
    @IsNotEmpty()
    @IsPhoneNumber("UA")
    client_phone!: string

   @ApiPropertyOptional({ example: 'example@gmail.com', description: 'User email' })
    @IsOptional()
    @IsEmail()
    client_email?: string;
}