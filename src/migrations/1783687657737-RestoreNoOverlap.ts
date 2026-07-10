import { MigrationInterface, QueryRunner } from "typeorm";

export class RestoreNoOverlap1783687657737 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`)
        // сносим то, что могло остаться (в т.ч. добавленное руками), и ставим заново из миграции
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT IF EXISTS "no_overlap"`)
        await queryRunner.query(`
            ALTER TABLE "booking_entity"
            ADD CONSTRAINT "no_overlap"
            EXCLUDE USING GIST (master_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
            WHERE (status = 'confirmed')
            `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT IF EXISTS "no_overlap"`);
    }

}
