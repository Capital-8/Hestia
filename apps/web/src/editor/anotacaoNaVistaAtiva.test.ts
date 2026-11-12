import { beforeEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import {
  createEmptyProject,
  floorViewId,
  makeLevel,
  makeRoom,
  makeWall,
  ProjectStore,
  roofViewId,
  viewAnnotationsOf,
  type Command,
  type Dimension,
  type Id,
  type Project,
} from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { deleteSelectionIn } from './deleteIds.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { tagAllNotTagged } from './tagActions.ts';
import { vistaAtivaParaComando } from './vistaDoComando.ts';

const clique = (x: number, y: number): { raw: Vec2; shift: boolean; ctrl: boolean; alt: boolean } => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const cliqueMouse = (x: number, y: number): void => {
  const p = clique(x, y);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

/** Quadrado de paredes no nível 0, um segundo nível e duas plantas de área do nível 0. */
function montar(): { project: Project; ap1: Id; ap2: Id } {
  const s = new ProjectStore(createEmptyProject());
  const pts: Array<[number, number]> = [[0, 0], [0, 5], [4, 5], [4, 0]];
  pts.forEach(([x, y], i) => {
    const [bx, by] = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x, y }, b: { x: bx, y: by }, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) });
  const ap1 = createAreaPlanAction(s, 'lv_0');
  const ap2 = createAreaPlanAction(s, 'lv_0');
  return { project: s.project, ap1, ap2 };
}

const ir = (viewId: Id | null, planKind: 'floor' | 'roof' | 'area', ap: { ap1: Id; ap2: Id; project: Project }): void => {
  editor.load(ap.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: planKind === 'area' ? (viewId as string) : planKind === 'roof' ? 'pvr_lv_0' : 'pv_lv_0', selection: [], hover: null, sectionId: null, options: DEFAULT_OPTIONS });
};

const cota = (id: string, y = -6): Dimension => ({ id, a: { x: 0, y }, b: { x: 4, y }, offset: 1, mode: 'aligned' });
const texto = (id: string) => ({ id, at: { x: 1, y: 1 }, text: id, height: 2.5, rotation: 0 });
const linha = (id: string) => ({ id, a: { x: 0, y: 3 }, b: { x: 4, y: 3 } });
const etiqueta = (id: string) => ({ id, hostId: 'w0', at: { x: 2, y: -1 }, property: 'type' as const, leader: false, orientation: 'horizontal' as const });

/** Cria uma de cada família pelo controlador (o caminho dos comandos das ferramentas), sem informar a vista. */
function criarTudo(sufixo: string): void {
  editor.applyCommand({ type: 'addDimension', levelId: 'lv_0', dimension: cota(`d${sufixo}`) });
  editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: texto(`t${sufixo}`) });
  editor.applyCommand({ type: 'addDetailLine', levelId: 'lv_0', item: linha(`l${sufixo}`) });
  editor.applyCommand({ type: 'addTag', levelId: 'lv_0', item: etiqueta(`g${sufixo}`) });
}

const ids = (viewId: Id): string[] => {
  const a = viewAnnotationsOf(editor.project, viewId);
  return [...a.dimensions, ...a.texts, ...a.detailLines, ...a.tags].map((x) => x.id).sort();
};

beforeEach(() => useUi.setState({ options: DEFAULT_OPTIONS, tool: 'select', status: '', viewTemp: {}, selection: [] }));

describe('controlador injeta a vista ativa no comando de anotação', () => {
  it('cobertura: cota, texto, linha de detalhe e etiqueta ficam em pvr_ e não aparecem no piso nem nas áreas', () => {
    const m = montar();
    ir(null, 'roof', m);
    criarTudo('c');
    expect(ids(roofViewId('lv_0'))).toEqual(['dc', 'gc', 'lc', 'tc']);
    expect(ids(floorViewId('lv_0'))).toEqual([]);
    expect(ids(m.ap1)).toEqual([]);
    expect(ids(m.ap2)).toEqual([]);
  });

  it('piso: continua indo para pv_ e a cobertura fica vazia', () => {
    const m = montar();
    ir(null, 'floor', m);
    criarTudo('p');
    expect(ids(floorViewId('lv_0'))).toEqual(['dp', 'gp', 'lp', 'tp']);
    expect(ids(roofViewId('lv_0'))).toEqual([]);
  });

  it('duas plantas de área do mesmo nível: cada comando vai para a planta aberta', () => {
    const m = montar();
    ir(m.ap1, 'area', m);
    criarTudo('1');
    useUi.setState({ planViewId: m.ap2 });
    criarTudo('2');
    expect(ids(m.ap1)).toEqual(['d1', 'g1', 'l1', 't1']);
    expect(ids(m.ap2)).toEqual(['d2', 'g2', 'l2', 't2']);
    expect(ids(floorViewId('lv_0'))).toEqual([]);
    expect(ids(roofViewId('lv_0'))).toEqual([]);
  });

  it('as ferramentas Cota e Linha de detalhe, pelo ponteiro, também gravam na cobertura', () => {
    const m = montar();
    ir(null, 'roof', m);
    editor.setTool('dimension');
    cliqueMouse(0.5, 2);
    cliqueMouse(3.5, 2);
    cliqueMouse(2, 3);
    editor.setTool('detailLine');
    cliqueMouse(0.5, 4);
    cliqueMouse(3.5, 4);
    expect(viewAnnotationsOf(editor.project, roofViewId('lv_0')).dimensions).toHaveLength(1);
    expect(viewAnnotationsOf(editor.project, roofViewId('lv_0')).detailLines).toHaveLength(1);
    expect(ids(floorViewId('lv_0'))).toEqual([]);
  });

  it('não injeta quando o comando já traz o destino ou o nível não é o da vista ativa', () => {
    const m = montar();
    ir(null, 'roof', m);
    const st = useUi.getState();
    const base: Command = { type: 'addText', levelId: 'lv_0', text: texto('x') };
    expect(vistaAtivaParaComando(editor.project, st, base)).toBe(roofViewId('lv_0'));
    expect(vistaAtivaParaComando(editor.project, st, { ...base, viewId: floorViewId('lv_0') } as Command)).toBeNull();
    expect(vistaAtivaParaComando(editor.project, st, { ...base, planId: m.ap1 } as Command)).toBeNull();
    expect(vistaAtivaParaComando(editor.project, st, { ...base, sectionId: 'sv' } as Command)).toBeNull();
    expect(vistaAtivaParaComando(editor.project, st, { ...base, levelId: 'lv_1' } as Command)).toBeNull();
    expect(vistaAtivaParaComando(editor.project, { ...st, view: '3d' }, base)).toBeNull();
    // Comando que não é de anotação de planta nunca é tocado.
    expect(vistaAtivaParaComando(editor.project, st, { type: 'removeRoomSeparator', levelId: 'lv_0', id: 'x' })).toBeNull();
  });

  it('com o nível diferente da vista ativa o comando segue a forma antiga (piso do nível dele)', () => {
    const m = montar();
    ir(null, 'roof', m);
    editor.applyCommand({ type: 'addText', levelId: 'lv_1', text: texto('outro') });
    expect(ids(floorViewId('lv_1'))).toEqual(['outro']);
    expect(ids(roofViewId('lv_1'))).toEqual([]);
    expect(ids(roofViewId('lv_0'))).toEqual([]);
  });
});

