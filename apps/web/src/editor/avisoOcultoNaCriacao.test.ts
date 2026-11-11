import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TOOL_GROUPS, type PerimeterTool, type ToolId } from '@hestia/tools';
import {
  createEmptyProject,
  floorViewId,
  planViewHiddenOf,
  planViewOf,
  ProjectStore,
  roofViewId,
  viewGraphicsOf,
  type GraphicsCategory,
  type Id,
  type Project,
} from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { desfazerCriacaoDoAviso, mostrarCategoriaDoAviso } from './avisoOcultoActions.ts';
import { editor } from './controller.ts';
import { I18N } from './i18n.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

const info = (x: number, y: number) => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const clicar = (x: number, y: number): void => {
  const p = info(x, y);
  editor.pointer('move', p);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

type Vista = { id: Id; kind: 'floor' | 'roof' | 'area' };

/** Projeto vazio com a planta de área e uma segunda planta de piso (do mesmo nível), para provar a independência. */
function montar(): { project: Project; area: Id; outraPiso: Id } {
  const s = new ProjectStore(createEmptyProject());
  const area = createAreaPlanAction(s, 'lv_0');
  s.exec({ type: 'addPlanView', view: { id: 'pv_outra', kind: 'floor', levelId: 'lv_0', name: 'Piso 2' } });
  return { project: s.project, area, outraPiso: 'pv_outra' };
}

function abrir(v: Vista, esconder?: GraphicsCategory[]): { area: Id; outraPiso: Id } {
  const m = montar();
  editor.load(m.project, 'teste.hestia.json');
  if (esconder) {
    // Mesma categoria oculta nas duas vistas de piso e na cobertura; a de área recebe o mesmo pelo perfil/categoria.
    for (const id of [floorViewId('lv_0'), roofViewId('lv_0'), m.outraPiso, m.area]) {
      editor.store.exec({ type: 'updatePlanView', viewId: id, patch: { hidden: { categories: esconder } } });
    }
  }
  const planKind = v.kind;
  const planViewId = v.kind === 'area' ? m.area : v.id;
  useUi.setState({ view: 'plan', levelId: 'lv_0', planKind, planViewId, selection: [], hover: null, options: DEFAULT_OPTIONS, viewTemp: {}, avisoOculto: null, tool: 'select' });
  editor.setTool('select');
  return m;
}

const PISO: Vista = { id: floorViewId('lv_0'), kind: 'floor' };
const COBERTURA: Vista = { id: roofViewId('lv_0'), kind: 'roof' };
const AREA: Vista = { id: 'resolvido-em-abrir', kind: 'area' };
const VISTAS: Array<[string, Vista]> = [['piso', PISO], ['cobertura', COBERTURA], ['área', AREA]];

/** Desenha uma parede com a ferramenta Parede (dois cliques; Esc encerra o encadeamento). */
function desenharParede(a: [number, number], b: [number, number]): void {
  editor.setTool('wall');
  clicar(...a);
  clicar(...b);
  editor.setTool('select');
}

/** Piso pelo modo de perímetro (forma Retângulo, dois cliques e Concluir): grava dentro de `env.transaction`. */
function desenharPiso(): void {
  editor.setTool('floor');
  expect(editor.perimetro.ativo).toBe(true);
  (editor.activeTool as PerimeterTool).setShape('rectangle');
  clicar(0, 0);
  clicar(4, 3);
  editor.perimetro.finish();
}

const viewIdAtivo = (): Id => useUi.getState().planViewId;

beforeEach(() => useUi.setState({ options: DEFAULT_OPTIONS, tool: 'select', status: '', viewTemp: {}, selection: [], avisoOculto: null }));
afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, viewTemp: {}, selection: [], avisoOculto: null }));

