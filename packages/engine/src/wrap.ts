import { difference, intersection, perp, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import {
  coreRange,
  openingCasing,
  openingFrameStyle,
  type OpeningType,
  type WallType,
  type WrapMode,
} from '@hestia/model';
import { pointAt, tangentAt, type WallFrame } from './frame.ts';
import { jambSection, openingFrameDims } from './openingModelContext.ts';

export type Side = 'exterior' | 'interior';

export interface Wrapper {
  index: number;
  /** Soma das espessuras das camadas "envolventes" entre esta e o núcleo. */
  off: number;
  thickness: number;
}

/** Camadas que envolvem de um lado, do núcleo para fora (as mais próximas do núcleo ficam coladas nele). */
export function wrappingLayers(type: WallType, side: Side): Wrapper[] {
  const core = coreRange(type);
  const out: Wrapper[] = [];
  let off = 0;
  const visit = (i: number): void => {
    const l = type.layers[i]!;
    if (!l.wraps || l.thickness < 1e-6) return;
    out.push({ index: i, off, thickness: l.thickness });
    off += l.thickness;
  };
  if (side === 'exterior') for (let i = core.first - 1; i >= 0; i--) visit(i);
  else for (let i = core.last + 1; i < type.layers.length; i++) visit(i);
  return out;
}

export const sidesOf = (m: WrapMode): Side[] => (m === 'both' ? ['exterior', 'interior'] : m === 'none' ? [] : [m]);

/** Alizar da composição gravada no tipo (faces diferentes de 'none' e largura positiva). */
export const compositionCasing = (ot: OpeningType): boolean => {
  const k = ot.composition?.casing;
  return !!k && k.faces !== 'none' && k.width > 0;
};

/**
 * Fechamento efetivo do vão (decisão 0035 §2 e 0036):
 * - com alizar (`casing`), o retorno é sempre `none`: alizar e retorno são exclusivos (como no ArchiCAD, onde o
 *   Turn Plaster some com o casing ligado), mesmo com `closure` explícito;
 * - `inherit` com batente vira `none` (o reboco vai até o batente; retorno com batente é opt-in, como o "Wrapping at
 *   Inserts" do Revit); sem porta/janela (vão livre ou estilo `block`) vale `wrapInserts` da parede;
 * - `closure` explícito ('both', 'exterior', 'interior') gera o retorno, recortado pela pegada do batente.
 */
export const insertMode = (wt: WallType, ot: OpeningType): WrapMode => {
  if (openingCasing(ot) || compositionCasing(ot)) return 'none';
  if (ot.closure !== 'inherit') return ot.closure;
  return ot.leaves > 0 && openingFrameStyle(ot) !== 'block' ? 'none' : wt.wrapInserts;
};

/**
 * Ponto do mundo em (t, s) no sistema do VÃO. Parede reta: o próprio `pointAt`. Parede curva: o sistema é RETO, orientado
 * pela tangente no centro do vão (o mesmo do furo em `resolve.ts`, do batente e da folha); um `pointAt` radial não
 * coincide com o furo e deixa cunhas de acabamento junto às ombreiras.
 */
export function vaoPoint(f: WallFrame, offset: number): (t: number, s: number) => Vec2 {
  if (!f.arc) return (t, s) => pointAt(f, t, s);
  const c = pointAt(f, offset, f.sMid);
  const u = tangentAt(f, offset);
  const n = perp(u);
  return (t, s) => ({ x: c.x + u.x * (t - offset) + n.x * (s - f.sMid), y: c.y + u.y * (t - offset) + n.y * (s - f.sMid) });
}

/** Contorno do batente na planta, em coordenadas do mundo: o que o retorno do acabamento não pode invadir. */
export function insertFrameFootprint(f: WallFrame, offset: number, ot: OpeningType, side: 1 | -1): MultiPolygon | null {
  if (ot.leaves === 0 || openingFrameStyle(ot) === 'block') return null;
  const style = openingFrameStyle(ot);
  const dims = openingFrameDims(f, ot);
  const { D, Cd, J } = dims;
  const hw = ot.width / 2;
  const at = vaoPoint(f, offset);
  const toWorld = (t: number, s: number): { x: number; y: number } => at(t, f.sMid + s);
  const out: MultiPolygon = [];
  if (ot.kind === 'door' && (style === 'rebate' || style === 'aduela')) {
    // Mesma seção da peça `jamb` do modelo (uma única fonte da geometria).
    for (const j of [-1, 1] as const) out.push([jambSection(dims, hw, side, j, offset).map(([t, s]) => toWorld(t, s))]);
    return out;
  }
  // Caixilho simples (janelas e batente 'simple'): duas caixas J × D nas ombreiras.
  for (const j of [-1, 1] as const) {
    out.push([
      [
        toWorld(offset + j * (hw - J), Cd - D / 2),
        toWorld(offset + j * hw, Cd - D / 2),
        toWorld(offset + j * hw, Cd + D / 2),
        toWorld(offset + j * (hw - J), Cd + D / 2),
      ],
    ]);
  }
  return out;
}

/** Dados do batente para recortar os retornos explícitos (o modelo é quem manda na largura e no rebaixo). */
export interface InsertFrame {
  ot: OpeningType;
  side: 1 | -1;
}

/** Faixa de s (profundidade na parede) coberta pelo retorno de um lado. */
function depthRange(f: WallFrame, side: Side, both: boolean): [number, number] {
  const ext = f.sExt;
  const int = f.sInt;
  if (!both) return [Math.min(ext, int), Math.max(ext, int)];
  const [a, b] = side === 'exterior' ? [f.sMid, ext] : [int, f.sMid];
  return [Math.min(a, b), Math.max(a, b)];
}

function ringRect(f: WallFrame, t0: number, t1: number, s0: number, s1: number): Ring {
  return [pointAt(f, t0, s0), pointAt(f, t1, s0), pointAt(f, t1, s1), pointAt(f, t0, s1)];
}

/** Faixa da parede curva entre as curvas de profundidade `s0` e `s1`, ao longo de [t0, t1] (aproxima os arcos por segmentos). */
function wallBand(f: WallFrame, t0: number, t1: number, s0: number, s1: number): MultiPolygon {
  const N = 16;
  const ts = Array.from({ length: N + 1 }, (_, i) => t0 + ((t1 - t0) * i) / N);
  return [[[...ts.map((t) => pointAt(f, t, s1)), ...[...ts].reverse().map((t) => pointAt(f, t, s0))]]];
}

/**
 * Retângulo do retorno no sistema do vão. Parede curva: as bordas laterais são retas (as do furo), mas a faixa de profundidade
 * [s0, s1] segue as curvas da parede (faces e plano médio), senão a divisão entre as faces externa e interna sai deslocada.
 */
function rect(f: WallFrame, offset: number, t0: number, t1: number, s0: number, s1: number): MultiPolygon {
  const at = vaoPoint(f, offset);
  if (!f.arc) return [[[at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)]]];
  const big = f.thickness + 0.5;
  const tall: MultiPolygon = [[[at(t0, f.sMid - big), at(t1, f.sMid - big), at(t1, f.sMid + big), at(t0, f.sMid + big)]]];
  return intersection(tall, wallBand(f, Math.min(t0, t1) - 0.2, Math.max(t0, t1) + 0.2, s0, s1));
}

