import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';

/** Brings the test database schema up to date and empties it. */
export default async function setup(project: TestProject): Promise<void> {
  const url = project.config.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against "${url}"`);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: './drizzle' });
    await db.execute(
      sql`truncate table click_events, urls, users restart identity cascade`,
    );
  } finally {
    await pool.end();
  }
}
