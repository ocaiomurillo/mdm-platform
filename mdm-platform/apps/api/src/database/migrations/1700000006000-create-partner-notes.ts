import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePartnerNotes1700000006000 implements MigrationInterface {
  name = "CreatePartnerNotes1700000006000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
        content text NOT NULL,
        created_by_id uuid NULL,
        created_by_name varchar(255) NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_notes_partner_id_created_at
        ON partner_notes (partner_id, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_partner_notes_partner_id_created_at;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS partner_notes;
    `);
  }
}
