import { describe, expect, it } from 'vitest';
import { createEmptyProject, floorViewId, planViewOf, ProjectStore, roofViewId, type Command, type Project } from '@hestia/model';
import { comandoMostrarCategorias, hiddenCreationWarning, categoriasPorExtenso } from './profileWarning.ts';

const wall = { type: 'addWall', wall: { id: 'w1', kind: 'wall', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, typeId: 'wt_alv14', locationLine: 'wallCenter', height: 2.8, baseOffset: 0 } } as never;

/** Projeto com uma planta de área (gráficos parciais sobre o padrão da área) e a parede criada depois do `before`. */
function criar(graphics: Record<string, unknown>, depois: Command = wall): { before: Project; after: Project } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addPlanView', view: { id: 'ap1', kind: 'area', levelId: 'lv_0', name: 'A', area: { graphics: graphics as never } } });
  const before = s.project;
  s.exec(depois);
  return { before, after: s.project };
}

describe('aviso R1 por vista (criar em camada ou categoria oculta)', () => {
  it('área: avisa ao criar parede com paredes ocultas pelo perfil', () => {
    const { before, after } = criar({ showWalls: 'hidden' });
    expect(hiddenCreationWarning(before, after, 'ap1')).toEqual(['wall']);
  });

  it('área: não avisa com a parede visível', () => {
    const { before, after } = criar({ showWalls: 'normal' });
    expect(hiddenCreationWarning(before, after, 'ap1')).toBeNull();
  });

  it('piso e cobertura: categoria oculta (hidden.categories) avisa; as outras vistas do nível não', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { hidden: { categories: ['wall'] } } });
    s.exec({ type: 'updatePlanView', viewId: roofViewId('lv_0'), patch: { hidden: { categories: ['wall'] } } });
    s.exec({ type: 'addPlanView', view: { id: 'pv2', kind: 'floor', levelId: 'lv_0', name: 'Outra' } });
    const before = s.project;
    s.exec(wall);
    expect(hiddenCreationWarning(before, s.project, floorViewId('lv_0'))).toEqual(['wall']);
    expect(hiddenCreationWarning(before, s.project, roofViewId('lv_0'))).toEqual(['wall']);
    expect(hiddenCreationWarning(before, s.project, 'pv2')).toBeNull();
  });

  it('categoria sem visibilidade nos gráficos da vista avisa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { graphics: { overrides: { wall: { visible: false } } } } });
    const before = s.project;
    s.exec(wall);
    expect(hiddenCreationWarning(before, s.project, floorViewId('lv_0'))).toEqual(['wall']);
  });

  it('o que não foi criado agora não conta (parede que já existia oculta)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(wall);
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { hidden: { categories: ['wall'] } } });
    const before = s.project;
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { name: 'Novo nome' } });
    expect(hiddenCreationWarning(before, s.project, floorViewId('lv_0'))).toBeNull();
  });

  it('elemento criado em outro nível não avisa (não aparece nesta vista de qualquer jeito)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { hidden: { categories: ['wall'] } } });
    const before = s.project;
    const outro = s.project.levels.find((l) => l.id !== 'lv_0');
    if (!outro) return;
    s.exec({ type: 'addWall', wall: { ...(wall as { wall: Record<string, unknown> }).wall, id: 'w2', levelId: outro.id } } as never);
    expect(hiddenCreationWarning(before, s.project, floorViewId('lv_0'))).toBeNull();
  });

  it('anotação criada com a camada de cotas desligada na área avisa (categoria annotation)', () => {
    const { before, after } = criar({ showDimensions: false }, { type: 'addDimension', viewId: 'ap1', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, offset: 0.5 } } as never);
    expect(hiddenCreationWarning(before, after, 'ap1')).toEqual(['annotation']);
  });

  it('vista que não existe ou projeto igual: nada', () => {
    const { before, after } = criar({ showWalls: 'hidden' });
    expect(hiddenCreationWarning(before, after, 'nao-existe')).toBeNull();
    expect(hiddenCreationWarning(after, after, 'ap1')).toBeNull();
  });
});

describe('comando "Mostrar categoria nesta vista"', () => {
  it('só mexe na vista pedida: tira a categoria de hidden.categories e liga a visibilidade nos gráficos dela', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updatePlanView', viewId: floorViewId('lv_0'), patch: { hidden: { categories: ['wall', 'door'] }, graphics: { overrides: { wall: { visible: false } } } } });
    const c = comandoMostrarCategorias(s.project, floorViewId('lv_0'), ['wall'])!;
    expect(c).toMatchObject({ type: 'updatePlanView', viewId: floorViewId('lv_0') });
    s.exec(c);
    const v = planViewOf(s.project, floorViewId('lv_0'))!;
    expect(v.hidden?.categories).toEqual(['door']);
    expect(v.graphics?.overrides.wall.visible).toBe(true);
  });

  it('planta de área: liga a camada do perfil que escondia a categoria', () => {
    const { after } = criar({ showWalls: 'hidden', showOpenings: false, showFloors: false });
    const s = new ProjectStore(after);
    s.exec(comandoMostrarCategorias(after, 'ap1', ['wall', 'door', 'floor'])!);
    expect(planViewOf(s.project, 'ap1')!.area!.graphics).toMatchObject({ showWalls: 'normal', showOpenings: true, showFloors: true });
  });

  it('sem nada a mudar no projeto (só temporário da sessão): null', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(comandoMostrarCategorias(s.project, floorViewId('lv_0'), ['wall'])).toBeNull();
  });
});

describe('texto das categorias', () => {
  it('uma, duas e três categorias', () => {
    expect(categoriasPorExtenso('pt', ['wall'])).toBe('parede');
    expect(categoriasPorExtenso('pt', ['wall', 'door'])).toMatch(/ e /);
    expect(categoriasPorExtenso('en', ['wall', 'door', 'floor']).split(',')).toHaveLength(2);
  });
});
