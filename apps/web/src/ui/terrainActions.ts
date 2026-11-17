import { isTerrain, type Id, type Project } from '@hestia/model';
import { TerrainEditTool, TerrainTool, type ModoEdicaoTerreno, type ModoTopografia, type Tool, type ToolId } from '@hestia/tools';
import { entrarEdicaoTerreno, terrenoDoElemento } from '../editor/terrenoEdicao.ts';

/**
 * Ações da faixa, da barra de opções e das propriedades do terreno (ficha U1). Funções sem React: quem chama passa o editor
 * (`setTool` e `activeTool`), assim o teste roda sem navegador. Nada aqui gera geometria: só liga ferramentas e entra no modo de edição.
 */

/** O que as ações precisam do editor. */
export interface EditorDoTerreno {
  setTool: (id: ToolId) => void;
  readonly activeTool: Tool;
}

/** Liga a Topografia no modo `pontos` ou `curvas`. Falso se a ferramenta não ficou ativa (vista sem planta, por exemplo). */
export function ativarTopografia(modo: ModoTopografia, ed: EditorDoTerreno): boolean {
  ed.setTool('terrain');
  const t = ed.activeTool;
  if (!(t instanceof TerrainTool)) return false;
  t.definirModo(modo);
  return true;
}

/** Terreno que o botão "Editar terreno" abre: o primeiro da seleção (ou o da região selecionada); sem seleção, o único terreno do nível. */
export function terrenoParaEditar(p: Project, selecao: readonly Id[], levelId: Id): Id | null {
  for (const id of selecao) {
    const t = terrenoDoElemento(p, id);
    if (t) return t;
  }
  const doNivel = Object.values(p.elements).filter((e) => isTerrain(e) && e.levelId === levelId);
  return doNivel.length === 1 ? doNivel[0]!.id : null;
}

/** Entra no modo "Editar terreno". Sem terreno a escolher, liga a ferramenta mesmo assim (ela avisa na barra de status). */
export function editarTerreno(p: Project, selecao: readonly Id[], levelId: Id, setTool: (id: ToolId) => void): boolean {
  const id = terrenoParaEditar(p, selecao, levelId);
  if (id && entrarEdicaoTerreno(p, id, setTool)) return true;
  setTool('terrainEdit');
  return false;
}

/** A ferramenta Editar terreno ativa, ou null. */
export const editorDeTerreno = (ed: Pick<EditorDoTerreno, 'activeTool'>): TerrainEditTool | null => (ed.activeTool instanceof TerrainEditTool ? ed.activeTool : null);

/** A ferramenta Topografia ativa, ou null. */
export const topografiaAtiva = (ed: Pick<EditorDoTerreno, 'activeTool'>): TerrainTool | null => (ed.activeTool instanceof TerrainTool ? ed.activeTool : null);

export type { ModoEdicaoTerreno, ModoTopografia };
