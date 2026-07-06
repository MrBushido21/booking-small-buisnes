import { MigrationInterface, QueryRunner } from "typeorm";

export class NoOverlap1783327653027 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`)
        await queryRunner.query(`
            ALTER TABLE "booking_entity"
            ADD CONSTRAINT "no_overlap"
            EXCLUDE USING GIST (master_id WITH =, tstzrange(starts_at, ends_at) WITH &&) 
            WHERE (status = 'confirmed')
            `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT "no_overlap"`);
    }

}

