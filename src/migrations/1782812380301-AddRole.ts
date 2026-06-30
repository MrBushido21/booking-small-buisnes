import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRole1782812380301 implements MigrationInterface {
    name = 'AddRole1782812380301'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auth_entity" ADD "role" character varying NOT NULL DEFAULT 'master'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auth_entity" DROP COLUMN "role"`);
    }

}
