import { defineConfig } from 'vitest/config';

/** Ouro das vistas de planta (`npm run test:vistas-ouro`): fora do `npm test` normal, que só enxerga `*.test.ts`. */
export default defineConfig({
  test: {
    include: ['tests/vistas-ouro/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['tests/vitestSetup.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
