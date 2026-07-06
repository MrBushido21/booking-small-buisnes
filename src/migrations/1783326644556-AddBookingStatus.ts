import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBookingStatus1783326644556 implements MigrationInterface {
    name = 'AddBookingStatus1783326644556'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "status" character varying NOT NULL DEFAULT 'confirmed'`);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "client_name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "client_phone" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "client_phone"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "client_name"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "status"`);
    }

}
