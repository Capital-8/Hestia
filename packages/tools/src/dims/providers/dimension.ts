import { areaPlanOf, areaPlansOfLevel, dimRefAt, dimRefCandidates, dimensionPoints, dimensionValue, isElementRef, isOpening, levelDimensions, planAnnotationsOf, type Command, type Dimension, type DimensionElementRef, type Id, type Project } from '@hestia/model';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';
import { drivenEditCommands } from '../driven.ts';

/** Onde a cota mora: no nível (planta de piso) ou numa planta de área (`planId`). */
export interface CotaVista {
  levelId: Id;
  planId?: Id;
}

/** Cotas da vista: as do nível, ou as da planta de área. */
function dimsDaVista(p: Project, v: CotaVista): Dimension[] {
  if (!v.planId) return levelDimensions(p, v.levelId);
  const plan = areaPlanOf(p, v.planId);
  return plan ? planAnnotationsOf(plan).dimensions : [];
}

/** Vista que contém a cota: procura no nível e depois nas plantas de área do nível. Sem ela, null. */
export function vistaDaCota(p: Project, levelId: Id, dimId: Id): CotaVista | null {
  if (levelDimensions(p, levelId).some((d) => d.id === dimId)) return { levelId };
  for (const plan of areaPlansOfLevel(p, levelId)) {
    if (planAnnotationsOf(plan).dimensions.some((d) => d.id === dimId)) return { levelId, planId: plan.id };
  }
  return null;
}

/**
 * Troca de referência para o elemento clicado (Shift+clique na alça, depois um clique na planta): a feição mais próxima
 * de `at` (dentro de `tol`, em metros) passa a ser a ponta `slot`. Recusa se não houver feição ali ou se a outra
 * ponta já usa a mesma feição. Pura: devolve os comandos (um único `updateDimension`).
 */
export function pickRefCommands(project: Project, levelId: Id, dimId: Id, slot: 'a' | 'b', at: { x: number; y: number }, tol: number): { commands: Command[] } | { error: string } {
  const vista = vistaDaCota(project, levelId, dimId);
  const d = vista ? dimsDaVista(project, vista).find((x) => x.id === dimId) : undefined;
  if (!vista || !d) return { error: 'Cota não encontrada neste nível.' };
  const hit = dimRefAt(project, levelId, at, tol);
  if (!hit || !isElementRef(hit.ref)) return { error: 'Nenhuma parede, porta, janela ou feição perto do clique.' };
  const outra = d.refs?.[slot === 'a' ? 'b' : 'a'];
  if (isElementRef(outra) && outra.elementId === hit.ref.elementId && outra.feature === hit.ref.feature && (outra.index ?? 0) === (hit.ref.index ?? 0) && outra.line === hit.ref.line) {
    return { error: 'A outra ponta já usa esta feição.' };
  }
  return { commands: [{ type: 'updateDimension', ...vista, id: dimId, patch: { refs: { ...(d.refs ?? {}), [slot]: hit.ref } } }] };
}

/** Nome da feição para a alça de troca de referência (lido pelo usuário, em português). */
export function dimElementRefLabel(r: DimensionElementRef): string {
  const n = (r.index ?? 0) + 1;
  switch (r.feature) {
    case 'wall-axis-a': return 'Eixo (início)';
    case 'wall-axis-b': return 'Eixo (fim)';
    case 'wall-face-lo': return `Face 1 (${r.index === 1 ? 'fim' : 'início'})`;
    case 'wall-face-hi': return `Face 2 (${r.index === 1 ? 'fim' : 'início'})`;
    case 'opening-edge-a': return 'Borda inicial da esquadria';
    case 'opening-edge-b': return 'Borda final da esquadria';
    case 'opening-center': return 'Centro da esquadria';
    case 'wall-line': return ({ 'face-hi': 'Face 2', 'face-lo': 'Face 1', axis: 'Eixo', 'core-hi': 'Núcleo 2', 'core-lo': 'Núcleo 1' } as const)[r.line ?? 'axis'];
    case 'vertex': return `Vértice ${n}`;
    case 'edge': return `Aresta ${n}`;
  }
}

