import { isCad, type CadDrawing, type Project } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';
import type { PlanBox } from './elevations.ts';

/**
 * Ações do CAD importado (DXF), compartilhadas pelo diálogo "CAD importado" e pelo nó do Navegador: listar, enquadrar,
 * selecionar, mostrar/ocultar, renomear e excluir. O desenho é um elemento só (`CadDrawing`), então tudo passa pelos
 * comandos normais do projeto e entra no desfazer.
 */

/** Desenhos CAD do projeto, por nível (elevação) e nome. */
export function cadDrawingsOf(p: Project): CadDrawing[] {
  const elevacao = new Map(p.levels.map((l) => [l.id, l.elevation] as const));
  return Object.values(p.elements)
    .filter(isCad)
    .sort((a, b) => (elevacao.get(a.levelId) ?? 0) - (elevacao.get(b.levelId) ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

/** Caixa do desenho em planta (traços e textos), em metros; null quando não há geometria. */
export function cadBoxOf(d: CadDrawing): PlanBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ver = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const path of d.paths) for (const q of path.pts) ver(q.x, q.y);
  for (const t of d.texts) ver(t.at.x, t.at.y);
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Nome do nível do desenho (ou o id, se o nível sumiu). */
export function cadLevelName(p: Project, d: CadDrawing): string {
  return p.levels.find((l) => l.id === d.levelId)?.name ?? d.levelId;
}

/** Seleciona o desenho, abrindo a planta do nível dele se preciso (as Propriedades passam a mostrar o CAD). */
export function selectCad(d: CadDrawing): void {
  if (useUi.getState().view !== 'plan' || useUi.getState().levelId !== d.levelId) activateView({ kind: 'plan', levelId: d.levelId });
  useUi.setState({ selection: [d.id], selectedLevel: null, dialog: null });
}

/** Enquadra a vista atual na caixa do desenho (a vista é aberta pelo chamador, se preciso). */
export function frameCad(d: CadDrawing): void {
  const box = cadBoxOf(d);
  if (!box) {
    useUi.setState({ status: { key: 'edc_cad_no_geometry' } });
    return;
  }
  editor.zoomToBox(box);
}

/** Mostra/oculta o desenho nas plantas e no 3D (comando do projeto, com desfazer). */
export function setCadVisible(d: CadDrawing, visible: boolean): void {
  editor.store.exec({ type: 'updateCadDrawing', id: d.id, patch: { visible } }, visible ? 'edc_cad_show' : 'edc_cad_hide');
}

/** Renomeia o desenho; nome vazio mantém o atual. */
export function renameCad(d: CadDrawing, name: string): void {
  const n = name.trim();
  if (n === '' || n === d.name) return;
  editor.store.exec({ type: 'updateCadDrawing', id: d.id, patch: { name: n } }, 'edc_cad_rename');
}

/** Exclui o desenho do projeto (um passo de desfazer). */
export function removeCad(d: CadDrawing): void {
  editor.store.exec({ type: 'deleteElements', ids: [d.id] }, 'edc_cad_delete');
  useUi.setState({ selection: [], status: { key: 'edc_cad_deleted', args: { name: d.name } } });
}
