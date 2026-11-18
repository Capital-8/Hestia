import { describe, expect, it } from 'vitest';
import { createEmptyProject, emptyTitleBlock, makeWall, type Project, type Sheet, type SheetViewport, type Wall } from '@hestia/model';
import { buildSheetDrawList } from './build.ts';
import { STAMP_H, STAMP_ROW, stampHeightOf } from './frame.ts';

/*
 * Editor de layout da prancha: pan, recorte e moldura opcionais por vista, legenda configurável e carimbo com
 * disciplina e tabela de revisões. A conversão mundo → papel continua com a mesma escala; só o conteúdo se desloca.
 */

const sheet = (viewports: SheetViewport[], over: Partial<Sheet> = {}): Sheet => ({
  id: 'sh1',
  number: 'A-101',
  name: 'Planta',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-22', revision: 'R0' },
  viewports,
  ...over,
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

/** Grupo de mobiliário (moldura, legendas e carimbo) de uma prancha com as vistas dadas. */
function furnitureOf(viewports: SheetViewport[], over: Partial<Sheet> = {}) {
  const p = projectWithWall();
  p.sheets = [sheet(viewports, over)];
  const list = buildSheetDrawList(p, 'sh1')!;
  return list.groups[list.groups.length - 1]!;
}

const pointsOf = (g: { fills: { polygons: { x: number; y: number }[][][] }[] }) =>
  g.fills.flatMap((f) => f.polygons.flatMap((poly) => poly.flatMap((ring) => ring)));

function centreOf(g: { fills: { polygons: { x: number; y: number }[][][] }[] }): { x: number; y: number } {
  const pts = pointsOf(g);
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

describe('pan do conteúdo (offset)', () => {
  it('offset desloca a planta de 4 m a 1:100 em exatamente 10/-5 mm de papel', () => {
    const base = projectWithWall();
    base.sheets = [sheet([planVp()])];
    const moved = projectWithWall();
    moved.sheets = [sheet([planVp({ offset: { x: 10, y: -5 } })])];
    const a = centreOf(buildSheetDrawList(base, 'sh1')!.groups[0]!);
    const b = centreOf(buildSheetDrawList(moved, 'sh1')!.groups[0]!);
    expect(b.x - a.x).toBeCloseTo(10, 6);
    expect(b.y - a.y).toBeCloseTo(-5, 6);
  });

  it('o offset move só o conteúdo: o recorte continua na caixa da vista', () => {
    const p = projectWithWall();
    p.sheets = [sheet([planVp({ offset: { x: 10, y: -5 } })])];
    expect(buildSheetDrawList(p, 'sh1')!.groups[0]!.clip).toEqual({ x: 20, y: 20, w: 200, h: 150 });
  });
});

describe('recorte e moldura por vista', () => {
  it('clip: false deixa o grupo sem recorte', () => {
    const p = projectWithWall();
    p.sheets = [sheet([planVp({ clip: false })])];
    expect(buildSheetDrawList(p, 'sh1')!.groups[0]!.clip).toBeNull();
  });

  it('frame: false não desenha a moldura fina da vista', () => {
    const withFrame = furnitureOf([planVp()]);
    const without = furnitureOf([planVp({ frame: false })]);
    expect(without.paths).toHaveLength(withFrame.paths.length - 1);
    const atViewCorner = (p: { closed: boolean; pts: { x: number; y: number }[] }) =>
      p.closed && p.pts.length === 4 && p.pts[0]!.x === 20 && p.pts[0]!.y === 20;
    expect(without.paths.some(atViewCorner)).toBe(false);
    expect(withFrame.paths.some(atViewCorner)).toBe(true);
  });
});

describe('legenda configurável', () => {
  it('label.show: false esconde o texto da legenda', () => {
    const texts = furnitureOf([planVp({ label: { show: false } })]).texts.map((t) => t.text);
    expect(texts).not.toContain('Térreo · 1:100');
  });

  it('label.sizeMm define o tamanho do texto', () => {
    const caption = furnitureOf([planVp({ label: { sizeMm: 3.5 } })]).texts.find((t) => t.text === 'Térreo · 1:100');
    expect(caption?.sizeMm).toBe(3.5);
  });

  it('rule: true desenha a linha sob o texto com metade da caixa', () => {
    const withRule = furnitureOf([planVp({ label: { rule: true } })]);
    const without = furnitureOf([planVp({ label: { rule: false } })]);
    expect(withRule.paths).toHaveLength(without.paths.length + 1);
    // Texto em `at.y - 3,5`; a linha fica 1 mm abaixo da base do texto.
    const rule = withRule.paths.find((p) => !p.closed && p.pts.length === 2 && p.pts.every((q) => Math.abs(q.y - 15.5) < 1e-9));
    expect(rule).toBeTruthy();
    expect(rule!.pts[1]!.x - rule!.pts[0]!.x).toBeCloseTo(100, 9);
  });

  it('scaleBar: true acrescenta a barra gráfica de 20 mm à direita do texto', () => {
    const withBar = furnitureOf([planVp({ label: { rule: false, scaleBar: true } })]);
    const without = furnitureOf([planVp({ label: { rule: false, scaleBar: false } })]);
    // Dois segmentos escuros preenchidos e quatro caminhos: contorno + três divisórias.
    expect(withBar.fills).toHaveLength(without.fills.length + 2);
    expect(withBar.paths).toHaveLength(without.paths.length + 4);
    const barPts = withBar.paths
      .filter((p) => p.pts.some((q) => q.y >= 16.5 - 1e-9 && q.y <= 18.1 + 1e-9 && q.x > 20 && q.x < 200))
      .flatMap((p) => p.pts);
    const xs = barPts.map((q) => q.x);
    expect(Math.min(...xs)).toBeGreaterThan(20 + 'Térreo · 1:100'.length * 2.5 * 0.6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 9);
  });
});

describe('carimbo com disciplina e revisões', () => {
  const revs = [
    { tag: '0', date: '01/10/2026', description: 'Emissão inicial' },
    { tag: 'A', date: '15/10/2026', description: 'Alteração de layout' },
  ];

  it('stampHeightOf soma uma linha por revisão', () => {
    expect(stampHeightOf({ revisions: [] })).toBe(STAMP_H);
    expect(stampHeightOf({ revisions: revs })).toBe(STAMP_H + 2 * STAMP_ROW);
  });

  it('as revisões ficam acima do carimbo e a disciplina no cabeçalho', () => {
    const f = furnitureOf([planVp()], { revisions: revs, discipline: 'Arquitetura' });
    const texts = f.texts.map((t) => t.text);
    expect(texts).toContain('Rev. 0');
    expect(texts).toContain('Rev. A');
    expect(texts.some((t) => t.includes('A-101') && t.includes('Arquitetura'))).toBe(true);
    // O fundo branco do carimbo cresce para caber a tabela de revisões.
    const white = f.fills[0]!;
    const ys = white.polygons.flatMap((poly) => poly.flatMap((ring) => ring.map((q) => q.y)));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(STAMP_H + 2 * STAMP_ROW, 9);
  });
});
