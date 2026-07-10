import { Column, Entity, Index, JoinColumn, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MasterEntity } from "./master.entity";
import { BuisnesEntity } from "./buisne.entity";
import { BookingEntity } from "./booking.entity";

@Entity()
export class ServicesEntity {
    @PrimaryGeneratedColumn('uuid')
    id!:string

    @Column()
    service!:string

    @Column('int')
    duration!:number // длительность услуги в минутах

    @Column('numeric', { precision: 10, scale: 2 })
    price!:number

    @Index()
    @Column()
    buisnes_id!: string

    @ManyToMany(() => MasterEntity, (master) => master.services)
    masters!: MasterEntity[]

    @ManyToOne(() => BuisnesEntity, (buisnes) => buisnes.services, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'buisnes_id' })
    buisnes!: BuisnesEntity

    @OneToMany(() => BookingEntity, (booking) => booking.service)
    bookings!: BookingEntity[]
}
