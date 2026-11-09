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
