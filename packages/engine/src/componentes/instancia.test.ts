import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, makeLevel, type Command, type Component, type Project } from '@hestia/model';
import { polygonArea } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { caixaDoComponente, malhaDoComponente, pegadaDoComponente, resolverComponente } from './instancia.ts';
import { volumeDaMalha, malhaDasPecas } from './malha.ts';
import { resolverFamilia } from './resolver.ts';

const aplicarCopia = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicar(q, c); return q; };
const projeto = (extra: { elevacao?: number } = {}): Project => {
  let p = createEmptyProject('t');
  if (extra.elevacao !== undefined) p = aplicarCopia(p, { type: 'upsertLevel', level: makeLevel({ id: p.levels[0]!.id, name: 'N', elevation: extra.elevacao }) });
  return aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
};
const comp = (p: Project, extra: Partial<Component> = {}): Component => ({
  id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'M', ...extra,
});
const mundoXY = (c: Component, lx: number, ly: number): [number, number] => {
  const x = c.mirrored ? -lx : lx; const co = Math.cos(c.rotation); const si = Math.sin(c.rotation);
  return [c.x + x * co - ly * si, c.y + x * si + ly * co];
};

describe('resolverComponente', () => {
  it('resolve com o tipo e os valores da instância e memoiza', () => {
    const p = projeto();
    const c = comp(p, { typeId: 'A60', values: { L: 700 } });
    const r = resolverComponente(p, c);
    expect(r.erros).toEqual([]);
    expect(r.env.L).toBe(700);
    expect(r.pecas.filter((x) => x.id === 'porta')).toHaveLength(1);
    expect(resolverComponente(p, c)).toBe(r);
    expect(resolverComponente(p, { ...c, values: { L: 710 } })).not.toBe(r);
    expect(resolverComponente(p, { ...c, typeId: null }).env.nPortas).toBe(2);
  });
  it('família editada (nova referência) invalida a memória', () => {
    const p = projeto();
    const c = comp(p);
    const antes = resolverComponente(p, c);
    const outra = aplicarCopia(p, { type: 'upsertFamily', family: { ...structuredClone(FAMILIA_ARMARIO), pecas: FAMILIA_ARMARIO.pecas.filter((x) => x.id !== 'tampo') } });
    const depois = resolverComponente(outra, c);
    expect(depois).not.toBe(antes);
    expect(depois.pecas.some((x) => x.id === 'tampo')).toBe(false);
  });
  it('família ausente devolve erro, sem lançar', () => {
    const p = createEmptyProject('t');
    const r = resolverComponente(p, comp(p));
    expect(r.pecas).toEqual([]);
    expect(r.erros[0]).toMatchObject({ onde: 'familia' });
  });
});

