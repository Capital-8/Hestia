import { defineConfig } from 'vitest/config';

// Suíte PESADA do kernel (`npm run test:wasm:pesado`): só as retas puras da A2 a 60 paredes (tests/kernel-a2-retas.pesado.test.ts).
// Cada variação de planta da semente 101 gasta ~70 a 110 s de trabalho síncrono do polygon-clipping do TS, e o RPC que o worker
// do vitest usa para reportar testes tem timeout fixo de 60 s (birpc, não configurável). Quando a referência bloqueia o worker
// por mais de 60 s, o vitest registra "Timeout calling onTaskUpdate" como erro não tratado, mesmo com o teste passando. Por isso
// este config tem `dangerouslyIgnoreUnhandledErrors`: SÓ esse erro de infraestrutura é ignorado aqui. Falha de asserção continua
// reprovando a execução, e nenhum assert, semente ou tolerância muda. A suíte normal (vitest.wasm.config.ts) não ignora erros.
export default defineConfig({
  test: {
    include: ['tests/kernel-a2-retas.pesado.test.ts'],
    environment: 'node',
    setupFiles: ['tests/kernel-wasm.setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 1 },
    },
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
