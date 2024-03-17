import { DatabaseExtension } from 'src/interfaces/database.interface';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';

let url = process.env.DB_URL;
if (!url) {
  const host = process.env.DB_HOSTNAME || 'database';
  const port = Number.parseInt(process.env.DB_PORT || '5432');
  const username = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const database = process.env.DB_DATABASE_NAME || 'immich';
  url = `postgres://${username}:${password}@${host}:${port}/${database}`;
  process.env.DB_URL = url;
}

/* eslint unicorn/prefer-module: "off" -- We can fix this when migrating to ESM*/
export const databaseConfig: PostgresConnectionOptions = {
  type: 'postgres',
  entities: [__dirname + '/entities/*.entity.{js,ts}'],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  subscribers: [__dirname + '/subscribers/*.{js,ts}'],
  migrationsRun: false,
  synchronize: false,
  connectTimeoutMS: 10_000, // 10 seconds
  parseInt8: true,
  url,
};

/**
 * @deprecated - DO NOT USE THIS
 *
 * this export is ONLY to be used for TypeORM commands in package.json#scripts
 */
export const dataSource = new DataSource({ ...databaseConfig, host: 'localhost' });

export const vectorExt =
  process.env.DB_VECTOR_EXTENSION === 'pgvector' ? DatabaseExtension.VECTOR : DatabaseExtension.VECTORS;
