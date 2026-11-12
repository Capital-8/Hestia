import { annotationIdsWithHiddenHostInView, openingHeight, openingTypeById, angularDimensionGeometry, dimensionFormatStyle, dimensionGeometry, dimensionPoints, dimensionStyleFor, dimensionText, isOpening, isWall, floorViewId, planViewOf, unitsOf, viewAnnotationsOf, wallHeight, wallType, type Dimension, type DimensionStyle, type DimTick, type ElementTag, type Id, type Project } from '@hestia/model';
import { resolveAngularDimension } from '@hestia/engine';
import type { DxfPoint } from './dxf.ts';
import type { DxfTextEntity } from './dxfDoc.ts';

/** Camadas das anotações da planta (decisão 0019): cotas em LINE e TEXT; textos livres em TEXT. */
export const DXF_LAYER_COTAS = 'COTAS';
export const DXF_LAYER_TEXTOS = 'TEXTOS';
export const DXF_LAYER_DETALHE = 'DETALHE';
export const DXF_LAYER_ETIQUETAS = 'ETIQUETAS';

export interface DxfNoteText {
  at: DxfPoint;
  text: string;
  /** Altura em metros de desenho (já na escala da vista). */
  height: number;
  /** Graus, anti-horário. */
  rotation: number;
  layer: string;
}

/** Anotações do nível para o DXF: linhas de cota (camada `COTAS`) e textos (`COTAS` para o valor, `TEXTOS` para o livre). */
export interface DxfNotes {
  lines: Array<[DxfPoint, DxfPoint]>;
  texts: DxfNoteText[];
  otherLines?: Array<{ a: DxfPoint; b: DxfPoint; layer: string }>;
  regions?: DxfPoint[][];
}

/** Marcas de ponta da cota no DXF (traço/ponto/seta), na escala da vista. Exportada para o DXF do corte/elevação. */
export function dimensionMarks(a: DxfPoint, b: DxfPoint, slash: Array<[DxfPoint, DxfPoint]>, style: DimTick | undefined, mPerMm: number): Array<[DxfPoint, DxfPoint]> {
  if (!style || style === 'slash') return slash;
  const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len; const uy = dy / len; const nx = -uy; const ny = ux;
  // `arrow-open`/`arrow-filled` saem como seta de duas linhas no DXF (o preenchimento é do desenho na tela).
  const r = (style === 'dot' ? 1.2 : 2.5) * mPerMm;
  if (style === 'arrow' || style === 'arrow-open' || style === 'arrow-filled') return [a, b].flatMap((tip, i) => {
    const inward = i === 0 ? 1 : -1;
    return [-1, 1].map((side): [DxfPoint, DxfPoint] => [tip, { x: tip.x + ux * inward * r + nx * r * 0.45 * side, y: tip.y + uy * inward * r + ny * r * 0.45 * side }]);
  });
  const circles = [a, b].flatMap((c) => Array.from({ length: 16 }, (_, i) => {
    const j = (i + 1) % 16;
    return [{ x: c.x + Math.cos(i * Math.PI / 8) * r, y: c.y + Math.sin(i * Math.PI / 8) * r }, { x: c.x + Math.cos(j * Math.PI / 8) * r, y: c.y + Math.sin(j * Math.PI / 8) * r }] as [DxfPoint, DxfPoint];
  }));
  return circles;
}

/**
 * Cotas de uma vista no DXF, com o estilo da família de cada cota (ou o global) e na escala da vista: as mesmas folgas,
 * marcas e convenção de leitura do desenho, e o valor formatado pela família. Geometria em metros de desenho. `levelId`
 * só serve às cotas angulares (a referência de parede da planta); no corte/elevação a geometria já vem resolvida.
 */
