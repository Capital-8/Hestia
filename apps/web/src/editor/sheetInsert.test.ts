import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, emptyTitleBlock, floorViewId, patchFloorOfTest, viewOfTest, makeView3DPoint, makeWall, sheetInnerBox, sheetOf, viewportIssue, type Sheet, type SheetViewport } from '@hestia/model';
import { addSheetAction } from './sheetActions.ts';
import { addViewportAtAction, addViewsAction, autoScaleForView, contentSizeMm, dragPlacement, naturalScaleOf, sheetsPerLevelAction } from './sheetInsert.ts';

const PLAN: { kind: 'plan'; levelId: string } = { kind: 'plan', levelId: 'lv_0' };

/** Projeto com uma parede reta no térreo: é o conteúdo que dá tamanho à planta. */
function storeWithWall(length: number, levelId = 'lv_0'): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_teste', typeId: 'wt_alv14', levelId, a: { x: 0, y: 0 }, b: { x: length, y: 0 }, height: 3 }) });
  return s;
}

/** Duas caixas de vistas não se tocam? */
function disjoint(a: SheetViewport, b: SheetViewport): boolean {
  return a.at.x >= b.at.x + b.size.w || b.at.x >= a.at.x + a.size.w || a.at.y >= b.at.y + b.size.h || b.at.y >= a.at.y + a.size.h;
}

describe('inserção de vistas: tamanho do conteúdo', () => {
  it('planta de parede de 4 m a 1:100 ocupa ~40 mm + 30 mm de folga', () => {
    const s = storeWithWall(4);
    const size = contentSizeMm(s.project, PLAN, 100);
    expect(size.w).toBeCloseTo(40 + 30, 6);
    expect(size.h).toBeCloseTo(30, 6);
  });

  it('quadro de áreas tem tamanho fixo, independente da escala', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(contentSizeMm(s.project, { kind: 'areaTable' }, 100)).toEqual({ w: 120, h: 120 });
    expect(contentSizeMm(s.project, { kind: 'areaTable' }, 20)).toEqual({ w: 120, h: 120 });
    expect(contentSizeMm(s.project, { kind: '3d' }, 50)).toEqual({ w: 180, h: 130 });
  });

  it('vista 3D com ponto de vista salvo continua com tamanho fixo', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(contentSizeMm(s.project, { kind: '3d', pointId: 'v3d_1' }, 100)).toEqual({ w: 180, h: 130 });
  });
});

describe('inserção de vistas: escala automática', () => {
  it('escolhe a maior escala que cabe (1:100) e desce para 1:200 na caixa menor', () => {
    const s = storeWithWall(4);
    expect(autoScaleForView(s.project, PLAN, { w: 80, h: 40 })).toBe(100);
    expect(autoScaleForView(s.project, PLAN, { w: 60, h: 40 })).toBe(200);
  });

  it('sem escala que caiba, devolve a maior disponível (500) e nunca um valor fora da lista', () => {
    const s = storeWithWall(4);
    expect(autoScaleForView(s.project, PLAN, { w: 10, h: 10 })).toBe(500);
    expect([20, 100]).toContain(autoScaleForView(s.project, PLAN, { w: 10, h: 10 }, [20, 100]));
  });
});

describe('inserção de vistas: lote', () => {
  it('adiciona três vistas sem sobreposição e um único undo remove todas', () => {
    const s = storeWithWall(4);
    const sheetId = addSheetAction(s);
    const ids = addViewsAction(s, sheetId, [
      { view: PLAN, scale: 100 },
      { view: { kind: 'areaTable' }, scale: 100 },
      { view: { kind: '3d' }, scale: 100 },
    ]);
    expect(ids).toHaveLength(3);
    const sheet = sheetOf(s.project, sheetId)!;
    expect(sheet.viewports).toHaveLength(3);
    for (const vp of sheet.viewports) expect(viewportIssue(sheet, vp)).toBeNull();
    for (let i = 0; i < sheet.viewports.length; i++) {
      for (let j = i + 1; j < sheet.viewports.length; j++) {
        expect(disjoint(sheet.viewports[i]!, sheet.viewports[j]!)).toBe(true);
      }
    }
    s.undo();
    expect(sheetOf(s.project, sheetId)!.viewports).toHaveLength(0);
    expect(s.project.sheets).toHaveLength(1);
  });

  it('insere a vista 3D já apontando para o ponto de vista escolhido', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addView3DPoint', point: makeView3DPoint({ azimuth: 0, elevation: 0.6, distance: 12, target: { x: 0, y: 0, z: 0 }, ortho: true }, 'Fachada norte') });
    const ponto = (s.project.view3dPoints ?? [])[0]!;
    const sheetId = addSheetAction(s);
    const ids = addViewsAction(s, sheetId, [{ view: { kind: '3d', pointId: ponto.id } }]);
    expect(ids).toHaveLength(1);
    const vp = sheetOf(s.project, sheetId)!.viewports[0]!;
    expect(vp.view).toEqual({ kind: '3d', pointId: ponto.id });
    expect(vp.size).toEqual({ w: 180, h: 130 });
    expect(viewportIssue(sheetOf(s.project, sheetId)!, vp)).toBeNull();
  });

  it('recusa o lote inteiro, sem gravar nada, quando uma vista não cabe', () => {
    const s = storeWithWall(400);
    const sheetId = addSheetAction(s);
    expect(() =>
      addViewsAction(s, sheetId, [
        { view: { kind: 'areaTable' }, scale: 100 },
        { view: PLAN, scale: 20 },
      ]),
    ).toThrow(/não cabe/);
    expect(sheetOf(s.project, sheetId)!.viewports).toHaveLength(0);
  });
});

