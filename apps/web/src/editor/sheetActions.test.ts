import { describe, expect, it } from 'vitest';
import { floorViewId, ProjectStore, cameraDaVista3D, createEmptyProject, makeView3DPoint, makeWall, projectView3DPoints, sheetOf, viewportAnchor, viewportIssue } from '@hestia/model';
import { addSheetAction, changeSheetAction, addViewAction, clampedAt, defaultViewSize, duplicateSheetCommand, fitSizeMm, fitViewportAction, freeSpot, moveViewportAction, moveViewportContentAction, nextSheetNumber, resizeViewportAction, setViewportScaleAction, setViewportView3DPointAction, sheetsPdfOf } from './sheetActions.ts';

const LV0 = 'lv_0';

describe('pranchas: ações', () => {
  it('numera a partir de A-101 e segue o que existe', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(nextSheetNumber(s.project)).toBe('A-101');
    addSheetAction(s);
    expect(nextSheetNumber(s.project)).toBe('A-102');
  });

  it('cria prancha com desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    expect(sheetOf(s.project, id)?.size).toBe('A3');
    s.undo();
    expect(s.project.sheets ?? []).toHaveLength(0);
  });

  it('adiciona vistas em lugares que não se sobrepõem e cabem na folha', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    const a = addViewAction(s, id, { kind: 'plan', viewId: floorViewId(LV0) }, 100);
    const b = addViewAction(s, id, { kind: 'plan', viewId: floorViewId(LV0) }, 50);
    const sh = sheetOf(s.project, id)!;
    const va = sh.viewports.find((v) => v.id === a)!;
    const vb = sh.viewports.find((v) => v.id === b)!;
    expect(viewportIssue(sh, va)).toBeNull();
    expect(viewportIssue(sh, vb)).toBeNull();
    const disjoint = vb.at.x >= va.at.x + va.size.w || va.at.x >= vb.at.x + vb.size.w || vb.at.y >= va.at.y + va.size.h || va.at.y >= vb.at.y + vb.size.h;
    expect(disjoint).toBe(true);
  });

  it('move a vista para fora e ela é limitada à área de desenho', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    const v = addViewAction(s, id, { kind: 'plan', viewId: floorViewId(LV0) }, 50);
    expect(moveViewportAction(s, id, v, { x: 9999, y: -50 })).toBeNull();
    const sh = sheetOf(s.project, id)!;
    const vp = sh.viewports[0]!;
    expect(vp.at.x + vp.size.w).toBeLessThanOrEqual(420 - 10 + 1e-9);
    expect(vp.at.y).toBeGreaterThanOrEqual(10 - 1e-9);
  });

  it('duplica a prancha com ids novos, vistas copiadas e número seguinte', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    addViewAction(s, id, { kind: 'plan', viewId: floorViewId(LV0) }, 100);
    const cmd = duplicateSheetCommand(s.project, id)!;
    s.exec(cmd, 'Duplicar prancha');
    const [orig, copy] = s.project.sheets!;
    expect(copy!.id).not.toBe(orig!.id);
    expect(copy!.number).toBe('A-102');
    expect(copy!.name).toBe('Nova prancha (cópia)');
    expect(copy!.viewports).toHaveLength(1);
    expect(copy!.viewports[0]!.id).not.toBe(orig!.viewports[0]!.id);
    s.undo();
    expect(s.project.sheets).toHaveLength(1);
  });

  it('PDF: nenhuma prancha, nada a exportar; com uma, um PDF', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(sheetsPdfOf(s.project)).toBeNull();
    addSheetAction(s);
    const bytes = sheetsPdfOf(s.project)!;
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('%PDF-1.4');
  });
});

