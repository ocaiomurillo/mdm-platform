import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPartnerTimestamps1700000007000 implements MigrationInterface {
  name = "AddPartnerTimestamps1700000007000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    `);

    await queryRunner.query(`
      UPDATE business_partners
      SET created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now());
    `);

    await queryRunner.query(`
      ALTER TABLE business_partners
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN updated_at SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        DROP COLUMN IF EXISTS created_at,
        DROP COLUMN IF EXISTS updated_at;
    `);
  }
}
