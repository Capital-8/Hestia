import { add, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { DEFAULT_DIMENSION_STYLE, DIM_TEXT_MM, dimensionGeometry, type AngularDimensionGeometry, type Dimension, type DimensionGeometry, type DimensionStyle, type DimTick } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { LANE_HEIGHTS, valorCabeNoTrecho } from './dimLabels.ts';
import { zoomAtinge } from './limiares.ts';
import { espessuraVezes } from './espessura.ts';
import { noteLabel } from './tags.ts';
import type { Espessura, FillOp, LabelOp, StrokeOp } from './types.ts';

/**
 * Desenho UNIVERSAL das cotas (planta, planta de área, corte e elevação): estilo CAD (marcadores, linhas de extensão com
 * folga e ultrapassagem), texto legível, linha de chamada quando o valor não cabe e anti-sobreposição dos rótulos.
 * Tudo em mm de papel (`DimensionStyle`) × escala da vista; a geometria fica em metros no plano da vista.
 */

export interface DimOps {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

/** Uma cota pronta para desenhar: pontos medidos (ou a geometria angular) e o texto já formatado. */
export interface DimItem {
  d: Dimension;
  a: Vec2;
  b: Vec2;
  text: string;
  ang?: AngularDimensionGeometry;
}

export interface DimLayoutCtx {
  /** Escala de impressão (1:n) da vista. */
  scale: number;
  style?: DimensionStyle;
  /** Vista: decide "cabe no trecho" pelo zoom (e registra o limiar). Sem ela, vale a conta nominal. */
  v?: Viewport;
}

/** Largura média de um caractere do valor, em corpos da fonte (a mesma estimativa da seleção). */
const CARACTERE_EM = 0.6;
/** Altura da caixa do texto, em corpos da fonte. */
const ALTURA_EM = 1.25;
/** Respiro do texto em volta, em mm de papel (caixa de colisão). */
const RESPIRO_MM = 0.4;
/** Respiro da linha interrompida (cota 'centered'), em mm de papel. */
const QUEBRA_MM = 0.8;
/** Folga da máscara (fundo/halo) do texto, em mm de papel. */
const MASCARA_MM = 0.45;
/** Número de pistas (alturas) tentadas antes de deslocar lateralmente. */
const PISTAS = 4;

/** Estilo efetivo: padrão + projeto (`style`) + campos da própria cota. */
export function effectiveDimStyle(style: DimensionStyle | undefined, d: Dimension): DimensionStyle {
  const s = { ...DEFAULT_DIMENSION_STYLE, ...(style ?? {}) };
  const tick = (d.tickStyle ?? s.tick) as DimTick;
  return { ...s, tick, textHeight: d.textHeight ?? s.textHeight, unit: d.unit ?? s.unit, precision: d.precision ?? s.precision, prefix: d.prefix ?? s.prefix, suffix: d.suffix ?? s.suffix };
}

/**
 * Campos de formatação do estilo que valem como definidos pelo projeto: os iguais ao padrão não sobrepõem as unidades do
 * projeto (o padrão `precision: 2` não pode apagar as casas das unidades do projeto).
 */
export function styleFormatOf(style: DimensionStyle | undefined): Partial<Pick<DimensionStyle, 'unit' | 'precision' | 'prefix' | 'suffix'>> {
  if (!style) return {};
  const D = DEFAULT_DIMENSION_STYLE;
  return {
    ...(style.unit !== D.unit ? { unit: style.unit } : {}),
    ...(style.precision !== D.precision ? { precision: style.precision } : {}),
    ...(style.prefix !== D.prefix ? { prefix: style.prefix } : {}),
    ...(style.suffix !== D.suffix ? { suffix: style.suffix } : {}),
  };
}

/** Retângulo orientado do texto (centro, meia largura/altura e rotação em graus). */
export interface TextBox {
  c: Vec2;
  hw: number;
  hh: number;
  rot: number;
}

export interface DimLayout {
  item: DimItem;
  style: DimensionStyle;
  textMm: number;
  g?: DimensionGeometry;
  ang?: AngularDimensionGeometry;
  textAt: Vec2;
  rotation: number;
  /** Largura/altura do texto em metros. */
  w: number;
  h: number;
  /** O valor cabe no trecho entre as linhas de extensão. */
  fits: boolean;
  /** O texto foi afastado da posição padrão (linha de chamada). */
  moved: boolean;
  leader?: [Vec2, Vec2];
  box: TextBox;
}

export const boxCorners = (b: TextBox, grow = 0): Vec2[] => {
  const r = (b.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = b.hw + grow;
  const hh = b.hh + grow;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: b.c.x + x! * c - y! * s, y: b.c.y + x! * s + y! * c }));
};

