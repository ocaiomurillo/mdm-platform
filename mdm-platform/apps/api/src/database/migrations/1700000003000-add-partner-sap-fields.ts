import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPartnerSapFields1700000003000 implements MigrationInterface {
  name = "AddPartnerSapFields1700000003000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        ADD COLUMN IF NOT EXISTS mdm_partner_id integer,
        ADD COLUMN IF NOT EXISTS sap_bp_id varchar;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.sequences
          WHERE sequence_name = 'business_partners_mdm_partner_id_seq'
        ) THEN
          CREATE SEQUENCE business_partners_mdm_partner_id_seq;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      UPDATE business_partners
      SET mdm_partner_id = nextval('business_partners_mdm_partner_id_seq')
      WHERE mdm_partner_id IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE business_partners
        ALTER COLUMN mdm_partner_id SET DEFAULT nextval('business_partners_mdm_partner_id_seq'),
        ALTER COLUMN mdm_partner_id SET NOT NULL,
        ADD CONSTRAINT uq_business_partners_mdm_partner_id UNIQUE (mdm_partner_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_partners
        DROP CONSTRAINT IF EXISTS uq_business_partners_mdm_partner_id;
    `);

    await queryRunner.query(`
      ALTER TABLE business_partners
        DROP COLUMN IF EXISTS mdm_partner_id,
        DROP COLUMN IF EXISTS sap_bp_id;
    `);

    await queryRunner.query(`
      DROP SEQUENCE IF EXISTS business_partners_mdm_partner_id_seq;
    `);
  }
}