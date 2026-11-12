import { describe, expect, it } from 'vitest';
import type { MalhaCortinaProjeto } from '@hestia/engine';
import { arestasDaCortina, avulsosDaCortina, caixasDasCortinas, celulaContemCentro, lotesDaCortina, malhaDePickCortina, matriz16, normaisDaMalha, normaisDoProto, subconjuntoDeLotes } from './cortina3d.ts';

/** Caixa unitária com 24 vértices (4 por face), como o Rust entrega (vértices próprios por face). */
function caixa(): { vertices: Float32Array; indices: Uint32Array } {
  const faces: number[][][] = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], // baixo
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // cima
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // frente
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], // trás
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // esquerda
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // direita
  ];
  const v: number[] = [];
  const i: number[] = [];
  faces.forEach((f, k) => {
    for (const p of f) v.push(...p);
    i.push(4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3);
  });
  return { vertices: Float32Array.from(v), indices: Uint32Array.from(i) };
}

/** Matriz 3 x 4 linha-maior: escala (sx, sy, sz) e translação (tx, ty, tz). */
const m12 = (sx: number, sy: number, sz: number, tx: number, ty: number, tz: number): number[] => [sx, 0, 0, tx, 0, sy, 0, ty, 0, 0, sz, tz];

function malha(): MalhaCortinaProjeto {
  const c = caixa();
  return {
    protos: new Map([
      [1, { proto: 1, papel: 0, tipoId: null, ...c }],
      [2, { proto: 2, papel: 1, tipoId: null, ...c }],
    ]),
    instancias: [
      { wallId: 'a', proto: 1, papel: 0, materialId: 'mat_aluminio', transparente: false, matrizes: Float32Array.from([...m12(0.05, 0.1, 3, 0, 0, 0), ...m12(0.05, 0.1, 3, 2, 0, 0)]), n: 2 },
      { wallId: 'a', proto: 2, papel: 1, materialId: 'mat_vidro', transparente: true, matrizes: Float32Array.from(m12(1, 0.01, 3, 0.5, 0, 0)), n: 1 },
      { wallId: 'b', proto: 1, papel: 0, materialId: 'mat_aluminio', transparente: false, matrizes: Float32Array.from(m12(0.05, 0.1, 3, 0, 10, 0)), n: 1 },
    ],
    grupos: [],
  };
}

/** Peça avulsa de uma cortina: a caixa unitária deslocada em `x` (vértices do mundo, índices locais). */
function grupo(wallId: string, x: number, transparente: boolean, materialId: string | null): MalhaCortinaProjeto['grupos'][number] {
  const c = caixa();
  const v = Float32Array.from(c.vertices, (q, k) => (k % 3 === 0 ? q + x : q));
  return { wallId, papel: 0, materialId, transparente, vertices: v, indices: c.indices };
}

