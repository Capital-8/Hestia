import { describe, expect, it } from 'vitest';
import { createEmptyProject, type DetailLine } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import { sectionInferContext } from './sectionContext.ts';
import { detailSnapDeLinhas } from './detailSnap.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { Inference, SectionToolContext } from './types.ts';

/**
 * Linhas de detalhe do corte como alvo de captura (t, z), molde de `snapsCorteCotaMedir.test.ts`. A seção não tem
 * geometria: tudo o que captura vem das linhas de detalhe.
 */
const v = (x: number, y: number): Vec2 => ({ x, y });
const section: SectionResult = { length: 10, zMin: -3, zMax: 10, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [] };
const linha = (id: string, a: Vec2, b: Vec2): DetailLine => ({ id, a, b });

function infer2(lines: DetailLine[], start: Vec2, cursor: Vec2, hidden?: Set<string>): Inference {
  const { env } = makeEnv();
  const project = createEmptyProject();
  const sec: SectionToolContext = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: lines, detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra = {}) => sectionInferContext(section, project, 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(10, 0) }, detailLines: lines, hidden }, extra),
    result: () => section,
  };
  env.section = () => sec;
  const t = tool('dimension', env);
  clickAt(t, start.x, start.y);
  t.move(P(cursor.x, cursor.y));
  return (t as unknown as { inference(): Inference }).inference();
}

const L1 = linha('dl_1', v(0, 0), v(4, 0));

describe('corte: linhas de detalhe como alvo de captura', () => {
  it('perpendicular: pé de (1,3) sobre (0,0)-(4,0) é (1,0)', () => {
    const r = infer2([L1], v(1, 3), v(1, 0.03));
    expect(r.kind).toBe('perpendicular');
    expect(r.point.x).toBeCloseTo(1, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });

  it('ponto médio (2,0)', () => {
    const r = infer2([L1], v(2, 3), v(2.02, 0.01));
    expect(r.kind).toBe('midpoint');
    expect(r.point).toEqual(v(2, 0));
  });

  it('extremidade (4,0)', () => {
    const r = infer2([L1], v(9, 8), v(4.02, 0.01));
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual(v(4, 0));
  });

  it('cruzamento de duas linhas em (1,0)', () => {
    const r = infer2([L1, linha('dl_2', v(0, -1), v(3, 2))], v(9, 8), v(1.02, 0.02));
    expect(r.kind).toBe('intersection');
    expect(r.point.x).toBeCloseTo(1, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });

  it('linha oculta na vista não captura', () => {
    const r = infer2([L1], v(2, 3), v(2.02, 0.01), new Set(['dl_1']));
    expect(r.kind).not.toBe('midpoint');
  });
});

describe('detailSnapDeLinhas: memoização por referência', () => {
  it('o mesmo array de linhas devolve as mesmas listas; vazio devolve listas vazias', () => {
    const lines = [L1];
    const a = detailSnapDeLinhas(lines);
    expect(detailSnapDeLinhas(lines)).toBe(a);
    expect(detailSnapDeLinhas(lines).points).toBe(a.points);
    expect(a.points).toHaveLength(3);
    expect(a.segments).toEqual([{ a: v(0, 0), b: v(4, 0), kind: 'nearest', hostId: 'dl_1' }]);
    expect(detailSnapDeLinhas([]).points).toHaveLength(0);
    expect(detailSnapDeLinhas(lines, new Set(['dl_1'])).points).toHaveLength(0);
  });
});
