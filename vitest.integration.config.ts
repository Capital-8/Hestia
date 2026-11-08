import { defineConfig } from 'vitest/config';

/**
 * Integração entre processos: o Hestia (Node, código real de @hestia/plugin-api) e o renderizador Rust (processo
 * separado) conversam por WebSocket real em loopback. Exige `cargo`. Roda com `npm run test:rust-processo`;
 * fica fora do `npm test` porque compila Rust e abre portas.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.integ.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    // Um único arquivo que compila Rust e abre processos: threads evitam o canal IPC do pool de processos, que fechava durante a compilação.
    pool: 'threads',
    reporters: ['verbose'],
  },
});
