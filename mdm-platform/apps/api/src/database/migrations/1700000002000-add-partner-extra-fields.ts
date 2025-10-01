import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPartnerExtraFields1700000002000 implements MigrationInterface {
  name = 'AddPartnerExtraFields1700000002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        ADD COLUMN IF NOT EXISTS comunicacao jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS fornecedor_info jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS vendas_info jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS fiscal_info jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS transportadores jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS credito_info jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        DROP COLUMN IF EXISTS comunicacao,
        DROP COLUMN IF EXISTS fornecedor_info,
        DROP COLUMN IF EXISTS vendas_info,
        DROP COLUMN IF EXISTS fiscal_info,
        DROP COLUMN IF EXISTS transportadores,
        DROP COLUMN IF EXISTS credito_info;
    `);
  }
}