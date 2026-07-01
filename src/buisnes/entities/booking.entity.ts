import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MasterEntity } from "./master.entity";

@Entity()
export class BookingEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column()
    service_name!: string 

    @Column()
    service_id!: string

    @Column({ type: 'timestamptz' })
    starts_at!: Date

    @Column({ type: 'timestamptz' })
    ends_at!: Date

    @Column()
    master_id!: string

    @ManyToOne(() => MasterEntity, (master) => master.bookings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'master_id' })
    master!: MasterEntity
}
