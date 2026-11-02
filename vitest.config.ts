import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Testes de desempenho (limites de razão) não entram no portão normal: rodam em `npm run test:perf`
    // (vitest.perf.config.ts), isolados, porque medem tempo e reprovam por contenção com a suíte paralela.
    // O kernel geométrico experimental (docs/decisoes/0045) também tem suíte própria: depende do artefato
    // wasm e compara duas implementações, então roda em `npm run test:wasm` (vitest.wasm.config.ts).
    exclude: [...configDefaults.exclude, '**/*perf.test.ts', 'packages/geom/src/kernel/*.test.ts', 'packages/geom/src/kernel/v2/*.wasm.test.ts'],
    environment: 'node',
    // Cede o event loop entre os testes para não estourar o timeout do birpc (I-1b; ver tests/vitestSetup.ts).
    setupFiles: ['tests/vitestSetup.ts'],
  },
});
