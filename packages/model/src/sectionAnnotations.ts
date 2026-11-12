import type { DetailLine, DetailRegion, Dimension, ElementTag, Id, SectionView, TextNote } from './types.ts';

/**
 * Ponta associativa de uma cota de corte/elevação: um ponto de captura de um elemento (parede, laje, escada, guarda-corpo...) na vista.
 * `ord` é a posição do ponto entre os do mesmo tipo (`kind`) do elemento, na ordem em que a vista os gera (a ordem não muda quando o
 * elemento só é movido ou redimensionado). O valor de `a`/`b` da cota é a última leitura; a vista refaz a leitura a cada mudança.
 */
export interface SectionDimRef {
  hostId: Id;
  kind: 'endpoint' | 'midpoint';
  ord: number;
}

/** Quem recalcula as pontas associativas (o app liga; precisa do resultado do corte, do índice de captura e do guarda-corpo). */
export type SectionDimensionResolver = (view: Pick<SectionView, 'annotations'> & { id?: Id }, annotations: SectionAnnotations) => SectionAnnotations | null;
let sectionDimensionResolver: SectionDimensionResolver | null = null;

export function setSectionDimensionResolver(f: SectionDimensionResolver | null): void {
  sectionDimensionResolver = f;
}

/**
 * Anotações de uma vista de corte/elevação. São da vista, não do nível: a mesma cota existe só naquele corte e na
 * prancha onde ele for colocado. Reaproveita os mesmos tipos geométricos da planta.
 */
export interface SectionAnnotations {
  dimensions: Dimension[];
  texts: TextNote[];
  detailLines: DetailLine[];
  detailRegions: DetailRegion[];
  tags: ElementTag[];
}

export const EMPTY_SECTION_ANNOTATIONS: SectionAnnotations = {
  dimensions: [],
  texts: [],
  detailLines: [],
  detailRegions: [],
  tags: [],
};

/**
 * Anotações efetivas da vista (nunca devolve undefined). Cotas com ponta associativa (`secRefs`) saem com as pontas relidas da vista
 * atual: o desenho, a seleção, o DXF e a prancha leem todos por aqui.
 */
export function sectionAnnotationsOf(v: (Pick<SectionView, 'annotations'> & { id?: Id }) | undefined): SectionAnnotations {
  const a = v?.annotations ?? EMPTY_SECTION_ANNOTATIONS;
  if (!v || !sectionDimensionResolver || !a.dimensions.some((d) => d.secRefs)) return a;
  return sectionDimensionResolver(v, a) ?? a;
}

/** Normaliza listas e remove ids repetidos; devolve undefined quando não sobra nada. */
export function cleanSectionAnnotations(a: SectionAnnotations | undefined): SectionAnnotations | undefined {
  if (!a) return undefined;
  const unique = <T extends { id: Id }>(list: readonly T[]): T[] => {
    const out: T[] = [];
    const seen = new Set<Id>();
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  };
  const dimensions = unique(a.dimensions ?? []);
  const texts = unique(a.texts ?? []);
  const detailLines = unique(a.detailLines ?? []);
  const detailRegions = unique(a.detailRegions ?? []);
  const tags = unique(a.tags ?? []);
  if (!dimensions.length && !texts.length && !detailLines.length && !detailRegions.length && !tags.length) return undefined;
  return { dimensions, texts, detailLines, detailRegions, tags };
}
