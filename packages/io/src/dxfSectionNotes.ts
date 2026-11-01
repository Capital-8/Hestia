import {
  sectionAnnotationsOf,
  type Dimension,
  type Id,
  type Project,
  type TextNote,
} from '@hestia/model';
import {
  DXF_LAYER_DETALHE,
  DXF_LAYER_ETIQUETAS,
  DXF_LAYER_TEXTOS,
  dimensionLinesDxfOf,
  tagValueText,
  type DxfNotes,
} from './dxfNotes.ts';

/**
 * DXF das anotações de uma vista de corte/elevação, no plano `(t,z)` da vista: cotas na camada `COTAS`, textos livres em
 * `TEXTOS`, detalhes em `DETALHE` e etiquetas em `ETIQUETAS` — as mesmas camadas da planta (decisão 0019), com o mesmo
 * estilo/família e a mesma escala. Antes desta rodada o DXF do corte saía sem nenhuma anotação.
 *
 * As cotas do corte não resolvem `refs` (referências de parede da planta não têm sentido em `(t,z)`): as pontas gravadas
 * valem como estão, a mesma regra do desenho em `render/src/section/annotations.ts`.
 */
function withoutRefs(dims: readonly Dimension[]): Dimension[] {
  return dims.map((d) => {
    const { refs: _refs, ...rest } = d;
    void _refs;
    return rest;
  });
}

/** Texto da etiqueta na vista: valor do modelo, no ponto e na orientação gravados; sem líder (o líder é da planta). */
function tagTextsOf(p: Project, tags: readonly { hostId: Id; at: { x: number; y: number }; orientation?: 'horizontal' | 'vertical' }[], out: DxfNotes, mPerMm: number): void {
  for (const tag of tags) {
    const value = tagValueText(p, tag as never);
    if (!value) continue;
    out.texts.push({ at: tag.at, text: value, height: 1.6 * mPerMm, rotation: tag.orientation === 'vertical' ? 90 : 0, layer: DXF_LAYER_ETIQUETAS });
  }
}

/** Altura do texto livre da vista em mm de papel (padrão 2,5 como no desenho). */
const textHeightMm = (t: TextNote): number => (t.height > 0 ? t.height : 2.5);

/** Anotações da vista de corte/elevação para o DXF; `undefined` quando a vista não tem nenhuma. */
export function sectionNotesDxfOf(p: Project, sectionId: Id, scale: number): DxfNotes | undefined {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) return undefined;
  const annotations = sectionAnnotationsOf(view);
  const has = annotations.dimensions.length + annotations.texts.length + annotations.detailLines.length
    + annotations.detailRegions.length + annotations.tags.length;
  if (has === 0) return undefined;
  const mPerMm = scale / 1000;
  const out: DxfNotes = { lines: [], texts: [], otherLines: [] };
  // Cotas: o mesmo caminho da planta, com `levelId = null` (a angular usa a geometria gravada e as pontas são as guardadas,
  // sem resolver refs de parede da planta — que não têm sentido em (t,z)).
  dimensionLinesDxfOf(p, null, withoutRefs(annotations.dimensions), scale, out);
  for (const t of annotations.texts) {
    if (t.leader) for (let i = 1; i < t.leader.length; i++) out.otherLines!.push({ a: t.leader[i - 1]!, b: t.leader[i]!, layer: DXF_LAYER_TEXTOS });
    out.texts.push({ at: t.at, text: t.text, height: textHeightMm(t) * mPerMm, rotation: t.rotation, layer: DXF_LAYER_TEXTOS });
  }
  for (const line of annotations.detailLines) out.otherLines!.push({ a: line.a, b: line.b, layer: DXF_LAYER_DETALHE });
  tagTextsOf(p, annotations.tags, out, mPerMm);
  return { ...out, regions: annotations.detailRegions.map((r) => r.boundary) };
}
