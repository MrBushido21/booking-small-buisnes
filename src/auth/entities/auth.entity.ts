import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()

export class AuthEntity {
    @PrimaryGeneratedColumn('uuid')
    id!:string

    @Column({unique: true})
    email!:string
    
    @Column()
    password!:string

    @Column({ default: 'master' })
    role!: 'owner' | 'master'
}
