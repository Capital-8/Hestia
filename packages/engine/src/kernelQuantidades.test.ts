import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CEILING_TYPES, ProjectStore, createEmptyProject, makeCeiling, type Id, type Project } from '@hestia/model';
import { quantifyCeilings, quantifyCeilingsTs } from './ceilingQuantities.ts';
import { decodificarQuantidades, indexarQuantidades, montarCenaForros } from './kernelQuantidades.ts';
import type { LinhaQuantRust, QuantidadesRust } from './quantidadesTipos.ts';
import { definirDespachanteDeQuantidades } from './resolveDespacho.ts';

afterEach(() => definirDespachanteDeQuantidades(null));

const quadrado = (l: number) => [
  { x: 0, y: 0 },
  { x: 0, y: l },
  { x: l, y: l },
  { x: l, y: 0 },
];

function comForro(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: quadrado(4), holes: [[{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }]] }) });
  return s.project;
}

const linha = (dono: number, camada: number, extra: Partial<LinhaQuantRust> = {}): LinhaQuantRust => ({ dono, camada, nFaixas: 1, flags: 0, bruto: 1, cortado: 0.25, liquido: 0.75, areaDeFace: 3, altura: 0, ...extra });

describe('decodificarQuantidades', () => {
  it('lê as duas saídas (4 e 5 valores por camada) e o layerIndex negativo em complemento de dois', () => {
    const r = decodificarQuantidades({ linhas: Uint32Array.from([7, 2, 3, 0, 8, 0xffff_ffff, 1, 2]), valores: Float64Array.from([1, 0.25, 0.75, 3, 2.8, 0, 0, 0, 0, 2.9]) });
    expect(r).toEqual([
      { dono: 7, camada: 2, nFaixas: 3, flags: 0, bruto: 1, cortado: 0.25, liquido: 0.75, areaDeFace: 3, altura: 2.8 },
      { dono: 8, camada: -1, nFaixas: 1, flags: 2, bruto: 0, cortado: 0, liquido: 0, areaDeFace: 0, altura: 2.9 },
    ]);
  });

  it('formato inesperado lança (nunca valor de reserva)', () => {
    expect(() => decodificarQuantidades({ linhas: Uint32Array.from([1, 2, 3]), valores: Float64Array.from([1]) })).toThrow(/formato inesperado/);
    expect(() => decodificarQuantidades({ linhas: Uint32Array.from([1, 2, 3, 0]), valores: Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) })).toThrow(/formato inesperado/);
  });
});

describe('indexarQuantidades', () => {
  const numero = new Map<Id, number>([['a', 7]]);

  it('devolve a camada e a altura pelo id do projeto; a linha de parede sem camada só dá a altura', () => {
    const q = indexarQuantidades([linha(7, 0, { altura: 2.8 }), linha(7, -1, { altura: 2.8 }), linha(9, 0, { flags: 2, altura: 3.1 })], new Map([...numero, ['b', 9]]), 'paredes');
    expect(q.camada('a', 0).liquido).toBe(0.75);
    expect(q.camada('a', -1).camada).toBe(-1);
    expect(q.altura('a')).toBe(2.8);
    expect(q.altura('b')).toBe(3.1);
    expect(() => q.camada('b', 0)).toThrow(/não devolveu quantidade/);
  });

  it('camada ou elemento que o Rust não conhece lança erro explícito', () => {
    const q = indexarQuantidades([linha(7, 0)], numero, 'pisos');
    expect(() => q.camada('a', 1)).toThrow(/não devolveu quantidade/);
    expect(() => q.camada('fantasma', 0)).toThrow(/sem número interno/);
  });
});

describe('forros: seções e despacho', () => {
  it('montarCenaForros leva o contorno com furo e a espessura vertical de cada camada', () => {
    const p = comForro();
    const f = montarCenaForros(p, new Map(p.levels.map((l, i) => [l.id, i] as const)));
    const tipo = DEFAULT_CEILING_TYPES.find((t) => t.id === 'ct_gesso')!;
    const camadas = tipo.layers.filter((l) => l.thickness >= 1e-6);
    expect(f.nLinhas.camadas_forro).toBe(camadas.length);
    f.secoes.camadas_forro['espessura']!.forEach((e, i) => expect(e).toBeCloseTo(camadas[i]!.thickness, 12));
    expect(new Set(f.secoes.camadas_forro['forro_num'])).toEqual(new Set([f.forroDe.get('c1')]));
    // dois anéis (contorno e furo): 4 + 4 vértices
    expect(f.nLinhas.pontos_forro).toBe(8);
    expect(new Set(f.secoes.pontos_forro['anel'])).toEqual(new Set([0, 1]));
  });

  it('com o despachante instalado, quantifyCeilings usa só as linhas do Rust (nenhuma conta de área no TypeScript)', () => {
    const p = comForro();
    const rc = quantifyCeilingsTs(p, 'lv_0');
    const falso: QuantidadesRust = {
      camada: (_id, indice) => linha(1, indice, { areaDeFace: 123, liquido: 456, bruto: 456 }),
      altura: () => 0,
    };
    definirDespachanteDeQuantidades((_p, nivel, tipo) => (nivel === 'lv_0' && tipo === 'forros' ? falso : null));
    const q = quantifyCeilings(p, 'lv_0');
    expect(q.layers).toHaveLength(rc.layers.length);
    for (const l of q.layers) expect([l.area, l.volume]).toEqual([123, 456]);
    expect(q.volumeByMaterial[q.layers[0]!.materialId]).toBe(456 * q.layers.filter((l) => l.materialId === q.layers[0]!.materialId).length);
  });

  it('sem despachante (ou com null) vale o motor TypeScript, igual à referência', () => {
    const p = comForro();
    expect(quantifyCeilings(p, 'lv_0')).toEqual(quantifyCeilingsTs(p, 'lv_0'));
    definirDespachanteDeQuantidades(() => null);
    expect(quantifyCeilings(p, 'lv_0')).toEqual(quantifyCeilingsTs(p, 'lv_0'));
  });

  it('uma falha do despachante (erro do Rust) chega ao chamador, sem número do TypeScript', () => {
    const p = comForro();
    definirDespachanteDeQuantidades(() => {
      throw new Error('kernel Rust (fatia B, nível lv_0): falha simulada');
    });
    expect(() => quantifyCeilings(p, 'lv_0')).toThrow(/falha simulada/);
  });
});