describe('inserção de vistas: uma prancha por nível', () => {
  it('cria uma prancha por nível, com planta e carimbo, e um undo desfaz todas', () => {
    const s = new ProjectStore(createEmptyProject('Casa'));
    const ids = sheetsPerLevelAction(s);
    expect(ids).toHaveLength(2);
    const sheets = s.project.sheets ?? [];
    expect(sheets).toHaveLength(2);
    expect(sheets.map((sh) => sh.name)).toEqual(['Planta — Térreo', 'Planta — Pavimento 2']);
    expect(sheets.map((sh) => sh.number)).toEqual(['A-101', 'A-102']);
    for (const [i, sh] of sheets.entries()) {
      expect(sh.titleBlock.project).toBe('Casa');
      expect(sh.titleBlock.date).not.toBe('');
      expect(sh.viewports).toHaveLength(1);
      const vp = sh.viewports[0]!;
      expect(vp.view).toEqual({ kind: 'plan', levelId: `lv_${i}` });
      expect(vp.scale).toBe(100);
      const inner = sheetInnerBox(sh);
      expect(vp.at).toEqual({ x: inner.x0 + 10, y: inner.y0 + 10 });
      expect(viewportIssue(sh, vp)).toBeNull();
    }
    s.undo();
    expect(s.project.sheets ?? []).toHaveLength(0);
  });
});

describe('arrastar uma vista do navegador para a prancha', () => {
  const casa = () => {
    const p = createEmptyProject();
    const a = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    const b = makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } });
    p.elements[a.id] = { ...a, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.nextOrder = 3;
    return p;
  };

  it('a escala natural da planta é a da vista do nível', () => {
    const p = casa();
    patchFloorOfTest(p, 'lv_0', { graphics: { ...(viewOfTest(p, floorViewId('lv_0')).graphics ?? {}), scale: 50 } as never });
    expect(naturalScaleOf(p, { kind: 'plan', levelId: 'lv_0' })).toBe(50);
    expect(naturalScaleOf(p, { kind: '3d' })).toBe(100);
  });

  it('coloca a vista centrada no ponto solto, na escala natural, e cabe na folha', () => {
    const p = casa();
    const sh: Sheet = { id: 's1', number: 'A-101', name: 'Planta', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] };
    const plan = dragPlacement(p, sh, { kind: 'plan', levelId: 'lv_0' }, { x: 210, y: 150 })!;
    expect(plan.scale).toBe(100);
    expect(plan.adjusted).toBe(false);
    // parede 4 × 3 m a 1:100 → 40 × 30 mm + 30 mm de folga
    expect(plan.size.w).toBeCloseTo(70, 6);
    expect(plan.size.h).toBeCloseTo(60, 6);
    expect(plan.at.x + plan.size.w / 2).toBeCloseTo(210, 6);
    expect(plan.at.y + plan.size.h / 2).toBeCloseTo(150, 6);
  });

  it('perto da borda, encaixa na área de desenho sem sair da folha', () => {
    const p = casa();
    const sh: Sheet = { id: 's1', number: 'A-101', name: 'Planta', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] };
    const plan = dragPlacement(p, sh, { kind: 'plan', levelId: 'lv_0' }, { x: 0, y: 0 })!;
    expect(plan.at.x).toBe(10);
    expect(plan.at.y).toBe(10);
  });

  it('escala natural que não cabe desce para a maior que cabe', () => {
    const p = casa();
    patchFloorOfTest(p, 'lv_0', { graphics: { ...(viewOfTest(p, floorViewId('lv_0')).graphics ?? {}), scale: 20 } as never });
    const sh: Sheet = { id: 's1', number: 'A-101', name: 'Planta', size: 'A4', orientation: 'portrait', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] };
    const plan = dragPlacement(p, sh, { kind: 'plan', levelId: 'lv_0' }, { x: 105, y: 148 })!;
    expect(plan.adjusted).toBe(true);
    expect(plan.scale).toBeGreaterThan(20);
    expect(plan.size.w).toBeLessThanOrEqual(190 + 1e-6);
    expect(plan.size.h).toBeLessThanOrEqual(277 + 1e-6);
  });

  it('grava a vista com um passo de desfazer e recusa vista de origem inexistente', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    const sh = sheetOf(s.project, id)!;
    const plan = dragPlacement(s.project, sh, { kind: 'plan', levelId: 'lv_0' }, { x: 200, y: 150 })!;
    const vpId = addViewportAtAction(s, id, { kind: 'plan', levelId: 'lv_0' }, plan);
    expect(sheetOf(s.project, id)!.viewports).toHaveLength(1);
    expect(sheetOf(s.project, id)!.viewports[0]!.id).toBe(vpId);
    s.undo();
    expect(sheetOf(s.project, id)!.viewports).toHaveLength(0);
    expect(() => addViewportAtAction(s, id, { kind: 'plan', levelId: 'nope' }, plan)).toThrow(/Nível inexistente/);
  });
});
