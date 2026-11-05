import { abrirProjetoPorFases } from './aberturaProjeto.ts';
import { editor } from './controller.ts';
import { saveProjectIfc } from './ifcExport.ts';
import { t, useI18n } from './i18n.ts';
import { savePdf } from './savePdf.ts';
import { pranchaDaPlantaAtual, sheetsPdfOf } from './sheetActions.ts';
import { useUi, type ThemePref } from './state.ts';

/** Ações do menu Arquivo (abrir, exportar, tema). Mensagens de resultado vão para a barra de status. */

const say = (status: string): void => useUi.setState({ status });
const tr = (key: Parameters<typeof t>[1], args?: Record<string, string | number>): string => t(useI18n.getState().lang, key, args);
const why = (e: unknown): string => (e instanceof Error ? e.message : tr('edc_unknown_failure'));

export async function openProjectFile(f: File | undefined): Promise<void> {
  if (!f) return;
  const texto = await f.text();
  say(tr('edc_opening_file', { file: f.name }));
  const r = await abrirProjetoPorFases(texto, f.name);
  say(r.ok ? tr('edc_opened_file', { file: f.name }) : tr('edc_open_failed', { error: r.error }));
}

/** Abre o diálogo de exportação DXF (lote de desenhos e pranchas, num ZIP). */
export async function exportDxf(): Promise<void> {
  useUi.setState({ dialog: 'dxfLayers' });
}

export async function exportPdf(): Promise<void> {
  try {
    // Sem prancha: cria uma com a planta do nível atual (ação com desfazer) e exporta essa.
    let bytes = sheetsPdfOf(editor.project, useI18n.getState().lang);
    if (!bytes) {
      pranchaDaPlantaAtual(editor.store, useUi.getState().levelId);
      bytes = sheetsPdfOf(editor.project, useI18n.getState().lang);
    }
    say(bytes ? await savePdf(`${editor.project.name || 'projeto'}-pranchas.pdf`, bytes) : tr('edc_no_sheets_to_export'));
  } catch (e) {
    say(tr('edc_export_pdf_failed', { error: why(e) }));
  }
}

export async function exportIfc(): Promise<void> {
  try {
    say(await saveProjectIfc(editor.project, useI18n.getState().lang));
  } catch (e) {
    say(tr('edc_export_ifc_failed', { error: why(e) }));
  }
}

export const nextTheme = (t: ThemePref): ThemePref => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');
