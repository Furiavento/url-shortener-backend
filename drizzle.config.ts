import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on variables already present in the environment.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
