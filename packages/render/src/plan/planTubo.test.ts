import { applyCommand as aplicar, BIBLIOTECA_MEP, createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { componentsPlanOps } from './planComponents.ts';
import { LIGHT, type StrokeOp } from './types.ts';

const TUBO = 'fam_krona_esgoto_tubo_corte';
/** O eixo da família é Z (prumada); o traçado deita a peça com Ry(90°) e, nas conexões, gira o plano da curva com Rz(90°). */
const H: Pick<Component, 'inclinacao'> = { inclinacao: [Math.PI / 2, 0] };
const HP: Pick<Component, 'inclinacao'> = { inclinacao: [Math.PI / 2, Math.PI / 2] };

export function projetoCom(ids: string[]): Project {
  const p = createEmptyProject('t');
  for (const id of ids) {
    const f = BIBLIOTECA_MEP.find((x) => x.id === id);
    if (!f) throw new Error(`família ausente: ${id}`);
    aplicar(p, { type: 'upsertFamily', family: structuredClone(f) });
  }
  return p;
}

export function peca(p: Project, id: string, familyId: string, extra: Partial<Component> = {}, values: Record<string, number> = {}): Component {
  const c = { id, kind: 'component', familyId, typeId: 'dn100', levelId: p.levels[0]!.id, order: 1, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, values, ...extra } as Component;
  p.elements[id] = c;
  return c;
}

export function ops(p: Project, zoom?: number, rotulo = false, detalhe: 'medium' | 'fine' = 'medium') {
  return componentsPlanOps(p, p.levels[0]!.id, LIGHT, undefined, false, detalhe, false, zoom === undefined ? { rotulo } : { zoom, rotulo });
}

/** Segmentos retos de um traço aberto (dois pontos). */
export const abertos = (s: StrokeOp[]): StrokeOp[] => s.filter((x) => !x.closed && !x.dash);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('planta do tubo reto (D1, Q1)', () => {
  const De = 0.1016;
  it('horizontal: duas linhas paralelas com afastamento = De', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, { ...H, x: 1, y: 2 }, { L: 2000 });
    const l = abertos(ops(p).strokes);
    expect(l).toHaveLength(2);
    expect(Math.abs(l[0]!.pts[0]!.y - l[1]!.pts[0]!.y)).toBeCloseTo(De, 3);
    expect(l[0]!.pts[0]!.y).not.toBeCloseTo(l[0]!.pts[1]!.y + 1, 1);
    expect(Math.abs(l[0]!.pts[0]!.x - l[0]!.pts[1]!.x)).toBeCloseTo(2, 3);
    expect(l[0]!.pts[0]!.y + l[1]!.pts[0]!.y).toBeCloseTo(4, 3);
  });
  it('vertical na planta (rotação 90°): duas linhas verticais', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, { ...H, rotation: Math.PI / 2 }, { L: 1500 });
    const l = abertos(ops(p).strokes);
    expect(l).toHaveLength(2);
    expect(Math.abs(l[0]!.pts[0]!.x - l[1]!.pts[0]!.x)).toBeCloseTo(De, 3);
    expect(Math.abs(l[0]!.pts[0]!.y - l[0]!.pts[1]!.y)).toBeCloseTo(1.5, 3);
  });
  it('diagonal a 45°: linhas paralelas ao eixo, distância perpendicular = De', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, { ...H, rotation: Math.PI / 4 }, { L: 2000 });
    const l = abertos(ops(p).strokes);
    expect(l).toHaveLength(2);
    const [a, b] = [l[0]!, l[1]!];
    const dx = a.pts[1]!.x - a.pts[0]!.x, dy = a.pts[1]!.y - a.pts[0]!.y;
    expect(dx / dy).toBeCloseTo(1, 4);
    const n = { x: -dy / Math.hypot(dx, dy), y: dx / Math.hypot(dx, dy) };
    expect(Math.abs((b.pts[0]!.x - a.pts[0]!.x) * n.x + (b.pts[0]!.y - a.pts[0]!.y) * n.y)).toBeCloseTo(De, 3);
  });
  it('a largura acompanha o DN (De do corpo, sem tabela)', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, H, { L: 1000 });
    peca(p, 'u', TUBO, { ...H, typeId: 'dn50', y: 1 }, { L: 1000 });
    const l = abertos(ops(p).strokes);
    expect(l).toHaveLength(4);
    const larg = (s: StrokeOp, o: StrokeOp): number => Math.abs(s.pts[0]!.y - o.pts[0]!.y);
    expect(larg(l[0]!, l[1]!)).toBeGreaterThan(larg(l[2]!, l[3]!) * 1.5);
  });
  it('escala pequena vira uma linha só (o eixo)', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, H, { L: 2000 });
    const o = ops(p, 20);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.pts).toHaveLength(2);
    expect(o.strokes[0]!.pts[0]!.y).toBeCloseTo(0, 6);
    expect(o.fills).toHaveLength(0);
  });
  it('escala adequada tem duas linhas e, bem aproximada, o eixo tracejado', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, H, { L: 2000 });
    expect(abertos(ops(p, 100).strokes)).toHaveLength(2);
    const perto = ops(p, 400).strokes;
    expect(perto.filter((s) => s.dash)).toHaveLength(1);
    expect(ops(p, 100).strokes.filter((s) => s.dash)).toHaveLength(0);
  });
  it('prumada (eixo Z da família, sem inclinação) vira anel com o furo', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, { x: 3, y: 3 }, { L: 1000 });
    const f = ops(p).strokes.filter((s) => s.closed);
    expect(f).toHaveLength(2);
    const r = (s: StrokeOp): number => dist(s.pts[0]!, { x: 3, y: 3 });
    expect(Math.max(r(f[0]!), r(f[1]!))).toBeCloseTo(De / 2, 3);
    expect(Math.min(r(f[0]!), r(f[1]!))).toBeLessThan(De / 2);
  });
  it('rótulo com declividade: tubo a 2% sai com "2,0%" e não ganha % se for horizontal', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, { inclinacao: [Math.PI / 2 - Math.atan(0.02), 0] }, { L: 2000, DN: 100 });
    expect(ops(p, undefined, true).labels[0]!.text).toBe('DN 100  2,0%');
  });
  it('rótulo opcional: desligado por padrão; ligado traz o DN', () => {
    const p = projetoCom([TUBO]);
    peca(p, 't', TUBO, H, { L: 2000, DN: 100 });
    expect(ops(p).labels).toHaveLength(0);
    const r = ops(p, undefined, true).labels;
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toBe('DN 100');
    expect(r[0]!.at.x).toBeCloseTo(1, 3);
  });
});