describe('seleção, exclusão e etiquetas na vista ativa', () => {
  it('selecionar e excluir na cobertura não afeta o piso', () => {
    const m = montar();
    ir(null, 'floor', m);
    criarTudo('p');
    useUi.setState({ planViewId: 'pvr_lv_0' });
    criarTudo('c');
    // Clique na cota da cobertura (a do piso está no mesmo lugar, fora do modelo): seleciona a da cobertura.
    editor.setTool('select');
    cliqueMouse(2, -5);
    expect(useUi.getState().selection).toEqual(['dc']);
    // A seleção sobrevive à poda que roda a cada mudança do projeto.
    editor.applyCommand({ type: 'updateText', levelId: 'lv_0', id: 'tc', patch: { text: 'novo' } });
    expect(useUi.getState().selection).toEqual(['dc']);

    useUi.setState({ selection: ['dc', 'tc', 'lc', 'gc'] });
    deleteSelectionIn(editor.store);
    expect(ids(roofViewId('lv_0'))).toEqual([]);
    expect(ids(floorViewId('lv_0'))).toEqual(['dp', 'gp', 'lp', 'tp']);
    expect(useUi.getState().selection).toEqual([]);
    // Desfazer devolve só a cobertura.
    editor.undo();
    expect(ids(roofViewId('lv_0'))).toEqual(['dc', 'gc', 'lc', 'tc']);
    expect(ids(floorViewId('lv_0'))).toEqual(['dp', 'gp', 'lp', 'tp']);
  });

  it('excluir no piso com ids da cobertura selecionados não toca a cobertura', () => {
    const m = montar();
    ir(null, 'roof', m);
    criarTudo('c');
    useUi.setState({ planViewId: 'pv_lv_0', selection: ['dc', 'tc'] });
    deleteSelectionIn(editor.store);
    expect(ids(roofViewId('lv_0'))).toEqual(['dc', 'gc', 'lc', 'tc']);
  });

  it('duas plantas de área: selecionar e excluir numa não afeta a outra', () => {
    const m = montar();
    ir(m.ap1, 'area', m);
    criarTudo('1');
    useUi.setState({ planViewId: m.ap2 });
    criarTudo('2');
    editor.setTool('select');
    cliqueMouse(2, -5);
    expect(useUi.getState().selection).toEqual(['d2']);
    useUi.setState({ selection: ['d2', 't2', 'l2', 'g2'] });
    deleteSelectionIn(editor.store);
    expect(ids(m.ap2)).toEqual([]);
    expect(ids(m.ap1)).toEqual(['d1', 'g1', 'l1', 't1']);
  });

  it('Etiquetar todos grava e lê na vista ativa (cobertura)', () => {
    const m = montar();
    ir(null, 'floor', m);
    editor.applyCommand({ type: 'addTag', levelId: 'lv_0', item: { ...etiqueta('piso'), hostId: 'w0' } });
    useUi.setState({ planViewId: 'pvr_lv_0' });
    // A cobertura não tem etiqueta: etiqueta todas as paredes, inclusive a que já tem no piso.
    const n = tagAllNotTagged();
    const cobertura = viewAnnotationsOf(editor.project, roofViewId('lv_0')).tags;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(cobertura.map((x) => x.hostId)).toContain('w0');
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).tags.map((x) => x.id)).toEqual(['piso']);
    // Repetir não duplica: lê as etiquetas da própria cobertura.
    expect(tagAllNotTagged()).toBe(0);
    expect(viewAnnotationsOf(editor.project, roofViewId('lv_0')).tags).toHaveLength(cobertura.length);
  });

  it('cotas automáticas entram na vista ativa (cobertura) e não no piso', () => {
    const m = montar();
    ir(null, 'roof', m);
    editor.cotasAutomaticasDaPlanta({});
    expect(viewAnnotationsOf(editor.project, roofViewId('lv_0')).dimensions.length).toBeGreaterThan(0);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).dimensions).toHaveLength(0);
  });
});
