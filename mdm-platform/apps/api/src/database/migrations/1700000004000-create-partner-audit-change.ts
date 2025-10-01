import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePartnerAuditChange1700000004000 implements MigrationInterface {
  name = "CreatePartnerAuditChange1700000004000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_change_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
        request_type varchar(20) NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(30) NOT NULL DEFAULT 'pendente',
        motivo text NULL,
        requested_by varchar(120) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_change_requests_partner_id
        ON partner_change_requests (partner_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_audit_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scope varchar(20) NOT NULL,
        partner_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        status varchar(20) NOT NULL DEFAULT 'queued',
        requested_by varchar(120) NULL,
        error_message text NULL,
        started_at timestamptz NULL,
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid NOT NULL REFERENCES partner_audit_jobs(id) ON DELETE CASCADE,
        partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
        result varchar(20) NOT NULL,
        differences jsonb NULL,
        external_data jsonb NULL,
        message text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_job_id
        ON partner_audit_logs (job_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_audit_logs_partner_id
        ON partner_audit_logs (partner_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS partner_audit_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS partner_audit_jobs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS partner_change_requests;`);
  }
}
