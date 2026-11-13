import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        'src/shared/schedule.ts': { branches: 100 },
        'src/tasks/completions.ts': { branches: 100 },
        'src/tasks/ownership.ts': { branches: 100 },
        'src/shopping/items.ts': { branches: 100 },
      },
    },
    // The suite runs several times slower on CI than on a laptop.
    testTimeout: 15000,
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.ts', 'container/**/__tests__/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['app/**/__tests__/**/*.test.{ts,tsx}'],
          exclude: ['e2e/**', 'node_modules/**'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
