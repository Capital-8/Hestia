/**
 * Acabamento da escada no guarda-corpo (ADR 0055 §26 e ADR 0011 §8): os dados do bocel e da cota do piso acabado vão para o kernel pelas linhas de
 * `escada_espelhos_gc`, derivados de `stairFinishModel` (nada é recalculado). Sem acabamento: bocel 0 e cota igual ao topo do espelho.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeStair, type StairType } from '@hestia/model';
import { straight } from './fixtureGuardaCorpo.ts';
import { montarCenaGC, type CenaGC, type NomeSecaoGC } from './kernelGuardaCorpo.ts';
import { acabamentoDosDegraus } from './kernelGuardaCorpoLinhas.ts';
import { resolveStairs } from './stairs.ts';
import { empurrarParaOPiso, pisoDoDegrau } from './guardaCorpoRef/distribuicao.ts';

const linhas = (c: CenaGC, nome: NomeSecaoGC): Array<Record<string, number>> =>
  Array.from({ length: c.nLinhas[nome] }, (_, i) => Object.fromEntries(Object.entries(c.secoes[nome]).map(([k, col]) => [k, col[i]!])));

const FIN_ON = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;

function projeto(extra?: Partial<StairType>) {
  const s = new ProjectStore(createEmptyProject());
  let typeId = defaultStairTypeId;
  if (extra) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    s.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, ...extra } as StairType });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(17, 0.28)] }) });
  const lado = { lance: true, patamar: true };
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_e', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  return s.project;
}

describe('escada_espelhos_gc com acabamento', () => {
  it('sem acabamento: bocel 0 e cota do piso igual ao topo do espelho (resultado atual)', () => {
    const esp = linhas(montarCenaGC(projeto()), 'escada_espelhos_gc');
    expect(esp.length).toBe(17);
    for (const e of esp) {
      expect(e['bocel']).toBe(0);
      expect(e['z_piso']).toBe(e['z1']);
    }
  });

  it('com piso, espelho e bocel: bocel de 2 cm nos 16 degraus e base sobre o topo do piso acabado', () => {
    const p = projeto(FIN_ON);
    const rs = resolveStairs(p)[0]!;
    const esp = linhas(montarCenaGC(p), 'escada_espelhos_gc');
    expect(esp.length).toBe(17);
    esp.forEach((e, i) => {
      // O último espelho chega ao piso de cima, que não é degrau da escada (sem piso acabado nem bocel no modelo).
      expect(e['bocel']).toBeCloseTo(i < 16 ? 0.02 : 0, 12);
      // O piso acabado termina em `z1` do espelho (a geometria resolvida já é a acabada): a base do montante não afunda nem flutua.
      expect(e['z_piso']).toBeCloseTo(e['z1']!, 9);
    });
    expect(esp[16]!['z_piso']).toBeCloseTo(rs.topZ, 9);
    const acab = acabamentoDosDegraus(rs);
    expect(acab.size).toBe(16);
  });

  it('só espelho acabado (sem piso): sem bocel', () => {
    const esp = linhas(montarCenaGC(projeto({ ...FIN_ON, treadFinishEnabled: false })), 'escada_espelhos_gc');
    for (const e of esp) expect(e['bocel']).toBe(0);
  });

  it('piso sem bocel: bocel 0', () => {
    const esp = linhas(montarCenaGC(projeto({ ...FIN_ON, bocelEnabled: false })), 'escada_espelhos_gc');
    for (const e of esp) expect(e['bocel']).toBe(0);
  });
});

describe('pisoDoDegrau (referência TS)', () => {
  it('sem acabamento é a quina e a pisada; com bocel, a frente do bocel e a pisada até o bocel seguinte', () => {
    expect(pisoDoDegrau({ s0: 1.4, prof: 0.28, z: 0.5 })).toEqual([1.4, 0.28]);
    expect(pisoDoDegrau({ s0: 1.4, prof: -0.28, z: 0.5 })).toEqual([1.4, -0.28]);
    const [b, p] = pisoDoDegrau({ s0: 1.4, prof: 0.28, z: 0.5, bocel: 0.02, bocelSeguinte: 0.02 });
    expect(b).toBeCloseTo(1.38, 12);
    expect(p).toBeCloseTo(0.28, 12);
    // Último degrau: sem bocel seguinte, a pisada útil vai até a face do espelho de cima.
    const [, pu] = pisoDoDegrau({ s0: 1.4, prof: 0.28, z: 0.5, bocel: 0.02 });
    expect(pu).toBeCloseTo(0.3, 12);
    // Invertido: o bocel recua para o lado de maior s.
    const [bi, pi] = pisoDoDegrau({ s0: 1.4, prof: -0.28, z: 0.5, bocel: 0.02, bocelSeguinte: 0.02 });
    expect(bi).toBeCloseTo(1.42, 12);
    expect(pi).toBeCloseTo(-0.28, 12);
  });
});

describe('empurrarParaOPiso (referência TS, espelha o Rust)', () => {
  it('nunca deixa o centro a menos de meia seção da quina nem do espelho seguinte', () => {
    const dg = [0, 1, 2].map((i) => ({ s0: 0.28 * i, prof: 0.28, z: 0.17 * (i + 1) }));
    expect(empurrarParaOPiso(dg, 0.28, 0.01)).toBeCloseTo(0.29, 12);
    expect(empurrarParaOPiso(dg, 0.275, 0.01)).toBeCloseTo(0.27, 12);
    expect(empurrarParaOPiso(dg, 0.14, 0.01)).toBeCloseTo(0.14, 12);
    expect(empurrarParaOPiso(dg, -0.5, 0.01)).toBeCloseTo(-0.5, 12);
    expect(empurrarParaOPiso([{ s0: 0, prof: 0.015, z: 0.17 }], 0.001, 0.01)).toBeCloseTo(0.0075, 12);
    expect(empurrarParaOPiso([{ s0: 1, prof: -0.28, z: 0.17 }], 1.0, 0.01)).toBeCloseTo(0.99, 12);
  });
});
