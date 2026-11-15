import { isLot, isTerrain, isTerrainRegion, type Id, type Lot, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { entrarEdicaoTerreno } from '../../editor/terrenoEdicao.ts';

/**
 * Listas e ações das categorias "Terrenos" e "Lotes" do Navegador de projeto (ficha U1). Funções simples sobre o projeto e o estado de
 * interface, no molde de `cadActions.ts`.
 */

const porNivelENome = <T extends { levelId: Id; name: string }>(p: Project): ((a: T, b: T) => number) => {
  const elevacao = new Map(p.levels.map((l) => [l.id, l.elevation] as const));
  return (a, b) => (elevacao.get(a.levelId) ?? 0) - (elevacao.get(b.levelId) ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
};

/** Terrenos do projeto, por elevação do nível e nome. */
export const terrenosDoProjeto = (p: Project): Terrain[] => Object.values(p.elements).filter(isTerrain).sort(porNivelENome(p));

/** Regiões de um terreno, na ordem de criação. */
export const regioesDoTerreno = (p: Project, terrenoId: Id): TerrainRegion[] =>
  Object.values(p.elements).filter((e): e is TerrainRegion => isTerrainRegion(e) && e.terrenoId === terrenoId).sort((a, b) => a.order - b.order);

/** Lotes do projeto, por elevação do nível e nome. */
export const lotesDoProjeto = (p: Project): Lot[] => Object.values(p.elements).filter(isLot).sort(porNivelENome(p));

/** Nome do nível do elemento (ou o id, se o nível sumiu). */
export const nomeDoNivel = (p: Project, levelId: Id): string => p.levels.find((l) => l.id === levelId)?.name ?? levelId;

/** Seleciona o elemento, abrindo a planta do nível dele se preciso (as Propriedades passam a mostrar o terreno, a região ou o lote). */
export function selecionarNoSitio(e: { id: Id; levelId: Id }): void {
  const ui = useUi.getState();
  if (ui.view !== 'plan' || ui.levelId !== e.levelId) activateView({ kind: 'plan', levelId: e.levelId });
  useUi.setState({ selection: [e.id], selectedLevel: null, dialog: null });
}

/** Seleciona o terreno e entra no modo "Editar terreno". */
export function editarTerrenoDoNavegador(p: Project, t: Terrain): void {
  selecionarNoSitio(t);
  entrarEdicaoTerreno(p, t.id, (id) => editor.setTool(id));
}

/** Exclui o elemento (um passo de desfazer; apagar o terreno apaga as regiões dele, pelo modelo). */
export function excluirDoSitio(id: Id): void {
  editor.store.exec({ type: 'deleteElements', ids: [id] });
  useUi.setState({ selection: [] });
}
