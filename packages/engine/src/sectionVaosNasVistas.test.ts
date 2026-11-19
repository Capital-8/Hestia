import { afterEach, describe, expect, it } from 'vitest';
import type { MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { computeSection } from './section.ts';
import { definirClienteFuroContorno } from './furoContornoDespacho.ts';
import { clienteFuroContornoFalso } from './furoContornoFalso.ts';

/**
 * Regressão do relato "em cortes e elevações não aparecem os vãos nem as esquadrias" (docs/estudo-esquadrias/41): o corte e a
 * elevação devolvem, para cada vão (retangular ou com contorno), o item com o polígono do vão E o modelo com as peças, e a
 * parede do corte não cobre o vão.
 */
const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };

function projeto(): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', shape: FORMA };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
  const add = (id: string, kind: 'door' | 'window', typeId: string, offset: number): void => {
    s.exec({ type: 'addOpening', opening: { id, kind, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  };
  add('o_p', 'door', 'ot_p90', 1.5);
  add('o_j', 'window', 'ot_j120', 4.5);
  add('o_a', 'door', 'ot_arco', 7.5);
  return s.project;
}

function dentro(m: MultiPolygon, [x, y]: [number, number]): boolean {
  let inside = false;
  for (const poly of m) for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

afterEach(() => definirClienteFuroContorno(null));

describe.each([
  ['sem cliente do furo (retangular)', false],
  ['com cliente do furo (contorno)', true],
])('vãos nas vistas, %s', (_nome, comCliente) => {
  const prepara = (): Project => {
    definirClienteFuroContorno(comCliente ? clienteFuroContornoFalso() : null);
    return projeto();
  };

  it('elevação: todos os vãos saem com polígono e peças do modelo', () => {
    const r = computeSection(prepara(), { a: { x: -1, y: -3 }, b: { x: 11, y: -3 }, depth: 5 });
    expect(r.openings.map((o) => o.openingId).sort()).toEqual(['o_a', 'o_j', 'o_p']);
    for (const o of r.openings) {
      expect(o.polygons.length).toBeGreaterThan(0);
      expect(o.model.parts.length).toBeGreaterThan(0);
      expect(o.z1).toBeGreaterThan(o.z0);
    }
    // O contorno só existe no vão com forma, e só com o cliente instalado.
    expect(r.openings.find((o) => o.openingId === 'o_p')!.contorno).toBeUndefined();
    expect(r.openings.find((o) => o.openingId === 'o_a')!.contorno !== undefined).toBe(comCliente);
  });

  it('corte: o vão cortado sai com peças e a parede não cobre o vão', () => {
    const r = computeSection(prepara(), { a: { x: 1.5, y: -1 }, b: { x: 1.5, y: 1 }, depth: 3 });
    const o = r.openings.find((x) => x.openingId === 'o_p')!;
    expect(o.cut).toBe(true);
    expect(o.model.parts.length).toBeGreaterThan(0);
    const cut: MultiPolygon = r.cut.map((c) => c.polygons).flat();
    const t = (o.t0 + o.t1) / 2;
    expect(dentro(cut, [t, 1])).toBe(false); // no vão da porta, sem parede
    expect(dentro(cut, [t, 2.6])).toBe(true); // acima da porta, parede
  });

  it('corte pelo vão com forma: sai com peças e a parede acima do arco continua', () => {
    const r = computeSection(prepara(), { a: { x: 7.5, y: -1 }, b: { x: 7.5, y: 1 }, depth: 3 });
    const o = r.openings.find((x) => x.openingId === 'o_a')!;
    expect(o.cut).toBe(true);
    expect(o.model.parts.length).toBeGreaterThan(0);
    const cut: MultiPolygon = r.cut.map((c) => c.polygons).flat();
    const t = (o.t0 + o.t1) / 2;
    expect(dentro(cut, [t, 1])).toBe(false);
    expect(dentro(cut, [t, 2.6])).toBe(true);
  });
});
