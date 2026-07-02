import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { ServicesEntity } from "./services.entity";
import { MasterEntity } from "./master.entity";

@Entity()
export class BuisnesEntity {
    @PrimaryGeneratedColumn('uuid')
    id!:string

    @Index()
    @Column()
    owner_id!:string

    @Column()
    title!:string

    @Column()
    address!:string

    @Column({ default: 'Europe/Kyiv' })
    timezone!: string

    @OneToMany(() => ServicesEntity, (services) => services.buisnes)
    services!: ServicesEntity[]

    @OneToMany(() => MasterEntity, (master) => master.buisnes)
    masters!: MasterEntity[]
}
