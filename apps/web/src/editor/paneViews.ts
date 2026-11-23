import { areaPlansOf, planViewsOfLevel, projectSheets, view3dViewsOf, type Project } from '@hestia/model';
import { t, type Lang } from './i18n.ts';
import { sameView, viewKey, type OpenView } from './openViews.ts';
import { MAX_PANES } from './panes.ts';
import { tabOf } from './viewTabActions.ts';

/** Uma vista escolhível no seletor do painel. */
export interface PaneViewOption {
  key: string;
  view: OpenView;
  label: string;
}

/** Grupo do seletor (`<optgroup>`): rótulo traduzido e as vistas dele. */
export interface PaneViewGroup {
  id: 'floor' | 'roof' | 'area' | '3d' | 'section' | 'elevation' | 'sheet';
  label: string;
  options: PaneViewOption[];
}

const opcao = (p: Project, view: OpenView): PaneViewOption[] => {
  const tab = tabOf(p, view);
  return tab ? [{ key: viewKey(view), view, label: tab.label }] : [];
};

/**
 * TODAS as vistas do projeto, agrupadas na ordem: plantas de piso (a padrão e as de disciplina de cada nível), plantas
 * de cobertura (uma por nível, como o navegador), plantas de área, modelo 3D, cortes, elevações e pranchas. Grupos sem
 * vistas não aparecem.
 */
export function listPaneViews(p: Project, lang: Lang): PaneViewGroup[] {
  const plantasDePiso = p.levels.flatMap((l) => [
    ...opcao(p, { kind: 'plan', levelId: l.id }),
    ...planViewsOfLevel(p, l.id).flatMap((pv) => opcao(p, { kind: 'plan', levelId: l.id, planViewId: pv.id })),
  ]);
  const grupos: PaneViewGroup[] = [
    { id: 'floor', label: t(lang, 'pane_group_floor'), options: plantasDePiso },
    { id: 'roof', label: t(lang, 'pane_group_roof'), options: p.levels.flatMap((l) => opcao(p, { kind: 'plan', levelId: l.id, planKind: 'roof' })) },
    { id: 'area', label: t(lang, 'pane_group_area'), options: areaPlansOf(p).flatMap((a) => opcao(p, { kind: 'plan', levelId: a.levelId, planKind: 'area', areaPlanId: a.id })) },
    { id: '3d', label: t(lang, 'pane_group_3d'), options: [opcao(p, { kind: '3d' }), ...view3dViewsOf(p).flatMap((v) => opcao(p, { kind: '3d', viewId: v.id }))].flat() },
    { id: 'section', label: t(lang, 'pane_group_section'), options: p.views.filter((v) => v.kind === 'section').flatMap((v) => opcao(p, { kind: 'section', viewId: v.id })) },
    { id: 'elevation', label: t(lang, 'pane_group_elevation'), options: p.views.filter((v) => v.kind === 'elevation').flatMap((v) => opcao(p, { kind: 'section', viewId: v.id })) },
    { id: 'sheet', label: t(lang, 'pane_group_sheet'), options: projectSheets(p).flatMap((s) => opcao(p, { kind: 'sheet', sheetId: s.id })) },
  ];
  return grupos.filter((g) => g.options.length > 0);
}

/**
 * Vistas diversas para um layout pronto: a ativa primeiro, depois o 3D (se não for a ativa), o primeiro corte ou elevação
 * do projeto, outra planta de piso; completa com as abertas (que ainda existem) e, por fim, repete a ativa até `MAX_PANES`.
 */
export function viewsForPreset(p: Project, active: OpenView, openViews: readonly OpenView[]): OpenView[] {
  const out: OpenView[] = [active];
  const add = (v: OpenView | undefined): void => {
    if (v && tabOf(p, v) !== null && !out.some((x) => sameView(x, v))) out.push(v);
  };
  add({ kind: '3d' });
  const corte = p.views[0];
  add(corte ? { kind: 'section', viewId: corte.id } : undefined);
  const outra = p.levels.find((l) => !sameView({ kind: 'plan', levelId: l.id }, active));
  add(outra ? { kind: 'plan', levelId: outra.id } : undefined);
  for (const v of openViews) add(v);
  while (out.length < MAX_PANES) out.push(active);
  return out;
}
