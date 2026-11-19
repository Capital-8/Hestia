import type { Vec2 } from '@hestia/geom';
import type { ResolvedLevel } from '@hestia/engine';
import { isTerrain, isTerrainRegion, type Id, type Project } from '@hestia/model';
import { janelaDaVista, terrenoEdicaoOps, type PlanOps, type PlanTheme, type TerrenoEdicaoVista, type Viewport } from '@hestia/render';
import { pickTerrenoAt, TerrainEditTool, type Tool, type ToolId } from '@hestia/tools';
import { useUi, type UiState } from './state.ts';

/**
 * Modo "Editar terreno" no estado de interface (ficha T2, A.6). O campo `terrenoEdicao: { terrenoId }` do `useUi` diz QUAL terreno está em edição; o
 * modo vale enquanto a ferramenta `terrainEdit` está ativa (Esc ou "Concluir" saem pela própria ferramenta: `env.done()` volta à seleção).
 *
 * Aqui ficam as ações (entrar, sair, sincronizar) e a escolha do terreno por duplo clique. Funções sem React nem controlador: quem chama passa o
 * `setTool` do editor (`editor.setTool`), assim o teste roda sem navegador. A ligação do duplo clique ao `ViewportCanvas` e do botão "Editar terreno"
 * à faixa é da ficha U1.
 */

type TrocarFerramenta = (id: ToolId) => void;

/** Terreno em edição: só vale com a ferramenta `terrainEdit` ativa. */
export function terrenoEmEdicao(ui: Pick<UiState, 'tool' | 'terrenoEdicao'>): Id | null {
  return ui.tool === 'terrainEdit' ? (ui.terrenoEdicao?.terrenoId ?? null) : null;
}

/** O terreno do elemento: ele mesmo, ou o terreno da região. Outro elemento, ausente ou terreno inexistente, null. */
export function terrenoDoElemento(p: Project, id: Id | null): Id | null {
  const e = id ? p.elements[id] : undefined;
  if (isTerrain(e)) return e.id;
  if (isTerrainRegion(e) && isTerrain(p.elements[e.terrenoId])) return e.terrenoId;
  return null;
}

/**
 * Entra no modo de edição do terreno `id` (ou o da região dada): guarda o terreno em `terrenoEdicao`, o seleciona e ativa a ferramenta. Falso, sem mudar
 * nada, se `id` não for um terreno (nem região de um).
 */
export function entrarEdicaoTerreno(p: Project, id: Id, setTool: TrocarFerramenta): boolean {
  const terrenoId = terrenoDoElemento(p, id);
  if (!terrenoId) return false;
  useUi.setState({ terrenoEdicao: { terrenoId }, selection: [terrenoId], selectedLevel: null });
  setTool('terrainEdit');
  return true;
}

/** Sai do modo ("Concluir"): limpa o campo e volta à seleção. Sem alterar o terreno. */
export function sairEdicaoTerreno(setTool: TrocarFerramenta): void {
  useUi.setState({ terrenoEdicao: null });
  setTool('select');
}

/** Terreno sob um duplo clique em planta: o da borda, de uma curva de nível ou do contorno de região (o interior não conta). Null se não houver. */
export function terrenoNoDuploClique(p: Project, levelId: Id, at: Vec2, tol: number, hidden?: ReadonlySet<Id>): Id | null {
  return terrenoDoElemento(p, pickTerrenoAt(p, levelId, at, tol, hidden));
}

/** Duplo clique no terreno entra no modo de edição. Devolve se entrou. */
export function entrarPorDuploClique(p: Project, levelId: Id, at: Vec2, tol: number, setTool: TrocarFerramenta, hidden?: ReadonlySet<Id>): boolean {
  const id = terrenoNoDuploClique(p, levelId, at, tol, hidden);
  return id ? entrarEdicaoTerreno(p, id, setTool) : false;
}

/**
 * Mantém `terrenoEdicao` coerente: ao trocar para qualquer outra ferramenta (Esc, Concluir, outro botão) o campo volta a null. Devolve a função que
 * desliga a escuta. A U1 a liga uma vez, ao montar o editor.
 */
