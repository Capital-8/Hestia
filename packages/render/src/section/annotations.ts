import { dimensionStyleOf, type AreaPlanAnnotations, type Dimension, type DimensionStyle, type Id, type Project, type SectionAnnotations } from '@hestia/model';
import { noteOps, type NoteOps } from '../plan/notes.ts';
import { defaultPaint, type PlanPaint } from '../plan/style.ts';
import type { SectionInput } from './build.ts';

/**
 * Anotações da vista de corte/elevação (cotas, textos, linhas/regiões de detalhe e etiquetas).
 *
 * A geometria guardada nas anotações está no plano da vista: `x` é a distância `t` ao longo do corte e `y` é a cota `z`
 * (não são coordenadas `(x,y)` da planta). Por isso as anotações da seção NÃO podem cair no desenho da planta: elas só
 * entram aqui, a partir de `SectionInput.annotations`.
 *
 * Todas as medidas de papel (folga da cota, corpo do texto, marcas) usam a escala da vista quando informada em
 * `SectionAnnotationOptions.scale`; a vista de corte ainda não guarda escala própria, então o padrão continua `100`
 * (desenho estável, independente do zoom/pan). As unidades do valor continuam
 * vindo do projeto (por `noteOps`).
 */
export const SECTION_ANNOTATION_SCALE = 100;

/**
 * Chave de referência inexistente no projeto. As cotas angulares guardam `refA`/`refB` de paredes da planta; no corte
 * essas referências não têm sentido (o espaço é `(t,z)`) e não podem ser reencontradas. Trocar por esta chave mantém a
 * geometria angular já gravada, sem que `resolveAngularDimension` tente resolvê-la em planta.
 */
const SECTION_ANGULAR_REF = 'section:annotation';

const listOf = <T>(list: readonly T[] | undefined): readonly T[] => list ?? [];

/** A vista tem alguma anotação para desenhar? Sem nenhuma, o desenho do corte fica exatamente o de antes. */
export function hasSectionAnnotations(a: SectionAnnotations | undefined): boolean {
  if (!a) return false;
  return (
    listOf(a.dimensions).length > 0 ||
    listOf(a.texts).length > 0 ||
    listOf(a.detailLines).length > 0 ||
    listOf(a.detailRegions).length > 0 ||
    listOf(a.tags).length > 0
  );
}

/**
 * Nível de referência da vista: o mais próximo da primeira cota (pela cota `z` do meio dela) ou, sem cotas, o primeiro
 * nível do projeto. Serve só para o `noteOps` (etiquetas e resolução angular); a geometria desenhada continua sendo a da
 * anotação, no plano `(t,z)`.
 */
function referenceLevel(p: Project, annotations: SectionAnnotations): Id | null {
  const levels = p.levels;
  if (levels.length === 0) return null;
  const first = listOf(annotations.dimensions)[0];
  if (!first) return levels[0]!.id;
  const z = (first.a.y + first.b.y) / 2;
  let best = levels[0]!;
  for (const level of levels) {
    if (Math.abs(level.elevation - z) < Math.abs(best.elevation - z)) best = level;
  }
  return best.id;
}

/**
 * Cotas da seção sem as referências de parede da planta (`refs`) e com as referências angulares neutralizadas. Sem isso,
 * `dimensionPoints`/`resolveAngularDimension` puxariam as pontas para paredes em `(x,y)` e a cota sairia fora do plano
 * `(t,z)`. O resto da cota (pontos, deslocamento, texto, estilo) é preservado.
 */
function sectionDimensions(list: readonly Dimension[] | undefined): Dimension[] {
  return listOf(list).map((d): Dimension => {
    if (!d.refs && !d.angular) return d;
    const { refs: _refs, ...rest } = d;
    void _refs;
    if (!d.angular) return rest;
    return { ...rest, angular: { ...d.angular, refA: SECTION_ANGULAR_REF, refB: SECTION_ANGULAR_REF } };
  });
}

/**
 * Ops de desenho das anotações da vista de corte/elevação, reaproveitando `noteOps` da planta. O par `(x,y)` das
 * anotações é interpretado como `(t,z)`: distância ao longo do corte e cota. Só usa `input.annotations` — nunca as
 * cotas/textos/etiquetas do nível — e devolve ops vazias quando não há anotação nenhuma.
 */
/** Opções do desenho das anotações do corte/elevação. */
export interface SectionAnnotationOptions {
  /** Escala de impressão (1:n) da vista; ausente usa `SECTION_ANNOTATION_SCALE`. */
  scale?: number;
  /** Estilo de cotas; ausente usa o do projeto (`dimensionStyleOf(settings)`). */
  style?: DimensionStyle;
  /** Cota sob o cursor (ausente usa `input.highlight.hover`). */
  hoverId?: Id | null;
  /** Anotações selecionadas (ausente usa `input.highlight.selection`). */
  selectedIds?: readonly Id[];
}

export function sectionAnnotationOps(input: SectionInput, opts: SectionAnnotationOptions = {}): NoteOps {
  const empty: NoteOps = { fills: [], strokes: [], labels: [] };
  const annotations = input.annotations;
  if (!hasSectionAnnotations(annotations)) return empty;
  const a = annotations!;
  const levelId = referenceLevel(input.project, a);
  const dimensions = sectionDimensions(a.dimensions);
  // A etiqueta de elemento é associativa: o texto vem do modelo pelo `hostId`. O líder, porém, liga o ponto do elemento
  // em PLANTA (`x,y`) ao texto em `(t,z)`; sem uma projeção do elemento para o plano do corte, o traço sairia errado.
  // A etiqueta continua no lugar certo, só sem líder nesta vista.
  const tags = listOf(a.tags).map((tag) => (tag.leader ? { ...tag, leader: false } : tag));
  const notes: AreaPlanAnnotations = {
    dimensions,
    texts: [...listOf(a.texts)],
    detailLines: [...listOf(a.detailLines)],
    detailRegions: [...listOf(a.detailRegions)],
    tags,
  };
  // Projeto derivado só para as etiquetas: o `noteOps` lê `level.tags`, então as etiquetas da seção tomam o lugar das do
  // nível de referência (sem somar as da planta). Sem nível, nenhuma etiqueta é desenhada.
  const p: Project = levelId
    ? { ...input.project, levels: input.project.levels.map((level) => (level.id === levelId ? { ...level, tags } : level)) }
    : input.project;
  const paint: PlanPaint = { ...defaultPaint('annotation', input.viewport.zoom), color: input.theme.ink };
  const look = {
    ink: input.theme.ink,
    select: input.theme.select,
    hoverColor: input.theme.selectHover,
    paper: input.theme.bg,
    selection: [...(opts.selectedIds ?? input.highlight?.selection ?? [])],
    hover: opts.hoverId === undefined ? (input.highlight?.hover ?? null) : opts.hoverId,
    dimStyle: opts.style ?? dimensionStyleOf(input.project.settings),
  };
  // `annotations` sempre definido: além de substituir as do nível, impede as linhas de separação de ambiente (que são da
  // planta) de entrarem no corte. Sem nível de referência (projeto sem níveis), as cotas/textos/detalhes ainda saem;
  // só as etiquetas ficam de fora, porque dependem do nível para serem encontradas.
  return noteOps(p, levelId ?? '', paint, look, opts.scale && opts.scale > 0 ? opts.scale : SECTION_ANNOTATION_SCALE, input.viewport, notes);
}
