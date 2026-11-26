import { beforeEach, describe, expect, it } from 'vitest';
import { trechoDeTubo } from '@hestia/engine';
import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject, familiaDaBiblioteca, isComponent, type Component, type Familia } from '@hestia/model';
import { createTool, opcoesEletroduto, opcoesTubo, type PointerInfo, type Tool, type ToolEnv, type ToolId } from '@hestia/tools';
import { buildContextMenu, type ContextMenuCtx } from '../editor/contextMenu.ts';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { criarTuboAPartirDaqui, podeCriarTuboAqui } from '../editor/tuboAqui.ts';
import { comComponente, ID_TUBO_AQUI } from './componenteMenu.ts';

/*
 * 'Criar tubo a partir daqui' (ficha F5): a entrada do menu de contexto só com UM componente que tem porta de tubulação, e o comando
 * que ativa a ferramenta já com a origem na porta livre ou no meio do tubo clicado.
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';

const ctxCom = (kinds: string[], lang: 'pt' | 'en' = 'pt'): ContextMenuCtx => ({
  view: 'plan', tool: 'select', selectionKinds: kinds, hasSelection: kinds.length > 0, singleType: true, recent: [], last: null, canSelectPrevious: false,
  propsOpen: true, browserOpen: false, lang, reveal: false, singleCategory: null, hasHidden: false, hasClip: false, canCopy: true,
});

const familia = (id: string): Familia => structuredClone(familiaDaBiblioteca(id) as Familia);
const FAMILIAS: Record<string, Familia> = { [ESG]: familia(ESG), [CAIXA]: familia(CAIXA), [FAMILIA_ARMARIO.id]: FAMILIA_ARMARIO };
const base = (id: string, familyId: string, extra: Partial<Component> = {}): Component => ({ id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 1, x: 0, y: 0, z: 0.5, rotation: 0, mirrored: false, mark: '', ...extra });
const menu = (cs: Component[], lang: 'pt' | 'en' = 'pt') => comComponente(buildContextMenu(ctxCom(cs.map(() => 'component'), lang)), ctxCom(cs.map(() => 'component'), lang), lang, cs, FAMILIAS);

/** Editor falso: projeto real, ferramenta real e `setTool` que cria a ferramenta pedida. */
function editorFalso() {
  const store = new ProjectStore(createEmptyProject('t'));
  for (const f of [FAMILIAS[ESG] as Familia, FAMILIAS[CAIXA] as Familia]) store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  const tubo = trechoDeTubo([0, 0, 0.5], [4, 0, 0.5], FAMILIAS[ESG] as Familia, 100, { id: 't1', levelId: 'lv_0' }) as Component;
  store.exec({ type: 'addComponent', component: tubo });
  const env: ToolEnv = {
    project: () => store.project, levelId: () => 'lv_0', selection: () => [], setSelection: () => {}, exec: (c) => store.exec(c), transaction: (l, fn) => store.transaction(l, fn),
    metersPerPixel: () => 0.01, gridStep: () => 0.01, say: () => {}, done: () => {}, options: () => ({ ...DEFAULT_OPTIONS, componentFamilyId: ESG }),
  };
  const estado: { tool: Tool; id: ToolId } = { tool: createTool('select', env), id: 'select' };
  const ed = {
    get project() { return store.project; },
    get activeTool() { return estado.tool; },
    setTool: (id: ToolId) => { estado.id = id; estado.tool = createTool(id, env); estado.tool.start(); },
  };
  return { store, ed, estado };
}

const P = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });

beforeEach(() => {
  opcoesTubo.dn = 50;
  opcoesTubo.z = 0;
  opcoesEletroduto.dn = 25;
});

describe('entrada do menu de contexto', () => {
  it('um tubo de esgoto selecionado ganha "Criar tubo a partir daqui"', () => {
    const itens = menu([base('t1', ESG)]);
    const e = itens.find((x) => x.id === ID_TUBO_AQUI);
    expect(e?.label).toBe('Criar tubo a partir daqui');
  });

  it('uma caixa elétrica ganha a versão de eletroduto, e em inglês o texto muda', () => {
    expect(menu([base('c1', CAIXA)]).find((x) => x.id === ID_TUBO_AQUI)?.label).toBe('Criar eletroduto a partir daqui');
    expect(menu([base('t1', ESG)], 'en').find((x) => x.id === ID_TUBO_AQUI)?.label).toBe('Create Pipe From Here');
  });

  it('peça sem porta de tubulação (armário) e seleção de duas peças não têm a entrada', () => {
    expect(menu([base('a1', FAMILIA_ARMARIO.id)]).some((x) => x.id === ID_TUBO_AQUI)).toBe(false);
    expect(menu([base('t1', ESG), base('t2', ESG)]).some((x) => x.id === ID_TUBO_AQUI)).toBe(false);
  });

  it('podeCriarTuboAqui diz a ferramenta pelo domínio da porta', () => {
    expect(podeCriarTuboAqui(FAMILIAS, base('t1', ESG))).toBe('tubo');
    expect(podeCriarTuboAqui(FAMILIAS, base('c1', CAIXA))).toBe('eletroduto');
    expect(podeCriarTuboAqui(FAMILIAS, base('a1', FAMILIA_ARMARIO.id))).toBeNull();
  });
});

describe('comando "Criar tubo a partir daqui"', () => {
  it('no meio do tubo clicado: ativa o Tubo com o DN do tubo e a cota dele; o próximo clique cria o ramal com tê', () => {
    const { store, ed, estado } = editorFalso();
    expect(criarTuboAPartirDaqui(ed, ['t1'], { x: 2, y: 0.4 })).toBeNull();
    expect(estado.id).toBe('tubo');
    expect(opcoesTubo.dn).toBe(100);
    expect(opcoesTubo.z).toBeCloseTo(0.5, 6);
    estado.tool.move(P(2, 2));
    estado.tool.click(P(2, 2));
    const tes = Object.values(store.project.elements).filter((e) => isComponent(e) && e.familyId === 'fam_krona_esgoto_te');
    expect(tes).toHaveLength(1);
  });

  it('numa caixa elétrica: ativa o Eletroduto na porta livre mais perto do cursor', () => {
    const { store, ed, estado } = editorFalso();
    store.exec({ type: 'addComponent', component: base('cx1', CAIXA, { values: { L: 100, A: 100, P: 50 } }) });
    expect(criarTuboAPartirDaqui(ed, ['cx1'], { x: 5, y: 0 })).toBeNull();
    expect(estado.id).toBe('eletroduto');
  });

  it('sem seleção única devolve o motivo e não troca de ferramenta', () => {
    const { ed, estado } = editorFalso();
    expect(criarTuboAPartirDaqui(ed, [], undefined)).toMatch(/Selecione/);
    expect(estado.id).toBe('select');
  });
});
