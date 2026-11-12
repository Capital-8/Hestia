import { describe, expect, it } from 'vitest';
import { floorViewId, createEmptyProject, makeWall, type Project, type Sheet, type SheetViewport } from '@hestia/model';
import type { SheetDrawList, SheetGroup, SheetPath } from '@hestia/render';
import {
  alignDelta,
  sameOwner,
  sheetAlignFeatures,
  type PaperPoint,
  type SheetAlignFeature,
} from './sheetAlignTool.ts';

const LV0 = 'lv_0';

/** Projeto de teste: parede de 4 m em x e 3 m em y no nível térreo (o resto vem do projeto vazio). */
function projectWithWalls(): Project {
  const base = createEmptyProject();
  const walls = [
    makeWall({ id: 'w_x', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }),
    makeWall({ id: 'w_y', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }),
  ];
  return {
    ...base,
    elements: Object.fromEntries(walls.map((w, i) => [w.id, { ...w, order: i }])),
  };
}

function sheetWith(viewports: SheetViewport[]): Sheet {
  return {
    id: 'sh_1',
    number: 'A-01',
    name: 'Prancha de teste',
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: { project: '', client: '', author: '', date: '', revision: '' },
    viewports,
  };
}

const emptyGroup = (): SheetGroup => ({ clip: null, fills: [], paths: [], texts: [] });

/** Lista de desenho com um grupo vazio por vista e o grupo do mobiliário no fim, como em `buildSheetDrawList`. */
function drawListFor(viewports: SheetViewport[]): SheetDrawList {
  return { widthMm: 420, heightMm: 297, groups: [...viewports.map(emptyGroup), emptyGroup()] };
}

function planVp(id: string, at: PaperPoint, extra: Partial<SheetViewport> = {}): SheetViewport {
  return { id, view: { kind: 'plan', viewId: floorViewId(LV0) }, at, size: { w: 180, h: 130 }, scale: 100, ...extra };
}

const ownedBy = (f: SheetAlignFeature, id: string): boolean => f.owner.type === 'viewport' && f.owner.id === id;

const faceOf = (features: SheetAlignFeature[], id: string): SheetAlignFeature | undefined =>
  features.find((f) => f.kind === 'faceParede' && ownedBy(f, id));