describe('pranchas: funções de posição', () => {
  const sh = { size: 'A3' as const, orientation: 'landscape' as const, margin: 10, viewports: [] };

  it('limita a posição à área de desenho', () => {
    expect(clampedAt(sh, { w: 100, h: 50 }, { x: -20, y: 500 })).toEqual({ x: 10, y: 237 });
  });

  it('o primeiro lugar livre é o canto da área de desenho quando a folha está vazia', () => {
    expect(freeSpot(sh, { w: 100, h: 50 })).toEqual({ x: 10, y: 10 });
  });

  it('a vista nova não cai sobre o carimbo (canto inferior direito)', () => {
    // Vista existente à esquerda, de 10 a 280 mm; o carimbo ocupa x 290–410, y 10–54: a vista nova vai acima dos dois.
    const taken = { id: 'v1', view: { kind: '3d' as const }, at: { x: 10, y: 10 }, size: { w: 270, h: 50 }, scale: 100 };
    expect(freeSpot({ ...sh, viewports: [taken] }, { w: 100, h: 50 })).toEqual({ x: 10, y: 60 });
  });

  it('a vista padrão encolhe para caber numa folha pequena', () => {
    expect(defaultViewSize({ size: 'A4', orientation: 'portrait', margin: 10 }, { kind: 'plan', viewId: floorViewId(LV0) })).toEqual({ w: 180, h: 130 });
    expect(defaultViewSize({ size: 'A4', orientation: 'portrait', margin: 60 }, { kind: 'plan', viewId: floorViewId(LV0) })).toEqual({ w: 90, h: 130 });
  });
});

describe('editor de layout: moldura e escala', () => {
  /** Projeto com paredes de 4 m (x) e 3 m (y) no nível lv_0. */
  const casa = () => {
    const p = createEmptyProject();
    const a = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    const b = makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 0, y: 3 } });
    p.elements[a.id] = { ...a, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.nextOrder = 3;
    return p;
  };

  it('fitSizeMm usa a escala certa: 1:50 vale 20 mm de papel por metro', () => {
    // O levelBox já folga 0,5 m por lado; o conteúdo medido desconta essa folga: 4 m × 3 m + 8 mm de cada lado.
    const size = fitSizeMm(casa(), { kind: 'plan', viewId: floorViewId(LV0) }, 50, 8)!;
    expect(size.w).toBeCloseTo(4 * 20 + 16, 6);
    expect(size.h).toBeCloseTo(3 * 20 + 16, 6);
    const half = fitSizeMm(casa(), { kind: 'plan', viewId: floorViewId(LV0) }, 100, 8)!;
    expect(half.w).toBeCloseTo(4 * 10 + 16, 6);
  });

  it('trocar a escala com moldura automática cresce a caixa e mantém o centro', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    expect(setViewportScaleAction(s, id, 'v1', 50, true)).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.scale).toBe(50);
    expect(v.size.w).toBeCloseTo(4 * 20 + 16, 6);
    expect(v.size.h).toBeCloseTo(3 * 20 + 16, 6);
    expect(v.at.x + v.size.w / 2).toBeCloseTo(90, 6);
    expect(v.at.y + v.size.h / 2).toBeCloseTo(100, 6);
    s.undo();
    expect(sheetOf(s.project, id)!.viewports[0]!.scale).toBe(100);
  });

  it('sem moldura automática a caixa fica e o desenho é recortado (como no Revit)', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    expect(setViewportScaleAction(s, id, 'v1', 25, false)).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.scale).toBe(25);
    expect(v.size).toEqual({ w: 100, h: 80 });
  });

  it('fitViewportAction enquadra o conteúdo na escala atual; vista travada recusa', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 40, y: 60 }, size: { w: 300, h: 200 }, scale: 100 } });
    expect(fitViewportAction(s, id, 'v1')).toBeNull();
    expect(sheetOf(s.project, id)!.viewports[0]!.size.w).toBeCloseTo(4 * 10 + 16, 6);
    s.exec({ type: 'updateViewport', sheetId: id, id: 'v1', patch: { locked: true } });
    expect(fitViewportAction(s, id, 'v1')).toMatch(/travada/);
    expect(setViewportScaleAction(s, id, 'v1', 50)).toMatch(/travada/);
    expect(resizeViewportAction(s, id, 'v1', { x: 10, y: 10, w: 50, h: 50 })).toMatch(/travada/);
    expect(moveViewportAction(s, id, 'v1', { x: 10, y: 10 })).toMatch(/travada/);
  });

  it('mover o conteúdo grava a âncora e não mexe na caixa', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    expect(moveViewportContentAction(s, id, 'v1', { x: 15, y: -7 })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.offset).toBeUndefined();
    expect(v.anchor).toEqual({ x: 105, y: 93 });
    expect(v.at).toEqual({ x: 40, y: 60 });
    expect(moveViewportContentAction(s, id, 'v1', { x: 400, y: 0 })).toBeNull();
    expect(sheetOf(s.project, id)!.viewports[0]!.anchor!.x).toBe(505);
  });
});

