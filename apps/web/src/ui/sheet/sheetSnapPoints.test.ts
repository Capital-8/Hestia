import { describe, expect, it } from 'vitest';
import { floorViewId, type Sheet, type SheetViewport } from '@hestia/model';
import type { SheetDrawList, SheetGroup, SheetPath } from '@hestia/render';
import {
  MAX_SNAP_POINTS,
  nearestPoint,
  snapLabel,
  snapPointsAt,
  type PaperPoint,
  type SnapPoint,
  type SnapPointKind,
} from './sheetSnapPoints.ts';

/** Prancha A3 deitada (420 × 297 mm), margem 10 → área de desenho de (10,10) a (410,287). */
function sheetWith(viewports: SheetViewport[] = []): Sheet {
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

const vp: SheetViewport = {
  id: 'vp1',
  view: { kind: 'plan', viewId: floorViewId('lv_0') },
  at: { x: 20, y: 20 },
  size: { w: 180, h: 130 },
  scale: 100,
};

const trace = (pts: PaperPoint[], closed = false): SheetPath => ({ pts, closed, widthMm: 0.2, color: '#000' });

const emptyGroup = (): SheetGroup => ({ clip: null, fills: [], paths: [], texts: [] });

const groupWith = (paths: SheetPath[]): SheetGroup => ({ ...emptyGroup(), paths });

/** Lista de desenho com um grupo por vista e o grupo do mobiliário no fim, como em `buildSheetDrawList`. */
const drawListOf = (viewGroups: SheetGroup[]): SheetDrawList => ({
  widthMm: 420,
  heightMm: 297,
  groups: [...viewGroups, emptyGroup()],
});

const pointsAt = (sheet: Sheet, drawList: SheetDrawList | null, at: PaperPoint, tol: number) =>
  snapPointsAt({ drawList, sheet, at, tol });

const near = (p: PaperPoint, x: number, y: number): boolean => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;

describe('pontos da moldura e da folha', () => {
  it('acha o canto inferior esquerdo da moldura dentro de 2 mm', () => {
    const sheet = sheetWith([vp]);
    const points = pointsAt(sheet, null, { x: 21.2, y: 20.6 }, 2);
    const corner = points.find((p) => p.kind === 'canto_moldura');
    expect(corner).toBeDefined();
    expect(corner!.p).toEqual({ x: 20, y: 20 });
    expect(corner!.label).toBe('Canto da moldura');
    expect(corner!.distance).toBeCloseTo(Math.hypot(1.2, 0.6), 9);
  });

  it('acha o centro da folha', () => {
    const sheet = sheetWith([vp]);
    // Área de desenho (10,10)–(410,287) → centro (210, 148.5).
    const points = pointsAt(sheet, null, { x: 210.4, y: 148.2 }, 1);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ kind: 'centro_folha', label: 'Centro da folha', p: { x: 210, y: 148.5 } });
  });

  it('sem drawList ainda captura moldura e folha', () => {
    const sheet = sheetWith([vp]);
    const points = pointsAt(sheet, null, { x: 20, y: 85 }, 1);
    expect(points[0]).toMatchObject({ kind: 'meio_moldura', p: { x: 20, y: 85 } });
  });
});

describe('pontos da construção desenhada', () => {
  it('acha a interseção de um "L" e ela ganha da extremidade que cai no mesmo lugar', () => {
    const sheet = sheetWith([vp]);
    const drawList = drawListOf([
      groupWith([
        trace([{ x: 120, y: 40 }, { x: 120, y: 130 }]),
        trace([{ x: 60, y: 80 }, { x: 170, y: 80 }]),
        // Traço inclinado que termina exatamente na interseção: vira uma extremidade na mesma coordenada.
        trace([{ x: 120, y: 80 }, { x: 150, y: 110 }]),
      ]),
    ]);
    const points = pointsAt(sheet, drawList, { x: 120.4, y: 80.3 }, 1);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ kind: 'intersecao', label: 'Interseção', p: { x: 120, y: 80 } });
    expect(points[0]!.distance).toBeCloseTo(0.5, 9);
  });

  it('as pontas viram extremidade, o meio só aparece em segmento com 10 mm ou mais', () => {
    const sheet = sheetWith([vp]);
    const drawList = drawListOf([groupWith([trace([{ x: 30, y: 30 }, { x: 80, y: 30 }])])]);

    const end = pointsAt(sheet, drawList, { x: 30.2, y: 30.2 }, 1).find((p) => p.kind === 'extremidade');
    expect(end).toBeDefined();
    expect(end!.p).toEqual({ x: 30, y: 30 });
    expect(end!.label).toBe('Extremidade');

    const mid = pointsAt(sheet, drawList, { x: 55, y: 30 }, 1);
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ kind: 'meio', label: 'Meio', p: { x: 55, y: 30 } });
  });

  it('segmento curto (menos de 10 mm) não gera meio', () => {
    const sheet = sheetWith([vp]);
    const drawList = drawListOf([groupWith([trace([{ x: 100, y: 30 }, { x: 105, y: 30 }])])]);
    expect(pointsAt(sheet, drawList, { x: 102.5, y: 30 }, 1)).toEqual([]);
  });

  it('dois segmentos que terminam no mesmo ponto geram um único ponto', () => {
    const sheet = sheetWith([vp]);
    const drawList = drawListOf([
      groupWith([trace([{ x: 50, y: 50 }, { x: 60, y: 50 }]), trace([{ x: 70, y: 50 }, { x: 60, y: 50 }])]),
    ]);
    const points = pointsAt(sheet, drawList, { x: 60, y: 50 }, 0.5);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ kind: 'extremidade', p: { x: 60, y: 50 } });
  });

  it('paths fechados também consideram o segmento de fechamento', () => {
    const sheet = sheetWith([vp]);
    // Triângulo fechado: o meio do segmento de fechamento (da última ponta de volta à primeira).
    const drawList = drawListOf([
      groupWith([trace([{ x: 100, y: 30 }, { x: 140, y: 30 }, { x: 120, y: 60 }], true)]),
    ]);
    expect(pointsAt(sheet, drawList, { x: 110, y: 45 }, 1).some((p) => p.kind === 'meio' && near(p.p, 110, 45))).toBe(
      true,
    );
  });
});