describe('cortina3d: contas puras da malha por instâncias', () => {
  it('matriz16 converte 3 x 4 linha-maior em 4 x 4 coluna-maior', () => {
    const o = new Float32Array(16);
    matriz16(m12(2, 3, 4, 5, 6, 7), 0, o, 0);
    expect([...o]).toEqual([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1]);
  });

  it('agrupa por (protótipo, material, transparência) e põe o vidro por último', () => {
    const l = lotesDaCortina(malha());
    expect(l).toHaveLength(2);
    expect(l.map((x) => [x.proto, x.transparente, x.n])).toEqual([[1, false, 3], [2, true, 1]]);
    expect(l[0]!.donos).toEqual(['a', 'a', 'b']);
    expect(l[0]!.matrizes.length).toBe(16 * 3);
  });

  it('o filtro de visibilidade tira a cortina inteira', () => {
    const l = lotesDaCortina(malha(), (id) => id === 'b');
    expect(l.map((x) => [x.proto, x.n])).toEqual([[1, 1]]);
    expect(lotesDaCortina(malha(), () => false)).toEqual([]);
  });

  it('normais por face apontam para fora', () => {
    const c = caixa();
    const n = normaisDoProto({ proto: 1, papel: 0, tipoId: null, ...c });
    // Face de baixo (vértices 0..3): normal -z; face de cima (4..7): +z.
    expect([n[2], n[5], n[8], n[11]]).toEqual([-1, -1, -1, -1]);
    expect([n[14], n[17], n[20], n[23]]).toEqual([1, 1, 1, 1]);
  });

  it('caixa de cada cortina vem das instâncias dela', () => {
    const cx = caixasDasCortinas(lotesDaCortina(malha()));
    const a = cx.get('a')!;
    expect(a.min[0]).toBeCloseTo(0, 6);
    expect(a.max[0]).toBeCloseTo(2.05, 6);
    expect(a.max[2]).toBeCloseTo(3, 6);
    expect(cx.get('b')!.min[1]).toBeCloseTo(10, 6);
  });

  it('picking: uma caixa de 12 triângulos por cortina, com a faixa dela', () => {
    const pk = malhaDePickCortina(caixasDasCortinas(lotesDaCortina(malha())));
    expect(pk.ranges).toEqual([{ id: 'a', start: 0, count: 12 }, { id: 'b', start: 12, count: 12 }]);
    expect(pk.positions.length).toBe(2 * 8 * 3);
    expect(pk.indices.length).toBe(2 * 36);
  });

  it('arestas vivas: 12 por caixa, cada uma levada ao mundo por cada instância', () => {
    const l = lotesDaCortina(malha(), (id) => id === 'b');
    const a = arestasDaCortina(l, (28 * Math.PI) / 180);
    expect(a.length / 6).toBe(12);
    expect(Math.min(...Array.from({ length: a.length / 3 }, (_, i) => a[3 * i + 1]!))).toBeCloseTo(10, 6);
  });
});

