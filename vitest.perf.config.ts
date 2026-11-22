import { defineConfig } from 'vitest/config';

// Suíte de desempenho: `npm run test:perf`. Arquivos `*perf.test.ts`, um por vez (sem paralelismo entre
// arquivos), para que a medida não dispute CPU com outros testes. Os limites são razões contra uma
// tarefa-base cronometrada no mesmo processo (ver perf.test.ts), não milissegundos absolutos.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*perf.test.ts', 'apps/*/src/**/*perf.test.ts'],
    environment: 'node',
    fileParallelism: false,
    // Os testes de prancha são síncronos e levam dezenas de segundos; sem ceder o event loop entre eles, o
    // birpc do worker dá `Timeout calling "onTaskUpdate"` e o run sai 1 sem falha de asserção (mesmo motivo
    // do setup da suíte normal, I-1b). Um fork único também evita a disputa de CPU entre workers.
    setupFiles: ['tests/vitestSetup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 180_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
  },
});
