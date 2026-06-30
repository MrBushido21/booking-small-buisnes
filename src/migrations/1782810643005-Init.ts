import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1782810643005 implements MigrationInterface {
    name = 'Init1782810643005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "auth_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, CONSTRAINT "UQ_a81b82d945ae1549f6cfe4126d4" UNIQUE ("email"), CONSTRAINT "PK_d3d458da474344a6982aec36b5b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_token_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "jwt_refresh" character varying NOT NULL, CONSTRAINT "PK_a78813e06745b2c5d5b9776bfcf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "reset_token_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "email" character varying NOT NULL, "change_pass_token" character varying NOT NULL, "pass_token_created_at" TIMESTAMP NOT NULL DEFAULT now(), "pass_token_expired_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_447e6239699aafdf3544880af14" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reset_token_entity"`);
        await queryRunner.query(`DROP TABLE "refresh_token_entity"`);
        await queryRunner.query(`DROP TABLE "auth_entity"`);
    }

}
