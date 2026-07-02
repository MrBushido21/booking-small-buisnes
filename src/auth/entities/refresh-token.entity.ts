import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Сессии (refresh-токены). Ничего лишнего: чей токен и сам токен.
@Entity()
export class RefreshTokenEntity {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Index()
    @Column()
    user_id!: string

    @Column()
    jwt_refresh!: string
}
