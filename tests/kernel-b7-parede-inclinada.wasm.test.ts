/**
 * Parede de topo inclinado sob a laje com término por camada (Rust): com o despacho do kernel ligado, a junção devolve as fatias das faixas inclinadas e as peças
 * que o desenho usa não se sobrepõem à laje, como no motor TypeScript (`packages/engine/src/terminoCamadaInclinada.test.ts`). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fuseBands, junctionLevel, resolveLevel, resolveSlabs, wallLayerBandsAfterJunction } from '@hestia/engine';
import { bandPiece, overlapVolume, slabLayerPiece } from '../packages/engine/src/junctionNet.ts';
import { instalarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoParedeSobLaje } from './termino-camada-casos.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
  if (ger) instalarDespachoKernel({ gerenciador: () => ger, config: () => ({ fatiaA: false, fatiaB: true, sombra: false }) });
});
afterAll(() => removerDespachoKernel());

describe.skipIf(!bytes)('parede de topo inclinado sob a laje (Rust)', () => {
  for (const anexar of [false, true]) {
    it(`parede ${anexar ? 'anexada ao telhado' : 'reta'}: nenhuma peça da parede se sobrepõe à laje depois da junção`, () => {
      if (ger === null) return;
      const p = projetoParedeSobLaje(anexar);
      const jl = junctionLevel(p, 'lv_0');
      const lv = resolveLevel(p, 'lv_0');
      const laje = resolveSlabs(p, 'lv_1')[0]!;
      const lajePecas = laje.layers.map((l) => slabLayerPiece(laje, l));
      let antes = 0;
      let depois = 0;
      for (const rw of Object.values(lv.walls)) {
        for (const l of rw.layers) {
          const cortadas = fuseBands(wallLayerBandsAfterJunction(jl, rw, l)).map((b) => bandPiece(rw, b));
          for (const c of lajePecas) {
            for (const b of l.bands) antes += overlapVolume(bandPiece(rw, b), c);
            for (const q of cortadas) depois += overlapVolume(q, c);
          }
        }
      }
      expect(antes).toBeGreaterThan(0.1);
      expect(depois).toBeLessThan(1e-6);
    }, 60_000);
  }
});
