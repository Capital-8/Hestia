import type { Id, Project } from '@hestia/model';
import { buildSheetDrawList, type SheetPath, type SheetPoint, type SheetRect, type SheetText } from '@hestia/render';
import { writeDxf2000, type DxfDoc, type DxfDocEntity, type DxfDocLayer, type DxfPoint, type DxfUnit } from '@hestia/io';
import { t as tr, useI18n, type Lang } from './i18n.ts';

/**
 * DXF R2000 de uma prancha "como plotada" (modo do Revit): UM arquivo por prancha, com as vistas na posição e na escala
 * do papel, sem XREF e sem arquivo por vista de origem. O desenho é o mesmo da prancha do PDF (`buildSheetDrawList`),
 * em mm de papel com origem no canto inferior esquerdo e y para cima; o documento DXF é montado em METROS (÷1000) e o
 * `units` converte na saída, como manda o escritor R2000.
 *
 * O que entra:
 * - `paths` viram POLYLINE (aberta ou fechada, com `width` em metros quando o traço tem `widthMm > 0`); traço com
 *   `dashMm` sai com `dashed: true`, isto é, LTYPE DASHED na própria entidade.
 * - `texts` viram TEXT na altura `sizeMm / 1000`, com rotação em graus e `centered` quando o texto é centrado.
 * - `fills` são IGNORADOS: o escritor R2000 daqui não tem HATCH/SOLID, então os preenchimentos da prancha (fundo do
 *   carimbo, hachuras das vistas) não saem no arquivo. O que é contorno continua desenhado.
 *
 * Recorte: grupo com `clip` (a caixa de uma vista) só desenha dentro do retângulo. Polilinha aberta é recortada por
 * segmento (Liang–Barsky, juntando os segmentos contíguos que sobraram); polilinha fechada por Sutherland–Hodgman. Texto
 * cujo `at` cai fora do retângulo é descartado — simplificação documentada (não se recorta o desenho da fonte). Grupo sem
 * clip (moldura, legendas e carimbo) não sofre recorte.
 *
 * Cores: o draw list traz CSS; a cor de cada entidade vira ACI por luminância (< 0,4 → 7, < 0,8 → 8, senão 9), para o
 * desenho ficar legível no CAD sem depender de true color (código 420). As camadas PRANCHA e PRANCHA_TEXTO são contínuas,
 * cor 7, com espessura 25 e 0 centésimos de mm.
 */

/** Camada das linhas da prancha. */
const LAYER = 'PRANCHA';
/** Camada dos textos da prancha (espessura 0, como anotação). */
const LAYER_TEXTO = 'PRANCHA_TEXTO';

/** Tabela de camadas do arquivo: ambas contínuas, cor 7; a de texto sem espessura. */
const LAYERS: readonly DxfDocLayer[] = [
  { name: LAYER, color: 7, linetype: 'CONTINUOUS', lineWeight: 25 },
  { name: LAYER_TEXTO, color: 7, linetype: 'CONTINUOUS', lineWeight: 0 },
];

/** Tolerância (mm de papel) das comparações de recorte e de pontos repetidos. */
const EPS = 1e-9;

/** Canais RGB (0 a 255) de uma cor CSS `#rgb`, `#rrggbb`, `rgb()` ou `rgba()`; null se não reconhecer. */
function rgbOf(css: string): [number, number, number] | null {
  const s = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const d = hex[1]!;
    if (d.length === 3) return [parseInt(d[0]! + d[0]!, 16), parseInt(d[1]! + d[1]!, 16), parseInt(d[2]! + d[2]!, 16)];
    return [parseInt(d.slice(0, 2), 16), parseInt(d.slice(2, 4), 16), parseInt(d.slice(4, 6), 16)];
  }
  const m = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Cor ACI de uma cor CSS pela luminância: < 0,4 preto (7), < 0,8 cinza (8), senão cinza claro (9). */