export function dimensionLinesDxfOf(
  p: Project,
  levelId: Id | null,
  dims: readonly Dimension[],
  scale: number,
  out: DxfNotes,
): void {
  const mPerMm = scale / 1000;
  const units = unitsOf(p);
  out.otherLines ??= [];
  const styleOf = (d: Dimension): DimensionStyle => dimensionStyleFor(p.settings, d);
  for (const d of dims) {
    const style = styleOf(d);
    const textMm = d.textHeight ?? style.textHeight;
    const value = dimensionText(p, d, units, dimensionFormatStyle(style));
    if (d.angular) {
      const rd = levelId ? resolveAngularDimension(p, levelId, d) : d;
      const g = angularDimensionGeometry(rd);
      if (!g) continue;
      for (let i = 1; i < g.arc.length; i++) out.lines.push([g.arc[i - 1]!, g.arc[i]!]);
      out.lines.push(...g.extensions, ...g.ticks);
      out.texts.push({ at: d.textAt ?? g.textAt, text: value, height: textMm * mPerMm, rotation: g.textRotation, layer: DXF_LAYER_COTAS });
      continue;
    }
    const { a, b } = dimensionPoints(p, d);
    const g = dimensionGeometry(a, b, d.offset, mPerMm, textMm, d.textAt, {
      extensionGapMm: style.extensionGap,
      extensionOvershootMm: style.extensionOvershoot,
      tickHalfMm: style.tickSize / 2,
      textGapMm: style.textGap,
      centered: style.textPlacement === 'centered',
      readConvention: style.readConvention,
    });
    out.lines.push(g.line, ...g.extensions, ...dimensionMarks(g.line[0], g.line[1], g.ticks, d.tickStyle ?? style.tick, mPerMm));
    if (d.textAt && Math.hypot(d.textAt.x - g.textAt.x, d.textAt.y - g.textAt.y) > 0.002) {
      out.otherLines!.push({ a: { x: (g.line[0].x + g.line[1].x) / 2, y: (g.line[0].y + g.line[1].y) / 2 }, b: d.textAt, layer: DXF_LAYER_COTAS });
    }
    out.texts.push({ at: d.textAt ?? g.textAt, text: value, height: textMm * mPerMm, rotation: g.textRotation, layer: DXF_LAYER_COTAS });
  }
}

/** Texto de uma etiqueta de elemento (o mesmo valor da tela), ou vazio quando o hóspede sumiu. Planta e corte/elevação. */
export function tagValueText(p: Project, tag: ElementTag): string {
  const e = p.elements[tag.hostId];
  if (!e) return '';
  const type = e.kind === 'wall' ? p.wallTypes[e.typeId]
    : e.kind === 'door' || e.kind === 'window' ? openingTypeById(p, e.typeId)
    : e.kind === 'floor' ? p.floorTypes[e.typeId]
    : e.kind === 'slab' ? p.slabTypes[e.typeId]
    : e.kind === 'ceiling' ? p.ceilingTypes[e.typeId]
    : e.kind === 'roof' ? p.roofTypes[e.typeId]
    : e.kind === 'stair' ? p.stairTypes[e.typeId] : undefined;
  const tagHost = isOpening(e) ? p.elements[e.hostId] : undefined;
  const tagLevelId = 'levelId' in e ? e.levelId : tagHost && 'levelId' in tagHost ? tagHost.levelId : null;
  return tag.property === 'type' ? (type && 'code' in type ? type.code : '') || (type && 'name' in type ? type.name : '') || e.kind
    : tag.property === 'name' ? e.kind === 'room' ? e.name : type && 'name' in type ? type.name : e.kind
    : tag.property === 'mark' ? ('mark' in e ? e.mark : '')
    : tag.property === 'level' ? p.levels.find((l) => l.id === tagLevelId)?.name ?? ''
    : tag.property === 'width' ? isOpening(e) ? `${(openingTypeById(p, e.typeId)?.width ?? 0) * 100} cm` : isWall(e) ? `${wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0) * 100} cm` : ''
    : isOpening(e) ? (() => { const ot = openingTypeById(p, e.typeId); return `${ot ? openingHeight(ot, e) : 0} m`; })() : isWall(e) ? `${wallHeight(p, e)} m` : '';
}

/**
 * Anotações da planta de piso do nível em metros de desenho. `scale` é o denominador da vista (1:100 → 100): 1 mm de
 * papel = scale/1000 m. Quem chama decide a visibilidade da categoria (a geometria sai inteira aqui). Converte o nível
 * para a vista de piso uma vez, aqui, e segue por `viewNotesDxfOf` (`outOfRange`: ver lá).
 */
