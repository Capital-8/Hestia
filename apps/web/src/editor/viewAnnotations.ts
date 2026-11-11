import { DIM_FAMILY_PADRAO, planAnnotationsOf, planOwnsAnnotations, sectionAnnotationsOf, type Id, type Project, type SectionAnnotations } from '@hestia/model';
import type { useUi } from './state.ts';

/** Anotação da vista ativa (cota, texto, linha/região de detalhe, etiqueta ou separador de ambiente). */
export interface ViewAnnotation {
  id: Id;
  /** Mesmo `kind` das anotações no resto do app ('dimension', 'text', 'detailLine', 'detailRegion', 'tag', 'roomSeparator'). */
  kind: string;
  /** "Tipo" da anotação: o kind e, nas cotas, a família de cotas (a ausente é a família padrão). */
  typeKey: string;
}

type ViewState = Pick<ReturnType<typeof useUi.getState>, 'view' | 'planKind' | 'levelId' | 'areaPlanId' | 'sectionId'>;

/**
 * Anotações da vista ativa: no corte/elevação as da própria vista; na planta de área as dela (ou as do nível, se herda);
 * na planta de piso e de cobertura as do nível. Fora dessas (3D, prancha) não há anotação.
 */
export function annotationsOfActiveView(p: Project, st: ViewState): ViewAnnotation[] {
  type Fonte = { dimensions?: Array<{ id: Id; familyId?: Id }>; texts?: Array<{ id: Id }>; detailLines?: Array<{ id: Id }>; detailRegions?: Array<{ id: Id }>; tags?: Array<{ id: Id }> };
  let fonte: Fonte | undefined;
  let separadores: Array<{ id: Id }> = [];
  if (st.view === 'section') {
    if (!st.sectionId) return [];
    fonte = sectionAnnotationsOf(p.views.find((v) => v.id === st.sectionId));
  } else if (st.view === 'plan') {
    const level = p.levels.find((l) => l.id === st.levelId);
    const plan = st.planKind === 'area' && st.areaPlanId ? p.areaPlans?.find((a) => a.id === st.areaPlanId) : undefined;
    if (plan && planOwnsAnnotations(plan)) fonte = planAnnotationsOf(plan);
    else {
      fonte = level;
      separadores = plan ? [] : (level?.roomSeparators ?? []);
    }
  } else return [];
  const out: ViewAnnotation[] = [];
  for (const d of fonte?.dimensions ?? []) out.push({ id: d.id, kind: 'dimension', typeKey: `dimension:${d.familyId ?? DIM_FAMILY_PADRAO}` });
  for (const x of fonte?.texts ?? []) out.push({ id: x.id, kind: 'text', typeKey: 'text' });
  for (const x of fonte?.detailLines ?? []) out.push({ id: x.id, kind: 'detailLine', typeKey: 'detailLine' });
  for (const x of fonte?.detailRegions ?? []) out.push({ id: x.id, kind: 'detailRegion', typeKey: 'detailRegion' });
  for (const x of fonte?.tags ?? []) out.push({ id: x.id, kind: 'tag', typeKey: 'tag' });
  for (const x of separadores) out.push({ id: x.id, kind: 'roomSeparator', typeKey: 'roomSeparator' });
  return out;
}

/** Anotações do corte sem as ocultas na vista (Ocultar elemento/categoria, isolar). Sem ocultos, o mesmo objeto. */
export function anotacoesSemOcultas(a: SectionAnnotations, hidden?: ReadonlySet<Id>): SectionAnnotations {
  if (!hidden?.size) return a;
  const keep = <T extends { id: Id }>(xs: T[]): T[] => xs.filter((x) => !hidden.has(x.id));
  return { dimensions: keep(a.dimensions), texts: keep(a.texts), detailLines: keep(a.detailLines), detailRegions: keep(a.detailRegions), tags: keep(a.tags) };
}

/** Ids de todas as anotações da vista ativa. */
export function annotationIdsOfActiveView(p: Project, st: ViewState): Id[] {
  return annotationsOfActiveView(p, st).map((a) => a.id);
}

/** Anotações da vista ativa que estão em `ids`. */
export function selectedAnnotations(p: Project, st: ViewState, ids: readonly Id[]): ViewAnnotation[] {
  const want = new Set(ids);
  return annotationsOfActiveView(p, st).filter((a) => want.has(a.id));
}

/**
 * Tipo comum de uma seleção só de anotações da vista (null quando algo da seleção não é anotação, ou quando há tipos
 * diferentes). Seleção vazia também dá null.
 */
export function annotationTypeOf(p: Project, st: ViewState, ids: readonly Id[]): string | null {
  if (ids.length === 0) return null;
  const sel = selectedAnnotations(p, st, ids);
  if (sel.length !== new Set(ids).size) return null;
  const keys = new Set(sel.map((a) => a.typeKey));
  return keys.size === 1 ? [...keys][0]! : null;
}

/** Ids das anotações da vista ativa do tipo dado, sem os ocultos (quando `hidden` vem). */
export function annotationIdsOfType(p: Project, st: ViewState, typeKey: string, hidden?: ReadonlySet<Id>): Id[] {
  return annotationsOfActiveView(p, st).filter((a) => a.typeKey === typeKey && !hidden?.has(a.id)).map((a) => a.id);
}
