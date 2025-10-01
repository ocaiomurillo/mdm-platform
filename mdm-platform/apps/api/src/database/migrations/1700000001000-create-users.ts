import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsers1700000001000 implements MigrationInterface {
  name = 'CreateUsers1700000001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar NOT NULL UNIQUE,
        password_hash varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO users (email, password_hash)
      VALUES (
        'admin@example.com',
        '$2a$10$jCS9lDnNx2J6y66hR5VEgu4kSv9mx8nc.5DdvCoooTBy.Nt6Q.Hue'
      )
      ON CONFLICT (email) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}