describe('filtro, ordenação e prioridade', () => {
  it('descarta o que está fora da tolerância e ordena por distância', () => {
    const sheet = sheetWith([vp]);
    const drawList = drawListOf([
      groupWith([trace([{ x: 100, y: 100 }, { x: 140, y: 100 }]), trace([{ x: 121, y: 101 }, { x: 131, y: 101 }])]),
    ]);
    const points = pointsAt(sheet, drawList, { x: 120.4, y: 100.3 }, 2);

    expect(points[0]).toMatchObject({ kind: 'meio', p: { x: 120, y: 100 } });
    expect(points[1]).toMatchObject({ kind: 'extremidade', p: { x: 121, y: 101 } });
    expect(points.some((p) => near(p.p, 140, 100))).toBe(false);
    expect(points.every((p) => p.distance <= 2 + 1e-6)).toBe(true);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.distance).toBeGreaterThanOrEqual(points[i - 1]!.distance - 1e-9);
    }
  });

  it('nearestPoint respeita a tolerância e a prioridade no empate', () => {
    const mk = (x: number, y: number, kind: SnapPointKind): SnapPoint => ({
      p: { x, y },
      kind,
      label: snapLabel(kind),
      distance: 0,
    });

    expect(nearestPoint([mk(0.1, 0, 'canto_folha'), mk(-0.1, 0, 'centro_folha')], { x: 0, y: 0 }, 1)?.kind).toBe(
      'centro_folha',
    );
    expect(nearestPoint([mk(0.2, 0, 'canto_folha'), mk(1, 0, 'centro_folha')], { x: 0, y: 0 }, 5)?.kind).toBe(
      'canto_folha',
    );
    expect(nearestPoint([mk(2, 0, 'extremidade')], { x: 0, y: 0 }, 1)).toBeNull();
    expect(nearestPoint([], { x: 0, y: 0 }, 1)).toBeNull();
  });

  it('snapLabel devolve os rótulos em pt-BR', () => {
    expect(snapLabel('intersecao')).toBe('Interseção');
    expect(snapLabel('extremidade')).toBe('Extremidade');
    expect(snapLabel('meio_folha')).toBe('Meio da folha');
    expect(snapLabel('centro_moldura')).toBe('Centro da moldura');
  });
});

describe('limites e grupos', () => {
  it('devolve no máximo 400 pontos com muitos segmentos, sem travar', () => {
    const sheet = sheetWith([vp]);
    const paths: SheetPath[] = [];
    for (let i = 0; i < 500; i++) {
      const x = 20 + (i % 25) * 7;
      const y = 20 + Math.floor(i / 25) * 6;
      paths.push(trace([{ x, y }, { x: x + 5, y }, { x: x + 5, y: y + 4 }, { x, y: y + 4 }], true));
    }
    const drawList = drawListOf([groupWith(paths)]);
    const started = performance.now();
    const points = pointsAt(sheet, drawList, { x: 100, y: 100 }, 500);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(points.length).toBeLessThanOrEqual(MAX_SNAP_POINTS);
    expect(points.length).toBeGreaterThan(0);
  });

  it('ignora o último grupo (mobiliário)', () => {
    const sheet = sheetWith([vp]);
    const furniture = groupWith([trace([{ x: 300, y: 60 }, { x: 320, y: 60 }])]);

    const asFurniture: SheetDrawList = { widthMm: 420, heightMm: 297, groups: [emptyGroup(), furniture] };
    expect(pointsAt(sheet, asFurniture, { x: 300, y: 60 }, 1)).toEqual([]);

    // O mesmo grupo na posição da vista é capturado normalmente.
    const asView: SheetDrawList = { widthMm: 420, heightMm: 297, groups: [furniture, emptyGroup()] };
    expect(pointsAt(sheet, asView, { x: 300, y: 60 }, 1)[0]).toMatchObject({
      kind: 'extremidade',
      p: { x: 300, y: 60 },
    });
  });
});
