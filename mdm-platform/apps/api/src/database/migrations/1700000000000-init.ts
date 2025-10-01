import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000'
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS business_partners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo_pessoa varchar NOT NULL,
        natureza varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'draft',
        nome_legal varchar NOT NULL,
        nome_fantasia varchar,
        documento varchar NOT NULL,
        ie varchar,
        im varchar,
        suframa varchar,
        regime_tributario varchar,
        contato_principal jsonb NOT NULL DEFAULT '{}'::jsonb,
        addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
        banks jsonb NOT NULL DEFAULT '[]'::jsonb,
        sap_segments jsonb NOT NULL DEFAULT '[]'::jsonb
      );
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS business_partners;`);
  }
}