describe('planta de área aceita todas as ferramentas', () => {
  it('toda ferramenta da faixa se comporta na área como no piso (setTool não recusa nem avisa de bloqueio)', () => {
    const ids: ToolId[] = [...new Set<ToolId>(TOOL_GROUPS.flatMap((g) => g.tools))];
    expect(ids).toContain('wall');
    const resultado = (v: Vista): Record<string, { tool: ToolId; perimetro: boolean; bloqueada: boolean }> => {
      abrir(v);
      const r: Record<string, { tool: ToolId; perimetro: boolean; bloqueada: boolean }> = {};
      for (const id of ids) {
        editor.setTool('select');
        editor.setTool(id);
        const st = useUi.getState();
        r[id] = { tool: st.tool, perimetro: editor.perimetro.ativo, bloqueada: JSON.stringify(st.status) === JSON.stringify({ key: 'eds_msg_tool_not_in_view' }) };
        if (editor.perimetro.ativo) editor.perimetro.cancel();
      }
      return r;
    };
    const piso = resultado(PISO);
    const area = resultado(AREA);
    expect(area).toEqual(piso);
    for (const id of ids) expect(area[id]!.bloqueada, id).toBe(false);
    // As de construção ficam ativas na área (as de perímetro abrem o modo).
    for (const id of ['wall', 'door', 'window', 'stair', 'ramp', 'room'] as const) expect(area[id]!.tool, id).toBe(id);
    for (const id of ['floor', 'slab', 'ceiling', 'roof'] as const) expect(area[id]!.perimetro, id).toBe(true);
  });

  it('Parede desenhada na planta de área cria a parede no nível (e a vista de área passa a poder mostrá-la)', () => {
    const { area } = abrir(AREA);
    expect(useUi.getState().planViewId).toBe(area);
    desenharParede([0, 0], [4, 0]);
    const paredes = Object.values(editor.project.elements).filter((e) => e.kind === 'wall');
    expect(paredes).toHaveLength(1);
    expect(paredes[0]!.levelId).toBe('lv_0');
  });

  it('Porta e Janela entram numa parede pela planta de área', () => {
    abrir(AREA);
    desenharParede([0, 0], [6, 0]);
    for (const [tool, x] of [['door', 1.5], ['window', 4.5]] as const) {
      editor.setTool(tool);
      clicar(x, 0.05);
      editor.setTool('select');
    }
    const kinds = Object.values(editor.project.elements).map((e) => e.kind).sort();
    expect(kinds).toEqual(['door', 'wall', 'window']);
  });

  it('Piso criado pelo modo de perímetro na planta de área grava o piso', () => {
    abrir(AREA);
    desenharPiso();
    expect(Object.values(editor.project.elements).filter((e) => e.kind === 'floor')).toHaveLength(1);
  });
});

describe.each(VISTAS)('aviso ao criar em categoria oculta: %s', (_nome, vista) => {
  it('parede com a categoria Parede oculta na vista é criada e avisa, com a categoria', () => {
    abrir(vista, ['wall']);
    desenharParede([0, 0], [4, 0]);
    expect(Object.values(editor.project.elements).filter((e) => e.kind === 'wall')).toHaveLength(1);
    const aviso = useUi.getState().avisoOculto;
    expect(aviso).not.toBeNull();
    expect(aviso!.viewId).toBe(viewIdAtivo());
    expect(aviso!.categories).toEqual(['wall']);
  });

  it('sem categoria oculta não há aviso', () => {
    abrir(vista);
    // Na planta de área o padrão esconde aberturas e pisos, mas a parede aparece (traço leve).
    desenharParede([0, 0], [4, 0]);
    expect(useUi.getState().avisoOculto).toBeNull();
  });

  it('"Mostrar categoria nesta vista" altera só esta vista; as outras seguem ocultando', () => {
    const { outraPiso, area } = abrir(vista, ['wall']);
    desenharParede([0, 0], [4, 0]);
    const ativa = viewIdAtivo();
    mostrarCategoriaDoAviso();
    // A vista ativa mostra a parede; o aviso some.
    expect(useUi.getState().avisoOculto).toBeNull();
    const p = editor.project;
    expect(planViewHiddenOf(p, ativa).categories ?? []).not.toContain('wall');
    expect(viewGraphicsOf(p, ativa).overrides.wall.visible).toBe(true);
    const wallId = Object.values(p.elements).find((e) => e.kind === 'wall')!.id;
    expect(visibilityOf(p, useUi.getState()).hidden.has(wallId)).toBe(false);
    // As demais vistas do mesmo nível continuam com a categoria oculta.
    const outras = [floorViewId('lv_0'), roofViewId('lv_0'), outraPiso, area].filter((id) => id !== ativa);
    for (const id of outras) expect(planViewHiddenOf(p, id).categories, id).toEqual(['wall']);
  });

  it('"Desfazer" desfaz a criação e o aviso some', () => {
    abrir(vista, ['wall']);
    const antes = editor.project;
    desenharParede([0, 0], [4, 0]);
    expect(useUi.getState().avisoOculto).not.toBeNull();
    desfazerCriacaoDoAviso();
    expect(useUi.getState().avisoOculto).toBeNull();
    expect(Object.values(editor.project.elements).filter((e) => e.kind === 'wall')).toHaveLength(0);
    expect(editor.project).toEqual(antes);
  });

  it('o aviso some quando o projeto muda por outro caminho (outra criação sem categoria oculta, desfazer)', () => {
    abrir(vista, ['wall']);
    desenharParede([0, 0], [4, 0]);
    expect(useUi.getState().avisoOculto).not.toBeNull();
    editor.undo();
    expect(useUi.getState().avisoOculto).toBeNull();
  });
});

