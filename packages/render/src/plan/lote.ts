import { areaEdificavel } from '@hestia/engine';
import { formatQuantity, unitsOf, type Id, type Lot, type PapelLadoLote, type Project } from '@hestia/model';
import type { Lang } from '../i18n.ts';
import { mix } from './color.ts';
import type { FloorOps } from './floors.ts';
import { espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';

/**
 * Lote em planta (ficha P2). O lote é só de planta e prancha: não aparece em corte, elevação nem 3D.
 *
 * - Contorno: o estilo pedido é traço-dois-pontos, mas o traço da planta (`StrokeOp.dash`) só tem o par [traço, vão]; sem como
 *   montar o padrão, o contorno sai tracejado longo (peso de projeção da categoria `lot`) e a área edificável, tracejado curto.
 * - Cada lado leva o papel e o comprimento (texto pequeno, alinhado ao lado, para fora do lote).
 * - Seleção: só pelo contorno (clique perto de um lado ou caixa que o toca). O interior NÃO seleciona (A.8 item 7).
 */

/** [traço, vão] em pixels do contorno do lote (longo: o mais perto de traço-dois-pontos que o traço da planta permite). */
export const LOTE_TRACO: [number, number] = [16, 5];
/** [traço, vão] em pixels da área edificável (curto, para se distinguir do contorno). */
export const EDIFICAVEL_TRACO: [number, number] = [5, 4];
/** Corpo do texto dos lados, em mm de papel. */
export const LOTE_TEXTO_MM = 1.5;
/** Distância do texto ao lado, em mm de papel (para fora do lote). */
const LOTE_TEXTO_AFASTA_MM = 2;

type Pt = { x: number; y: number };

/**
 * Nome do papel do lado. TODO: trocar por `t(lang, 'md_lt_lado_*')` quando as chaves entrarem em `packages/model/src/i18n.ts` (a ficha P2 não
 * lista esse arquivo); até lá, pt e en aqui, e os demais idiomas caem no inglês, como o dicionário faz.
 */
const PAPEIS: Record<'pt' | 'en', Record<PapelLadoLote, string>> = {
  pt: { frente: 'frente', lateral: 'lateral', fundo: 'fundo' },
  en: { frente: 'front', lateral: 'side', fundo: 'rear' },
};

export function textoDoPapel(lang: Lang, papel: PapelLadoLote): string {
  return PAPEIS[lang === 'pt' ? 'pt' : 'en'][papel];
}

/** Lotes do nível, na ordem de criação, menos os ocultos. */
export function lotesDoNivel(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): Lot[] {
  const out: Lot[] = [];
  for (const e of Object.values(p.elements)) if (e.kind === 'lot' && e.levelId === levelId && !hidden?.has(e.id)) out.push(e);
  return out.sort((a, b) => a.order - b.order);
}

/** Ângulo do texto (graus), sempre legível: de −90 (exclusive) a 90. */
function anguloLegivel(dx: number, dy: number): number {
  let r = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (r > 90) r -= 180;
  while (r <= -90) r += 180;
  return r;
}

/** Sinal da orientação do contorno: positivo anti-horário. */
function sentido(c: readonly Pt[]): number {
  let a = 0;
  c.forEach((q, i) => {
    const r = c[(i + 1) % c.length]!;
    a += q.x * r.y - r.x * q.y;
  });
  return a;
}

/** Desenho de um lote: contorno, área edificável (se ligada) e o papel e o comprimento de cada lado. */
export function loteOps(p: Project, l: Lot, theme: PlanTheme, dark: boolean, paint: PlanPaint, scale: number, lang: Lang = 'pt'): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  const n = l.contorno.length;
  if (n < 3) return out;
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? l.color ?? mix(theme.ink, base, 0.15);
  const suave = paint.color ?? l.color ?? mix(theme.ink, base, 0.45);
  const proj = espessuraDeProjecao(paint);
  out.strokes.push({ pts: l.contorno.map((q) => ({ x: q.x, y: q.y })), closed: true, ...proj, color: cor, alpha: 1, dash: LOTE_TRACO });
  if (l.mostrarEdificavel) {
    for (const poly of areaEdificavel(l.contorno, l.lados)) {
      for (const ring of poly) if (ring.length >= 3) out.strokes.push({ pts: ring.map((q) => ({ x: q.x, y: q.y })), closed: true, ...proj, color: suave, alpha: 1, dash: EDIFICAVEL_TRACO });
    }
  }
  const u = unitsOf(p);
  const ccw = sentido(l.contorno) >= 0 ? 1 : -1;
  l.contorno.forEach((a, i) => {
    const b = l.contorno[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 1e-9)) return;
    const lado = l.lados[i];
    if (!lado) return;
    // Normal para fora do lote: à direita do sentido a → b num contorno anti-horário.
    const nx = ((b.y - a.y) / len) * ccw;
    const ny = (-(b.x - a.x) / len) * ccw;
    out.labels.push({
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      text: `${textoDoPapel(lang, lado.papel)} ${formatQuantity(u, 'length', len)}`,
      center: true,
      rotation: anguloLegivel(b.x - a.x, b.y - a.y),
      tone: 'soft',
      papel: { escala: scale, fontMm: LOTE_TEXTO_MM, desvio: { mm: LOTE_TEXTO_AFASTA_MM, ux: nx + 0, uy: 0 - ny } },
    });
  });
  return out;
}

