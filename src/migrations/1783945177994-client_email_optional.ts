import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientEmailOptional1783945177994 implements MigrationInterface {
    name = 'ClientEmailOptional1783945177994'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "client_email" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "client_email"`);
    }

}
