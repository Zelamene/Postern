import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Runs the unit and integration suites as separate projects so their
    // coverage maps are merged into one report by the v8 provider.
    projects: ['./vitest.config.ts', './vitest.integration.config.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/**/*.d.ts'],
    },
  },
})
