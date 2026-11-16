// Contornos dos pisos gerados pela massa (plano de massa, A.7 e ficha D1). Para cada nível escolhido, pega a fatia da massa (já calculada pelo
// kernel, consulta 142, uma por cópia do arranjo), faz a UNIÃO 2D das cópias com `union` de @hestia/geom e simplifica cada contorno por
// Douglas-Peucker (tolerância padrão 5 mm). O TS não calcula a fatia: sem kernel, devolve `null`. Quem monta o comando é `comandoDerivarPisos`
// (pacote model).

import { union, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { servicoMassa, type ServicoMassa } from './massaServico.ts';

/** Tolerância padrão da simplificação do contorno (A.7): 5 mm, em metros. */
export const TOLERANCIA_PISO_PADRAO = 0.005;

/** Um polígono do resultado: o anel externo e os furos, em metros, na ordem de `Polygon` (externo primeiro). */
export type PoligonoDerivado = Polygon;

/** Contornos de um nível: um polígono por componente conexo da união das cópias. */
export interface DerivacaoNivelMassa {
  nivelId: Id;
  poligonos: PoligonoDerivado[];
}

export interface DerivacaoPisosMassa {
  /** Níveis em que a massa tem fatia, na ordem pedida. */
  porNivel: DerivacaoNivelMassa[];
  /** Níveis pedidos sem fatia da massa (fora dela): não geram nada e aparecem aqui. */
  semFatia: Id[];
}

/** Distância do ponto `p` ao segmento `a`–`b`. */
function distanciaAoSegmento(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const q = dx * dx + dy * dy;
  const t = q === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / q));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker numa polilinha aberta: mantém as duas extremidades e os pontos mais afastados da corda que passam da tolerância. */
function douglasPeucker(pts: readonly Vec2[], tolerancia: number): Vec2[] {
  if (pts.length <= 2) return [...pts];
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  let idx = 0;
  let dmax = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distanciaAoSegmento(pts[i]!, a, b);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= tolerancia) return [a, b];
  const esquerda = douglasPeucker(pts.slice(0, idx + 1), tolerancia);
  const direita = douglasPeucker(pts.slice(idx), tolerancia);
  return [...esquerda.slice(0, -1), ...direita];
}

/** Tira pontos repetidos seguidos e o ponto de fechamento repetido do início (o anel já fecha sozinho). */
export function semRepetidos(anel: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of anel) {
    const ult = out[out.length - 1];
    if (!ult || Math.hypot(p.x - ult.x, p.y - ult.y) > 1e-9) out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1 && Math.hypot(out[0]!.x - out[out.length - 1]!.x, out[0]!.y - out[out.length - 1]!.y) <= 1e-9) out.pop();
  return out;
}

/**
 * Simplifica um anel fechado por Douglas-Peucker. O ponto de partida é o do anel e o corte é no ponto mais afastado dele, para que
 * as duas metades tenham extremidades distintas. Se a tolerância não é positiva, ou se a simplificação deixaria menos de 3 pontos
 * (contorno que sumiria), devolve o anel como veio.
 */
export function simplificarAnel(anel: readonly Vec2[], tolerancia: number): Vec2[] {
  if (anel.length <= 3 || !(tolerancia > 0)) return anel.map((p) => ({ x: p.x, y: p.y }));
  const a = anel[0]!;
  let corte = 1;
  let dmax = -1;
  for (let i = 1; i < anel.length; i++) {
    const d = Math.hypot(anel[i]!.x - a.x, anel[i]!.y - a.y);
    if (d > dmax) {
      dmax = d;
      corte = i;
    }
  }
  const metadeA = douglasPeucker(anel.slice(0, corte + 1), tolerancia);
  const metadeB = douglasPeucker([...anel.slice(corte), a], tolerancia);
  const out = [...metadeA.slice(0, -1), ...metadeB.slice(0, -1)];
  return out.length >= 3 ? out : anel.map((p) => ({ x: p.x, y: p.y }));
}

/** União 2D de anéis simples (cada um vira um polígono sem furos) pela `union` de @hestia/geom. Anéis vazios não entram. */
export function uniaoDeAneis(aneis: readonly Ring[]): MultiPolygon {
  const polis = aneis.filter((r) => r.length >= 3).map((r): MultiPolygon => [[r]]);
  return polis.length === 0 ? [] : union(...polis);
}

/**
 * Contornos da massa por nível (A.7). Para cada nível: fatias da massa (todas as cópias), união 2D, cada polígono com o contorno externo e
 * os furos simplificados. Nível sem fatia da massa vai para `semFatia`. Sem kernel (a fonte devolve `null`), devolve `null` sem lançar.
 * A fonte é injetável para os testes; em produção é o `servicoMassa()`.
 *
 * Chama `fatias(p)` (todas as massas) UMA vez e filtra por nível alvo: a consulta do kernel com um nível filtra pela cota do nível DA
 * MASSA (`massas_do_nivel`), não pelo nível em que a fatia cai, então `fatias(p, nivel)` não serve para pegar a fatia de cada nível.
 */
export function derivarContornosPisosDaMassa(
  p: Project,
  massaId: Id,
  niveis: readonly Id[],
  tolerancia: number = TOLERANCIA_PISO_PADRAO,
  fonte: Pick<ServicoMassa, 'fatias'> = servicoMassa(),
): DerivacaoPisosMassa | null {
  const todas = fonte.fatias(p);
  if (todas === null) return null;
  const porNivel: DerivacaoNivelMassa[] = [];
  const semFatia: Id[] = [];
  for (const nivelId of niveis) {
    const minhas = todas.filter((f) => f.massaId === massaId && f.nivelId === nivelId);
    if (minhas.length === 0) {
      semFatia.push(nivelId);
      continue;
    }
    const uniao = uniaoDeAneis(minhas.map((f) => semRepetidos(f.pontos)));
    const poligonos = uniao
      .map((poli) => poli.map((anel) => simplificarAnel(anel, tolerancia)))
      .filter((poli) => poli[0]!.length >= 3);
    porNivel.push({ nivelId, poligonos });
  }
  return { porNivel, semFatia };
}