describe('captura na prancha', () => {
  it('acha a face da parede e leva a reta do mundo para o papel', () => {
    const project = projectWithWalls();
    const vp = planVp('vp1', { x: 20, y: 20 });
    const sheet = sheetWith([vp]);
    // Vista 1:100 → 10 mm de papel por metro. Padrão: âncora no centro da caixa (110, 85) e centro do nível (2, 1.5).
    // Cursor a 0,5 mm da face de cima da parede em x (y = 0,092 m → 70,92 mm).
    const at = { x: 100, y: 71.42 };
    const features = sheetAlignFeatures({ project, sheet, drawList: drawListFor([vp]), at, zoom: 10 });

    const face = faceOf(features, 'vp1');
    expect(face).toBeDefined();
    expect(face!.label).toContain('face');
    expect(face!.line.p.x).toBeCloseTo(100, 6);
    expect(face!.line.p.y).toBeCloseTo(70.92, 6);
    expect(face!.line.d).toEqual({ x: 1, y: 0 });
    expect(face!.distance).toBeCloseTo(0.5, 6);
    expect(face!.owner).toEqual({ type: 'viewport', id: 'vp1' });
  });

  it('acha a moldura quando o cursor está perto da borda da vista', () => {
    const project = projectWithWalls();
    const vp = planVp('vp1', { x: 20, y: 20 });
    const sheet = sheetWith([vp]);
    // Tolerância = 8 px; com zoom 10, 0,8 mm. O cursor a 0,5 mm da borda esquerda.
    const features = sheetAlignFeatures({ project, sheet, drawList: drawListFor([vp]), at: { x: 20.5, y: 60 }, zoom: 10 });

    const frame = features.filter((f) => f.kind === 'moldura' && ownedBy(f, 'vp1'));
    expect(frame.length).toBeGreaterThanOrEqual(1);
    const left = frame.find((f) => Math.abs(f.distance - 0.5) < 1e-9);
    expect(left).toBeDefined();
    expect(left!.label).toBe('moldura da vista');
    expect(left!.line.p.x).toBeCloseTo(20, 9);
    expect(left!.line.d).toEqual({ x: 0, y: 1 });
    expect(left!.seg).toEqual({ a: { x: 20, y: 20 }, b: { x: 20, y: 150 } });
  });

  it('com face e moldura igualmente perto, a face vem primeiro', () => {
    const project = projectWithWalls();
    // Âncora puxa o desenho para cima: a face de cima da parede cai em y = 151 mm, sobre o topo da moldura (150 mm).
    const vp = planVp('vp1', { x: 20, y: 20 }, { anchor: { x: 110, y: 165.08 } });
    const sheet = sheetWith([vp]);
    const at = { x: 100, y: 150.5 };
    const features = sheetAlignFeatures({ project, sheet, drawList: drawListFor([vp]), at, zoom: 10 });

    expect(features[0]?.kind).toBe('faceParede');
    expect(features[0]?.distance).toBeCloseTo(0.5, 6);
    expect(features.some((f) => f.kind === 'moldura' && Math.abs(f.distance - 0.5) < 1e-6)).toBe(true);
  });

  it('o fallback do corte acha a linha vertical e ignora traço curto e inclinado', () => {
    const vp: SheetViewport = {
      id: 'vp_corte',
      view: { kind: 'section', sectionId: 'sv_1' },
      at: { x: 20, y: 20 },
      size: { w: 180, h: 130 },
      scale: 100,
    };
    const sheet = sheetWith([vp]);
    const paths: SheetPath[] = [
      // Vertical longa (a linha do desenho).
      { pts: [{ x: 100, y: 30 }, { x: 100, y: 120 }], closed: false, widthMm: 0.2, color: '#000' },
      // Horizontal longa.
      { pts: [{ x: 20, y: 60 }, { x: 160, y: 60 }], closed: false, widthMm: 0.2, color: '#000' },
      // Vertical curta: 2 mm, abaixo dos 15% da caixa (19,5 mm) — ignorada.
      { pts: [{ x: 100.4, y: 69 }, { x: 100.4, y: 71 }], closed: false, widthMm: 0.2, color: '#000' },
      // Traço inclinado passando perto do cursor — ignorado.
      { pts: [{ x: 90, y: 68 }, { x: 110, y: 72 }], closed: false, widthMm: 0.2, color: '#000' },
      // Mesma coluna da primeira: deduplicada numa feição só.
      { pts: [{ x: 100, y: 110 }, { x: 100, y: 30 }], closed: false, widthMm: 0.2, color: '#000' },
    ];
    const drawList: SheetDrawList = {
      widthMm: 420,
      heightMm: 297,
      groups: [{ ...emptyGroup(), paths }, emptyGroup()],
    };

    const lines = sheetAlignFeatures({ project: projectWithWalls(), sheet, drawList, at: { x: 100.3, y: 70 }, zoom: 10 }).filter(
      (f) => f.kind === 'linhaEsboco',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe('linha do desenho');
    expect(lines[0]!.line.d).toEqual({ x: 0, y: 1 });
    expect(lines[0]!.line.p.x).toBeCloseTo(100, 9);
    expect(lines[0]!.distance).toBeCloseTo(0.3, 6);
    expect(lines[0]!.seg).toEqual({ a: { x: 100, y: 30 }, b: { x: 100, y: 120 } });

    const horizontal = sheetAlignFeatures({ project: projectWithWalls(), sheet, drawList, at: { x: 70, y: 60.2 }, zoom: 10 }).filter(
      (f) => f.kind === 'linhaEsboco',
    );
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]!.line.d).toEqual({ x: 1, y: 0 });
    expect(horizontal[0]!.line.p.y).toBeCloseTo(60, 9);
    expect(horizontal[0]!.distance).toBeCloseTo(0.2, 6);
  });

  it('devolve a borda e o centro da folha quando o cursor está perto', () => {
    const sheet = sheetWith([]);
    const query = { project: projectWithWalls(), sheet, drawList: drawListFor([]), zoom: 10 };
    const naBorda = sheetAlignFeatures({ ...query, at: { x: 10, y: 150 } }).filter((f) => f.kind === 'folha');
    expect(naBorda.length).toBeGreaterThanOrEqual(1);
    expect(naBorda[0]!.label).toBe('borda da folha');
    expect(naBorda[0]!.distance).toBeCloseTo(0, 6);
    expect(naBorda.every((f) => f.owner.type === 'sheet')).toBe(true);

    const noCentro = sheetAlignFeatures({ ...query, at: { x: 210, y: 148.5 } }).filter((f) => f.kind === 'folha');
    expect(noCentro.some((f) => f.label === 'centro da folha')).toBe(true);
  });
});

