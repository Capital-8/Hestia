import type { Command } from './commands.ts';
import { sectionViewIssue, viewNameIssue } from './sectionView.ts';
import type { Project, SectionView } from './types.ts';
import { t, type Lang } from './i18n.ts';

type ViewCommand = Extract<Command, { type: 'addView' | 'updateView' | 'deleteView' }>;

/** Aplica criar/alterar/excluir vista com validação e a cascata dos viewports da prancha. */
export function applyViewCommand(p: Project, c: ViewCommand, lang: Lang = 'pt'): void {
  switch (c.type) {
    case 'addView': {
      if (p.views.some((v) => v.id === c.view.id)) throw new Error(t(lang, 'md_cmd_view_exists'));
      const issue = sectionViewIssue(c.view) ?? viewNameIssue(p.views, c.view.name);
      if (issue) throw new Error(issue);
      p.views.push(c.view);
      break;
    }
    case 'updateView': {
      const v = p.views.find((x) => x.id === c.id);
      if (!v) throw new Error(t(lang, 'md_view_missing'));
      const next: SectionView = { ...v, ...c.patch, id: v.id };
      const issue = sectionViewIssue(next) ?? (c.patch.name !== undefined ? viewNameIssue(p.views, next.name, v.id) : null);
      if (issue) throw new Error(issue);
      p.views = p.views.map((x) => (x.id === c.id ? next : x));
      break;
    }
    case 'deleteView':
      p.views = p.views.filter((v) => v.id !== c.id);
      // A vista pode estar numa prancha: sem a origem, o viewport ficaria órfão. Sai junto no mesmo passo de desfazer.
      if (p.sheets) {
        p.sheets = p.sheets.map((s) => ({
          ...s,
          viewports: s.viewports.filter((vp) => !(vp.view.kind === 'section' && vp.view.sectionId === c.id)),
        }));
      }
      break;
  }
}
