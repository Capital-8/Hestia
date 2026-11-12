import { newAnnotations } from './planViewAnnotations.ts';
import { floorViewId } from './planViewIds.ts';
import type { PlanView } from './planView.ts';
import type { Id, Level, Project } from './types.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';

/**
 * Vistas principais do nível (docs/vistas/PLANO-MESTRE.md §4.1): todo nível tem exatamente uma planta de piso
 * (`pv_<nível>`), criada junto com ele. A cobertura deixou de ser principal no esquema 25. Roda sobre o rascunho do projeto: lê e escreve
 * direto em `p.planViews`, sem memória.
 */

/** A vista principal de um nível novo (só o piso): intervalo padrão (ou o dado), gráficos padrão e anotações vazias. */
export function mainViewsOf(level: Pick<Level, 'id' | 'name'>, viewRange?: ViewRange): [PlanView] {
  const range = (): ViewRange => ({ ...(viewRange ?? DEFAULT_VIEW_RANGE) });
  return [
    { id: floorViewId(level.id), name: level.name, levelId: level.id, kind: 'floor', viewRange: range(), annotations: newAnnotations() },
  ];
}

/** Se `view` é a vista principal (piso `pv_<nível>`) de um nível que existe. */
export const isMainView = (p: Pick<Project, 'levels'>, view: Pick<PlanView, 'id' | 'levelId' | 'kind'>): boolean =>
  view.kind === 'floor' && view.id === floorViewId(view.levelId) &&
  p.levels.some((l) => l.id === view.levelId);

/**
 * Ordem do armazenamento: por nível (na ordem de `levels`) o piso principal, depois as demais vistas na
 * ordem em que estavam. É a mesma ordem da projeção da Fase 1 e da migração.
 */
export function sortPlanViews(p: Project): void {
  const mains = new Set<Id>();
  const ordered: PlanView[] = [];
  for (const l of p.levels) {
    for (const id of [floorViewId(l.id)]) {
      const v = p.planViews.find((x) => x.id === id);
      if (v) {
        ordered.push(v);
        mains.add(id);
      }
    }
  }
  const rest = p.planViews.filter((v) => !mains.has(v.id));
  const next = [...ordered, ...rest];
  if (next.some((v, i) => v !== p.planViews[i])) p.planViews = next;
}

/**
 * Criação ou edição de nível (`upsertLevel`): nível novo ganha a vista principal; nível existente mantém as suas e
 * só acompanha o nome (o nome da vista principal é o do nível).
 */
export function syncLevelViews(p: Project, level: Level, isNew: boolean, viewRange?: ViewRange): void {
  if (isNew) {
    const existing = new Set(p.planViews.map((v) => v.id));
    const add = mainViewsOf(level, viewRange).filter((v) => !existing.has(v.id));
    if (add.length > 0) p.planViews = [...p.planViews, ...add];
  } else {
    for (const v of p.planViews) if (v.levelId === level.id && isMainView(p, v) && v.name !== level.name) v.name = level.name;
  }
  sortPlanViews(p);
}

/** Remove todas as vistas de um nível apagado (as plantas de área e as extras também). */
export function dropViewsOfLevel(p: Project, levelId: Id): void {
  if (p.planViews.some((v) => v.levelId === levelId)) p.planViews = p.planViews.filter((v) => v.levelId !== levelId);
}