/** Distância do ponto ao segmento a-b. */
function distanciaAoSegmento(q: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = dx * dx + dy * dy;
  const t = c > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / c)) : 0;
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

/**
 * O lote visível do nível cujo CONTORNO passa a no máximo `tol` (m) de `q`, ou null. O interior não conta: clicar dentro do lote não o
 * seleciona (senão ele engoliria os cliques da planta). Empate: o de menor id.
 */
export function loteNoPonto(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, q: Pt, tol: number): Id | null {
  let melhor: { id: Id; d: number } | null = null;
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    let d = Infinity;
    l.contorno.forEach((a, i) => {
      d = Math.min(d, distanciaAoSegmento(q, a, l.contorno[(i + 1) % l.contorno.length]!));
    });
    if (d <= tol && (!melhor || d < melhor.d || (d === melhor.d && l.id < melhor.id))) melhor = { id: l.id, d };
  }
  return melhor?.id ?? null;
}

/** Os dois segmentos se cruzam ou se tocam? */
function seCruzam(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const noSeg = (p: Pt, q: Pt, r: Pt): boolean => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && noSeg(a, b, c)) || (o2 === 0 && noSeg(a, b, d)) || (o3 === 0 && noSeg(c, d, a)) || (o4 === 0 && noSeg(c, d, b));
}

/**
 * Lotes selecionados por uma caixa (de `a` a `b`). Janela (`b.x >= a.x`): todos os vértices do contorno dentro da caixa. Cruzamento: algum lado
 * do contorno toca a caixa. Uma caixa inteira dentro do lote, sem tocar o contorno, não o seleciona (o interior não conta).
 */
export function lotesNaCaixa(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, a: Pt, b: Pt): Id[] {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const janela = b.x >= a.x;
  const dentro = (q: Pt): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  const cantos: Pt[] = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  const out: Id[] = [];
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    const c = l.contorno;
    const ok = janela
      ? c.length > 0 && c.every(dentro)
      : c.some(dentro) || c.some((q, i) => cantos.some((k, j) => seCruzam(q, c[(i + 1) % c.length]!, k, cantos[(j + 1) % 4]!)));
    if (ok) out.push(l.id);
  }
  return out;
}

/** Realce do lote selecionado ou sob o cursor: só o contorno (sem preenchimento, porque o interior não é alvo). */
export function loteSelectionOps(p: Project, levelId: Id, selection: readonly Id[], hover: Id | null, theme: PlanTheme, hidden?: ReadonlySet<Id>): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    const sel = selection.includes(l.id);
    if (!sel && l.id !== hover) continue;
    out.strokes.push({ pts: l.contorno.map((q) => ({ x: q.x, y: q.y })), closed: true, widthPx: sel ? 2.5 : 2, color: sel ? theme.select : theme.selectHover, alpha: sel ? 1 : 0.8 });
  }
  return out;
}
