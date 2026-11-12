import { describe, expect, it } from 'vitest';
import { areaPlanOf, createEmptyProject, DEFAULT_AREA_GRAPHICS, dimensionPoints, dimensionValue, floorViewId, levelDimensions, makeWall, newId, planAnnotationsOf, ProjectStore, roofViewId, viewAnnotationsOf, type Dimension } from '@hestia/model';
import { registerBuiltinDimProviders } from '../registry.ts';
import { selectionDims } from '../registry.ts';
import { permanentDimProvider, pickRefCommands, vistaDaCota } from './dimension.ts';
import type { DimContext } from '../types.ts';

function cena(): { s: ProjectStore; dimId: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const dimId = newId('dim');
  const dim: Dimension = {
    id: dimId,
    a: { x: 0, y: 0 },
    b: { x: 3, y: 0 },
    offset: 0.5,
    refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } as never,
  };
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: dim });
  return { s, dimId };
}

function ctx(s: ProjectStore): DimContext {
  return { project: s.project, levelId: 'lv_0', settings: { showOnSelection: true } as never, overrides: {} };
}

describe('cota permanente selecionada (provedor dimension)', () => {
  it('selecionar a cota gera a cota dinâmica com o valor medido', () => {
    registerBuiltinDimProviders();
    const { s, dimId } = cena();
    const dims = selectionDims(ctx(s), [dimId]);
    expect(dims).toHaveLength(1);
    expect(dims[0]!.value).toBeCloseTo(3, 6);
    expect(dims[0]!.edit).toBeDefined();
  });

  it('editar o valor pela cota dinâmica move a porta, como a cota dirigida', () => {
    const { s, dimId } = cena();
    const [dim] = selectionDims(ctx(s), [dimId]);
    const r = dim!.edit!(2);
    expect(r).toHaveProperty('commands');
    if (!('commands' in r)) return;
    expect(r.commands).toHaveLength(1); // um único batch, um passo de desfazer
    s.exec(r.commands[0]!);
    expect((s.project.elements.d1 as { offset: number }).offset).toBeCloseTo(2, 6);
    const d = levelDimensions(s.project, 'lv_0').find((x) => x.id === dimId)!;
    expect(dimensionValue(s.project, d)).toBeCloseTo(2, 3);
  });

  it('id que não é cota de nível não gera cota dinâmica', () => {
    const { s } = cena();
    expect(permanentDimProvider.selectionSubject!(s.project, 'nao_existe', 'lv_0')).toBeNull();
    expect(selectionDims(ctx(s), ["nao_existe"])).toEqual([]);
  });

  it('alça de troca: a ponta a (eixo da parede) lista as feições da parede hospedeira e troca para outra', () => {
    const { s, dimId } = cena();
    const [dim] = selectionDims(ctx(s), [dimId]);
    const alt = dim!.ends[0]!.alt;
    expect(alt).toBeDefined();
    expect(alt!.options.length).toBeGreaterThan(2);
    const atual = alt!.options[alt!.current]!;
    expect(atual).toEqual({ elementId: 'h', feature: 'wall-axis-a', index: undefined });
    const next = alt!.options.find((o) => o.feature === 'wall-face-lo' && o.index === 0)!;
    s.exec(alt!.apply(next)[0]!);
    const d = levelDimensions(s.project, 'lv_0').find((x) => x.id === dimId)!;
    expect(d.refs?.a).toMatchObject({ elementId: 'h', feature: 'wall-face-lo', index: 0 });
    // A ponta re-resolve a partir da face escolhida (não há mais ponto guardado a seguir).
    const [depois] = selectionDims(ctx(s), [dimId]);
    expect(depois!.a.y).not.toBeCloseTo(0, 6);
  });

  it('desfazer a troca de referência volta a ponta à feição original', () => {
    const { s, dimId } = cena();
    const [dim] = selectionDims(ctx(s), [dimId]);
    const alt = dim!.ends[0]!.alt!;
    const next = alt.options.find((o) => o.feature === 'wall-face-lo' && o.index === 0)!;
    s.exec(alt.apply(next)[0]!);
    s.undo();
    const d = levelDimensions(s.project, 'lv_0').find((x) => x.id === dimId)!;
    expect(d.refs?.a).toMatchObject({ feature: 'wall-axis-a' });
  });
  it('escolher outro elemento: a ponta passa a ser a feição clicada (outra parede)', () => {
    const { s, dimId } = cena();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'p2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
    const r = pickRefCommands(s.project, 'lv_0', dimId, 'a', { x: 0, y: 3 }, 0.05);
    if ('error' in r) throw new Error(r.error);
    s.exec(r.commands[0]!);
    const d = levelDimensions(s.project, 'lv_0').find((x) => x.id === dimId)!;
    expect(d.refs?.a).toMatchObject({ elementId: 'p2', feature: 'wall-axis-a' });
    expect(dimensionPoints(s.project, d).a.y).toBeCloseTo(3, 6);
  });

  it('escolha recusada: fora de qualquer feição, ou feição já usada pela outra ponta', () => {
    const { s, dimId } = cena();
    expect(pickRefCommands(s.project, 'lv_0', dimId, 'a', { x: 50, y: 50 }, 0.05)).toHaveProperty('error');
    // (3,0) é o centro da porta, que a ponta b já usa.
    expect(pickRefCommands(s.project, 'lv_0', dimId, 'a', { x: 3, y: 0 }, 0.05)).toEqual({ error: 'A outra ponta já usa esta feição.' });
  });
  it('cota de planta de área: selecionada pela vista da área, e a troca grava na própria área', () => {
    registerBuiltinDimProviders();
    const { s } = cena();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'p2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
    const dimArea: Dimension = {
      id: 'dm_area',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      offset: 0.5,
      refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } as never,
    };
    s.exec({
      type: 'addAreaPlan',
      plan: {
        id: 'ap1',
        name: 'Área 1',
        levelId: 'lv_0',
        scale: 50,
        graphics: DEFAULT_AREA_GRAPHICS,
        tags: [],
        annotations: { dimensions: [dimArea], texts: [], detailLines: [], detailRegions: [], tags: [] },
      },
    } as never);
    expect(vistaDaCota(s.project, 'lv_0', 'dm_area')).toEqual({ levelId: 'lv_0', viewId: 'ap1' });
    const dims = selectionDims(ctx(s), ['dm_area']);
    expect(dims).toHaveLength(1);
    expect(dims[0]!.value).toBeCloseTo(3, 6);
    const r = pickRefCommands(s.project, 'lv_0', 'dm_area', 'a', { x: 0, y: 3 }, 0.05);
    if ('error' in r) throw new Error(r.error);
    expect(r.commands[0]).toMatchObject({ type: 'updateDimension', viewId: 'ap1', id: 'dm_area' });
    s.exec(r.commands[0]!);
    const plano = areaPlanOf(s.project, 'ap1')!;
    expect(planAnnotationsOf(plano).dimensions[0]!.refs?.a).toMatchObject({ elementId: 'p2', feature: 'wall-axis-a' });
  });
  it('cota travada: a edição de valor é recusada e não move a porta; destravada volta a mover', () => {
    const { s, dimId } = cena();
    s.exec({ type: 'updateDimension', levelId: 'lv_0', id: dimId, patch: { locked: true } });
    const [dim] = selectionDims(ctx(s), [dimId]);
    const travada = dim!.edit!(2);
    expect(travada).toHaveProperty('error');
    expect((s.project.elements.d1 as { offset: number }).offset).toBeCloseTo(3, 6);
    s.exec({ type: 'updateDimension', levelId: 'lv_0', id: dimId, patch: { locked: false } });
    const [solta] = selectionDims(ctx(s), [dimId]);
    const r = solta!.edit!(2);
    expect(r).toHaveProperty('commands');
    if (!('commands' in r)) return;
    s.exec(r.commands[0]!);
    expect((s.project.elements.d1 as { offset: number }).offset).toBeCloseTo(2, 6);
  });
});

