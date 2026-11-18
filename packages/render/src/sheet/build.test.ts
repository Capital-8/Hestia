import { describe, expect, it } from 'vitest';
import { createEmptyProject, emptyTitleBlock, makeWall, type Project, type Sheet, type SheetViewport, type Wall } from '@hestia/model';
import { buildSheetDrawList } from './build.ts';
import { partsOf, toPaper, viewMappingOf } from './convert.ts';
import { LIGHT, type PlanDrawList } from '../plan/types.ts';

const sheet = (viewports: SheetViewport[]): Sheet => ({
  id: 'sh1',
  number: 'A-101',
  name: 'Planta',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-22', revision: 'R0' },
  viewports,
});

/** Projeto com uma parede de 4 m no eixo x, do nível lv_0. */
function projectWithWall(): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 } as Wall;
  p.nextOrder = 2;
  return p;
}

const planVp = (over: Partial<SheetViewport> = {}): SheetViewport => ({
  id: 'v1',
  view: { kind: 'plan', levelId: 'lv_0' },
  at: { x: 20, y: 20 },
  size: { w: 200, h: 150 },
  scale: 100,
  ...over,
});

const pointsOf = (g: { fills: { polygons: { x: number; y: number }[][][] }[] }) =>
  g.fills.flatMap((f) => f.polygons.flatMap((poly) => poly.flatMap((ring) => ring)));

