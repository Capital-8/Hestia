import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoof, type Roof, type ValidationIssue } from '@hestia/model';
import { PerimeterTool, addSegs, newDraft, setSegSlope, type NewSeg } from '@hestia/tools';
import { editor } from './controller.ts';
import { issueTarget } from './issuesView.ts';
import { perimeterActions } from './perimeter.ts';
import { pedidoDegrauTelhado, responderDegrauTelhado } from './roofStepPrompt.ts';
import { useUi } from './state.ts';
import { compatibleTypes, instancesOfType, replaceType, whereUsedTarget } from './typeActions.ts';
import { duplicateRoofType, keptRoofType, renameRoofType, roofTypeDeleteBlock, roofTypeError, roofTypeUsage, tryDeleteRoofType } from './roofTypeActions.ts';

const square = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];

function storeWithRoof(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addRoof', roof: makeRoof({ id: 't1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: square }) });
  return store;
}

describe('tipos de telhado: uso, exclusão e substituição (B4)', () => {
  it('telhado conta como instância do tipo e aparece nas substituições compatíveis', () => {
    const store = storeWithRoof();
    expect(instancesOfType(store.project, 'roof', 'rt_ceramica')).toEqual(['t1']);
    expect(roofTypeUsage(store.project, 'rt_ceramica')).toBe(1);
    expect(compatibleTypes(store.project, 'roof', 'rt_ceramica').map((t) => t.id)).toContain('rt_fibro');
  });

  it('exclusão é bloqueada em uso e no último tipo', () => {
    const store = storeWithRoof();
    expect(roofTypeDeleteBlock(store.project, 'rt_ceramica')).toContain('Em uso');
    expect(tryDeleteRoofType(store, 'rt_ceramica').ok).toBe(false);
    expect(roofTypeDeleteBlock(store.project, 'rt_fibro')).toBeNull();
    store.exec({ type: 'deleteRoofType', id: 'rt_fibro' });
    store.exec({ type: 'deleteRoofType', id: 'rt_metalica' });
    expect(roofTypeDeleteBlock(store.project, 'rt_ceramica')).toContain('único');
  });

  it('duplicar cria tipo com id novo e nome "(cópia)"; renomear recusa nome vazio', () => {
    const store = storeWithRoof();
    const id = duplicateRoofType(store, 'rt_ceramica');
    expect(id).not.toBeNull();
    expect(store.project.roofTypes[id!]?.name).toBe('Telha cerâmica sobre madeiramento (cópia)');
    expect(renameRoofType(store, id!, '   ').ok).toBe(false);
    expect(renameRoofType(store, id!, 'Nova').ok).toBe(true);
    expect(store.project.roofTypes[id!]?.name).toBe('Nova');
  });

  it('substituir o tipo troca em todos os telhados com um passo de desfazer', () => {
    const store = storeWithRoof();
    expect(replaceType(store, 'roof', 'rt_ceramica', 'rt_fibro')).toBe(1);
    expect((store.project.elements['t1'] as Roof).typeId).toBe('rt_fibro');
    store.undo();
    expect((store.project.elements['t1'] as Roof).typeId).toBe('rt_ceramica');
  });

  it('validação das camadas é a mesma do piso; tipo ausente nas opções cai no primeiro existente', () => {
    expect(roofTypeError({ name: '', layers: [] })).not.toBeNull();
    expect(roofTypeError({ name: 'Telhado', layers: [{ function: 'finish1', materialId: 'mat_telha_ceramica', thickness: 0.015, wraps: false }] })).toBeNull();
    const p = createEmptyProject();
    expect(keptRoofType(p, 'rt_fibro')).toBe('rt_fibro');
    expect(keptRoofType(p, 'inexistente')).toBe(Object.keys(p.roofTypes)[0]);
  });

  it('"Onde é usado" leva ao nível do telhado e seleciona o telhado', () => {
    const store = storeWithRoof();
    expect(whereUsedTarget(store.project, 'roof', 'rt_ceramica')).toEqual({ levelId: 'lv_0', ids: ['t1'], elsewhere: 0 });
  });
});

describe('avisos: "Ir para" de telhado (G2)', () => {
  it('telhado vira alvo com a caixa do beiral e o nível', () => {
    const store = storeWithRoof();
    const issue: ValidationIssue = { severity: 'warning', code: 'teste', message: 'teste', elementId: 't1' };
    const t = issueTarget(store.project, issue);
    expect(t?.levelId).toBe('lv_0');
    expect(t?.box).toEqual({ minX: 0, minY: 0, maxX: 6, maxY: 4 });
    expect(t?.center).toEqual({ x: 3, y: 2 });
  });
});

const PROJETO_FOOTPRINT = [
  { x: 39.261789, y: -3.683495 },
  { x: 42.032474, y: -3.683495 },
  { x: 42.031474, y: 0.223953 },
  { x: 35.5494415, y: -0.684715 },
  { x: 35.5303785, y: -4.909743000000001 },
  { x: 39.261789, y: -4.910743 },
];
const PROJETO_SLOPES: Array<number | null> = [null, 30, 30, 30, null, 30];

function prepararTelhadoComDegrau(): string {
  editor.load(createEmptyProject(), 'degrau.hestia.json');
  editor.setTool('roof');
  const tool = editor.activeTool;
  if (!(tool instanceof PerimeterTool)) throw new Error('PerimeterTool esperado');
  const segs: NewSeg[] = PROJETO_FOOTPRINT.map((a, i) => ({ a, b: PROJETO_FOOTPRINT[(i + 1) % PROJETO_FOOTPRINT.length]! }));
  let draft = addSegs(newDraft('roof'), segs);
  PROJETO_SLOPES.forEach((sl, i) => {
    draft = setSegSlope(draft, draft.segs[i]!.id, sl === null ? { definesSlope: false } : { definesSlope: true, slopePct: sl });
  });
  tool.loadDraft(draft);
  perimeterActions.finish();
  return useUi.getState().selection[0]!;
}

describe('confirmação de fechamento de degrau no telhado', () => {
  beforeEach(() => {
    responderDegrauTelhado(false);
    useUi.setState({ dialog: null });
  });

  it('aceitar o fechamento grava closeStepGaps: true', async () => {
    const id = prepararTelhadoComDegrau();
    expect(useUi.getState().dialog).toBe('roofStep');
    expect(pedidoDegrauTelhado()).toContain('0,83 m');
    expect(pedidoDegrauTelhado()).toContain('beiral e empena');
    responderDegrauTelhado(true);
    await Promise.resolve();
    expect((editor.project.elements[id] as Roof).closeStepGaps).toBe(true);
  });

  it('recusar o fechamento (deixar aberto) grava closeStepGaps: false e não reabre o diálogo ao editar novamente', async () => {
    const id = prepararTelhadoComDegrau();
    expect(useUi.getState().dialog).toBe('roofStep');
    responderDegrauTelhado(false);
    await Promise.resolve();
    expect((editor.project.elements[id] as Roof).closeStepGaps).toBe(false);

    // Reabrir e concluir sem mudar closeStepGaps não pergunta de novo.
    perimeterActions.edit(id);
    perimeterActions.finish();
    expect(useUi.getState().dialog).toBeNull();
    expect((editor.project.elements[id] as Roof).closeStepGaps).toBe(false);
  });
});
