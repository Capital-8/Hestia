import { annotationIdsOf, copyAnnotationsToView, inheritedAnnotations, newAnnotations, normalizeAnnotations, ownAreaAnnotations, plainClone, remapHiddenElements, ANNOTATION_FAMILIES } from './planViewAnnotations.ts';
import { floorViewId, roofViewId } from './planViewIds.ts';
import type { PlanAnnotations, PlanView } from './planView.ts';
import type { ViewHidden } from './graphics.ts';
import { DEFAULT_VIEW_RANGE } from './viewRange.ts';

type Raw = Record<string, unknown>;

/** Campos de vista que o `Level` perde na versão 24. */
const LEVEL_VIEW_FIELDS = ['viewRange', 'graphics', 'hidden', 'roofHidden', 'dimensions', 'texts', 'detailLines', 'detailRegions', 'tags'] as const;

type Hidden = ViewHidden;

/** Ocultação com os ids de anotação trocados pelos das cópias; vazia (sem elementos e sem categorias) some. */
function remapHidden(h: Hidden | undefined, levelIds: ReadonlySet<string>, viewId: string, copies: ReadonlySet<string>): Hidden | undefined {
  if (!h) return undefined;
  const out: Hidden = { ...plainClone(h) };
  if (out.elements) out.elements = remapHiddenElements(out.elements, levelIds, viewId, copies);
  if (!out.elements?.length) delete out.elements;
  if (!out.categories?.length) delete out.categories;
  return out.elements || out.categories ? out : undefined;
}

const set = <T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined): void => {
  if (v !== undefined) o[k] = v as T[K];
};

/** Anotações do nível (listas ausentes viram vazias). */
const levelAnnotations = (l: Raw): PlanAnnotations => normalizeAnnotations(Object.fromEntries(ANNOTATION_FAMILIES.map((f) => [f, l[f]])) as Partial<PlanAnnotations>);

/**
 * Migração 23 → 24 (docs/vistas/FASE-2A.md): as vistas de planta saem do `Level` e de `Project.areaPlans` e viram
 * `Project.planViews`. Determinística (sem `newId`) e só roda de 23 para 24, logo idempotente por construção.
 *
 * - cada nível gera `pv_<nível>` (piso) com intervalo, gráficos, ocultos e anotações dele, e `pvr_<nível>` (cobertura) com
 *   o intervalo padrão, cópia dos gráficos, `roofHidden` e, se o nível tem telhado, cópia das anotações (D3: nível sem
 *   telhado nasce sem anotações na cobertura);
 * - cada `AreaPlan` vira vista `area` com o mesmo id; a herança de anotações (`annotations === undefined`) vira cópia das
 *   famílias que a planta desenha (D1: id `<id>__<idDaVista>`); o conjunto próprio fica como está e, com
 *   `showAnnotations` ligado, recebe depois dele uma cópia de cada etiqueta de elemento do nível (a planta as desenhava
 *   lendo a de piso; agora o desenho lê só a vista: ver `ownAreaAnnotations`);
 * - planta de área cujo nível não existe é descartada.
 */