export function ligarSincroniaDaEdicao(): () => void {
  return useUi.subscribe((ui, antes) => {
    if (ui.tool !== antes.tool && ui.tool !== 'terrainEdit' && ui.terrenoEdicao) useUi.setState({ terrenoEdicao: null });
  });
}

/** Quem trata a tecla Delete (ou Backspace) com a ferramenta ativa. */
export type DestinoDoDelete = 'ferramenta' | 'selecao' | 'nada';

/**
 * Roteia o Delete: a ferramenta ativa, se ela tratou a tecla (`deleteKey()` devolveu true); senão, com `terrainEdit`, NADA (a seleção é o próprio terreno
 * em edição e o Delete sem vértice escolhido não pode apagá-lo); nas demais ferramentas, a exclusão da seleção, como sempre.
 */
export function destinoDoDelete(ferramenta: string, ferramentaTratou: boolean): DestinoDoDelete {
  if (ferramentaTratou) return 'ferramenta';
  return ferramenta === 'terrainEdit' ? 'nada' : 'selecao';
}

/**
 * Estado do modo Editar terreno para o desenho da planta (`input.terrenoEdicao`): o terreno em edição, o item escolhido e a mensagem de "aproxime para
 * editar pontos" que a ferramenta devolve (já no idioma da interface). Também entrega à ferramenta a janela da vista (`definirJanela`), que decide o limite
 * de 500 alças, e o terreno em edição (`definirTerreno`). Null com o modo desligado, com outra ferramenta ativa ou sem a ferramenta de edição.
 */
export function edicaoParaAVista(ui: Pick<UiState, 'tool' | 'terrenoEdicao'>, tool: Pick<Tool, 'id'>, viewport: Viewport | null): TerrenoEdicaoVista | null {
  const terrenoId = terrenoEmEdicao(ui);
  if (!terrenoId || !(tool instanceof TerrainEditTool)) return null;
  tool.definirTerreno(terrenoId);
  tool.definirJanela(viewport ? janelaDaVista(viewport) : null);
  return { terrenoId, selecionado: tool.selecionado, mensagem: tool.alcas().mensagem };
}

/** Contexto mínimo que o desenho das alças lê da planta. */
export interface ContextoDaEdicao {
  project: Project;
  levelId: Id;
  v: Viewport;
  theme: PlanTheme;
  dark: boolean;
  hidden?: ReadonlySet<Id>;
}

type AtualizacaoDoQuadro = { liveKey?: string; live?: () => PlanOps };

/**
 * Acrescenta o modo Editar terreno à camada viva do quadro da planta: as alças e o destaque saem de `terrenoEdicaoOps` com `input.terrenoEdicao`
 * preenchido. A chave da camada ganha o estado do modo e a vista (as alças dependem da janela), senão pan e zoom não as refariam. Sem `ed`, devolve a
 * atualização como veio.
 */
export function comEdicaoDoTerreno<T extends AtualizacaoDoQuadro>(upd: T, ctx: ContextoDaEdicao, ed: TerrenoEdicaoVista | null): T {
  if (!ed) return upd;
  const { v } = ctx;
  const resolved: ResolvedLevel = { levelId: ctx.levelId, walls: {}, clusters: [] };
  const entrada = {
    project: ctx.project, levelId: ctx.levelId, resolved, below: null, viewport: v, theme: ctx.theme, dark: ctx.dark, selection: [], hover: null, preview: [], inference: null,
    showGrid: false, ...(ctx.hidden ? { hidden: ctx.hidden } : {}), terrenoEdicao: ed,
  };
  const base = upd.live;
  return {
    ...upd,
    liveKey: `${upd.liveKey ?? ''}|ed:${JSON.stringify(ed)}|${v.cx},${v.cy},${v.zoom},${v.width},${v.height}`,
    live: () => {
      const o = base ? base() : { fills: [], strokes: [], labels: [] };
      const a = terrenoEdicaoOps(entrada);
      return { fills: [...o.fills, ...a.fills], strokes: [...o.strokes, ...a.strokes], labels: [...o.labels, ...a.labels] };
    },
  };
}
