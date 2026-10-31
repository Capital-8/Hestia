import type { DetailLine, DetailRegion, Dimension, ElementTag, Id, SectionView, TextNote } from './types.ts';

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

/** Anotações efetivas da vista (nunca devolve undefined). */
export function sectionAnnotationsOf(v: Pick<SectionView, 'annotations'> | undefined): SectionAnnotations {
  return v?.annotations ?? EMPTY_SECTION_ANNOTATIONS;
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
