import { defineConfig } from 'vitest/config';

// Suíte do kernel geométrico experimental (Rust → WebAssembly): `npm run test:wasm`. Roda só os testes de
// `packages/geom/src/kernel/` — contrato, carregador, glue/ABI e o diferencial contra o TypeScript.
//
// Separada da suíte padrão de propósito: é o portão do experimento, não do produto. O wasm é carregado do
// artefato commitado (`packages/geom/assets/geom_wasm.wasm`), então a suíte precisa dele em disco; o CI a
// roda no job `wasm`, com `continue-on-error` até o experimento ser promovido. Timeout de 30 s porque a
// primeira instância compila o módulo e o diferencial pode comparar centenas de pares de polígonos.
// Pool de processos limitado a 4 forks (com ~11 workers em paralelo, testes síncronos do TS levavam 2 a 4 vezes mais). Os casos
// de retas a 60 paredes, que passam de 60 s de bloqueio, ficam no config pesado (vitest.wasm.pesado.config.ts, `test:wasm:pesado`).
export default defineConfig({
  test: {
    include: ['packages/geom/src/kernel/**/*.test.ts', 'tests/kernel-a*.wasm.test.ts', 'tests/kernel-b*.wasm.test.ts', 'tests/kernel-invariantes-*.wasm.test.ts', 'tests/kernel-v1-*.wasm.test.ts', 'tests/kernel-gc*.wasm.test.ts'],
    environment: 'node',
    setupFiles: ['tests/kernel-wasm.setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 4 },
    },
  },
});
