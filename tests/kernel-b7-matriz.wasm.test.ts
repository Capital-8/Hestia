/**
 * Matriz do término por camada (decisão 0054) no Rust: as mesmas configurações e as mesmas posições esperadas do teste do motor TypeScript
 * (`packages/engine/src/terminoCamadaMatriz.test.ts`), com o despacho do kernel ligado (laje e piso saem do `pisos_lajes_com_paredes` do wasm).
 * Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { instalarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { casosCamada, esperadoCamada, medir, projetoDaMatriz, type Intervalos } from './termino-camada-matriz.ts';

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

const arred = (a: Intervalos): number[][] => a.map((i) => i.map((v) => +v.toFixed(4)));

describe.skipIf(!bytes)('matriz do término por camada (Rust): a borda sai das espessuras', () => {
  for (const c of casosCamada()) {
    it(`${c.grupo} ${c.nome}`, () => {
      if (ger === null) return;
      const m = medir(projetoDaMatriz(c));
      const e = esperadoCamada(c);
      const por = (id: string) => m.find((x) => x.elemento === id)!;
      for (const id of ['lp', 'fp']) {
        expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.perimetroH));
        expect(arred(por(id).vertical), `${id} vertical`).toEqual(arred(e.perimetroV));
      }
      for (const id of ['ls', 'fs']) expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.salaH));
    }, 60_000);
  }
});
