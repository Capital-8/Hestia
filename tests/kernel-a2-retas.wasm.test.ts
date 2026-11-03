/**
 * Equivalência da sub-etapa A2 (decisão 0047) só para retas puras e só para arcos: `itens_pintados` do Rust x motor TypeScript.
 * Separado de kernel-a2.wasm.test.ts para que o caso lento do polygon-clipping do TS (arcos) não bloqueie o worker da suíte principal.
 * Roda só em `npm run test:wasm`. Mesmas sementes, paredes e tolerâncias de antes; um teste por semente e tipo de geometria.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, it } from 'vitest';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoDeEstresseA2 } from '../scripts/kernel-a2-estresse.mts';
import { compararProjeto } from './kernel-a2.wasm.helpers.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null; // binário sem ABI v2 (ainda é o da v1): os testes são pulados
  }
});

describe.skipIf(!bytes)('A2: retas puras e só arcos, Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  // Retas: uma variação de planta por teste. Com 60 paredes, cada variação leva de ~30 s (semente 100) a ~99 s (semente 101) só no TS,
  // e o fixture não pode mudar. Dividir por variação foi o máximo possível; o timeout explícito (120 s) segue o do original.
  const VARIACOES_RETAS = [0, 1, 2, 3];
  for (let semente = 100; semente < 103; semente++) {
    for (const variacao of VARIACOES_RETAS) {
      it(`semente ${semente}: retas puras sem ruído, variação de planta ${variacao}`, () => {
        if (pula()) return;
        compararProjeto(ger!, projetoDeEstresseA2(semente, { paredes: 60, pavimentos: 1, curvas: 0, ruido: false }), semente, true, [variacao]);
      }, 120_000);
    }

    it(`semente ${semente}: só arcos`, () => {
      if (pula()) return;
      // (o caso de arcos é lento no polygon-clipping do TS: poucas paredes)
      compararProjeto(ger!, projetoDeEstresseA2(semente, { paredes: 12, pavimentos: 1, curvas: 1 }), semente);
    });
  }
});
