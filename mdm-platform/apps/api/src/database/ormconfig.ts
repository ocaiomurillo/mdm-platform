import { DataSource } from 'typeorm';

const dbUrl = process.env.DATABASE_URL || 'postgres://mdm:mdm@localhost:5432/mdm';

export default new DataSource({
  type: 'postgres',
  url: dbUrl,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
