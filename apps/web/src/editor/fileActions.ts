import { abrirProjetoPorFases } from './aberturaProjeto.ts';
import { editor } from './controller.ts';
import { saveProjectIfc } from './ifcExport.ts';
import { savePdf } from './savePdf.ts';
import { pranchaDaPlantaAtual, sheetsPdfOf } from './sheetActions.ts';
import { useUi, type ThemePref } from './state.ts';

/** Ações do menu Arquivo (abrir, exportar, tema). Mensagens de resultado vão para a barra de status. */

const say = (status: string): void => useUi.setState({ status });
const why = (e: unknown): string => (e instanceof Error ? e.message : 'falha desconhecida');

export async function openProjectFile(f: File | undefined): Promise<void> {
  if (!f) return;
  const texto = await f.text();
  say(`Abrindo ${f.name}…`);
  const r = await abrirProjetoPorFases(texto, f.name);
  say(r.ok ? `Aberto: ${f.name}` : `Não foi possível abrir: ${r.error}`);
}

/** Abre o diálogo de exportação DXF (lote de desenhos e pranchas, num ZIP). */
export async function exportDxf(): Promise<void> {
  useUi.setState({ dialog: 'dxfLayers' });
}

export async function exportPdf(): Promise<void> {
  try {
    // Sem prancha: cria uma com a planta do nível atual (ação com desfazer) e exporta essa.
    let bytes = sheetsPdfOf(editor.project);
    if (!bytes) {
      pranchaDaPlantaAtual(editor.store, useUi.getState().levelId);
      bytes = sheetsPdfOf(editor.project);
    }
    say(bytes ? await savePdf(`${editor.project.name || 'projeto'}-pranchas.pdf`, bytes) : 'Nenhuma prancha para exportar.');
  } catch (e) {
    say(`Não foi possível exportar o PDF: ${why(e)}`);
  }
}

export async function exportIfc(): Promise<void> {
  try {
    say(await saveProjectIfc(editor.project));
  } catch (e) {
    say(`Não foi possível exportar o IFC: ${why(e)}`);
  }
}

export const nextTheme = (t: ThemePref): ThemePref => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');
