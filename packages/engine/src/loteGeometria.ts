import { difference, ringArea, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import type { LadoLote } from '@hestia/model';

/** Trechos de cada meio-círculo da faixa de recuo (A.4 regra 17). */
export const TRECHOS_MEIO_CIRCULO = 12;

/** Anel anti-horário (inverte se vier no sentido horário). */
const antiHorario = (r: readonly Vec2[]): Ring => (ringArea([...r]) < 0 ? [...r].reverse() : [...r]);

/**
 * Faixa de recuo de um lado (A.4 regra 17): o "estádio" dos pontos a distância ≤ `r` do segmento `a`-`b`, isto é, o retângulo de
 * meia-largura `r` em torno do segmento mais um meio-círculo de 12 trechos em cada ponta. Segmento nulo ou `r <= 0`: sem faixa (null).
 */
export function faixaDeRecuo(a: Vec2, b: Vec2, r: number): Ring | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(r > 0) || !(len > 0)) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Normal à esquerda do sentido a → b.
  const nx = -uy;
  const ny = ux;
  const ang0 = Math.atan2(ny, nx);
  const pts: Vec2[] = [];
  // Em volta de b: da normal esquerda, passando pela direção do segmento, até a normal direita (varredura horária, -π).
  for (let k = 0; k <= TRECHOS_MEIO_CIRCULO; k++) {
    const t = ang0 - (Math.PI * k) / TRECHOS_MEIO_CIRCULO;
    pts.push({ x: b.x + r * Math.cos(t), y: b.y + r * Math.sin(t) });
  }
  // Em volta de a: da normal direita, passando pelo sentido contrário ao segmento, até a normal esquerda.
  for (let k = 0; k <= TRECHOS_MEIO_CIRCULO; k++) {
    const t = ang0 - Math.PI - (Math.PI * k) / TRECHOS_MEIO_CIRCULO;
    pts.push({ x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t) });
  }
  return antiHorario(pts);
}

/** Faixas de recuo de todos os lados com recuo > 0 (lado i vai de contorno[i] a contorno[i+1]). */
export function faixasDeRecuo(contorno: readonly Vec2[], lados: readonly LadoLote[]): Ring[] {
  const out: Ring[] = [];
  contorno.forEach((a, i) => {
    const f = faixaDeRecuo(a, contorno[(i + 1) % contorno.length]!, lados[i]?.recuo ?? 0);
    if (f) out.push(f);
  });
  return out;
}

/** Contorno do lote como multipolígono (anti-horário). */
export const loteComoMulti = (contorno: readonly Vec2[]): MultiPolygon => (contorno.length >= 3 ? [[antiHorario(contorno)]] : []);

/** Área do lote (metros quadrados), sempre positiva. */
export const areaDoLote = (contorno: readonly Vec2[]): number => Math.abs(ringArea([...contorno]));

/** Perímetro do lote (m). */
export function perimetroDoLote(contorno: readonly Vec2[]): number {
  return contorno.reduce((s, a, i) => {
    const b = contorno[(i + 1) % contorno.length]!;
    return s + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
}

/** Área edificável (A.4 regra 17): o lote menos a união das faixas de recuo. Sem recuo nenhum, é o próprio lote. */
export function areaEdificavel(contorno: readonly Vec2[], lados: readonly LadoLote[]): MultiPolygon {
  const lote = loteComoMulti(contorno);
  const faixas = faixasDeRecuo(contorno, lados);
  if (lote.length === 0 || faixas.length === 0) return lote;
  return difference(lote, union(...faixas.map((f): MultiPolygon => [[f]])));
}
