import { MigrationInterface, QueryRunner } from "typeorm";

export class MasterAuthFk1782980987502 implements MigrationInterface {
    name = 'MasterAuthFk1782980987502'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b1d5baa827fc1b70bc244daee0"`);
        await queryRunner.query(`ALTER TABLE "master_entity" DROP COLUMN "auth_id"`);
        await queryRunner.query(`ALTER TABLE "master_entity" ADD "auth_id" uuid NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b1d5baa827fc1b70bc244daee0" ON "master_entity"  ("auth_id") `);
        await queryRunner.query(`ALTER TABLE "master_entity" ADD CONSTRAINT "FK_b1d5baa827fc1b70bc244daee05" FOREIGN KEY ("auth_id") REFERENCES "auth_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "master_entity" DROP CONSTRAINT "FK_b1d5baa827fc1b70bc244daee05"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b1d5baa827fc1b70bc244daee0"`);
        await queryRunner.query(`ALTER TABLE "master_entity" DROP COLUMN "auth_id"`);
        await queryRunner.query(`ALTER TABLE "master_entity" ADD "auth_id" character varying NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b1d5baa827fc1b70bc244daee0" ON "master_entity" USING btree ("auth_id") `);
    }

}
