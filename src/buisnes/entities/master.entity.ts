import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { ServicesEntity } from "./services.entity";
import { BuisnesEntity } from "./buisne.entity";
import { BookingEntity } from "./booking.entity";
import { AuthEntity } from "../../auth/entities/auth.entity";

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

    @Index({ unique: true })
    @Column({ type: 'uuid' })
    auth_id!: string

    @Index()
    @Column()
    buisnes_id!: string

    @ManyToMany(() => ServicesEntity, (service) => service.masters)
    @JoinTable({ name: 'master_services' })
    services!: ServicesEntity[]

    @ManyToOne(() => BuisnesEntity, (buisnes) => buisnes.masters, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'buisnes_id' })
    buisnes!: BuisnesEntity

    // FK на аккаунт мастера: удалили аккаунт → удалился и мастер (нет сирот)
    @ManyToOne(() => AuthEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'auth_id' })
    auth!: AuthEntity

    @OneToMany(() => BookingEntity, (booking) => booking.master)
    bookings!: BookingEntity[]
}
