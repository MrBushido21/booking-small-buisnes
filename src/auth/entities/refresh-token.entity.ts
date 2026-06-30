import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Сессии (refresh-токены). Ничего лишнего: чей токен и сам токен.
@Entity()
export class RefreshTokenEntity {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column()
    user_id!: string

    @Column()
    jwt_refresh!: string
}
