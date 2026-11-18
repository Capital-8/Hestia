import { afterEach, describe, expect, it } from 'vitest';
import { multiArea, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type OpeningShape, type Project } from '@hestia/model';
import { computeSection } from './section.ts';
import { frameOfWall, openingGeometry, resolveLevel } from './resolve.ts';
import { definirClienteFuroContorno } from './furoContornoDespacho.ts';
import { clienteFuroContornoFalso } from './furoContornoFalso.ts';
import { faixasSemVazio, vaosDeContornoDaParede, vaziosDoCorte } from './vaoContornoVistas.ts';
import { verticalCutProfile } from './openingShapeViews.ts';
import type { Opening } from '@hestia/model';

const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.4 };

/** Parede de 6 m (eixo x, y entre 0 e a espessura) com um vão livre em x = 4, com forma ou sem ela. */
function projeto(forma: boolean): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', width: 0.9, height: 2.4, leaves: 0, closure: 'none', ...(forma ? { shape: FORMA } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const arco: Opening = { id: 'o_arco', kind: 'window', typeId: 'ot_arco', hostId: 'w1', offset: 4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: arco });
  return s.project;
}

/** Ponto dentro de um multipolígono (regra par-ímpar sobre todos os anéis: furos contam). */
function dentro(m: MultiPolygon, [x, y]: [number, number]): boolean {
  let inside = false;
  for (const poly of m) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
    }
  }
  return inside;
}

afterEach(() => definirClienteFuroContorno(null));

describe('vão com contorno nas vistas (corte, elevação)', () => {
  it('corte perpendicular: o vão abre pelo perfil e a parede continua sobre o arco', () => {
    const p = projeto(true);
    const g = openingGeometry(p, p.elements.o_arco as Opening, frameOfWall(p, 'w1')!);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    // Corte em x = 4 + 0,35: o arco está mais baixo que no centro, então sobra parede acima do vão.
    const r = computeSection(p, { a: { x: 4.35, y: -1 }, b: { x: 4.35, y: 1 }, depth: 3 });
    const tm = 1; // parede centrada em y = 0: a espessura vai de t = 1 - th/2 a 1 + th/2
    const base = g.sill;
    const cut: MultiPolygon = r.cut.map((c) => c.polygons).flat();
    // Dentro do vão, no fundo do arco: nada de parede no corte.
    expect(dentro(cut, [tm, base + 0.05])).toBe(false);
    // Perfil real em x = 4,35 (cota absoluta): o vão vai de `lo` a `hi`; logo acima de `hi` é parede.
    const [lo, hi] = verticalCutProfile(g.forma!, { along: 0, sill: base }, 0.35)[0]!;
    expect(lo).toBeCloseTo(base, 9);
    expect(dentro(cut, [tm, (lo + hi) / 2])).toBe(false);
    expect(dentro(cut, [tm, hi + 0.05])).toBe(true);
  });

  it('corte perpendicular: a faixa de parede perde o vão só pelo perfil (área a mais que o retângulo)', () => {
    const p = projeto(true);
    const area = (r: ReturnType<typeof computeSection>): number => multiArea(r.cut.map((c) => c.polygons).flat());
    const sem = area(computeSection(p, { a: { x: 4.35, y: -1 }, b: { x: 4.35, y: 1 }, depth: 3 }));
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const com = area(computeSection(p, { a: { x: 4.35, y: -1 }, b: { x: 4.35, y: 1 }, depth: 3 }));
    expect(com).toBeGreaterThan(sem);
  });

  it('vaziosDoCorte e faixasSemVazio: intervalos de z do perfil e a faixa que sobra', () => {
    const p = projeto(true);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const rw = resolveLevel(p, 'lv_0').walls.w1!;
    const vaos = vaosDeContornoDaParede(rw);
    expect(vaos.length).toBe(1);
    const v = vaziosDoCorte(vaos, { a: { x: 4, y: -1 }, d: { x: 0, y: 1 } });
    expect(v.length).toBe(1);
    expect(v[0]![0]).toBeCloseTo(vaos[0]!.sillAbs, 9);
    expect(faixasSemVazio(0, 3, [[1, 2]])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(faixasSemVazio(0, 3, [[-1, 4]])).toEqual([]);
  });

  it('elevação: o contorno do vão aparece na vista e a face da parede perde o furo', () => {
    const p = projeto(true);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const g = openingGeometry(p, p.elements.o_arco as Opening, frameOfWall(p, 'w1')!);
    // Linha paralela à parede, à frente dela (y = -1): a parede aparece além do plano.
    const r = computeSection(p, { a: { x: -1, y: -1 }, b: { x: 7, y: -1 }, depth: 3 });
    const op = r.openings.find((o) => o.openingId === 'o_arco');
    expect(op?.contorno).toBeDefined();
    const tc = 5; // centro do vão em t = x - (-1)
    // Dentro do arco: o vão tem contorno (está no polígono do vão) e a face da parede não tem parede ali.
    expect(dentro(op!.polygons, [tc, g.sill + 0.05])).toBe(true);
    const faceParede = r.beyond.filter((b) => b.wallId === 'w1').flatMap((b) => b.polygons);
    expect(dentro(faceParede, [tc, g.sill + 0.05])).toBe(false);
    // Fora do contorno, logo ao lado dele (meia-largura do vão bruto mais 10 cm): parede.
    expect(dentro(faceParede, [tc + g.forma!.width / 2 + 0.1, g.sill + 0.05])).toBe(true);
    // O arco, não o retângulo bruto: no canto acima da curva (u = 0,4; z = 2,3 está acima do arco de 2,4 m de altura) é parede.
    expect(dentro(op!.polygons, [tc, 2.3])).toBe(true);
    expect(dentro(op!.polygons, [tc + 0.4, 2.3])).toBe(false);
    expect(dentro(faceParede, [tc + 0.4, 2.3])).toBe(true);
  });

  it('vão retangular: vistas idênticas com e sem o cliente instalado', () => {
    const p = projeto(false);
    const sem = JSON.stringify([computeSection(p, { a: { x: 4, y: -1 }, b: { x: 4, y: 1 }, depth: 3 }), computeSection(p, { a: { x: -1, y: -1 }, b: { x: 7, y: -1 }, depth: 3 })]);
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const com = JSON.stringify([computeSection(p, { a: { x: 4, y: -1 }, b: { x: 4, y: 1 }, depth: 3 }), computeSection(p, { a: { x: -1, y: -1 }, b: { x: 7, y: -1 }, depth: 3 })]);
    expect(com).toBe(sem);
  });

  it('vão com forma sem cliente: vistas idênticas às do vão retangular (a forma só vale com o furo por contorno)', () => {
    const linha = { a: { x: 4.35, y: -1 }, b: { x: 4.35, y: 1 }, depth: 3 };
    const a = JSON.stringify(computeSection(projeto(true), linha));
    const b = JSON.stringify(computeSection(projeto(false), linha));
    expect(a).toBe(b);
  });
});