export function notesDxfOf(p: Project, levelId: Id, scale: number, outOfRange?: ReadonlySet<Id>): DxfNotes {
  return viewNotesDxfOf(p, floorViewId(levelId), scale, outOfRange);
}

/**
 * Anotações que uma vista de planta DESENHA (`viewAnnotationsOf`, já com a herança da planta de área), em metros de
 * desenho. Vista inexistente: sem nada. A referência de parede das cotas angulares é a do nível da vista.
 *
 * Etapa 7 da regra 4.5: a cota e a etiqueta cujo elemento não aparece na vista (`hidden` da vista, categoria, camada do
 * perfil e, em `outOfRange`, o que o chamador sabe estar fora do intervalo) não saem. O elemento em si segue a decisão
 * de quem monta a geometria (o DXF não honra `hidden.elements`).
 */
export function viewNotesDxfOf(p: Project, viewId: Id, scale: number, outOfRange?: ReadonlySet<Id>): DxfNotes {
  const mPerMm = scale / 1000;
  const out: DxfNotes = { lines: [], texts: [], otherLines: [] };
  const all = viewAnnotationsOf(p, viewId);
  const presas = annotationIdsWithHiddenHostInView(p, viewId, { outOfRange });
  const notes = presas.size === 0 ? all : { ...all, dimensions: all.dimensions.filter((d) => !presas.has(d.id)), tags: all.tags.filter((t) => !presas.has(t.id)) };
  dimensionLinesDxfOf(p, planViewOf(p, viewId)?.levelId ?? null, notes.dimensions, scale, out);
  for (const t of notes.texts) {
    if (t.leader) for (let i = 1; i < t.leader.length; i++) out.otherLines!.push({ a: t.leader[i - 1]!, b: t.leader[i]!, layer: DXF_LAYER_TEXTOS });
    out.texts.push({ at: t.at, text: t.text, height: t.height * mPerMm, rotation: t.rotation, layer: DXF_LAYER_TEXTOS });
  }
  for (const line of notes.detailLines) out.otherLines!.push({ a: line.a, b: line.b, layer: DXF_LAYER_DETALHE });
  for (const tag of notes.tags) {
    if (!p.elements[tag.hostId]) continue;
    const value = tagValueText(p, tag);
    if (tag.leader) {
      const e = p.elements[tag.hostId]!;
      const host = isOpening(e) ? p.elements[e.hostId] : e;
      const anchor = host ? isWall(host) ? { x: (host.a.x + host.b.x) / 2, y: (host.a.y + host.b.y) / 2 } : 'point' in host ? host.point : 'boundary' in host && host.boundary.length ? { x: host.boundary.reduce((s, q) => s + q.x, 0) / host.boundary.length, y: host.boundary.reduce((s, q) => s + q.y, 0) / host.boundary.length } : null : null;
      if (anchor) out.otherLines!.push({ a: anchor, b: tag.at, layer: DXF_LAYER_ETIQUETAS });
    }
    if (value) out.texts.push({ at: tag.at, text: value, height: 1.6 * mPerMm, rotation: tag.orientation === 'vertical' ? 90 : 0, layer: DXF_LAYER_ETIQUETAS });
  }
  return { ...out, regions: notes.detailRegions.map((r) => r.boundary) };
}

/**
 * Texto para o grupo 1 do DXF: o que não é ASCII visível vira `\U+XXXX`. O AutoCAD lê o R2000 (AC1015) em ANSI (com
 * `$DWGCODEPAGE` ANSI_1252), então o UTF-8 cru sairia como dois caracteres por acento; e uma quebra de linha no valor
 * partiria o par código/valor do arquivo. O `\U+XXXX` é lido por todas as versões do AutoCAD.
 */
export function dxfEscapeText(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, (ch) => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

/** Entidade TEXT do documento R2000 para uma anotação: centrada no ponto (72 = 1 e 73 = 2), o escritor escapa o texto. */
export function dxfTextEntity(t: DxfNoteText): DxfTextEntity {
  return { kind: 'text', layer: t.layer, at: t.at, height: t.height, text: t.text, rotation: t.rotation, centered: true };
}
