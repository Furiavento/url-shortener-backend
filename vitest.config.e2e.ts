import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on variables already present in the environment.
}

// E2E tests truncate every table, so never point them at the development database.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: { DATABASE_URL: databaseUrl ?? '' },
    // Test files share one database.
    fileParallelism: false,
  },
});