describe('aviso: perfil da planta de área e categorias de cada tipo', () => {
  it('Porta na área com aberturas ocultas pelo perfil avisa; "Mostrar" liga as aberturas só nesta planta', () => {
    const { area, outraPiso } = abrir(AREA);
    desenharParede([0, 0], [6, 0]);
    expect(useUi.getState().avisoOculto).toBeNull();
    editor.setTool('door');
    clicar(2, 0.05);
    editor.setTool('select');
    const aviso = useUi.getState().avisoOculto;
    expect(aviso?.categories).toEqual(['door']);
    mostrarCategoriaDoAviso();
    const v = planViewOf(editor.project, area)!;
    expect(v.area!.graphics.showOpenings).toBe(true);
    // A planta de piso do mesmo nível não foi tocada (e nunca escondeu aberturas).
    expect(planViewHiddenOf(editor.project, outraPiso).categories ?? []).toEqual([]);
    expect(useUi.getState().avisoOculto).toBeNull();
  });

  it('Piso na área com pisos ocultos pelo perfil avisa e "Mostrar" liga os pisos; Desfazer remove o piso', () => {
    const { area } = abrir(AREA);
    desenharPiso();
    expect(Object.values(editor.project.elements).filter((e) => e.kind === 'floor')).toHaveLength(1);
    expect(useUi.getState().avisoOculto?.categories).toEqual(['floor']);
    mostrarCategoriaDoAviso();
    expect(planViewOf(editor.project, area)!.area!.graphics.showFloors).toBe(true);
  });

  it('o aviso não aparece nem some fora da planta de origem: trocar de vista esconde o aviso da outra', () => {
    const { outraPiso } = abrir(PISO, ['wall']);
    desenharParede([0, 0], [4, 0]);
    expect(useUi.getState().avisoOculto?.viewId).toBe(floorViewId('lv_0'));
    // O aviso é da vista em que se criou: a outra vista não herda a ação.
    useUi.setState({ planViewId: outraPiso });
    mostrarCategoriaDoAviso();
    expect(planViewHiddenOf(editor.project, outraPiso).categories).toEqual(['wall']);
  });

  it('categoria oculta temporariamente (HC) também avisa, e "Mostrar" a libera na sessão', () => {
    abrir(PISO);
    useUi.setState({ viewTemp: { [`plan:lv_0`]: { hidden: { categories: ['wall'] } } } });
    desenharParede([0, 0], [4, 0]);
    expect(useUi.getState().avisoOculto?.categories).toEqual(['wall']);
    mostrarCategoriaDoAviso();
    expect(useUi.getState().viewTemp['plan:lv_0']?.hidden?.categories ?? []).not.toContain('wall');
  });
});

describe('textos novos nos sete idiomas', () => {
  const CHAVES = ['edc_hidden_creation', 'edc_hidden_show_category', 'eds_msg_category_shown', 'eds_undo_show_category_view', 'eds_msg_tool_not_in_view', 'btn_undo'] as const;
  const IDIOMAS = ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const;

  it('cada chave existe, não está vazia e, fora do português, difere do português', () => {
    for (const k of CHAVES) {
      for (const lang of IDIOMAS) {
        const texto = (I18N[lang] as Record<string, string>)[k];
        expect(texto, `${lang}.${k}`).toBeTruthy();
        if (lang !== 'pt' && k !== 'btn_undo') expect(texto, `${lang}.${k}`).not.toBe((I18N.pt as Record<string, string>)[k]);
      }
    }
  });

  it('a mensagem de criação oculta leva a lista de categorias em todos os idiomas', () => {
    for (const lang of IDIOMAS) expect((I18N[lang] as Record<string, string>).edc_hidden_creation).toContain('{layers}');
  });
});
