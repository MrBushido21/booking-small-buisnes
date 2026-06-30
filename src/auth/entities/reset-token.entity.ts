import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

// Коды сброса пароля. Токен хранится хешированным, ищем запись по email/user_id.
@Entity()
export class ResetTokenEntity {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column()
    user_id!: string

    @Column()
    email!: string

    @Column()
    change_pass_token!: string

    @CreateDateColumn()
    pass_token_created_at!: Date

    @Column({ type: 'timestamp' })
    pass_token_expired_at!: Date
}