const sameRef = (x: DimensionElementRef, y: DimensionElementRef): boolean =>
  x.elementId === y.elementId && x.feature === y.feature && (x.index ?? 0) === (y.index ?? 0) && x.line === y.line;

/**
 * Alternativas de referência de uma ponta permanente: as feições do próprio elemento da ponta (de parede, a parede
 * inteira; de esquadria, a parede hospedeira com as aberturas dela). Sem elemento, sem alternativa.
 */
export function endAltOf(project: Project, vista: CotaVista, d: Dimension, which: 'a' | 'b', ref: DimensionElementRef | undefined): DimEnd['alt'] {
  if (!ref) return undefined;
  const el = project.elements[ref.elementId];
  if (!el) return undefined;
  const base = isOpening(el) ? project.elements[el.hostId] : el;
  if (!base) return undefined;
  const options = ref.feature === 'wall-line'
    ? (['face-hi', 'face-lo', 'axis', 'core-hi', 'core-lo'] as const).map((line): DimensionElementRef => ({ ...ref, line }))
    : dimRefCandidates(project, base).map((c) => c.ref);
  const current = options.findIndex((o) => sameRef(o, ref));
  if (current < 0 || options.length < 2) return undefined;
  return {
    options,
    current,
    apply: (next) => [{ type: 'updateDimension', ...vista, id: d.id, patch: { refs: { ...(d.refs ?? {}), [which]: next } } }],
  };
}

/** Cota permanente selecionada: o id dela e a vista (nível ou planta de área) em que mora. */
export interface PermanentDimSubject extends CotaVista {
  dimId: Id;
}

/** Id do provedor (compõe a chave da cota temporária: `dimension:<id>`). */
export const PERMANENT_DIM_ID = 'dimension';

/**
 * Cota permanente selecionada (planta de piso ou planta de área): mesmas cotas dinâmicas das paredes e esquadrias, para
 * que a edição do valor use o mesmo caminho (`drivenEditCommands`) e a mesma interface (`DimValueEditor`). Cada ponta
 * ligada a um elemento ganha as alternativas de feição (alça de troca).
 */
export const permanentDimProvider: DimProvider<PermanentDimSubject> = {
  id: PERMANENT_DIM_ID,

  compute(ctx: DimContext, subject: PermanentDimSubject): TempDim[] {
    const vista: CotaVista = subject.planId ? { levelId: subject.levelId, planId: subject.planId } : { levelId: subject.levelId };
    const d = dimsDaVista(ctx.project, vista).find((x) => x.id === subject.dimId);
    if (!d || d.angular) return [];
    const pts = dimensionPoints(ctx.project, d);
    const end = (at: { x: number; y: number }, which: 'a' | 'b'): DimEnd => {
      const ref = d.refs?.[which];
      const alt = endAltOf(ctx.project, vista, d, which, isElementRef(ref) ? ref : undefined);
      // Com alternativas, a ponta não usa `options` de cota dinâmica de parede/esquadria (que ficam vazias aqui).
      return alt
        ? { at, slot: which, kind: 'wall', current: 'axis', options: [], alt }
        : { at, slot: which, kind: 'wall', current: 'axis', options: ['axis'] };
    };
    return [
      {
        key: `${PERMANENT_DIM_ID}:${d.id}`,
        a: pts.a,
        b: pts.b,
        offset: d.offset,
        value: dimensionValue(ctx.project, d),
        quantity: 'length',
        ends: [end(pts.a, 'a'), end(pts.b, 'b')],
        edit: (valor: number): DimEditResult => {
          const r = drivenEditCommands(ctx.project, d, valor);
          if (!r.ok) return { error: r.reason };
          return { commands: r.commands as Command[] };
        },
      },
    ];
  },

  selectionSubject(project: Project, selectionId: Id, levelId?: Id): PermanentDimSubject | null {
    if (!levelId) return null;
    const vista = vistaDaCota(project, levelId, selectionId);
    return vista ? { dimId: selectionId, ...vista } : null;
  },
};
