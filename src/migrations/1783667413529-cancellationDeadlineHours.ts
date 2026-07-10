import { MigrationInterface, QueryRunner } from "typeorm";

export class CancellationDeadlineHours1783667413529 implements MigrationInterface {
    name = 'CancellationDeadlineHours1783667413529'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "buisnes_entity" ADD "cancellationDeadlineHours" integer NOT NULL DEFAULT '3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "buisnes_entity" DROP COLUMN "cancellationDeadlineHours"`);
    }

}
