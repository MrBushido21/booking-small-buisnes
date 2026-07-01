import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { ServicesEntity } from "./services.entity";
import { BuisnesEntity } from "./buisne.entity";
import { BookingEntity } from "./booking.entity";

interface DaySchedule {
  open: string;
  close: string;
}

export interface WorkTime {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
}

@Entity()
export class MasterEntity {
    @PrimaryGeneratedColumn('uuid')
    id!:string

    @Column()
    name!:string

    @Column()
    specialism!:string

    @Column()
    description!:string

    @Column()
    photo!:string

    @Column({type: "jsonb"})
    work_time!: WorkTime

    @Column()
    auth_id!: string

    @Column()
    buisnes_id!: string

    // владелец связи: тут создаётся связующая таблица master_services
    @ManyToMany(() => ServicesEntity, (service) => service.masters)
    @JoinTable({ name: 'master_services' })
    services!: ServicesEntity[]

    @ManyToOne(() => BuisnesEntity, (buisnes) => buisnes.masters, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'buisnes_id' })
    buisnes!: BuisnesEntity

    @OneToMany(() => BookingEntity, (booking) => booking.master)
    bookings!: BookingEntity[]
}