function overlapBoxes(a: TextBox, b: TextBox): boolean {
  const pa = boxCorners(a);
  const pb = boxCorners(b);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const e = sub(poly[i + 1]!, poly[i]!);
      const ax = norm(perp(e));
      let minA = Infinity; let maxA = -Infinity; let minB = Infinity; let maxB = -Infinity;
      for (const p of pa) { const t = p.x * ax.x + p.y * ax.y; minA = Math.min(minA, t); maxA = Math.max(maxA, t); }
      for (const p of pb) { const t = p.x * ax.x + p.y * ax.y; minB = Math.min(minB, t); maxB = Math.max(maxB, t); }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

/** Ponto no referencial do retângulo (x ao longo do texto). */
function toLocal(b: TextBox, p: Vec2): Vec2 {
  const r = (-b.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - b.c.x;
  const dy = p.y - b.c.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** O segmento p–q cruza o retângulo (Liang–Barsky no referencial do texto)? */
function segmentHitsBox(p: Vec2, q: Vec2, b: TextBox): boolean {
  const a = toLocal(b, p);
  const e = toLocal(b, q);
  let t0 = 0; let t1 = 1;
  const d = sub(e, a);
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-d.x, a.x + b.hw) && clip(d.x, b.hw - a.x) && clip(-d.y, a.y + b.hh) && clip(d.y, b.hh - a.y) && t0 <= t1;
}

const laneHeight = (k: number): number => (k < LANE_HEIGHTS.length ? LANE_HEIGHTS[k]! : LANE_HEIGHTS[LANE_HEIGHTS.length - 1]! + 1.4 * (k - LANE_HEIGHTS.length + 1));

/** Ponto do contorno do retângulo mais próximo de `p` (a ponta da linha de chamada junto ao texto). */
function pontoNoContorno(b: TextBox, p: Vec2): Vec2 {
  const l = toLocal(b, p);
  const x = Math.max(-b.hw, Math.min(b.hw, l.x));
  const y = Math.max(-b.hh, Math.min(b.hh, l.y));
  const r = (b.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: b.c.x + x * c - y * s, y: b.c.y + x * s + y * c };
}

/**
 * Disposição das cotas de uma vista: posição do texto de cada uma, com linha de chamada quando o valor não cabe e
 * ANTI-SOBREPOSIÇÃO entre os rótulos (determinística: ordem pelo ponto médio e pelo id). Primeiro ficam os rótulos que
 * cabem e os fixos (angulares, `textAt` manual); depois os demais tentam, na ordem, a posição padrão, as pistas
 * alternadas de `LANE_HEIGHTS` (para fora da cota) e, por fim, deslocamentos laterais.
 */
export function layoutDimensions(items: readonly DimItem[], ctx: DimLayoutCtx): DimLayout[] {
  const mPerMm = ctx.scale / 1000;
  const layouts: DimLayout[] = items.map((item) => baseLayout(item, ctx, mPerMm));
  const order = [...layouts].sort((p, q) => {
    const mp = midOf(p); const mq = midOf(q);
    return mp.x - mq.x || mp.y - mq.y || (p.item.d.id < q.item.d.id ? -1 : p.item.d.id > q.item.d.id ? 1 : 0);
  });
  const placed: TextBox[] = [];
  const deferred: DimLayout[] = [];
  const livre = (b: TextBox): boolean => placed.every((o) => !overlapBoxes(grow(b, RESPIRO_MM * mPerMm), o));
  for (const l of order) {
    if (!l.g || l.item.d.textAt) { placed.push(l.box); continue; }
    if (l.fits && livre(l.box)) placed.push(l.box);
    else deferred.push(l);
  }
  for (const l of deferred) {
    const g = l.g!;
    if (!l.style.leaderWhenNoFit) { placed.push(l.box); continue; }
    const th = l.textMm * mPerMm;
    const gap = 1.5 * mPerMm;
    const [ta, tb] = g.line;
    const u = norm(sub(tb, ta));
    const out = mul(perp(u), l.item.d.offset >= 0 ? 1 : -1);
    const mid = mul(add(ta, tb), 0.5);
    const obstaculos = layouts.filter((o) => o !== l && o.g).map((o) => o.g!.line);
    const step = l.w / 2 + th;
    const tentativas: Array<[number, number]> = [];
    for (let k = 0; k < PISTAS; k++) tentativas.push([k, 0]);
    for (const m of [1, -1, 2, -2]) for (let k = 0; k < PISTAS; k++) tentativas.push([k, m]);
    for (let k = PISTAS; k < PISTAS + 4; k++) tentativas.push([k, 0]);
    let escolhida: TextBox | null = null;
    for (const [k, m] of tentativas) {
      const c = add(add(mid, mul(out, gap + th * laneHeight(k))), mul(u, m * step));
      const box: TextBox = { ...l.box, c };
      if (!livre(box)) continue;
      const g2 = grow(box, RESPIRO_MM * mPerMm);
      if (obstaculos.some(([p, q]) => segmentHitsBox(p, q, g2))) continue;
      escolhida = box;
      break;
    }
    const box = escolhida ?? { ...l.box, c: add(mid, mul(out, gap + th * laneHeight(PISTAS))) };
    l.box = box;
    l.textAt = box.c;
    l.moved = true;
    l.leader = [mid, pontoNoContorno(box, mid)];
    placed.push(box);
  }
  return layouts;
}

const grow = (b: TextBox, by: number): TextBox => ({ ...b, hw: b.hw + by, hh: b.hh + by });

function midOf(l: DimLayout): Vec2 {
  if (l.g) return mul(add(l.g.line[0], l.g.line[1]), 0.5);
  return l.item.ang?.textAt ?? l.item.a;
}

function baseLayout(item: DimItem, ctx: DimLayoutCtx, mPerMm: number): DimLayout {
  const d = item.d;
  const style = effectiveDimStyle(ctx.style, d);
  const textMm = style.textHeight > 0 ? style.textHeight : DIM_TEXT_MM;
  const w = Math.max(1, item.text.length) * textMm * CARACTERE_EM * mPerMm;
  const h = textMm * ALTURA_EM * mPerMm;
  if (item.ang) {
    const rotation = item.ang.textRotation;
    return { item, style, textMm, ang: item.ang, textAt: item.ang.textAt, rotation, w, h, fits: true, moved: false, box: { c: item.ang.textAt, hw: w / 2, hh: h / 2, rot: rotation } };
  }
  const centered = style.textPlacement === 'centered';
  const geomOpts = {
    extensionGapMm: style.extensionGap,
    extensionOvershootMm: style.extensionOvershoot,
    tickHalfMm: style.tickSize / 2,
    centered,
  };
  const base = dimensionGeometry(item.a, item.b, d.offset, mPerMm, textMm, undefined, geomOpts);
  const g = d.textAt ? dimensionGeometry(item.a, item.b, d.offset, mPerMm, textMm, d.textAt, geomOpts) : base;
  const nominal = w + (centered ? 2 * QUEBRA_MM * mPerMm : 0) <= g.length;
  let fits = nominal;
  if (ctx.v) {
    const medida = valorCabeNoTrecho(item.text, g.length, textMm, ctx.scale, ctx.v.zoom);
    if (Number.isFinite(medida.limiar)) zoomAtinge(ctx.v, medida.limiar);
    fits = medida.cabe && nominal;
  }
  return { item, style, textMm, g, textAt: g.textAt, rotation: g.textRotation, w, h, fits, moved: false, box: { c: g.textAt, hw: w / 2, hh: h / 2, rot: g.textRotation }, ...(d.textAt && Math.hypot(d.textAt.x - base.textAt.x, d.textAt.y - base.textAt.y) > 0.002 ? { leader: [mul(add(g.line[0], g.line[1]), 0.5), d.textAt] as [Vec2, Vec2] } : {}) };
}

/** Aparência de uma cota no desenho. */
export interface DimLook {
  color: string;
  /** Peso de papel da linha fina (linha de cota, chamadas, extensão) e do marcador. */
  fina: Espessura;
  marcador: Espessura;
  /** Cor do fundo/halo do texto. */
  paper: string;
  /** Multiplicador de espessura (destaque de hover/seleção). */
  fator?: number;
  /** Texto em negrito (destaque). */
  bold?: boolean;
}

/** Marcador de ponta em `tip`, voltado para `inward` (unitário, para dentro da cota). */
function markerOps(tick: DimTick, tip: Vec2, inward: Vec2, tickMm: number, mPerMm: number, look: DimLook, mk: Espessura, out: DimOps): void {
  const size = tickMm * mPerMm;
  const n = perp(inward);
  const stroke = (pts: Vec2[], closed = false): StrokeOp => ({ pts, closed, ...mk, color: look.color, alpha: 1 });
  if (tick === 'arrow-filled') {
    const p1 = add(tip, add(mul(inward, size), mul(n, size * 0.17)));
    const p2 = add(tip, add(mul(inward, size), mul(n, -size * 0.17)));
    out.fills.push({ polygons: [[[tip, p1, p2]]], color: look.color, alpha: 1 });
    out.strokes.push(stroke([tip, p1, p2], true));
  } else if (tick === 'arrow' || tick === 'arrow-open') {
    for (const side of [-1, 1]) out.strokes.push(stroke([tip, add(tip, add(mul(inward, size), mul(n, size * 0.3 * side)))]));
  } else if (tick === 'dot') {
    const r = size * 0.3;
    const pts = Array.from({ length: 16 }, (_, i) => ({ x: tip.x + Math.cos((i * Math.PI) / 8) * r, y: tip.y + Math.sin((i * Math.PI) / 8) * r }));
    out.fills.push({ polygons: [[pts]], color: look.color, alpha: 1 });
    out.strokes.push(stroke(pts, true));
  }
}

/** Desenha uma cota disposta por `layoutDimensions`. */
export function drawDimension(l: DimLayout, scale: number, look: DimLook): DimOps {
  const out: DimOps = { fills: [], strokes: [], labels: [] };
  const mPerMm = scale / 1000;
  const f = look.fator ?? 1;
  const fina = f === 1 ? look.fina : espessuraVezes(look.fina, f);
  const mk = f === 1 ? look.marcador : espessuraVezes(look.marcador, f);
  const st = (pts: Vec2[], esp: Espessura = fina): StrokeOp => ({ pts, closed: false, ...esp, color: look.color, alpha: 1 });
  const { style } = l;
  if (l.g) {
    const g = l.g;
    for (const seg of g.extensions) out.strokes.push(st([...seg]));
    const [ta, tb] = g.line;
    const u = norm(sub(tb, ta));
    const tick = style.tick;
    // Linha de cota: o marcador de 45° ultrapassa o corte da linha; o texto centrado a interrompe.
    const sobra = tick === 'slash' ? style.tickSize * 0.35 * mPerMm : 0;
    const p0 = sub(ta, mul(u, sobra));
    const p1 = add(tb, mul(u, sobra));
    const cortada = l.fits && style.textPlacement === 'centered' && !l.moved && !l.item.d.textAt && l.item.text !== '';
    if (cortada) {
      const meio = l.w / 2 + QUEBRA_MM * mPerMm;
      const mid = mul(add(ta, tb), 0.5);
      out.strokes.push(st([p0, sub(mid, mul(u, meio))]), st([add(mid, mul(u, meio)), p1]));
    } else out.strokes.push(st([p0, p1]));
    if (tick === 'slash') for (const t of g.ticks) out.strokes.push(st([...t], mk));
    else {
      markerOps(tick, ta, u, style.tickSize, mPerMm, look, mk, out);
      markerOps(tick, tb, mul(u, -1), style.tickSize, mPerMm, look, mk, out);
    }
    if (l.leader) out.strokes.push(st([...l.leader]));
  } else if (l.ang) {
    const g = l.ang;
    out.strokes.push(st(g.arc));
    for (const seg of g.extensions) out.strokes.push(st([...seg]));
    if (style.tick === 'slash') for (const t of g.ticks) out.strokes.push(st([...t], mk));
    else if (g.arc.length >= 2) {
      const n = g.arc.length;
      markerOps(style.tick, g.arc[0]!, norm(sub(g.arc[1]!, g.arc[0]!)), style.tickSize, mPerMm, look, mk, out);
      markerOps(style.tick, g.arc[n - 1]!, norm(sub(g.arc[n - 2]!, g.arc[n - 1]!)), style.tickSize, mPerMm, look, mk, out);
    }
  }
  if (l.item.text !== '') {
    const label: LabelOp = { ...noteLabel(l.textAt, l.item.text, l.textMm, scale, l.rotation), color: look.color };
    if (look.bold) label.bold = true;
    if (style.font) label.fontFamily = style.font;
    // Fundo (halo) fino do papel: o valor se lê por cima de hachuras e linhas.
    label.maskBoundary = boxCorners({ ...l.box, c: l.textAt }, MASCARA_MM * mPerMm);
    label.maskColor = look.paper;
    label.maskBorderColor = 'none';
    out.labels.push(label);
  }
  return out;
}