describe('alinhamento entre feições', () => {
  const base = (key: string, p: PaperPoint, d: PaperPoint, owner: SheetAlignFeature['owner'] = { type: 'sheet' }): SheetAlignFeature => ({
    key,
    label: '',
    kind: 'faceParede',
    line: { p, d },
    owner,
    distance: 0,
  });

  it('alinha duas faces paralelas de vistas diferentes', () => {
    const project = projectWithWalls();
    const vp1 = planVp('vp1', { x: 20, y: 20 });
    const vp2 = planVp('vp2', { x: 210, y: 60 });
    const sheet = sheetWith([vp1, vp2]);
    const drawList = drawListFor([vp1, vp2]);

    // Mesmo ponto do mundo nas duas vistas (x = 1 m), cada uma com a sua âncora: as faces ficam em y = 70,92 e 110,92.
    const f1 = sheetAlignFeatures({ project, sheet, drawList, at: { x: 100, y: 71.42 }, zoom: 10 });
    const f2 = sheetAlignFeatures({ project, sheet, drawList, at: { x: 300, y: 111.42 }, zoom: 10 });
    const ref = faceOf(f1, 'vp1')!;
    const alvo = faceOf(f2, 'vp2')!;
    expect(ref.line.p.y).toBeCloseTo(70.92, 6);
    expect(alvo.line.p.y).toBeCloseTo(110.92, 6);

    const delta = alignDelta(ref, alvo);
    expect(delta).not.toBeNull();
    expect(delta!.dy).toBeCloseTo(-40, 6);
    expect(delta!.dx).toBeCloseTo(0, 6);

    // Aplicar o delta na segunda faz as duas retas coincidirem.
    const movida = { x: alvo.line.p.x + delta!.dx, y: alvo.line.p.y + delta!.dy };
    expect(movida.y).toBeCloseTo(ref.line.p.y, 6);
    expect(movida.x).toBeCloseTo(alvo.line.p.x, 6);
  });

  it('recusa retas perpendiculares e devolve zero para retas já alinhadas', () => {
    const horizontal = base('h', { x: 0, y: 0 }, { x: 1, y: 0 });
    const vertical = base('v', { x: 5, y: 3 }, { x: 0, y: 1 });
    expect(alignDelta(horizontal, vertical)).toBeNull();

    const paralela = base('p', { x: 4, y: 4 }, { x: 1, y: 0 });
    expect(alignDelta(horizontal, paralela)).toEqual({ dx: 0, dy: -4 });

    const alinhada = base('a', { x: 7, y: 0 }, { x: 1, y: 0 });
    expect(alignDelta(horizontal, alinhada)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('dono da feição', () => {
  it('reconhece a mesma vista, vistas diferentes e a folha', () => {
    const project = projectWithWalls();
    const vp1 = planVp('vp1', { x: 20, y: 20 });
    const vp2 = planVp('vp2', { x: 210, y: 60 });
    const sheet = sheetWith([vp1, vp2]);
    const drawList = drawListFor([vp1, vp2]);
    const features = sheetAlignFeatures({ project, sheet, drawList, at: { x: 100, y: 71.42 }, zoom: 10 });

    const face = faceOf(features, 'vp1')!;
    const frame: SheetAlignFeature = { ...face, key: 'moldura', kind: 'moldura' };
    const outraVista: SheetAlignFeature = { ...face, key: 'outra', owner: { type: 'viewport', id: 'vp2' } };
    const folha: SheetAlignFeature = { key: 'folha', label: 'borda da folha', kind: 'folha', line: { p: { x: 0, y: 0 }, d: { x: 0, y: 1 } }, owner: { type: 'sheet' }, distance: 0 };
    const outraFolha: SheetAlignFeature = { ...folha, key: 'folha2' };

    expect(sameOwner(face, frame)).toBe(true);
    expect(sameOwner(face, outraVista)).toBe(false);
    expect(sameOwner(face, folha)).toBe(false);
    expect(sameOwner(folha, outraFolha)).toBe(true);
  });
});