describe('malhaDoComponente', () => {
  const casos: Array<Partial<Component>> = [
    { rotation: 0, mirrored: false }, { rotation: Math.PI / 2, mirrored: false }, { rotation: 0.7, mirrored: false },
    { rotation: 0, mirrored: true }, { rotation: -1.3, mirrored: true }, { rotation: Math.PI, mirrored: true },
  ];
  for (const extra of casos) {
    it(`rotação ${extra.rotation}, espelhado ${extra.mirrored}: volume positivo igual ao local, vértices no mundo e normais para fora`, () => {
      const p = projeto({ elevacao: 3 });
      const c = comp(p, { ...extra, z: 0.1 });
      const res = resolverComponente(p, c);
      const m = malhaDoComponente(p, c, res);
      const local = malhaDasPecas(res.pecas);
      expect(volumeDaMalha(m.solidas)).toBeCloseTo(volumeDaMalha(local.solidas), 9);
      expect(m.solidas.indices).toHaveLength(local.solidas.indices.length);
      expect(m.solidas.pecaDoTriangulo).toEqual(local.solidas.pecaDoTriangulo);
      for (let v = 0; v < local.solidas.positions.length; v += 3) {
        const [wx, wy] = mundoXY(c, local.solidas.positions[v]!, local.solidas.positions[v + 1]!);
        expect(m.solidas.positions[v]).toBeCloseTo(wx, 9);
        expect(m.solidas.positions[v + 1]).toBeCloseTo(wy, 9);
        expect(m.solidas.positions[v + 2]).toBeCloseTo(3 + 0.1 + local.solidas.positions[v + 2]!, 9);
      }
      for (let t = 0; t < m.solidas.indices.length; t += 3) {
        const [i, j, k] = [m.solidas.indices[t]!, m.solidas.indices[t + 1]!, m.solidas.indices[t + 2]!];
        const pt = (n: number): number[] => [m.solidas.positions[n * 3]!, m.solidas.positions[n * 3 + 1]!, m.solidas.positions[n * 3 + 2]!];
        const [a, b, d] = [pt(i), pt(j), pt(k)];
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]; const w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
        const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
        const len = Math.hypot(n[0]!, n[1]!, n[2]!);
        const dec = [m.solidas.normals[i * 3]!, m.solidas.normals[i * 3 + 1]!, m.solidas.normals[i * 3 + 2]!];
        expect(Math.hypot(dec[0]!, dec[1]!, dec[2]!)).toBeCloseTo(1, 6);
        expect((n[0]! * dec[0]! + n[1]! * dec[1]! + n[2]! * dec[2]!) / len).toBeCloseTo(1, 6);
      }
    });
  }
  it('sem família devolve malhas vazias', () => {
    const p = createEmptyProject('t');
    const m = malhaDoComponente(p, comp(p));
    expect(m.solidas.indices).toEqual([]);
    expect(m.vazios.indices).toEqual([]);
  });
  it('peças vazias vão para a malha de vazios', () => {
    const f = structuredClone(FAMILIA_ARMARIO);
    f.pecas.push({ id: 'cuba', nome: 'Cuba', papel: 'bloco', vazio: true, eixo: 'z', origem: ['100', '100', 'A - 100'], tamanho: ['200', '200'], espessura: '100' });
    const p = aplicarCopia(projeto(), { type: 'upsertFamily', family: f });
    const m = malhaDoComponente(p, comp(p));
    expect(m.vazios.indices.length).toBe(36);
    expect(m.solidas.pecaDoTriangulo.every((i) => i !== resolverComponente(p, comp(p)).pecas.findIndex((x) => x.id === 'cuba'))).toBe(true);
  });
});

describe('pegadaDoComponente e caixaDoComponente', () => {
  it('sem rotação: união = retângulo da caixa em planta (tampo e portas incluídos)', () => {
    const p = projeto();
    const g = pegadaDoComponente(p, comp(p));
    const area = g.reduce((s, poly) => s + polygonArea(poly), 0);
    expect(area).toBeCloseTo(0.8 * 0.58, 6);
    const xs = g.flat(2).map((q) => q.x); const ys = g.flat(2).map((q) => q.y);
    expect(Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...xs)).toBeCloseTo(1.8, 6);
    expect(Math.min(...ys)).toBeCloseTo(2 - 0.02, 6);
    expect(Math.max(...ys)).toBeCloseTo(2 + 0.56, 6);
  });
  it('girada e espelhada: mesma área; a caixa acompanha a transformação', () => {
    const p = projeto({ elevacao: 1 });
    for (const extra of [{ rotation: Math.PI / 2 }, { mirrored: true }, { rotation: 0.5, mirrored: true }]) {
      const c = comp(p, { ...extra, z: 0.2 });
      expect(pegadaDoComponente(p, c).reduce((s, poly) => s + polygonArea(poly), 0)).toBeCloseTo(0.8 * 0.58, 5);
      const cx = caixaDoComponente(p, c)!;
      const res = resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A80' });
      const zs = res.pecas.flatMap((q) => [q.origem[2], q.origem[2] + q.extensao[2]]);
      expect(cx.min[2]).toBeCloseTo(1 + 0.2 + Math.min(...zs), 9);
      expect(cx.max[2]).toBeCloseTo(1 + 0.2 + Math.max(...zs), 9);
    }
    const c90 = comp(p, { rotation: Math.PI / 2 });
    const b = caixaDoComponente(p, c90)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.58, 6);
    expect(b.max[1] - b.min[1]).toBeCloseTo(0.8, 6);
  });
  it('sem família: pegada vazia e caixa nula', () => {
    const p = createEmptyProject('t');
    expect(pegadaDoComponente(p, comp(p))).toEqual([]);
    expect(caixaDoComponente(p, comp(p))).toBeNull();
  });
});
