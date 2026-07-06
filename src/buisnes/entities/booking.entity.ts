import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MasterEntity } from "./master.entity";

@Entity()
@Index(['master_id', 'starts_at'])
export class BookingEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column()
    service_name!: string 

    @Index()
    @Column()
    service_id!: string

    @Column({ type: 'timestamptz' })
    starts_at!: Date

    @Column({ type: 'timestamptz' })
    ends_at!: Date

    @Column({default: "confirmed"})
    status!: "pending" | "confirmed" | "cancelled" | "completed"

    @Column()
    client_name!: string

    @Column()
    client_phone!:string

    @Column()
    master_id!: string

    @ManyToOne(() => MasterEntity, (master) => master.bookings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'master_id' })
    master!: MasterEntity
}
