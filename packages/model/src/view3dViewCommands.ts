import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { newId } from './ids.ts';
import type { Discipline, TomOuApresentacao } from './planView.ts';
import type { Id, Project } from './types.ts';
import {
  copyView3dView,
  uniqueView3dViewName,
  view3dViewIssues,
  view3dViewOf,
  view3dViewsOf,
  type Camera3D,
  type View3DView,
} from './view3dViews.ts';
import type { View3DSettings } from './graphics.ts';

function copy<T>(x: T): T {
  if (Array.isArray(x)) return x.map(copy) as T;
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) as T;
  return x;
}

/**
 * Comandos das vistas 3D salvas (plano de UX das disciplinas, 2026-11-23). Cada função grava um comando só; a
 * validação falha sem tocar no projeto, e o desfazer é o passo normal do `ProjectStore`. A vista 3D padrão
 * (`Project.view3d`) não é uma `View3DView`: `removeView3d` só alcança a coleção `Project.view3dViews`.
 */

export interface View3dViewPatch {
  name?: string;
  discipline?: Discipline | undefined;
  camera?: Camera3D;
  settings?: View3DSettings;
  tones?: Partial<Record<Discipline, TomOuApresentacao>> | undefined;
}

export type View3dViewCommand =
  | { type: 'addView3d'; view: View3DView }
  | { type: 'duplicateView3d'; id: Id; newViewId?: Id }
  | { type: 'updateView3d'; id: Id; patch: View3dViewPatch }
  | { type: 'removeView3d'; id: Id };

const refuse = (issues: string[]): void => {
  if (issues.length > 0) throw new Error(issues.join(' '));
};

function existing(p: Project, id: Id, lang: Lang): View3DView {
  const view = view3dViewOf(p, id);
  if (!view) throw new Error(t(lang, 'md_v3dview_missing', { id }));
  return view;
}

/** Nome aparado e campos opcionais vazios fora do objeto gravado. */
function normalized(view: View3DView): View3DView {
  const out = copyView3dView(view);
  out.name = out.name.trim();
  if (out.tones && Object.keys(out.tones).length === 0) delete out.tones;
  return out;
}

function put(p: Project, views: View3DView[]): void {
  if (views.length > 0) p.view3dViews = views;
  else delete p.view3dViews;
}

/** Aplica um comando das vistas 3D salvas. Devolve false quando o comando não é desta família. */
export function applyView3dViewCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addView3d': {
      const view = normalized(c.view);
      refuse(view3dViewIssues(p, view, lang));
      put(p, [...view3dViewsOf(p), view]);
      return true;
    }
    case 'duplicateView3d': {
      const src = existing(p, c.id, lang);
      const id = c.newViewId ?? newId('v3d');
      if (view3dViewsOf(p).some((x) => x.id === id)) throw new Error(t(lang, 'md_v3dview_id_exists', { id }));
      const view = normalized({ ...copyView3dView(src), id, name: uniqueView3dViewName(p, src.name) });
      put(p, [...view3dViewsOf(p), view]);
      return true;
    }
    case 'updateView3d': {
      const old = existing(p, c.id, lang);
      const next: View3DView = copyView3dView(old);
      if (c.patch.name !== undefined) next.name = c.patch.name;
      if ('discipline' in c.patch) {
        if (c.patch.discipline === undefined) delete next.discipline;
        else next.discipline = c.patch.discipline;
      }
      if (c.patch.camera !== undefined) next.camera = { ...c.patch.camera, target: { ...c.patch.camera.target } };
      if (c.patch.settings !== undefined) next.settings = copy(c.patch.settings);
      if ('tones' in c.patch) {
        if (c.patch.tones === undefined) delete next.tones;
        else next.tones = copy(c.patch.tones);
      }
      refuse(view3dViewIssues(p, next, lang, old.id));
      put(p, view3dViewsOf(p).map((x) => (x.id === old.id ? normalized(next) : x)));
      return true;
    }
    case 'removeView3d': {
      existing(p, c.id, lang);
      put(p, view3dViewsOf(p).filter((x) => x.id !== c.id));
      return true;
    }
    default:
      return false;
  }
}