describe('trocar a folha reencaixando as vistas', () => {
  it('A3 → A4 encolhe e reposiciona a vista para caber, num único desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 100, y: 200 }, size: { w: 300, h: 80 }, scale: 100 } });
    expect(changeSheetAction(s, id, { size: 'A4' })).toBeNull();
    const sh = sheetOf(s.project, id)!;
    expect(sh.size).toBe('A4');
    const v = sh.viewports[0]!;
    expect(v.size.w).toBeLessThanOrEqual(277 + 1e-6);
    expect(v.at.x).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(v.at.x + v.size.w).toBeLessThanOrEqual(287 + 1e-6);
    expect(v.at.y + v.size.h).toBeLessThanOrEqual(200 + 1e-6);
    s.undo();
    const back = sheetOf(s.project, id)!;
    expect(back.size).toBe('A3');
    expect(back.viewports[0]!.size).toEqual({ w: 300, h: 80 });
    expect(back.viewports[0]!.at).toEqual({ x: 100, y: 200 });
  });

  it('mudar só a margem também mantém as vistas dentro', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 10, y: 10 }, size: { w: 100, h: 60 }, scale: 100 } });
    expect(changeSheetAction(s, id, { margin: 25 })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.at.x).toBeGreaterThanOrEqual(25 - 1e-6);
    expect(v.at.y).toBeGreaterThanOrEqual(25 - 1e-6);
  });
});

describe('âncora: redimensionar não move o desenho', () => {
  const casa = () => {
    const p = createEmptyProject();
    const a = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    const b = makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } });
    p.elements[a.id] = { ...a, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.nextOrder = 3;
    return p;
  };

  it('o primeiro redimensionamento grava a âncora no centro atual do conteúdo', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    const antes = viewportAnchor(sheetOf(s.project, id)!.viewports[0]!);
    expect(resizeViewportAction(s, id, 'v1', { x: 40, y: 60, w: 160, h: 80 })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.size.w).toBe(160);
    expect(v.anchor).toEqual(antes);
    expect(viewportAnchor(v)).toEqual(antes);
  });

  it('redimensionar de novo não desloca a âncora; o desenho fica no mesmo ponto do papel', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    resizeViewportAction(s, id, 'v1', { x: 40, y: 60, w: 160, h: 120 });
    const a1 = viewportAnchor(sheetOf(s.project, id)!.viewports[0]!);
    resizeViewportAction(s, id, 'v1', { x: 20, y: 40, w: 200, h: 140 });
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(viewportAnchor(v)).toEqual(a1);
    expect(v.at).toEqual({ x: 20, y: 40 });
  });

  it('mover a vista desloca a âncora junto (o desenho acompanha a moldura)', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 120, h: 90 }, scale: 100, anchor: { x: 100, y: 105 } } });
    expect(moveViewportAction(s, id, 'v1', { x: 70, y: 90 })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.at).toEqual({ x: 70, y: 90 });
    expect(v.anchor).toEqual({ x: 130, y: 135 });
  });

  it('pan do conteúdo grava a âncora, limpa o offset e não tem limite artificial', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    expect(moveViewportContentAction(s, id, 'v1', { x: 900, y: -700 })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.offset).toBeUndefined();
    expect(v.anchor).toEqual({ x: 90 + 900, y: 100 - 700 });
    expect(v.at).toEqual({ x: 40, y: 60 });
    s.undo();
    expect(sheetOf(s.project, id)!.viewports[0]!.anchor).toBeUndefined();
  });

  it('trocar a escala com moldura automática recentraliza a âncora na moldura nova', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100, anchor: { x: 10, y: 10 } } });
    expect(setViewportScaleAction(s, id, 'v1', 50, true)).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.anchor).toEqual({ x: v.at.x + v.size.w / 2, y: v.at.y + v.size.h / 2 });
  });

  it('trocar a folha mantém a âncora relativa à vista ao reposicionar', () => {
    const s = new ProjectStore(casa());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId('lv_0') }, at: { x: 200, y: 200 }, size: { w: 200, h: 80 }, scale: 100, anchor: { x: 300, y: 240 } } });
    expect(changeSheetAction(s, id, { size: 'A4' })).toBeNull();
    const v = sheetOf(s.project, id)!.viewports[0]!;
    expect(v.at.x).toBeLessThan(200);
    expect(v.anchor!.x - v.at.x).toBeCloseTo(100, 6);
    expect(v.anchor!.y - v.at.y).toBeCloseTo(40, 6);
  });
});