describe('cota permanente da cobertura', () => {
  it('é achada na vista da cobertura (viewId) e a troca de referência grava nela, sem tocar o piso', () => {
    registerBuiltinDimProviders();
    const { s } = cena();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'p2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
    const dimCob: Dimension = {
      id: 'dm_cob',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      offset: 0.5,
      refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } as never,
    };
    s.exec({ type: 'addDimension', levelId: 'lv_0', viewId: roofViewId('lv_0'), dimension: dimCob });
    expect(vistaDaCota(s.project, 'lv_0', 'dm_cob')).toEqual({ levelId: 'lv_0', viewId: roofViewId('lv_0') });
    const dims = selectionDims(ctx(s), ['dm_cob']);
    expect(dims).toHaveLength(1);
    expect(dims[0]!.value).toBeCloseTo(3, 6);
    const r = pickRefCommands(s.project, 'lv_0', 'dm_cob', 'a', { x: 0, y: 3 }, 0.05);
    if ('error' in r) throw new Error(r.error);
    expect(r.commands[0]).toMatchObject({ type: 'updateDimension', viewId: roofViewId('lv_0'), id: 'dm_cob' });
    s.exec(r.commands[0]!);
    expect(viewAnnotationsOf(s.project, roofViewId('lv_0')).dimensions[0]!.refs?.a).toMatchObject({ elementId: 'p2', feature: 'wall-axis-a' });
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).dimensions[0]!.refs?.a).toMatchObject({ elementId: 'h', feature: 'wall-axis-a' });
  });
});
