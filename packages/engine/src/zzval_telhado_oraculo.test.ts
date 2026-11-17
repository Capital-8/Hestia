import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { migrateProject, sectionPoints } from '@hestia/model';
import { analyze, elevationsAround, mk, projectWith, summary, v, type LineReport } from './zzval_telhado_util.ts';

/**
 * Oráculo geométrico: cada linha visível do telhado (cumeeira, espigão, rincão, beiral), projetada na vista, deve ter traço
 * desenhado por `buildSectionDrawList`. Visível = nenhuma água mais próxima, no mesmo t, tem a face de cima mais alta.
 */
const gapOf = (rs: LineReport[]): number => rs.reduce((s, r) => s + r.uncoveredLen, 0);
const visOf = (rs: LineReport[]): number => rs.reduce((s, r) => s + r.visibleLen, 0);
const FALTA_MAX = 0.05; // m de linha visível sem traço (sobra de amostragem)

const real = migrateProject(JSON.parse(readFileSync('/home/dennylson/Documents/Projetos/Projeto sem título (5)/projeto.hestia.json', 'utf8')));

describe('projeto real: toda linha visível do telhado tem traço', () => {
  for (const view of real.views.filter((x) => x.kind === 'elevation')) {
    it(`${view.name}`, () => {
      const pts = sectionPoints(real, view);
      const r = analyze(real, { a: pts.a, b: pts.b, depth: view.depth }, undefined, false);
      expect(visOf(r.reports)).toBeGreaterThan(1);
      expect(gapOf(r.reports), summary(r.reports.filter((x) => x.uncoveredLen > 0))).toBeLessThanOrEqual(FALTA_MAX);
    });
  }

  it('controle do oráculo: só com o contorno do conjunto (sem as águas) o oráculo acusa linhas sem traço (ele discrimina)', () => {
    const view = real.views.find((x) => x.name === 'Norte')!;
    const pts = sectionPoints(real, view);
    // o contorno do conjunto é o penúltimo traço fechado (o último é a silhueta externa)
    const r = analyze(real, { a: pts.a, b: pts.b, depth: view.depth }, undefined, true, (st) => [st[st.length - 2]!]);
    expect(gapOf(r.reports)).toBeGreaterThan(1);
  });
});

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];
const L: Vec2[] = [v(0, 0), v(10, 0), v(10, 4), v(4, 4), v(4, 9), v(0, 9)];
const T: Vec2[] = [v(0, 0), v(12, 0), v(12, 4), v(8, 4), v(8, 10), v(4, 10), v(4, 4), v(0, 4)];
const shapes: Array<[string, Vec2[], 'gable' | 'hip']> = [
  ['duas águas 8x6', rect(0, 0, 8, 6), 'gable'],
  ['quatro águas 8x6', rect(0, 0, 8, 6), 'hip'],
  ['L (4 águas)', L, 'hip'],
  ['T (4 águas)', T, 'hip'],
];

describe('telhados sintéticos: toda linha visível tem traço', () => {
  for (const [name, ring, shape] of shapes) {
    const p = projectWith(mk('r1', ring, shape));
    for (const e of elevationsAround(ring)) {
      it(`${name}, ${e.name}`, () => {
        const r = analyze(p, e.line);
        expect(visOf(r.reports)).toBeGreaterThan(0.5);
        expect(gapOf(r.reports), summary(r.reports.filter((x) => x.uncoveredLen > 0))).toBeLessThanOrEqual(FALTA_MAX);
      });
    }
  }
});

describe('traços sem sentido na elevação Leste do projeto real', () => {
  const view = real.views.find((x) => x.name === 'Leste')!;
  const pts = sectionPoints(real, view);
  const r = analyze(real, { a: pts.a, b: pts.b, depth: view.depth }, undefined, false);
  const verticais = r.segs.filter(([a, b]) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6 && Math.abs(a.y - b.y) < 0.12);

  it('não há vertical de ~5 cm entre z = 2,70 e 2,76 (a queixa do dono)', () => {
    const cinco = verticais.filter(([a, b]) => Math.abs(Math.abs(a.y - b.y) - 0.05) < 0.01 && Math.min(a.y, b.y) > 2.65 && Math.max(a.y, b.y) < 2.8);
    expect(cinco.map(([a, b]) => `x=${a.x} z=${a.y}..${b.y}`)).toEqual([]);
  });

  it('não há traço fechado degenerado (comprimento < 5 cm)', () => {
    const len = (s: { pts: Vec2[] }): number => s.pts.reduce((a, q, k) => a + Math.hypot(q.x - s.pts[(k + 1) % s.pts.length]!.x, q.y - s.pts[(k + 1) % s.pts.length]!.y), 0);
    expect(r.draw.strokes.filter((s) => s.closed && len(s) < 0.05).length).toBe(0);
  });

  it('não há duas verticais de telhado quase coincidentes (a menos de 2 cm em x, faixas de z sobrepostas)', () => {
    const dup = verticais.filter(([a, b], i) => verticais.some(([c, d], j) => j > i && Math.abs(a.x - c.x) > 1e-6 && Math.abs(a.x - c.x) < 0.02 && Math.min(a.y, b.y) < Math.max(c.y, d.y) && Math.min(c.y, d.y) < Math.max(a.y, b.y)));
    expect(dup.length).toBe(0);
  });
});

describe('Leste em linha oculta (com preenchimento)', () => {
  const view = real.views.find((x) => x.name === 'Leste')!;
  const pts = sectionPoints(real, view);
  const oculta = { ...real, sectionGraphics: { ...real.sectionGraphics!, style: 'hiddenLine' as const } };
  const r = analyze(oculta, { a: pts.a, b: pts.b, depth: view.depth }, undefined, true);

  it('as linhas visíveis seguem com traço', () => {
    expect(gapOf(r.reports)).toBeLessThanOrEqual(FALTA_MAX);
  });

  it('nenhum preenchimento do telhado tem furo maior que 5 cm (a telha da camada 0 deixa um vão de ~1,4 x 0,5 m em x 4,81..6,20, z 2,86..3,36)', () => {
    const furos = r.draw.fills.flatMap((f) => f.polygons.flatMap((poly) => poly.slice(1))).filter((ring) => Math.max(...ring.map((q) => q.x)) - Math.min(...ring.map((q) => q.x)) > 0.05 && Math.max(...ring.map((q) => q.y)) - Math.min(...ring.map((q) => q.y)) > 0.05);
    expect(furos.length).toBe(0);
  });
});
