import { newId } from './ids.ts';
import { projectSheets, sheetIssue, sheetOf, sheetView3DCameraIssue, viewportIssue, type Sheet, type SheetViewport, type SheetViewSource } from './sheet.ts';
import type { Id, Project } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';
import { resolvePlanView } from './planViewResolve.ts';
import { normalizeSheetViewSource } from './planViewIdentificacao.ts';

/**
 * Comandos de pranchas (decisão 0022). Recusam com mensagem pt-BR e não alteram o projeto. Mudar tamanho, orientação ou
 * margem revalida todas as vistas: a mudança é recusada se alguma vista ficaria fora da folha.
 */
export type SheetCommand =
  | { type: 'addSheet'; sheet: Sheet }
  | { type: 'updateSheet'; id: Id; patch: Partial<Omit<Sheet, 'id' | 'viewports'>> }
  | { type: 'removeSheet'; id: Id }
  | { type: 'setSheetOrder'; ids: Id[] }
  | { type: 'addViewport'; sheetId: Id; viewport: SheetViewport }
  | { type: 'updateViewport'; sheetId: Id; id: Id; patch: Partial<Omit<SheetViewport, 'id'>> }
  | { type: 'removeViewport'; sheetId: Id; id: Id };

/** Viewport com a fonte na forma única (`{ plan, viewId }`); a entrada pode vir na forma antiga. */
function withNormalSource(v: SheetViewport): SheetViewport {
  const view = normalizeSheetViewSource(v.view);
  return view === v.view ? v : { ...v, view };
}

/** Remove as viewports cuja fonte não existe mais (usado ao apagar planta de área ou nível, no mesmo comando). */
export function dropOrphanViewports(p: Project): void {
  if (!p.sheets?.some((s) => s.viewports.some((v) => viewSourceIssue(p, v.view)))) return;
  p.sheets = p.sheets.map((s) => (s.viewports.some((v) => viewSourceIssue(p, v.view)) ? { ...s, viewports: s.viewports.filter((v) => !viewSourceIssue(p, v.view)) } : s));
}

/** Motivo de recusa de uma fonte de vista (nível ou seção que precisa existir), ou null. */
export function viewSourceIssue(p: Pick<Project, 'levels' | 'views' | 'planViews'>, view: SheetViewSource, lang: Lang = 'pt'): string | null {
  // Formas antigas (entrada): mantêm as mensagens de antes. A forma única recusa vista inexistente (ou de forro, ainda sem desenho).
  if (view.kind === 'plan' && 'levelId' in view && !p.levels.some((l) => l.id === view.levelId)) return translate(lang, 'md_level_missing');
  if (view.kind === 'areaPlan' && resolvePlanView(p, view.planId)?.kind !== 'area') return translate(lang, 'md_area_plan_missing');
  if (view.kind === 'plan' && 'viewId' in view) {
    const alvo = resolvePlanView(p, view.viewId);
    if (!alvo || alvo.kind === 'ceiling') return translate(lang, 'md_view_missing');
  }
  if (view.kind === 'section' && !p.views.some((v) => v.id === view.sectionId)) return translate(lang, 'md_cmd_section_missing');
  if (view.kind === '3d' && view.camera !== undefined) return sheetView3DCameraIssue(view.camera);
  return null;
}

const refuse = (issue: string | null): void => {
  if (issue) throw new Error(issue);
};

function sheetRef(p: Project, id: Id, lang: Lang): Sheet {
  const s = sheetOf(p, id);
  if (!s) throw new Error(translate(lang, 'md_cmd_sheet_missing'));
  return s;
}

function setSheets(p: Project, next: Sheet[]): void {
  p.sheets = next;
}

/** Aplica um comando de prancha sobre o rascunho do projeto. Lança Error em texto pt-BR se recusar. */
export function applySheetCommand(p: Project, c: SheetCommand, lang: Lang = 'pt'): void {
  switch (c.type) {
    case 'addSheet': {
      refuse(sheetIssue(c.sheet, lang));
      if (projectSheets(p).some((s) => s.id === c.sheet.id)) throw new Error(translate(lang, 'md_cmd_sheet_exists'));
      c.sheet.viewports.forEach((v) => refuse(viewportIssue(c.sheet, v, lang) ?? viewSourceIssue(p, v.view, lang)));
      setSheets(p, [...projectSheets(p), { ...c.sheet, viewports: c.sheet.viewports.map(withNormalSource) }]);
      break;
    }
    case 'updateSheet': {
      const old = sheetRef(p, c.id, lang);
      const next: Sheet = { ...old, ...c.patch, id: old.id, viewports: old.viewports };
      refuse(sheetIssue(next, lang));
      next.viewports.forEach((v) => refuse(viewportIssue(next, v, lang)));
      setSheets(p, projectSheets(p).map((s) => (s.id === c.id ? next : s)));
      break;
    }
    case 'removeSheet': {
      sheetRef(p, c.id, lang);
      setSheets(p, projectSheets(p).filter((s) => s.id !== c.id));
      break;
    }
    case 'setSheetOrder': {
      const all = projectSheets(p);
      if (new Set(c.ids).size !== c.ids.length) throw new Error(translate(lang, 'md_cmd_sheet_order_duplicate'));
      for (const id of c.ids) if (!all.some((s) => s.id === id)) throw new Error(translate(lang, 'md_cmd_sheet_order_missing'));
      const byId = new Map(all.map((s) => [s.id, s]));
      const ordered = c.ids.map((id) => byId.get(id)!);
      // Pranchas não citadas (ex.: criadas por outro caminho) ficam no fim, na ordem atual.
      setSheets(p, [...ordered, ...all.filter((s) => !c.ids.includes(s.id))]);
      break;
    }
    case 'addViewport': {
      const old = sheetRef(p, c.sheetId, lang);
      if (old.viewports.some((v) => v.id === c.viewport.id)) throw new Error(translate(lang, 'md_cmd_viewport_exists'));
      refuse(viewportIssue(old, c.viewport, lang) ?? viewSourceIssue(p, c.viewport.view, lang));
      const novo = withNormalSource(c.viewport);
      setSheets(p, projectSheets(p).map((s) => (s.id === c.sheetId ? { ...s, viewports: [...s.viewports, novo] } : s)));
      break;
    }
    case 'updateViewport': {
      const old = sheetRef(p, c.sheetId, lang);
      const cur = old.viewports.find((v) => v.id === c.id);
      if (!cur) throw new Error(translate(lang, 'md_view_missing'));
      const next: SheetViewport = withNormalSource({ ...cur, ...c.patch, id: cur.id });
      refuse(viewportIssue(old, next, lang) ?? viewSourceIssue(p, next.view, lang));
      setSheets(p, projectSheets(p).map((s) => (s.id === c.sheetId ? { ...s, viewports: s.viewports.map((v) => (v.id === c.id ? next : v)) } : s)));
      break;
    }
    case 'removeViewport': {
      const old = sheetRef(p, c.sheetId, lang);
      if (!old.viewports.some((v) => v.id === c.id)) throw new Error(translate(lang, 'md_view_missing'));
      setSheets(p, projectSheets(p).map((s) => (s.id === c.sheetId ? { ...s, viewports: s.viewports.filter((v) => v.id !== c.id) } : s)));
      break;
    }
  }
}

/** Id novo de prancha ou vista (prefixos `sht` e `vpt`), para quem monta os comandos. */
export const newSheetId = (): Id => newId('sht');
export const newViewportId = (): Id => newId('vpt');