export interface LayerReturn {
  layerIndex: number;
  poly: MultiPolygon;
}

/**
 * Retornos de acabamento nos dois cantos de um vão (planta). Com batente presente (`frame`), cada retorno é recortado
 * pelo contorno do batente (decisão 0035 §2): o que fica atrás do rebaixo continua, o que cruzaria a peça sai.
 */
export function insertReturns(f: WallFrame, offset: number, width: number, mode: WrapMode, frame?: InsertFrame): LayerReturn[] {
  const sides = sidesOf(mode);
  const out: LayerReturn[] = [];
  const footprint = frame && sides.length > 0 ? insertFrameFootprint(f, offset, frame.ot, frame.side) : null;
  for (const side of sides) {
    const [s0, s1] = depthRange(f, side, sides.length === 2);
    for (const w of wrappingLayers(f.type, side)) {
      if (w.off + w.thickness >= width / 2 - 1e-3) continue; // não cabe no vão
      const a0 = offset - width / 2 + w.off;
      const b1 = offset + width / 2 - w.off;
      const cru: MultiPolygon = [...rect(f, offset, a0, a0 + w.thickness, s0, s1), ...rect(f, offset, b1 - w.thickness, b1, s0, s1)];
      const poly = footprint ? difference(cru, footprint) : cru;
      if (poly.length > 0) out.push({ layerIndex: w.index, poly });
    }
  }
  return out;
}

/** Retornos nas extremidades livres: os acabamentos contornam a ponta da parede. */
export function endReturns(f: WallFrame, which: 'a' | 'b', mode: WrapMode): LayerReturn[] {
  const sides = sidesOf(mode);
  const out: LayerReturn[] = [];
  for (const side of sides) {
    const [s0, s1] = depthRange(f, side, sides.length === 2);
    for (const w of wrappingLayers(f.type, side)) {
      const [t0, t1] = which === 'a' ? [-(w.off + w.thickness), -w.off] : [f.length + w.off, f.length + w.off + w.thickness];
      out.push({ layerIndex: w.index, poly: [[ringRect(f, t0, t1, s0, s1)]] });
    }
  }
  return out;
}