describe('conexões na planta (D1, Q2)', () => {
  it('joelho 90°: contorno fechado com arcos (mais de 8 vértices) e sem retângulo da caixa', () => {
    const p = projetoCom(['fam_krona_esgoto_joelho90']);
    peca(p, 'j', 'fam_krona_esgoto_joelho90', HP);
    const o = ops(p);
    const fechados = o.strokes.filter((s) => s.closed);
    expect(fechados).toHaveLength(1);
    expect(fechados[0]!.pts.length).toBeGreaterThan(8);
    expect(o.fills).toHaveLength(1);
  });
  it('joelho: a faixa tem a largura do diâmetro externo da bolsa na perna reta', () => {
    const p = projetoCom(['fam_krona_esgoto_joelho90']);
    peca(p, 'j', 'fam_krona_esgoto_joelho90', HP);
    const pts = ops(p).strokes.find((s) => s.closed)!.pts;
    const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y);
    const larg = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    expect(larg).toBeGreaterThan(0.1);
    expect(larg).toBeLessThan(0.5);
  });
  it('luva: um retângulo escalonado (bolsas + batente), sem linha interna', () => {
    const p = projetoCom(['fam_krona_esgoto_luva']);
    peca(p, 'l', 'fam_krona_esgoto_luva', HP);
    const o = ops(p);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.closed).toBe(true);
  });
  it('tê: um só contorno em T (a união apaga as linhas internas do ramal)', () => {
    const p = projetoCom(['fam_krona_esgoto_te']);
    peca(p, 'e', 'fam_krona_esgoto_te', HP);
    const o = ops(p);
    expect(o.strokes).toHaveLength(1);
    const xs = o.strokes[0]!.pts.map((v) => v.x), ys = o.strokes[0]!.pts.map((v) => v.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.05);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05);
  });
  it('conexão em escala pequena vira o eixo (linha simples)', () => {
    const p = projetoCom(['fam_krona_esgoto_joelho90']);
    peca(p, 'j', 'fam_krona_esgoto_joelho90', HP);
    const o = ops(p, 20);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.closed).toBe(false);
  });
});

describe('garantias (D1)', () => {
  it('componente sem família MEP (armário) não muda', () => {
    const p = createEmptyProject('t');
    aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    peca(p, 'a', FAMILIA_ARMARIO.id, { typeId: 'A80', x: 1, y: 1 });
    const a = ops(p);
    const b = ops(p, 20, true);
    expect(a.strokes.length).toBeGreaterThan(0);
    expect(b.strokes).toEqual(a.strokes);
    expect(b.labels).toEqual(a.labels);
  });
  it('determinístico', () => {
    const p = projetoCom([TUBO, 'fam_krona_esgoto_te']);
    peca(p, 't', TUBO, { ...H, rotation: 0.7 }, { L: 1000 });
    peca(p, 'e', 'fam_krona_esgoto_te', { ...HP, x: 2 });
    expect(JSON.stringify(ops(p, 100))).toBe(JSON.stringify(ops(p, 100)));
  });
  it('peça girada, espelhada e inclinada não lança', () => {
    const p = projetoCom([TUBO, 'fam_krona_esgoto_te', 'fam_krona_esgoto_curva45_longa']);
    peca(p, 't', TUBO, { rotation: 2.3, mirrored: true, inclinacao: [0.02, 0.4] }, { L: 1000 });
    peca(p, 'e', 'fam_krona_esgoto_te', { rotation: -1.1, mirrored: true });
    peca(p, 'c', 'fam_krona_esgoto_curva45_longa', { rotation: 4, inclinacao: [0.3, 1] });
    for (const z of [undefined, 5, 100, 1000]) expect(() => ops(p, z, true, 'fine')).not.toThrow();
  });
});
