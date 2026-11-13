import type { Id } from '@hestia/model';

/**
 * Linhas do guarda-corpo para as vistas 2D (planta, corte e elevação), decodificadas da saída plana de `guarda_planta` e `guarda_corte`
 * (decisão 0055, §6.2). Em planta as coordenadas são `(x, y)`; em corte e elevação, `(s, z)`. O mesmo tipo serve às duas.
 *
 * Visibilidade e seleção passam por aqui: `linhasVisiveisGC` aplica o conjunto `hidden` que vem do ponto único `visibilityOf()` (elemento e
 * categoria `railing` já expandidos em ids), e `guardaCorpoNoPonto` escolhe o guarda-corpo sob o cursor entre as linhas visíveis.
 */
export interface LinhaVistaGC {
  guardaId: Id;
  /** 255 = eixo; 0 a 7 = papel da peça. */
  papel: number;
  /** 0 cortado, 1 projetado, 2 oculto. */
  estilo: number;
  pontos: Array<{ x: number; y: number }>;
}

/** `linhas` `[guarda_num, papel, estilo, n_pontos]` e `pontos` `[x, y]`; `idDe` traduz `guarda_num` em id do elemento (ausente = ignora). */
export function decodificarLinhasGC(linhas: ArrayLike<number>, pontos: ArrayLike<number>, idDe: (guardaNum: number) => Id | undefined): LinhaVistaGC[] {
  const out: LinhaVistaGC[] = [];
  let k = 0;
  for (let i = 0; i + 3 < linhas.length; i += 4) {
    const n = linhas[i + 3]!;
    const id = idDe(linhas[i]!);
    if (id !== undefined) {
      const pts: LinhaVistaGC['pontos'] = [];
      for (let j = 0; j < n; j++) pts.push({ x: pontos[2 * (k + j)]!, y: pontos[2 * (k + j) + 1]! });
      out.push({ guardaId: id, papel: linhas[i + 1]!, estilo: linhas[i + 2]!, pontos: pts });
    }
    k += n;
  }
  return out;
}

/** Tira o que está oculto ou fora do isolamento. */
export function linhasVisiveisGC(linhas: readonly LinhaVistaGC[], hidden: ReadonlySet<Id>): LinhaVistaGC[] {
  return linhas.filter((l) => !hidden.has(l.guardaId));
}

function distSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function dentro(p: { x: number; y: number }, poly: LinhaVistaGC['pontos']): boolean {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) in_ = !in_;
  }
  return in_;
}

/** Distância do ponto à linha: 0 dentro de um contorno de peça (papel < 255), senão a menor distância às arestas. */
export function distanciaALinhaGC(p: { x: number; y: number }, l: LinhaVistaGC): number {
  if (l.papel !== 255 && l.pontos.length >= 4 && dentro(p, l.pontos)) return 0;
  let d = Infinity;
  for (let i = 0; i + 1 < l.pontos.length; i++) d = Math.min(d, distSeg(p, l.pontos[i]!, l.pontos[i + 1]!));
  return d;
}

/** O guarda-corpo visível mais perto de `p` dentro de `tol`, ou null. Empate: o de menor id (determinístico). */
export function guardaCorpoNoPonto(linhas: readonly LinhaVistaGC[], hidden: ReadonlySet<Id>, p: { x: number; y: number }, tol: number): Id | null {
  let melhor: { id: Id; d: number } | null = null;
  for (const l of linhasVisiveisGC(linhas, hidden)) {
    const d = distanciaALinhaGC(p, l);
    if (d <= tol && (!melhor || d < melhor.d || (d === melhor.d && l.guardaId < melhor.id))) melhor = { id: l.guardaId, d };
  }
  return melhor?.id ?? null;
}

type Pt = { x: number; y: number };

/** Os dois segmentos se cruzam ou se tocam? (orientação com tolerância zero: basta para a caixa de seleção). */
function segmentosSeCruzam(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const noSeg = (p: Pt, q: Pt, r: Pt): boolean => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && noSeg(a, b, c)) || (o2 === 0 && noSeg(a, b, d)) || (o3 === 0 && noSeg(c, d, a)) || (o4 === 0 && noSeg(c, d, b));
}

/** A linha (contorno de peça ou polilinha) toca a caixa: vértice dentro, aresta cruzando a borda, ou caixa inteira dentro da peça. */
function linhaTocaCaixa(l: LinhaVistaGC, min: Pt, max: Pt): boolean {
  const dentroCaixa = (q: Pt): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  if (l.pontos.some(dentroCaixa)) return true;
  const cantos: Pt[] = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  const fechada = l.papel !== 255 && l.pontos.length >= 3;
  const n = l.pontos.length;
  for (let i = 0; i < (fechada ? n : n - 1); i++) {
    const a = l.pontos[i]!;
    const b = l.pontos[(i + 1) % n]!;
    for (let k = 0; k < 4; k++) if (segmentosSeCruzam(a, b, cantos[k]!, cantos[(k + 1) % 4]!)) return true;
  }
  return fechada && dentro({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }, l.pontos);
}

/**
 * Guarda-corpos que a caixa de seleção do corte ou da elevação pega, nas mesmas linhas que a vista desenha (`guarda_corte`).
 * Janela (`b.x >= a.x`): o guarda-corpo vale se TODAS as peças visíveis dele ficam inteiras dentro da caixa.
 * Cruzamento: vale se alguma peça toca a caixa. Oculto ou fora do isolamento não entra. Ordem da primeira aparição.
 */
export function guardaCorposNaCaixa(linhas: readonly LinhaVistaGC[], hidden: ReadonlySet<Id>, a: Pt, b: Pt): Id[] {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const janela = b.x >= a.x;
  const dentroCaixa = (q: Pt): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  const porId = new Map<Id, boolean>();
  for (const l of linhasVisiveisGC(linhas, hidden)) {
    if (l.papel === 255 || l.pontos.length < 2) continue;
    const ok = janela ? l.pontos.every(dentroCaixa) : linhaTocaCaixa(l, min, max);
    const atual = porId.get(l.guardaId);
    porId.set(l.guardaId, atual === undefined ? ok : janela ? atual && ok : atual || ok);
  }
  return [...porId].filter(([, ok]) => ok).map(([id]) => id);
}
