import { MigrationInterface, QueryRunner } from "typeorm";

export class BookingServiceFK1783520474267 implements MigrationInterface {
    name = 'BookingServiceFK1783520474267'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT "no_overlap"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_106d9f3d5367c141bae820d9b4"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "service_id"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "service_id" uuid NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_106d9f3d5367c141bae820d9b4" ON "booking_entity"  ("service_id") `);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD CONSTRAINT "FK_106d9f3d5367c141bae820d9b48" FOREIGN KEY ("service_id") REFERENCES "services_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT "FK_106d9f3d5367c141bae820d9b48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_106d9f3d5367c141bae820d9b4"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP COLUMN "service_id"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD "service_id" character varying NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_106d9f3d5367c141bae820d9b4" ON "booking_entity" USING btree ("service_id") `);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD CONSTRAINT "no_overlap" EXCLUDE USING gist (master_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (((status)::text = 'confirmed'::text))`);
    }

}
