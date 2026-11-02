import { defineConfig } from 'vitest/config';

// Suíte do kernel geométrico experimental (Rust → WebAssembly): `npm run test:wasm`. Roda só os testes de
// `packages/geom/src/kernel/` — contrato, carregador, glue/ABI e o diferencial contra o TypeScript.
//
// Separada da suíte padrão de propósito: é o portão do experimento, não do produto. O wasm é carregado do
// artefato commitado (`packages/geom/assets/geom_wasm.wasm`), então a suíte precisa dele em disco; o CI a
// roda no job `wasm`, com `continue-on-error` até o experimento ser promovido. Timeout de 30 s porque a
// primeira instância compila o módulo e o diferencial pode comparar centenas de pares de polígonos.
export default defineConfig({
  test: {
    include: ['packages/geom/src/kernel/**/*.test.ts', 'tests/kernel-a*.wasm.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
