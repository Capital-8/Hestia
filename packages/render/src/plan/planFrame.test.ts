import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeRoof, makeWall, type Project } from '@hestia/model';
import { buildPlanGeometry, buildPlanOverlay, planGeometrySelection, type PlanInput } from './build.ts';
import { PlanFrame, planFrameUpdateOf, sameLabels, type PlanViewState } from './planFrame.ts';
import { PlanScene } from './gpuPlan.ts';
import { gridCovers, gridLayer } from './grid.ts';
import { LIGHT } from './types.ts';
import type { LabelOp, PlanOps, StrokeOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

const V: Viewport = { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 };

/** Sem GPU: a cena recebe as camadas e não faz nada com elas (o quadro só guarda o que desenharia). */
const NULL_SINK = { setSlot: (): void => {}, setBackground: (): void => {} };

/** Funções de geometria e sobreposição que contam quantas vezes foram refeitas. */
function ops(count: { g: number; o: number }) {
  const stroke = (x: number): StrokeOp => ({ pts: [{ x, y: 0 }, { x, y: 5 }], closed: false, widthPx: 2, color: '#000', alpha: 1 });
  const geometry = (): PlanOps => {
    count.g++;
    return { fills: [{ polygons: [[[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]]], color: '#abc', alpha: 1 }], strokes: [stroke(1)], labels: [] };
  };
  const overlay = (): PlanOps => {
    count.o++;
    return { fills: [], strokes: [stroke(2)], labels: [] };
  };
  return { geometry, overlay };
}

/** Malhas de cada camada da cena, na ordem (grade, base, seleção, hover, viva, provisória e os traços). */
const slotMeshes = (scene: PlanScene): unknown[][] => scene.scene.children.map((g) => [...g.children]);
/** Mesmas malhas, na mesma ordem (identidade, não igualdade estrutural). */
const sameMeshes = (a: unknown[], b: unknown[]): boolean => a.length === b.length && a.every((m, i) => m === b[i]);
/** Versão do buffer de posições de cada malha, por camada: só sobe quando a camada é reescrita (as malhas são reaproveitadas). */
const versoesDasPosicoes = (scene: PlanScene): number[][] =>
  scene.scene.children.map((g) => g.children.map((m) => ((m as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute).version));

describe('quadro da planta (PlanFrame)', () => {
  it('pan dentro da área coberta não refaz a geometria nem a sobreposição (as malhas ficam as mesmas)', () => {
    const scene = new PlanScene();
    const frame = new PlanFrame(scene);
    const count = { g: 0, o: 0 };
    const { geometry, overlay } = ops(count);
    const upd = (v: Viewport): void => frame.update({ v, theme: LIGHT, gpu: true, showGrid: true, geometryKey: 'g1', overlayKey: 'o1', geometry, overlay });
    upd(V);
    const before = slotMeshes(scene);
    upd({ ...V, cx: 0.2 });
    upd({ ...V, cx: -0.3, cy: 0.1 });
    expect(count).toEqual({ g: 1, o: 1 });
    const after = slotMeshes(scene);
    // Geometria (fillsBase, strokesBase) e seleção (fillsSel, strokesSel): mesmas malhas. A grade pode ser refeita.
    for (const i of [1, 2, 6, 7]) expect(sameMeshes(after[i]!, before[i]!)).toBe(true);
    scene.dispose();
  });

  it('mudança só da sobreposição refaz só a sobreposição', () => {
    const scene = new PlanScene();
    const frame = new PlanFrame(scene);
    const count = { g: 0, o: 0 };
    const { geometry, overlay } = ops(count);
    frame.update({ v: V, theme: LIGHT, gpu: true, showGrid: false, geometryKey: 'g1', overlayKey: 'o1', geometry, overlay });
    const before = slotMeshes(scene);
    const versoesAntes = versoesDasPosicoes(scene);
    frame.update({ v: V, theme: LIGHT, gpu: true, showGrid: false, geometryKey: 'g1', overlayKey: 'o2', geometry, overlay });
    expect(count).toEqual({ g: 1, o: 2 });
    const after = slotMeshes(scene);
    expect(sameMeshes(after[1]!, before[1]!)).toBe(true);
    expect(sameMeshes(after[6]!, before[6]!)).toBe(true);
    // A seleção é reescrita no mesmo buffer (malha reaproveitada); as outras camadas não são reescritas.
    expect(sameMeshes(after[7]!, before[7]!)).toBe(true);
    const versoesDepois = versoesDasPosicoes(scene);
    expect(versoesDepois[1]).toEqual(versoesAntes[1]);
    expect(versoesDepois[6]).toEqual(versoesAntes[6]);
    expect(versoesDepois[7]![0]).not.toBe(versoesAntes[7]![0]);
    scene.dispose();
  });

  it('mudança só do hover refaz só a camada de hover; a da camada viva, só a viva', () => {
    const scene = new PlanScene();
    const frame = new PlanFrame(scene);
    const count = { g: 0, o: 0, h: 0, l: 0 };
    const { geometry, overlay } = ops(count);
    const stroke = (x: number): StrokeOp => ({ pts: [{ x, y: 0 }, { x, y: 5 }], closed: false, widthPx: 2, color: '#000', alpha: 1 });
    const hover = (): PlanOps => {
      count.h++;
      return { fills: [], strokes: [stroke(3)], labels: [] };
    };
    const live = (): PlanOps => {
      count.l++;
      return { fills: [], strokes: [stroke(4)], labels: [] };
    };
    const upd = (overlayKey: string, hoverKey: string, liveKey: string): void =>
      frame.update({ v: V, theme: LIGHT, gpu: true, showGrid: false, geometryKey: 'g', overlayKey, hoverKey, liveKey, geometry, overlay, hover, live });
    upd('o', 'h1', 'l1');
    const antes = versoesDasPosicoes(scene);
    upd('o', 'h2', 'l1');
    expect(count).toEqual({ g: 1, o: 1, h: 2, l: 1 });
    const depoisHover = versoesDasPosicoes(scene);
    // Seleção (fillsSel, strokesSel) e camada viva ficam como estavam; só o traço do hover é reescrito.
    expect(depoisHover[2]).toEqual(antes[2]);
    expect(depoisHover[7]).toEqual(antes[7]);
    expect(depoisHover[9]).toEqual(antes[9]);
    expect(depoisHover[8]![0]).not.toBe(antes[8]![0]);
    upd('o', 'h2', 'l2');
    expect(count).toEqual({ g: 1, o: 1, h: 2, l: 2 });
    const depoisViva = versoesDasPosicoes(scene);
    expect(depoisViva[8]).toEqual(depoisHover[8]);
    expect(depoisViva[9]![0]).not.toBe(depoisHover[9]![0]);
    scene.dispose();
  });

  it('mudança da chave da geometria (nível, por exemplo) refaz a geometria', () => {
    const frame = new PlanFrame(NULL_SINK);
    const count = { g: 0, o: 0 };
    const { geometry, overlay } = ops(count);
    frame.update({ v: V, theme: LIGHT, gpu: false, showGrid: false, geometryKey: 'g1', overlayKey: 'o1', geometry, overlay });
    frame.update({ v: { ...V, zoom: 80 }, theme: LIGHT, gpu: false, showGrid: false, geometryKey: 'g2', overlayKey: 'o1', geometry, overlay });
    expect(count.g).toBe(2);
  });

  it('rótulos: a referência só muda quando o conteúdo muda', () => {
    const frame = new PlanFrame(NULL_SINK);
    const count = { g: 0, o: 0 };
    const geo = ops(count).geometry;
    const label = (text: string): LabelOp => ({ at: { x: 1, y: 1 }, text, dy: -12, tone: 'info' });
    let ov: LabelOp[] = [label('2,00 m')];
    const run = (key: string): void => frame.update({ v: V, theme: LIGHT, gpu: false, showGrid: false, geometryKey: 'g', overlayKey: key, geometry: geo, overlay: () => ({ fills: [], strokes: [], labels: ov }) });
    run('a');
    const first = frame.labels;
    ov = [label('2,00 m')];
    run('b');
    expect(frame.labels).toBe(first);
    ov = [label('3,00 m')];
    run('c');
    expect(frame.labels).not.toBe(first);
    expect(frame.labels[0]?.text).toBe('3,00 m');
  });

  it('sem grade, a camada da grade fica vazia; com grade, ela segue a vista', () => {
    const scene = new PlanScene();
    const frame = new PlanFrame(scene);
    const count = { g: 0, o: 0 };
    const { geometry, overlay } = ops(count);
    frame.update({ v: V, theme: LIGHT, gpu: true, showGrid: true, geometryKey: 'g', overlayKey: 'o', geometry, overlay });
    expect(scene.scene.children[0]!.children.length).toBeGreaterThan(0);
    frame.update({ v: V, theme: LIGHT, gpu: true, showGrid: false, geometryKey: 'g', overlayKey: 'o', geometry, overlay });
    expect(scene.scene.children[0]!.children.length).toBe(0);
    scene.dispose();
  });

  it('drawList junta as camadas na ordem de desenho: preenchimentos, depois traços da geometria e da sobreposição', () => {
    const frame = new PlanFrame(NULL_SINK);
    const count = { g: 0, o: 0 };
    const { geometry, overlay } = ops(count);
    frame.update({ v: V, theme: LIGHT, gpu: false, showGrid: false, geometryKey: 'g', overlayKey: 'o', geometry, overlay });
    const dl = frame.drawList(LIGHT);
    expect(dl.fills).toHaveLength(1);
    expect(dl.strokes.map((s) => s.pts[0]!.x)).toEqual([1, 2]);
  });
});

describe('rótulos iguais (sameLabels)', () => {
  it('compara texto, posição e estilo, na mesma ordem', () => {
    const a: LabelOp[] = [{ at: { x: 1, y: 2 }, text: 'A', tone: 'soft' }];
    expect(sameLabels(a, [{ at: { x: 1, y: 2 }, text: 'A', tone: 'soft' }])).toBe(true);
    expect(sameLabels(a, [{ at: { x: 1, y: 2 }, text: 'B', tone: 'soft' }])).toBe(false);
    expect(sameLabels(a, [{ at: { x: 1, y: 3 }, text: 'A', tone: 'soft' }])).toBe(false);
    expect(sameLabels(a, [])).toBe(false);
    expect(sameLabels([], [])).toBe(true);
  });
});

describe('grade com área coberta (gridLayer)', () => {
  it('cobre a vista; uma vista deslocada para fora da área pede nova grade', () => {
    const layer = gridLayer(V, LIGHT);
    expect(layer.strokes.length).toBeGreaterThan(0);
    expect(gridCovers(layer, V)).toBe(true);
    expect(gridCovers(layer, { ...V, cx: V.cx + 3 * V.width / V.zoom })).toBe(false);
  });
});

describe('geometria e sobreposição separadas (build)', () => {
  function proj(): Project {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 0, y: 2 }, b: { x: 4, y: 2 }, style: 'dashed' } });
    s.exec({ type: 'addDetailRegion', levelId: 'lv_0', item: { id: 'dr1', boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] } });
    return s.project;
  }
  const input = (p: Project, selection: string[], hover: string | null = null): PlanInput => ({
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: V,
    theme: LIGHT,
    dark: false,
    selection,
    hover,
    preview: [],
    inference: null,
    showGrid: false,
  });

  it('a seleção entra na geometria pelas cotas e pelas linhas de detalhe do nível (achado A2)', () => {
    const p = proj();
    expect(planGeometrySelection(p, 'lv_0', ['w1', 'd1', 'x'])).toEqual(['d1']);
    expect(planGeometrySelection(p, 'lv_0', ['w1'])).toEqual([]);
    expect(planGeometrySelection(p, 'lv_0', ['dl1', 'w1'])).toEqual(['dl1']);
    expect(planGeometrySelection(p, 'lv_0', ['dr1', 'w1'])).toEqual(['dr1']);
    const semSel = buildPlanGeometry(input(p, []));
    expect(buildPlanGeometry(input(p, ['w1'])).strokes).toEqual(semSel.strokes);
    expect(buildPlanGeometry(input(p, ['d1'])).strokes).not.toEqual(semSel.strokes);
    const linhaSel = buildPlanGeometry(input(p, ['dl1'])).strokes.find((s) => s.pts[0]!.y === 2)!;
    const linhaSem = semSel.strokes.find((s) => s.pts[0]!.y === 2)!;
    expect(linhaSel.color).not.toBe(linhaSem.color);
    expect(linhaSel.widthPx).toBeGreaterThan(linhaSem.widthPx);
    const regiaoSel = buildPlanGeometry(input(p, ['dr1'])).strokes.find((s) => s.pts.length === 4 && s.pts[0]!.x === 0 && s.pts[0]!.y === 0)!;
    const regiaoSem = semSel.strokes.find((s) => s.pts.length === 4 && s.pts[0]!.x === 0 && s.pts[0]!.y === 0)!;
    expect(regiaoSel.color).not.toBe(regiaoSem.color);
  });

  it('a sobreposição depende da seleção e do cursor, e a geometria não', () => {
    const p = proj();
    const base = buildPlanOverlay(input(p, []));
    const sel = buildPlanOverlay(input(p, ['w1']));
    expect(sel.fills.length).toBeGreaterThan(base.fills.length);
    expect(buildPlanOverlay(input(p, [], 'w1')).fills.length).toBeGreaterThan(0);
    expect(base.fills).toHaveLength(0);
  });

  it('a parede selecionada não ganha rótulo com o próprio comprimento (a cota é até a vizinha)', () => {
    const p = proj();
    expect(buildPlanOverlay(input(p, ['w1'])).labels).toEqual([]);
    expect(buildPlanOverlay(input(p, ['w1'], 'w1')).labels).toEqual([]);
  });
});