describe('cortina3d: peças avulsas (grupos) como malha própria', () => {
  const comGrupos = (): MalhaCortinaProjeto => ({ ...malha(), grupos: [grupo('a', 5, true, 'mat_vidro'), grupo('a', 5, false, 'mat_aluminio'), grupo('b', 20, false, null)] });

  it('avulsosDaCortina: uma malha por grupo, em soup (12 triângulos por caixa), normal chapada e opacas antes do vidro', () => {
    const av = avulsosDaCortina(comGrupos(), (id) => id !== 'b');
    expect(av.map((a) => a.transparente)).toEqual([false, true]);
    const [opaca] = av;
    expect(opaca!.cortina).toBe('a');
    expect(opaca!.materialId).toBe('mat_aluminio');
    expect(opaca!.indices.length).toBe(36);
    expect(opaca!.vertices.length).toBe(108);
    // Cada triângulo tem os seus três vértices e a mesma normal nos três, de módulo 1.
    for (let t = 0; t < 12; t++) {
      const n = [0, 1, 2].map((k) => Array.from(opaca!.normais.slice(9 * t + 3 * k, 9 * t + 3 * k + 3)));
      expect(n[0]).toEqual(n[1]);
      expect(n[1]).toEqual(n[2]);
      expect(Math.hypot(...n[0]!)).toBeCloseTo(1, 5);
    }
  });

  it('normaisDaMalha: triângulo no plano z = 0 com a orientação anti-horária tem normal +z', () => {
    const n = normaisDaMalha([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    expect([...n]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(normaisDoProto({ proto: 9, papel: 0, tipoId: null, vertices: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]) })[2]).toBe(1);
  });

  it('caixas da cortina incluem as peças avulsas: o montante de canto entra no picking', () => {
    const m = comGrupos();
    const cx = caixasDasCortinas(lotesDaCortina(m, (id) => id === 'a'), avulsosDaCortina(m, (id) => id === 'a'));
    expect(cx.get('a')!.max[0]).toBeCloseTo(6, 6);
    expect(cx.get('a')!.min[0]).toBeCloseTo(0, 6);
    // Sem as peças, a caixa da cortina ficaria em x ≤ 2,05.
    expect(caixasDasCortinas(lotesDaCortina(m, (id) => id === 'a')).get('a')!.max[0]).toBeCloseTo(2.05, 5);
  });

  it('arestas vivas das peças avulsas: 12 segmentos por caixa, no mundo', () => {
    const m = comGrupos();
    const a = arestasDaCortina([], (28 * Math.PI) / 180, avulsosDaCortina(m, (id) => id === 'a').filter((x) => !x.transparente));
    expect(a.length / 6).toBe(12);
    expect(Math.min(...Array.from({ length: a.length / 3 }, (_, i) => a[3 * i]!))).toBeCloseTo(5, 6);
  });

  it('peça de cortina oculta (visivel = false) não entra', () => {
    expect(avulsosDaCortina(comGrupos(), (id) => id === 'b')).toHaveLength(1);
    expect(avulsosDaCortina(comGrupos(), () => false)).toEqual([]);
  });
});

describe('cortina3d: subconjunto de instâncias para o realce (sem caixa)', () => {
  it('subconjuntoDeLotes: só as instâncias do dono, com as matrizes originais (cópia, o lote não muda)', () => {
    const l = lotesDaCortina(malha());
    const sub = subconjuntoDeLotes(l, (dono) => dono === 'a');
    expect(sub.map((x) => [x.proto, x.n, x.donos])).toEqual([
      [1, 2, ['a', 'a']],
      [2, 1, ['a']],
    ]);
    expect([...sub[0]!.matrizes]).toEqual([...l[0]!.matrizes.subarray(0, 32)]);
    expect(l[0]!.n).toBe(3);
  });

  it('subconjuntoDeLotes: o critério de posição usa o centro da caixa do protótipo no mundo', () => {
    // Centro da instância de `a` em x = 0: (0,025; 0,05; 1,5); a de x = 2: (2,025; 0,05; 1,5); o vidro em x = 0,5 tem centro em x = 1,0.
    const sub = subconjuntoDeLotes(lotesDaCortina(malha()), (dono, c) => dono === 'a' && c[0]! > 1);
    expect(sub).toHaveLength(1);
    expect(sub[0]!.n).toBe(1);
    expect(sub[0]!.donos).toEqual(['a']);
    expect(sub[0]!.matrizes[12]).toBeCloseTo(2, 6);
  });

  it('subconjuntoDeLotes sem instância aceita: nenhum lote', () => {
    expect(subconjuntoDeLotes(lotesDaCortina(malha()), () => false)).toEqual([]);
  });

  it('arestas do subconjunto são as do protótipo levadas pela matriz de cada instância', () => {
    const sub = subconjuntoDeLotes(lotesDaCortina(malha()), (dono) => dono === 'a');
    const a = arestasDaCortina(sub, (28 * Math.PI) / 180);
    // 12 arestas por caixa e 3 instâncias (2 montantes e 1 vidro).
    expect(a.length / 6).toBe(36);
    // O canto (1, 1, 1) do protótipo, na instância de x = 2, vai a (2 + 0,05; 0,1; 3).
    const pontos: string[] = [];
    for (let i = 0; i < a.length; i += 3) pontos.push([a[i]!, a[i + 1]!, a[i + 2]!].map((v) => v.toFixed(4)).join(','));
    expect(pontos).toContain('2.0500,0.1000,3.0000');
    expect(pontos).toContain('0.0000,0.0000,0.0000');
  });

  it('celulaContemCentro: o centro de um painel estritamente dentro da célula', () => {
    const parede = { a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, L: 6, zBase: 0, profundidade: 0.1 };
    const celula = { s0: 2, s1: 4, z0: 0, z1: 3 };
    expect(celulaContemCentro([3, 0, 1.5], parede, celula)).toBe(true);
    // Montante sobre a linha da grade (s = 2) fica de fora; o mesmo vale para a borda de cima.
    expect(celulaContemCentro([2, 0, 1.5], parede, celula)).toBe(false);
    expect(celulaContemCentro([3, 0, 3], parede, celula)).toBe(false);
    // Fora da espessura da cortina, e de outra célula, não.
    expect(celulaContemCentro([3, 0.5, 1.5], parede, celula)).toBe(false);
    expect(celulaContemCentro([5, 0, 1.5], parede, celula)).toBe(false);
  });

  it('celulaContemCentro: parede inclinada usa o eixo a-b (s) e a normal (n)', () => {
    const parede = { a: { x: 0, y: 0 }, b: { x: 0, y: 6 }, L: 6, zBase: 1, profundidade: 0.1 };
    expect(celulaContemCentro([0, 3, 2.5], parede, { s0: 2, s1: 4, z0: 0, z1: 3 })).toBe(true);
    expect(celulaContemCentro([0.5, 3, 2.5], parede, { s0: 2, s1: 4, z0: 0, z1: 3 })).toBe(false);
  });
});
