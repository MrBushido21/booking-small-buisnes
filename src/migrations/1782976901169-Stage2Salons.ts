import { MigrationInterface, QueryRunner } from "typeorm";

export class Stage2Salons1782976901169 implements MigrationInterface {
    name = 'Stage2Salons1782976901169'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "booking_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "service_name" character varying NOT NULL, "service_id" character varying NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "master_id" uuid NOT NULL, CONSTRAINT "PK_ab285d4d9e829aa0fc5f679c7e2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_106d9f3d5367c141bae820d9b4" ON "booking_entity"  ("service_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_98063d65360bd5f09a94c97dab" ON "booking_entity"  ("master_id", "starts_at") `);
        await queryRunner.query(`CREATE TABLE "master_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "specialism" character varying NOT NULL, "description" character varying NOT NULL, "photo" character varying NOT NULL, "work_time" jsonb NOT NULL, "auth_id" character varying NOT NULL, "buisnes_id" uuid NOT NULL, CONSTRAINT "PK_ea73e3c936cd569cf091620b7fd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b1d5baa827fc1b70bc244daee0" ON "master_entity"  ("auth_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4c529a060861986750aa099ed8" ON "master_entity"  ("buisnes_id") `);
        await queryRunner.query(`CREATE TABLE "services_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "service" character varying NOT NULL, "duration" integer NOT NULL, "price" numeric(10,2) NOT NULL, "buisnes_id" uuid NOT NULL, CONSTRAINT "PK_4142d814ae1d507fee7dd5425b1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ef55a947cd74c176f98b36b810" ON "services_entity"  ("buisnes_id") `);
        await queryRunner.query(`CREATE TABLE "buisnes_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" character varying NOT NULL, "title" character varying NOT NULL, "address" character varying NOT NULL, "timezone" character varying NOT NULL DEFAULT 'Europe/Kyiv', CONSTRAINT "PK_0b8fa63d91a846c81338c5f75a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c0e2cc2cbdb53dd0c73227acbc" ON "buisnes_entity"  ("owner_id") `);
        await queryRunner.query(`CREATE TABLE "master_services" ("masterEntityId" uuid NOT NULL, "servicesEntityId" uuid NOT NULL, CONSTRAINT "PK_7ae919cfbd8d2ef53587313b723" PRIMARY KEY ("masterEntityId", "servicesEntityId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7f6939797e970f3c6cff4d466c" ON "master_services"  ("masterEntityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5c1cfd1b20cb4b0fa8db1645e0" ON "master_services"  ("servicesEntityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_06d69eb4c771cb92bab441f67a" ON "refresh_token_entity"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3bd246fbcfd8a4241b466ef13c" ON "reset_token_entity"  ("user_id") `);
        await queryRunner.query(`ALTER TABLE "booking_entity" ADD CONSTRAINT "FK_2585ec3eadfe908e07c5c5145f9" FOREIGN KEY ("master_id") REFERENCES "master_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "master_entity" ADD CONSTRAINT "FK_4c529a060861986750aa099ed8c" FOREIGN KEY ("buisnes_id") REFERENCES "buisnes_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "services_entity" ADD CONSTRAINT "FK_ef55a947cd74c176f98b36b810a" FOREIGN KEY ("buisnes_id") REFERENCES "buisnes_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "master_services" ADD CONSTRAINT "FK_7f6939797e970f3c6cff4d466c1" FOREIGN KEY ("masterEntityId") REFERENCES "master_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "master_services" ADD CONSTRAINT "FK_5c1cfd1b20cb4b0fa8db1645e09" FOREIGN KEY ("servicesEntityId") REFERENCES "services_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "master_services" DROP CONSTRAINT "FK_5c1cfd1b20cb4b0fa8db1645e09"`);
        await queryRunner.query(`ALTER TABLE "master_services" DROP CONSTRAINT "FK_7f6939797e970f3c6cff4d466c1"`);
        await queryRunner.query(`ALTER TABLE "services_entity" DROP CONSTRAINT "FK_ef55a947cd74c176f98b36b810a"`);
        await queryRunner.query(`ALTER TABLE "master_entity" DROP CONSTRAINT "FK_4c529a060861986750aa099ed8c"`);
        await queryRunner.query(`ALTER TABLE "booking_entity" DROP CONSTRAINT "FK_2585ec3eadfe908e07c5c5145f9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bd246fbcfd8a4241b466ef13c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06d69eb4c771cb92bab441f67a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5c1cfd1b20cb4b0fa8db1645e0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7f6939797e970f3c6cff4d466c"`);
        await queryRunner.query(`DROP TABLE "master_services"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c0e2cc2cbdb53dd0c73227acbc"`);
        await queryRunner.query(`DROP TABLE "buisnes_entity"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ef55a947cd74c176f98b36b810"`);
        await queryRunner.query(`DROP TABLE "services_entity"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c529a060861986750aa099ed8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b1d5baa827fc1b70bc244daee0"`);
        await queryRunner.query(`DROP TABLE "master_entity"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98063d65360bd5f09a94c97dab"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_106d9f3d5367c141bae820d9b4"`);
        await queryRunner.query(`DROP TABLE "booking_entity"`);
    }

}