describe('ponto de vista 3D da vista na prancha', () => {
  /** Câmera de teste (metade do `SheetView3DCamera`), completada abaixo. */
  const CAM3D = { azimuth: 0, elevation: 0.6, distance: 12, target: { x: 0, y: 0, z: 0 }, ortho: true };

  /** Prancha com uma vista 3D e dois pontos salvos no catálogo do projeto. */
  const comPontos = () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addView3DPoint', point: makeView3DPoint(CAM3D, 'Fachada norte') });
    s.exec({ type: 'addView3DPoint', point: makeView3DPoint({ ...CAM3D, azimuth: 1.2 }, 'Fachada leste') });
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: '3d' }, at: { x: 40, y: 60 }, size: { w: 180, h: 130 }, scale: 100 } });
    return { s, id, ponto: projectView3DPoints(s.project)[0]! };
  };

  it('grava o ponto escolhido e o desfazer volta ao enquadramento padrão', () => {
    const { s, id, ponto } = comPontos();
    expect(setViewportView3DPointAction(s, id, 'v1', ponto.id)).toBeNull();
    expect(s.undoLabel).toBe('Trocar ponto de vista 3D');
    const view = sheetOf(s.project, id)!.viewports[0]!.view;
    expect(view).toEqual({ kind: '3d', pointId: ponto.id });
    if (view.kind === '3d') expect(cameraDaVista3D(s.project, view)).toEqual(ponto.camera);
    s.undo();
    expect(sheetOf(s.project, id)!.viewports[0]!.view).toEqual({ kind: '3d' });
  });

  it('volta ao enquadramento padrão com null', () => {
    const { s, id, ponto } = comPontos();
    setViewportView3DPointAction(s, id, 'v1', ponto.id);
    expect(setViewportView3DPointAction(s, id, 'v1', null)).toBeNull();
    expect(sheetOf(s.project, id)!.viewports[0]!.view).toEqual({ kind: '3d' });
  });

  it('recusa vista que não é 3D e vista inexistente', () => {
    const s = new ProjectStore(createEmptyProject());
    const id = addSheetAction(s);
    s.exec({ type: 'addViewport', sheetId: id, viewport: { id: 'v1', view: { kind: 'plan', viewId: floorViewId(LV0) }, at: { x: 40, y: 60 }, size: { w: 100, h: 80 }, scale: 100 } });
    expect(setViewportView3DPointAction(s, id, 'v1', null)).toContain('vista 3D');
    expect(setViewportView3DPointAction(s, id, 'nao_existe', null)).toBe('Vista inexistente');
  });
});
