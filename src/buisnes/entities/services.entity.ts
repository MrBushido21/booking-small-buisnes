import { Column, Entity, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MasterEntity } from "./master.entity";
import { BuisnesEntity } from "./buisne.entity";

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

    @Column()
    buisnes_id!: string

    // обратная сторона ManyToMany: @JoinTable живёт в MasterEntity
    @ManyToMany(() => MasterEntity, (master) => master.services)
    masters!: MasterEntity[]

    @ManyToOne(() => BuisnesEntity, (buisnes) => buisnes.services, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'buisnes_id' })
    buisnes!: BuisnesEntity
}
