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
import { bordaDaLajeEm, projetoPortaSobLaje } from './termino-camada-porta.ts';
import { CENARIOS, caixaEsperada, caixasDoCenario, casosCamada, larguraMinimaDasPecas, esperadoCamada, medir, projetoDaMatriz, projetoDoCenario, type Intervalos } from './termino-camada-matriz.ts';

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

describe.skipIf(!bytes)('cenários do caso real (Rust): excesso sub-micrométrico e junção em T', () => {
  for (const cen of CENARIOS) {
    for (const c of casosCamada().filter((k) => k.grupo === 'preset')) {
      it(`${cen.nome}: ${c.nome}`, () => {
        if (ger === null) return;
        const m = caixasDoCenario(projetoDoCenario(c, cen.id));
        for (const id of ['lq', 'fq']) expect(m[id]!.map((v) => +v.toFixed(4)), id).toEqual(caixaEsperada(c, cen.id).map((v) => +v.toFixed(4)));
      }, 60_000);
    }
  }

  for (const c of casosCamada().filter((k) => k.grupo === 'preset')) {
    it(`excesso: ${c.nome}: o contorno não guarda peça fio (largura média menor que 1 µm) que a extrusão leva à face da parede`, () => {
        if (ger === null) return;
      const m = larguraMinimaDasPecas(projetoDoCenario(c, 'excesso'));
      for (const id of ['lq', 'fq']) expect(m[id]!, id).toBeGreaterThanOrEqual(1e-6);
    }, 60_000);
  }
});

describe.skipIf(!bytes)('término por camada (Rust): acima da porta a parede é contínua', () => {
  it('a borda da laje sobre o vão da porta é a mesma do trecho cheio da parede', () => {
    if (ger === null) return;
    const p = projetoPortaSobLaje();
    const cheio = bordaDaLajeEm(p, 1);
    const sobPorta = bordaDaLajeEm(p, 3);
    expect(Number.isFinite(cheio) && Number.isFinite(sobPorta)).toBe(true);
    expect(sobPorta).toBeCloseTo(cheio, 6);
  }, 60_000);
});