export function migrateVistasV23(raw: Raw): Raw {
  // Defesa: dados que já estão no formato novo (um IFC importado carrega a versão de esquema do arquivo antigo) passam como estão.
  const levels0 = Array.isArray(raw.levels) ? (raw.levels as Raw[]) : [];
  if (Array.isArray(raw.planViews) && !Array.isArray(raw.areaPlans) && levels0.every((l) => !('viewRange' in l))) return raw;
  const levels = Array.isArray(raw.levels) ? (raw.levels as Raw[]) : [];
  const elements = Object.values((raw.elements as Record<string, Raw> | undefined) ?? {});
  const withRoof = new Set(elements.filter((e) => e.kind === 'roof').map((e) => e.levelId as string));
  const planViews: PlanView[] = [];
  const byLevel = new Map<string, Raw>();

  for (const l of levels) {
    const id = l.id as string;
    byLevel.set(id, l);
    const name = l.name as string;
    const range = (l.viewRange as PlanView['viewRange'] | undefined) ?? { ...DEFAULT_VIEW_RANGE };
    const annotations = levelAnnotations(l);
    const levelIds = new Set(annotationIdsOf(annotations));

    const floor: PlanView = { id: floorViewId(id), name, levelId: id, kind: 'floor', viewRange: plainClone(range) } as PlanView;
    set(floor, 'graphics', plainClone(l.graphics as PlanView['graphics']));
    set(floor, 'hidden', plainClone(l.hidden as PlanView['hidden']));
    floor.annotations = annotations;

    const roofId = roofViewId(id);
    const roofAnnotations = withRoof.has(id) ? copyAnnotationsToView(annotations, roofId, Object.fromEntries(ANNOTATION_FAMILIES.map((f) => [f, true]))) : newAnnotations();
    const roof: PlanView = { id: roofId, name, levelId: id, kind: 'roof', viewRange: { ...DEFAULT_VIEW_RANGE } } as PlanView;
    set(roof, 'graphics', plainClone(l.graphics as PlanView['graphics']));
    set(roof, 'hidden', remapHidden(l.roofHidden as Hidden | undefined, levelIds, roofId, new Set(annotationIdsOf(roofAnnotations))));
    roof.annotations = roofAnnotations;
    planViews.push(floor, roof);
  }

  for (const a of (Array.isArray(raw.areaPlans) ? (raw.areaPlans as Raw[]) : [])) {
    const level = byLevel.get(a.levelId as string);
    if (!level) continue;
    const id = a.id as string;
    const g = a.graphics as { showDimensions?: boolean; showAnnotations?: boolean } | undefined;
    const fromLevel = levelAnnotations(level);
    const inherited = a.annotations === undefined;
    // Etiquetas de elemento do nível: a planta de conjunto próprio as desenhava (lendo a planta de piso) quando
    // `showAnnotations` estava ligado (`profile.elementTags`); a que herdava já as recebe na família `tags` acima.
    const levelTags = !inherited && Boolean(g?.showAnnotations) ? fromLevel.tags : [];
    const annotations = inherited ? inheritedAnnotations(fromLevel, id, g) : ownAreaAnnotations(a.annotations as Partial<PlanAnnotations>, { tags: levelTags, viewId: id });
    const view = { id, name: a.name as string, levelId: a.levelId as string, kind: 'area', viewRange: plainClone((level.viewRange as PlanView['viewRange'] | undefined) ?? { ...DEFAULT_VIEW_RANGE }) } as PlanView;
    set(view, 'graphics', plainClone(level.graphics as PlanView['graphics']));
    // Ids de anotação do nível que viraram cópia na vista (todas as famílias na que herdava; só as etiquetas na própria)
    // são trocados pelos das cópias nos ocultos; os demais ficam como estão.
    const copiados = inherited ? annotationIdsOf(fromLevel) : levelTags.map((x) => x.id);
    set(view, 'hidden', remapHidden(a.hidden as Hidden | undefined, new Set(copiados), id, new Set(annotationIdsOf(annotations))));
    view.annotations = annotations;
    const area: NonNullable<PlanView['area']> = { scale: a.scale as number, graphics: plainClone(a.graphics as NonNullable<PlanView['area']>['graphics']), tags: plainClone((a.tags as NonNullable<PlanView['area']>['tags'] | undefined) ?? []) };
    set(area, 'schemeId', a.schemeId as string | undefined);
    set(area, 'legend', plainClone(a.legend as NonNullable<PlanView['area']>['legend']));
    set(area, 'table', plainClone(a.table as NonNullable<PlanView['area']>['table']));
    view.area = area;
    planViews.push(view);
  }

  const { areaPlans: _areaPlans, ...rest } = raw;
  return {
    ...rest,
    levels: levels.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !(LEVEL_VIEW_FIELDS as readonly string[]).includes(k)))),
    planViews,
  };
}
