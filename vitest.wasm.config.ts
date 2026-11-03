import { defineConfig } from 'vitest/config';

// Suíte do kernel geométrico experimental (Rust → WebAssembly): `npm run test:wasm`. Roda só os testes de
// `packages/geom/src/kernel/` — contrato, carregador, glue/ABI e o diferencial contra o TypeScript.
//
// Separada da suíte padrão de propósito: é o portão do experimento, não do produto. O wasm é carregado do
// artefato commitado (`packages/geom/assets/geom_wasm.wasm`), então a suíte precisa dele em disco; o CI a
// roda no job `wasm`, com `continue-on-error` até o experimento ser promovido. Timeout de 30 s porque a
// primeira instância compila o módulo e o diferencial pode comparar centenas de pares de polígonos.
// Pool de processos limitado a 4 forks: com ~11 workers em paralelo (padrão) os testes síncronos do polygon-clipping do TS
// (retas a 60 paredes) levavam 2 a 4 vezes mais e 3 testes falhavam por RPC; com 4 forks nenhum falha. O RPC do vitest é fixo
// em 60 s, e uma variação de semente 101 leva ~99 s só no TS, então o aviso "Timeout calling onTaskUpdate" ainda aparece.
// Os testes são os mesmos; só a concorrência muda.
export default defineConfig({
  test: {
    include: ['packages/geom/src/kernel/**/*.test.ts', 'tests/kernel-a*.wasm.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 4 },
    },
  },
});
