import { ringArea, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { caixaDoComponente, pegadaDoComponente, resolverComponente, type PecaResolvida } from '@hestia/engine';
import { levelElevation, type Component, type Project } from '@hestia/model';
import { mix } from './color.ts';
import type { FillOp, PlanTheme, StrokeOp } from './types.ts';

/** Cota mínima (m) relativa ao pavimento a partir da qual o móvel é considerado aéreo (projeção tracejada). */
const COTA_AEREO_M = 1.1;

/** Cota mínima e máxima aproximada dos recortes de tampo quando há peça tampo explícita. */
const RECORTE_REGEX = /cuba|cooktop|recorte/i;

function pontoNoMundo(c: Component, lx: number, ly: number): Vec2 {
  const cos = Math.cos(c.rotation);
  const sen = Math.sin(c.rotation);
  const sx = c.mirrored ? -lx : lx;
  return { x: c.x + sx * cos - ly * sen, y: c.y + sx * sen + ly * cos };
}

function anelRetangulo(c: Component, x0: number, y0: number, x1: number, y1: number): Ring {
  const ring = [
    pontoNoMundo(c, x0, y0),
    pontoNoMundo(c, x1, y0),
    pontoNoMundo(c, x1, y1),
    pontoNoMundo(c, x0, y1),
  ];
  if (ringArea(ring) < 0) ring.reverse();
  return ring;
}

function anelDaPecaEmPlanta(c: Component, peca: PecaResolvida): Ring {
  const [ox, oy] = peca.origem;
  if (peca.eixo === 'z' && peca.contorno !== null && peca.contorno.length >= 6) {
    const ring: Ring = [];
    for (let i = 0; i + 1 < peca.contorno.length; i += 2) {
      ring.push(pontoNoMundo(c, ox + peca.contorno[i]!, oy + peca.contorno[i + 1]!));
    }
    if (ringArea(ring) < 0) ring.reverse();
    return ring;
  }
  const [ex, ey] = peca.extensao;
  return anelRetangulo(c, ox, oy, ox + ex, oy + ey);
}

function desenharRecorte(
  c: Component,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  strokes: StrokeOp[],
): void {
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return;
  strokes.push({ pts: anelRetangulo(c, x0, y0, x1, y1), closed: true, widthPx: 1, color, alpha: 0.85 });
  const margem = Math.min(0.02, Math.min(x1 - x0, y1 - y0) * 0.15);
  if (x1 - x0 > 2 * margem + 0.04 && y1 - y0 > 2 * margem + 0.04) {
    strokes.push({
      pts: anelRetangulo(c, x0 + margem, y0 + margem, x1 - margem, y1 - margem),
      closed: true,
      widthPx: 0.8,
      color,
      alpha: 0.55,
    });
  }
}

function desenharTamposERecortes(
  c: Component,
  pecas: readonly PecaResolvida[],
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
): void {
  const tampos = pecas.filter((q) => !q.vazio && q.papel === 'tampo');
  const tampoPolys: MultiPolygon = [];
  for (const t of tampos) {
    const ring = anelDaPecaEmPlanta(c, t);
    tampoPolys.push([ring]);
    strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 0.9 });
    if (t.eixo === 'z') {
      const [ox, oy] = t.origem;
      for (const u of t.usinagens) {
        if (u.tipo !== 'recorte') continue;
        desenharRecorte(c, ox + u.u, oy + u.v, ox + u.u + u.comprimento, oy + u.v + u.largura, theme.inkSoft, strokes);
      }
    }
  }
  if (tampoPolys.length > 0) {
    fills.push({ polygons: tampoPolys, color: mix(theme.bg, '#8c6a4a', 0.14), alpha: 0.85 });
  }

  // Peças explícitas de recorte/cuba/cooktop ou genéricas sobre o tampo (inclusive peças vazias `vazio: true`).
  const tampoZMin = tampos.length > 0 ? Math.min(...tampos.map((t) => t.origem[2])) - 0.05 : -Infinity;
  for (const q of pecas) {
    const ehRecorte = q.vazio || q.papel === 'generica' || RECORTE_REGEX.test(q.id) || RECORTE_REGEX.test(q.nome);
    if (!ehRecorte) continue;
    if (tampos.length > 0 && q.origem[2] + q.extensao[2] < tampoZMin) continue;
    const [ox, oy] = q.origem;
    const [ex, ey] = q.extensao;
    desenharRecorte(c, ox, oy, ox + ex, oy + ey, theme.inkSoft, strokes);
  }
}