function aciOf(css: string): number {
  const rgb = rgbOf(css);
  if (!rgb) return 7;
  const luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luma < 0.4 ? 7 : luma < 0.8 ? 8 : 9;
}

/** Ponto repetido (dentro da tolerância) — sai do vértice seguinte. */
const samePoint = (a: SheetPoint, b: SheetPoint): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Tira pontos consecutivos repetidos; num caminho fechado, também o último igual ao primeiro. */
function dedupe(pts: readonly SheetPoint[], closed: boolean): SheetPoint[] {
  const out: SheetPoint[] = [];
  for (const p of pts) if (out.length === 0 || !samePoint(out[out.length - 1]!, p)) out.push(p);
  if (closed && out.length > 1 && samePoint(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}

/**
 * Recorta o segmento a→b ao retângulo (Liang–Barsky). Devolve os extremos recortados, ou null se o segmento não toca o
 * retângulo.
 */
function clipSegment(a: SheetPoint, b: SheetPoint, r: SheetRect): [SheetPoint, SheetPoint] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (Math.abs(pi) < EPS) {
      // Paralelo à borda: fora dela, nada do segmento aparece.
      if (qi < -EPS) return null;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  if (t0 > t1) return null;
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

/** Recorta uma polilinha aberta por segmento; cada trecho contíguo que sobrevive vira uma polilinha. */
function clipOpen(pts: readonly SheetPoint[], r: SheetRect): SheetPoint[][] {
  const runs: SheetPoint[][] = [];
  let run: SheetPoint[] | null = null;
  for (let i = 1; i < pts.length; i++) {
    const seg = clipSegment(pts[i - 1]!, pts[i]!, r);
    if (!seg) {
      run = null;
      continue;
    }
    const [s, e] = seg;
    if (run && samePoint(run[run.length - 1]!, s)) run.push(e);
    else {
      run = [s, e];
      runs.push(run);
    }
  }
  return runs.filter((x) => x.length > 1 && !samePoint(x[0]!, x[x.length - 1]!));
}

/** Ponto onde o segmento a→b cruza a reta `coord = limite`. */
function crossing(a: SheetPoint, b: SheetPoint, coord: (p: SheetPoint) => number, limit: number): SheetPoint {
  const ca = coord(a);
  const cb = coord(b);
  const t = Math.abs(cb - ca) < EPS ? 0 : (limit - ca) / (cb - ca);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Recorta o polígono a uma meia-reta (Sutherland–Hodgman). `keepAbove` diz de que lado fica o que sobra. */
function clipHalfPlane(poly: readonly SheetPoint[], coord: (p: SheetPoint) => number, limit: number, keepAbove: boolean): SheetPoint[] {
  const inside = (q: SheetPoint): boolean => (keepAbove ? coord(q) >= limit - EPS : coord(q) <= limit + EPS);
  const out: SheetPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(crossing(prev, cur, coord, limit));
      out.push(cur);
    } else if (prevIn) out.push(crossing(prev, cur, coord, limit));
  }
  return out;
}

/** Recorta um polígono fechado ao retângulo (Sutherland–Hodgman); menos de três pontos = nada aparece. */
function clipClosed(pts: readonly SheetPoint[], r: SheetRect): SheetPoint[] {
  const byX = (p: SheetPoint): number => p.x;
  const byY = (p: SheetPoint): number => p.y;
  let poly = [...pts];
  for (const step of [
    (poly: SheetPoint[]) => clipHalfPlane(poly, byX, r.x, true),
    (poly: SheetPoint[]) => clipHalfPlane(poly, byX, r.x + r.w, false),
    (poly: SheetPoint[]) => clipHalfPlane(poly, byY, r.y, true),
    (poly: SheetPoint[]) => clipHalfPlane(poly, byY, r.y + r.h, false),
  ]) {
    poly = step(poly);
    if (poly.length < 3) return [];
  }
  const clean = dedupe(poly, true);
  return clean.length >= 3 ? clean : [];
}

/** Ponto de papel (mm) em metros, como o documento DXF guarda. */
const m = (p: SheetPoint): DxfPoint => ({ x: p.x / 1000, y: p.y / 1000 });

/** POLYLINE de um caminho; pontos repetidos saem e caminho com menos de dois vértices não vira entidade. */
function polylineOf(pts: readonly SheetPoint[], closed: boolean, path: SheetPath): DxfDocEntity | null {
  const clean = dedupe(pts, closed);
  if (clean.length < (closed ? 3 : 2)) return null;
  return {
    kind: 'polyline',
    layer: LAYER,
    points: clean.map(m),
    closed,
    ...(path.dashMm !== undefined ? { dashed: true } : {}),
    color: aciOf(path.color),
    ...(path.widthMm > 0 ? { width: path.widthMm / 1000 } : {}),
  };
}

/** Entidades de um traço da prancha, já recortadas ao `clip` do grupo (quando há). */
function pathEntities(path: SheetPath, clip: SheetRect | null): DxfDocEntity[] {
  if (path.closed) {
    const poly = clip ? clipClosed(path.pts, clip) : dedupe(path.pts, true);
    const entity = poly.length >= 3 ? polylineOf(poly, true, path) : null;
    return entity ? [entity] : [];
  }
  const runs = clip ? clipOpen(path.pts, clip) : [dedupe(path.pts, false)];
  return runs.map((run) => polylineOf(run, false, path)).filter((e): e is DxfDocEntity => e !== null);
}

/** Texto da prancha em metros; fora do `clip` é descartado (não se recorta o desenho da fonte). */
function textEntity(t: SheetText, clip: SheetRect | null): DxfDocEntity | null {
  if (clip && (t.at.x < clip.x - EPS || t.at.x > clip.x + clip.w + EPS || t.at.y < clip.y - EPS || t.at.y > clip.y + clip.h + EPS)) return null;
  return {
    kind: 'text',
    layer: LAYER_TEXTO,
    at: m(t.at),
    height: t.sizeMm / 1000,
    text: t.text,
    rotation: t.rotation,
    centered: t.center,
    color: aciOf(t.color),
  };
}

/**
 * DXF R2000 de uma prancha, "como plotada": um arquivo com as vistas na posição e escala do papel. Prancha inexistente
 * lança Error em pt-BR. Os preenchimentos (`fills`) não saem (o escritor não tem HATCH/SOLID).
 */
export function sheetDxf(p: Project, sheetId: Id, options: { units: DxfUnit; lang?: Lang }): string {
  const lang = options.lang ?? useI18n.getState().lang;
  const list = buildSheetDrawList(p, sheetId, lang);
  if (!list) throw new Error(tr(lang, 'io_dxf_sheet_missing', { id: sheetId }));
  const layerMap = new Map<string, string>([
    [LAYER, tr(lang, 'io_dxf_layer_sheet')],
    [LAYER_TEXTO, tr(lang, 'io_dxf_layer_sheet_text')],
  ]);
  const entities: DxfDocEntity[] = [];
  for (const group of list.groups) {
    for (const path of group.paths) entities.push(...pathEntities(path, group.clip));
    for (const text of group.texts) {
      const entity = textEntity(text, group.clip);
      if (entity) entities.push(entity);
    }
  }
  const doc: DxfDoc = {
    layers: LAYERS.map((layer) => ({ ...layer, name: layerMap.get(layer.name) ?? layer.name })),
    entities: entities.map((entity) => ({ ...entity, layer: layerMap.get(entity.layer) ?? entity.layer })),
    extMin: { x: 0, y: 0 },
    extMax: { x: list.widthMm / 1000, y: list.heightMm / 1000 },
    units: options.units,
  };
  return writeDxf2000(doc);
}