describe('estado da planta para o quadro (planFrameUpdateOf)', () => {
  const p = (() => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    return s.project;
  })();
  const state = (over: Partial<PlanViewState> = {}): PlanViewState => ({
    project: p,
    version: 1,
    levelId: 'lv_0',
    v: V,
    theme: LIGHT,
    dark: false,
    gpu: true,
    showGrid: false,
    showUnderlay: false,
    showRoofProjection: true,
    thinLines: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    resolve: () => resolveLevel(p, 'lv_0', new Map()),
    ...over,
  });

  it('a geometria só muda pelo que ela lê (versão, cotas e linhas de detalhe selecionadas); zoom, seleção de parede e cursor não', () => {
    const base = planFrameUpdateOf(state());
    expect(planFrameUpdateOf(state({ selection: ['w1'] })).geometryKey).toBe(base.geometryKey);
    expect(planFrameUpdateOf(state({ hover: 'w1' })).geometryKey).toBe(base.geometryKey);
    expect(planFrameUpdateOf(state({ selection: ['d1'] })).geometryKey).not.toBe(base.geometryKey);
    expect(planFrameUpdateOf(state({ v: { ...V, zoom: 80 } })).geometryKey).toBe(base.geometryKey);
    expect(planFrameUpdateOf(state({ version: 2 })).geometryKey).not.toBe(base.geometryKey);
  });

  it('abrir a planta não resolve o nível atual (a geometria vem da vista); só o nível de baixo é resolvido', () => {
    const chamadas: string[] = [];
    const resolve = (id: string) => {
      chamadas.push(id);
      return resolveLevel(p, id, new Map());
    };
    planFrameUpdateOf(state({ levelId: 'lv_1', showUnderlay: true, resolve })).geometry();
    expect(chamadas).toEqual(['lv_0']);
    chamadas.length = 0;
    planFrameUpdateOf(state({ levelId: 'lv_0', showUnderlay: true, resolve })).geometry();
    expect(chamadas).toEqual([]);
  });

  it('a seleção, o hover e a camada viva têm chaves próprias; nenhuma delas depende do pan ou do zoom', () => {
    const base = planFrameUpdateOf(state());
    expect(planFrameUpdateOf(state({ selection: ['w1'] })).overlayKey).not.toBe(base.overlayKey);
    expect(planFrameUpdateOf(state({ hover: 'w1' })).overlayKey).toBe(base.overlayKey);
    expect(planFrameUpdateOf(state({ hover: 'w1' })).hoverKey).not.toBe(base.hoverKey);
    const previa = planFrameUpdateOf(state({ preview: [{ kind: 'point', at: { x: 0, y: 0 } }] }));
    expect(previa.liveKey).not.toBe(base.liveKey);
    expect(previa.hoverKey).toBe(base.hoverKey);
    for (const v of [{ ...V, cx: 9 }, { ...V, zoom: 220 }]) {
      const u = planFrameUpdateOf(state({ v }));
      expect(u.overlayKey).toBe(base.overlayKey);
      expect(u.hoverKey).toBe(base.hoverKey);
      expect(u.liveKey).toBe(base.liveKey);
    }
  });

  it('planta de cobertura tem chaves próprias: a geometria de piso do mesmo nível não é reaproveitada', () => {
    const piso = planFrameUpdateOf(state());
    const cob = planFrameUpdateOf(state({ roofPlanMode: true }));
    expect(cob.geometryKey).not.toBe(piso.geometryKey);
    expect(cob.overlayKey).not.toBe(piso.overlayKey);
    expect(cob.hoverKey).not.toBe(piso.hoverKey);
    expect(planFrameUpdateOf(state({ roofPlanMode: false })).geometryKey).toBe(piso.geometryKey);
  });

  it('planta de cobertura resolve o nível atual; a de piso não o resolve (só o de baixo, se houver)', () => {
    const chamadas: string[] = [];
    const resolve = (id: string) => {
      chamadas.push(id);
      return resolveLevel(p, id, new Map());
    };
    planFrameUpdateOf(state({ roofPlanMode: true, resolve })).geometry();
    expect(chamadas).toContain('lv_0');
  });

  it('cobertura: o nível atual é resolvido uma vez por atualização, mesmo com as quatro camadas', () => {
    const chamadas: string[] = [];
    const resolve = (id: string) => {
      chamadas.push(id);
      return resolveLevel(p, id, new Map());
    };
    const u = planFrameUpdateOf(state({ roofPlanMode: true, resolve }));
    u.geometry();
    u.overlay();
    u.hover!();
    u.live!();
    expect(chamadas).toEqual(['lv_0']);
  });

  it('alternar piso e cobertura do mesmo nível não deixa resíduo: voltar ao piso reproduz o desenho de piso', () => {
    const quadro = new PlanFrame(NULL_SINK);
    const atualiza = (over: Partial<PlanViewState>): void => quadro.update({ ...planFrameUpdateOf(state(over)), gpu: false });
    atualiza({});
    const piso = JSON.stringify(quadro.drawList(LIGHT));
    atualiza({ roofPlanMode: true });
    expect(JSON.stringify(quadro.drawList(LIGHT))).not.toBe(piso);
    atualiza({});
    expect(JSON.stringify(quadro.drawList(LIGHT))).toBe(piso);
  });

  it('cobertura: o telhado do nível abaixo entra na planta, só com a referência de baixo ligada', () => {
    const comTelhadoBaixo = (): Project => {
      const s = new ProjectStore(createEmptyProject());
      s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r0', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: -0.3, y: -0.3 }, { x: 8.3, y: -0.3 }, { x: 8.3, y: 6.3 }, { x: -0.3, y: 6.3 }], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 } }) });
      return s.project;
    };
    const semTelhadoBaixo = createEmptyProject();
    const fills = (proj: Project, showUnderlay: boolean): number =>
      planFrameUpdateOf(state({ project: proj, levelId: 'lv_1', roofPlanMode: true, showUnderlay, resolve: (id) => resolveLevel(proj, id, new Map()) })).geometry().fills.length;
    expect(fills(comTelhadoBaixo(), true)).toBeGreaterThan(fills(semTelhadoBaixo, true));
    expect(fills(comTelhadoBaixo(), false)).toBe(fills(semTelhadoBaixo, false));
  });

  it('cobertura: o telhado de um nível mais abaixo (não o de referência) também entra', () => {
    const tres = (com: boolean): Project => {
      const s = new ProjectStore(createEmptyProject());
      s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Cobertura', elevation: 6 }) });
      if (com) s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r0', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: -0.3, y: -0.3 }, { x: 8.3, y: -0.3 }, { x: 8.3, y: 6.3 }, { x: -0.3, y: 6.3 }], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 } }) });
      return s.project;
    };
    const fills = (proj: Project): number =>
      planFrameUpdateOf(state({ project: proj, levelId: 'lv_2', roofPlanMode: true, showUnderlay: true, resolve: (id) => resolveLevel(proj, id, new Map()) })).geometry().fills.length;
    expect(fills(tres(true))).toBeGreaterThan(fills(tres(false)));
  });
});
