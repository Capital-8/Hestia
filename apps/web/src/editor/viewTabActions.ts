import { sheetOf, type Id, type Project } from '@hestia/model';
import { openAreaPlan } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { t, useI18n } from './i18n.ts';
import { activeViewOf, addView, closeView, levelToRelease, planKindOf, removeView, type OpenView } from './openViews.ts';
import { useUi } from './state.ts';

/** Rótulo e ícone de uma aba; null quando a vista não existe mais no projeto (nível, corte ou prancha excluídos). */
export function tabOf(p: Project, v: OpenView): { icon: 'plan' | 'roof' | 'cube' | 'section' | 'elevation'; label: string } | null {
  const lang = useI18n.getState().lang;
  switch (v.kind) {
    case 'plan': {
      const l = p.levels.find((x) => x.id === v.levelId);
      if (!l) return null;
      if (planKindOf(v) === 'area') {
        const ap = v.areaPlanId ? (p.areaPlans ?? []).find((x) => x.id === v.areaPlanId) : undefined;
        return ap ? { icon: 'plan', label: ap.name } : null;
      }
      // A aba de cobertura leva o nome do tipo, para não confundir com a planta de piso do mesmo nível.
      return planKindOf(v) === 'roof' ? { icon: 'roof', label: t(lang, 'eds_tab_roof_plan', { name: l.name }) } : { icon: 'plan', label: l.name };
    }
    case '3d':
      return { icon: 'cube', label: t(lang, 'eds_tab_3d_model') };
    case 'section': {
      const sv = p.views.find((x) => x.id === v.viewId);
      return sv ? { icon: sv.kind === 'section' ? 'section' : 'elevation', label: sv.name } : null;
    }
    case 'sheet': {
      const sh = sheetOf(p, v.sheetId);
      return sh ? { icon: 'plan', label: `${sh.number} ${sh.name}` } : null;
    }
  }
}

/**
 * Libera o nível de uma planta fechada (a frente de edição cria `editor.releaseLevel`). Enquanto o método não
 * existir, não faz nada. Depois do merge, pode virar a chamada direta `editor.releaseLevel(id)`.
 */
function releaseLevel(levelId: Id): void {
  const ed = editor as unknown as { releaseLevel?: (id: Id) => void };
  if (typeof ed.releaseLevel === 'function') ed.releaseLevel(levelId);
}

/**
 * Navega até a vista e diz se a navegação foi aceita. Com o modo de perímetro aberto, o controlador recusa trocar de
 * vista ou de nível: nesse caso o estado não muda para a vista pedida (mas reabrir a vista já ativa continua valendo).
 */
function navega(v: OpenView): boolean {
  switch (v.kind) {
    case 'plan': {
      const kind = planKindOf(v);
      // Abrir pela aba/árvore também semeia as anotações de plantas antigas; sem isso o render mostra as do nível,
      // mas as ferramentas com `planId` não encontram nada para selecionar.
      if (kind === 'area' && v.areaPlanId) openAreaPlan(editor.store, v.areaPlanId);
      else editor.selectLevel(v.levelId, kind, null);
      const s = useUi.getState();
      return s.view === 'plan' && s.levelId === v.levelId && s.planKind === kind && (kind !== 'area' || s.areaPlanId === v.areaPlanId);
    }
    case '3d':
      editor.setView('3d');
      return useUi.getState().view === '3d';
    case 'section':
      editor.openSection(v.viewId);
      return useUi.getState().view === 'section' && useUi.getState().sectionId === v.viewId;
    case 'sheet':
      if (editor.perimetro.bloqueiaNavegacao()) return false;
      useUi.setState({ view: 'sheet', sheetId: v.sheetId });
      return true;
  }
}

/**
 * Abre ou ativa uma vista (aba). Plantas passam por `selectLevel`, que já aponta a planta.
 * Garante a aba na lista mesmo quando a vista já é a ativa (caso de reabrir depois de fechar a última aba,
 * em que a vista ativa não muda e a sincronização de `state.ts` não percebe a mudança). A aba só entra se a
 * navegação for aceita: com o modo de perímetro aberto, trocar de vista não pode abrir uma aba nova.
 */
export function activateView(v: OpenView): void {
  if (!navega(v)) return;
  const s = useUi.getState();
  if (!tabOf(editor.project, v)) return;
  const next = addView(s.openViews, v);
  if (next !== s.openViews) useUi.setState({ openViews: next });
}

/**
 * Fecha uma aba. Qualquer aba fecha, inclusive a última: a área de desenho mostra o estado vazio.
 * Fechar a ativa ativa a vizinha; sem vizinha (lista vazia), limpa a seleção. Fechar uma planta libera o nível.
 */
export function closeTab(target: OpenView): void {
  const s = useUi.getState();
  const r = closeView(s.openViews, target, activeViewOf(s));
  useUi.setState({ openViews: r.list });
  const level = levelToRelease(target);
  if (level) releaseLevel(level);
  if (r.activate) activateView(r.activate);
  else if (r.list.length === 0) useUi.setState({ selection: [], hover: null });
}

/** Mantém em openViews só as vistas que o projeto ainda tem. Lista vazia é um estado válido (estado vazio na área de desenho). */
export function dropMissingViews(p: Project): void {
  const cur = useUi.getState();
  const missing = cur.openViews.filter((v) => tabOf(p, v) === null);
  if (!missing.length) return;
  let list = cur.openViews;
  for (const v of missing) list = removeView(list, v);
  useUi.setState({ openViews: list });
}
