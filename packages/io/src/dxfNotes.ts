import { openingHeight, openingTypeById, angularDimensionGeometry, dimensionGeometry, dimensionPoints, dimensionText, DIM_TEXT_MM, isOpening, isWall, levelDimensions, levelTexts, unitsOf, wallHeight, wallType, type Id, type Project } from '@hestia/model';
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

function dimensionMarks(a: DxfPoint, b: DxfPoint, slash: Array<[DxfPoint, DxfPoint]>, style: 'slash' | 'arrow' | 'dot' | undefined, mPerMm: number): Array<[DxfPoint, DxfPoint]> {
  if (!style || style === 'slash') return slash;
  const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len; const uy = dy / len; const nx = -uy; const ny = ux;
  const r = (style === 'dot' ? 1.2 : 2.5) * mPerMm;
  if (style === 'arrow') return [a, b].flatMap((tip, i) => {
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
 * Anotações do nível em metros de desenho. `scale` é o denominador da vista (1:100 → 100): 1 mm de papel = scale/1000 m.
 * Quem chama decide a visibilidade da categoria (a geometria sai inteira aqui).
 */
export function notesDxfOf(p: Project, levelId: Id, scale: number): DxfNotes {
  const mPerMm = scale / 1000;
  const lines: Array<[DxfPoint, DxfPoint]> = [];
  const texts: DxfNoteText[] = [];
  const otherLines: Array<{ a: DxfPoint; b: DxfPoint; layer: string }> = [];
  for (const d of levelDimensions(p, levelId)) {
    if (d.angular) {
      const rd = resolveAngularDimension(p, levelId, d);
      const g = angularDimensionGeometry(rd);
      if (!g) continue;
      for (let i = 1; i < g.arc.length; i++) lines.push([g.arc[i - 1]!, g.arc[i]!]);
      lines.push(...g.extensions, ...g.ticks);
      texts.push({ at: rd.textAt ?? g.textAt, text: dimensionText(p, rd, unitsOf(p)), height: (rd.textHeight ?? DIM_TEXT_MM) * mPerMm, rotation: g.textRotation, layer: DXF_LAYER_COTAS });
      continue;
    }
    const { a, b } = dimensionPoints(p, d);
    const g = dimensionGeometry(a, b, d.offset, mPerMm);
    lines.push(g.line, ...g.extensions, ...dimensionMarks(g.line[0], g.line[1], g.ticks, d.tickStyle, mPerMm));
    if (d.textAt && Math.hypot(d.textAt.x - g.textAt.x, d.textAt.y - g.textAt.y) > 0.002) otherLines.push({ a: { x: (g.line[0].x + g.line[1].x) / 2, y: (g.line[0].y + g.line[1].y) / 2 }, b: d.textAt, layer: DXF_LAYER_COTAS });
    texts.push({ at: d.textAt ?? g.textAt, text: dimensionText(p, d, unitsOf(p)), height: (d.textHeight ?? DIM_TEXT_MM) * mPerMm, rotation: g.textRotation, layer: DXF_LAYER_COTAS });
  }
  for (const t of levelTexts(p, levelId)) {
    if (t.leader) for (let i = 1; i < t.leader.length; i++) otherLines.push({ a: t.leader[i - 1]!, b: t.leader[i]!, layer: DXF_LAYER_TEXTOS });
    texts.push({ at: t.at, text: t.text, height: t.height * mPerMm, rotation: t.rotation, layer: DXF_LAYER_TEXTOS });
  }
  const level = p.levels.find((l) => l.id === levelId);
  for (const line of level?.detailLines ?? []) otherLines.push({ a: line.a, b: line.b, layer: DXF_LAYER_DETALHE });
  for (const tag of level?.tags ?? []) {
    const e = p.elements[tag.hostId];
    if (!e) continue;
    const type = e.kind === 'wall' ? p.wallTypes[e.typeId]
      : e.kind === 'door' || e.kind === 'window' ? openingTypeById(p, e.typeId)
      : e.kind === 'floor' ? p.floorTypes[e.typeId]
      : e.kind === 'slab' ? p.slabTypes[e.typeId]
      : e.kind === 'ceiling' ? p.ceilingTypes[e.typeId]
      : e.kind === 'roof' ? p.roofTypes[e.typeId]
      : e.kind === 'stair' ? p.stairTypes[e.typeId] : undefined;
    const tagHost = isOpening(e) ? p.elements[e.hostId] : undefined;
    const tagLevelId = 'levelId' in e ? e.levelId : tagHost && 'levelId' in tagHost ? tagHost.levelId : null;
    const value = tag.property === 'type' ? (type && 'code' in type ? type.code : '') || (type && 'name' in type ? type.name : '') || e.kind
      : tag.property === 'name' ? e.kind === 'room' ? e.name : type && 'name' in type ? type.name : e.kind
      : tag.property === 'mark' ? ('mark' in e ? e.mark : '')
      : tag.property === 'level' ? p.levels.find((l) => l.id === tagLevelId)?.name ?? ''
      : tag.property === 'width' ? isOpening(e) ? `${(openingTypeById(p, e.typeId)?.width ?? 0) * 100} cm` : isWall(e) ? `${wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0) * 100} cm` : ''
      : isOpening(e) ? (() => { const ot = openingTypeById(p, e.typeId); return `${ot ? openingHeight(ot, e) : 0} m`; })() : isWall(e) ? `${wallHeight(p, e)} m` : '';
    if (tag.leader) {
      const host = isOpening(e) ? p.elements[e.hostId] : e;
      const anchor = host ? isWall(host) ? { x: (host.a.x + host.b.x) / 2, y: (host.a.y + host.b.y) / 2 } : 'point' in host ? host.point : 'boundary' in host && host.boundary.length ? { x: host.boundary.reduce((s, q) => s + q.x, 0) / host.boundary.length, y: host.boundary.reduce((s, q) => s + q.y, 0) / host.boundary.length } : null : null;
      if (anchor) otherLines.push({ a: anchor, b: tag.at, layer: DXF_LAYER_ETIQUETAS });
    }
    if (value) texts.push({ at: tag.at, text: value, height: 1.6 * mPerMm, rotation: tag.orientation === 'vertical' ? 90 : 0, layer: DXF_LAYER_ETIQUETAS });
  }
  return { lines, texts, otherLines, regions: (level?.detailRegions ?? []).map((r) => r.boundary) };
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
