import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()

export class AuthEntity {
    @PrimaryGeneratedColumn('uuid')
    id!:string

    @Column({unique: true})
    email!:string
    
    @Column()
    password!:string

    // owner — тот, кто зарегистрировался сам; master заводит owner на этапе 2
    @Column({ default: 'master' })
    role!: 'owner' | 'master'
}