function desenharFrentes(c: Component, pecas: readonly PecaResolvida[], color: string, strokes: StrokeOp[]): void {
  const vistas = new Set<string>();
  for (const q of pecas) {
    if (q.vazio || (q.papel !== 'porta' && q.papel !== 'frente_gaveta')) continue;
    const [ox, oy] = q.origem;
    const [ex, ey] = q.extensao;
    if (ex <= 1e-4 || ey <= 1e-4) continue;
    const chave = `${Math.round(ox * 1e4)}:${Math.round(oy * 1e4)}:${Math.round(ex * 1e4)}:${Math.round(ey * 1e4)}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    strokes.push({ pts: anelRetangulo(c, ox, oy, ox + ex, oy + ey), closed: true, widthPx: 0.9, color, alpha: 0.75 });
    const largPux = Math.min(0.12, ex * 0.35);
    if (largPux >= 0.03) {
      const cx = ox + ex / 2;
      const yf = oy - 0.014;
      strokes.push({
        pts: [pontoNoMundo(c, cx - largPux / 2, yf), pontoNoMundo(c, cx + largPux / 2, yf)],
        closed: false,
        widthPx: 0.9,
        color,
        alpha: 0.75,
      });
    }
  }
}

/**
 * Desenha um componente paramétrico (marcenaria/mobiliário) na planta 2D de forma fiel às peças 3D:
 * - Aéreo elevado (`zMin >= 1,1 m`): contornos tracejados (`dash: [4, 3]`), sem fill opaco sobre os balcões abaixo.
 * - Piso/torre: contorno sólido + fill sutil, destaque de tampo (`papel === 'tampo'`), recortes/cubas/cooktops e
 *   marcação frontal de portas/gavetas (`papel === 'porta' | 'frente_gaveta'`).
 */
export function desenharComponenteEmPlanta(
  p: Project,
  c: Component,
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
): void {
  const res = resolverComponente(p, c);
  const caixa = caixaDoComponente(p, c, res);
  if (!caixa || res.pecas.length === 0) return;
  const pegada = pegadaDoComponente(p, c, res);
  if (pegada.length === 0) return;

  const zMinNoNivel = caixa.min[2] - levelElevation(p, c.levelId);
  if (zMinNoNivel >= COTA_AEREO_M) {
    for (const poly of pegada) {
      for (const ring of poly) {
        strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 0.9, dash: [4, 3] });
      }
    }
    return;
  }

  fills.push({ polygons: pegada, color: mix(theme.bg, theme.inkSoft, 0.07), alpha: 0.85 });
  for (const poly of pegada) {
    for (const ring of poly) {
      strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 1 });
    }
  }
  desenharTamposERecortes(c, res.pecas, theme, fills, strokes);
  desenharFrentes(c, res.pecas, theme.inkSoft, strokes);
}

/** Gera fills e strokes de todos os componentes visíveis do nível para `build.ts`. */
export function componentsPlanOps(
  p: Project,
  levelId: string,
  theme: PlanTheme,
  hidden: ReadonlySet<string> | undefined,
): { fills: FillOp[]; strokes: StrokeOp[] } {
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  for (const e of Object.values(p.elements)) {
    if (e.kind === 'component' && e.levelId === levelId && !hidden?.has(e.id)) {
      desenharComponenteEmPlanta(p, e, theme, fills, strokes);
    }
  }
  return { fills, strokes };
}