describe('escala na folha', () => {
  it('um metro na escala 1:100 mede 10 mm de papel', () => {
    const m = viewMappingOf({ size: { w: 200, h: 150 }, scale: 100 }, { x: 0, y: 0 });
    const to = toPaper({ at: { x: 20, y: 20 }, size: { w: 200, h: 150 } }, m);
    const a = to({ x: 0, y: 0 });
    const b = to({ x: 1, y: 0 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(10, 9);
  });

  it('a centragem põe o centro do conteúdo no centro da vista', () => {
    const m = viewMappingOf({ size: { w: 200, h: 150 }, scale: 50 }, { x: 2, y: 0 });
    const c = toPaper({ at: { x: 20, y: 20 }, size: { w: 200, h: 150 } }, m)({ x: 2, y: 0 });
    expect(c.x).toBeCloseTo(120, 9);
    expect(c.y).toBeCloseTo(95, 9);
  });
});

describe('composição da prancha', () => {
  it('planta: a parede de 4 m a 1:100 ocupa 40 mm, centrada na caixa, recortada à vista', () => {
    const p = projectWithWall();
    p.sheets = [sheet([planVp()])];
    const list = buildSheetDrawList(p, 'sh1')!;
    expect(list.widthMm).toBe(420);
    expect(list.groups).toHaveLength(2);
    const vp = list.groups[0]!;
    expect(vp.clip).toEqual({ x: 20, y: 20, w: 200, h: 150 });
    const pts = pointsOf(vp);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40, 3);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(120, 3);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(95, 3);
  });

  it('a moldura e a legenda ficam no grupo sem recorte, por último', () => {
    const p = projectWithWall();
    p.sheets = [sheet([planVp()])];
    const list = buildSheetDrawList(p, 'sh1')!;
    const furniture = list.groups[list.groups.length - 1]!;
    expect(furniture.clip).toBeNull();
    const texts = furniture.texts.map((t) => t.text);
    expect(texts).toContain('A-101  Planta');
    expect(texts).toContain('Projeto: Casa');
    expect(texts).toContain('Escala: 1:100');
    expect(texts).toContain('Térreo · 1:100');
  });

  it('largura de linha vem em mm de papel: 500 px de tela valem 0,5 mm', () => {
    const list: PlanDrawList = {
      background: '#fff',
      fills: [],
      strokes: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, widthPx: 500, color: '#000000', alpha: 1 }],
      labels: [],
    };
    const parts = partsOf(list, toPaper({ at: { x: 0, y: 0 }, size: { w: 100, h: 100 } }, viewMappingOf({ size: { w: 100, h: 100 }, scale: 100 }, { x: 0, y: 0 })), LIGHT);
    expect(parts.paths[0]!.widthMm).toBeCloseTo(0.5, 9);
  });

  it('corte: a seção gera partes (preenchimentos) recortadas à caixa', () => {
    const p = projectWithWall();
    p.views = [{ id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -1, y: 0 }, b: { x: 5, y: 0 }, depth: 3 }];
    p.sheets = [sheet([{ id: 'v2', view: { kind: 'section', sectionId: 'sv1' }, at: { x: 20, y: 20 }, size: { w: 200, h: 100 }, scale: 50 }])];
    const list = buildSheetDrawList(p, 'sh1')!;
    expect(list.groups[0]!.fills.length).toBeGreaterThan(0);
    expect(list.groups[0]!.clip).toEqual({ x: 20, y: 20, w: 200, h: 100 });
    expect(list.groups[list.groups.length - 1]!.texts.map((t) => t.text)).toContain('Corte AA · 1:50');
  });

  it('corte na prancha leva as anotações da vista (cota e texto), como a planta', () => {
    const p = projectWithWall();
    p.views = [{
      id: 'sv1', name: 'Corte AA', kind: 'section', a: { x: -1, y: 0 }, b: { x: 5, y: 0 }, depth: 3,
      annotations: {
        dimensions: [{ id: 'd1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.4 }],
        texts: [{ id: 't1', at: { x: 2, y: 2.5 }, text: 'Pé-direito', height: 2.5, rotation: 0 }],
        detailLines: [], detailRegions: [], tags: [],
      },
    }];
    p.sheets = [sheet([{ id: 'v2', view: { kind: 'section', sectionId: 'sv1' }, at: { x: 20, y: 20 }, size: { w: 200, h: 100 }, scale: 100 }])];
    const list = buildSheetDrawList(p, 'sh1')!;
    const textos = list.groups[0]!.texts.map((t) => t.text);
    expect(textos).toContain('Pé-direito');
    expect(textos.some((t) => t.includes('3,00'))).toBe(true);
  });

  it('3D sai vetorial na prancha: arestas visíveis, sem o aviso antigo', () => {
    const p = projectWithWall();
    p.sheets = [sheet([{ id: 'v3', view: { kind: '3d' }, at: { x: 20, y: 20 }, size: { w: 200, h: 100 }, scale: 100 }])];
    const list = buildSheetDrawList(p, 'sh1')!;
    expect(list.groups[0]!.texts).toEqual([]);
    expect(list.groups[0]!.fills).toHaveLength(0);
    const paths = list.groups[0]!.paths;
    expect(paths.length).toBeGreaterThan(0);
    for (const s of paths) {
      expect(s.widthMm).toBeGreaterThan(0);
      for (const q of s.pts) {
        expect(q.x).toBeGreaterThanOrEqual(20 - 0.01);
        expect(q.x).toBeLessThanOrEqual(220 + 0.01);
        expect(q.y).toBeGreaterThanOrEqual(20 - 0.01);
        expect(q.y).toBeLessThanOrEqual(120 + 0.01);
      }
    }
    // A legenda não mostra escala de desenho no 3D.
    expect(list.groups[1]!.texts.map((t) => t.text)).toContain('3D · Sem escala');
  });

  it('nível inexistente não quebra: a vista fica vazia com a legenda "Vista inexistente"', () => {
    const p = projectWithWall();
    p.sheets = [sheet([planVp({ view: { kind: 'plan', levelId: 'nope' } })])];
    const list = buildSheetDrawList(p, 'sh1')!;
    expect(list.groups[0]!.fills).toHaveLength(0);
    expect(list.groups[1]!.texts.map((t) => t.text)).toContain('Vista inexistente · 1:100');
  });

  it('prancha inexistente devolve null', () => {
    expect(buildSheetDrawList(projectWithWall(), 'nada')).toBeNull();
  });
});
