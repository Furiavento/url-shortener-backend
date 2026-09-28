/**
 * Applies the pending SQL migrations in `drizzle/`. Production images run it
 * before starting the API, since drizzle-kit is only a dev dependency.
 *
 *   pnpm db:migrate:prod
 */
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { validateEnv } from '../config/env.js';
import { createDatabase } from '../database/database.module.js';

// dist/scripts/migrate.js → <project root>/drizzle
const MIGRATIONS_FOLDER = join(import.meta.dirname, '..', '..', 'drizzle');

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on variables already present in the environment.
  }
  const env = validateEnv(process.env);

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

await main();
