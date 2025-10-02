import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPartnerWorkflowAndUserProfile1700000005000 implements MigrationInterface {
  name = "AddPartnerWorkflowAndUserProfile1700000005000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        ADD COLUMN IF NOT EXISTS approval_stage varchar NOT NULL DEFAULT 'fiscal',
        ADD COLUMN IF NOT EXISTS approval_history jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS display_name varchar,
        ADD COLUMN IF NOT EXISTS profile varchar,
        ADD COLUMN IF NOT EXISTS responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS responsibilities,
        DROP COLUMN IF EXISTS profile,
        DROP COLUMN IF EXISTS display_name;
    `);

    await queryRunner.query(`
      ALTER TABLE business_partners
        DROP COLUMN IF EXISTS approval_history,
        DROP COLUMN IF EXISTS approval_stage;
    `);
  }
}
