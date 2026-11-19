import type { Ring } from '@hestia/geom';
import type { PecaResolvida } from '@hestia/engine';
import type { Component } from '@hestia/model';
import { mix } from './color.ts';
import { anelDaPecaEmPlanta, corDoPapel, pecaDeVidro } from './planComponentsGeo.ts';
import type { FillOp, PlanTheme, StrokeOp } from './types.ts';

/** Opacidade do vidro na planta: o que está embaixo continua à vista. */
export const ALPHA_VIDRO = 0.25;

const topoZ = (q: PecaResolvida): number => q.origem[2] + q.extensao[2];

/** Peças em ordem de baixo para cima (cota superior; empate pela inferior): a mais alta é desenhada por último e cobre a outra. */
export function ordenarPorZ(pecas: readonly PecaResolvida[]): PecaResolvida[] {
  return [...pecas].sort((a, b) => topoZ(a) - topoZ(b) || a.origem[2] - b.origem[2]);
}

function caixaDoAnel(r: Ring): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const v of r) { if (v.x < a) a = v.x; if (v.y < b) b = v.y; if (v.x > c) c = v.x; if (v.y > d) d = v.y; }
  return [a, b, c, d];
}

function dentro(x: number, y: number, r: Ring): boolean {
  let in_ = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) in_ = !in_;
  }
  return in_;
}

/** Chave de deduplicação do anel (peças idênticas empilhadas, como duas portas no mesmo vão). */
function chaveDoAnel(r: Ring): string {
  const [a, b, c, d] = caixaDoAnel(r);
  return `${r.length}:${Math.round(a * 1e4)}:${Math.round(b * 1e4)}:${Math.round(c * 1e4)}:${Math.round(d * 1e4)}`;
}

/** Contornos (mundo) das peças visíveis, sem repetição: a silhueta real do móvel (usada no aéreo tracejado). */
export function aneisDasPecas(c: Component, pecas: readonly PecaResolvida[]): Ring[] {
  const vistos = new Set<string>();
  const saida: Ring[] = [];
  for (const q of pecas) {
    const r = anelDaPecaEmPlanta(c, q);
    const k = chaveDoAnel(r);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(r);
  }
  return saida;
}

/**
 * Projeção real do móvel de piso: cada peça (já filtrada pelo nível de detalhe) como fill + contorno fino, de baixo para cima.
 * Em sombreado a cor é a do acabamento da peça; senão o tom neutro de antes. Vidro: alpha 0,25 e nunca cobre as peças de baixo.
 * Aramado (`aramado`): só contornos. Peça totalmente encoberta por outra opaca mais alta: contorno omitido (médio) ou tracejado
 * fraco (fino), como linha oculta; portas e frentes mantêm o contorno (marcação de projeto).
 */
export function desenharPecasEmPlanta(
  c: Component,
  pecas: readonly PecaResolvida[],
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
  sombreado: boolean,
  aramado: boolean,
  fino: boolean,
): void {
  const ord = ordenarPorZ(pecas);
  const aneis = ord.map((q) => anelDaPecaEmPlanta(c, q));
  const vidro = ord.map((q) => pecaDeVidro(c, q));
  const caixas = aneis.map(caixaDoAnel);
  const vistos = new Set<string>();
  for (let i = 0; i < ord.length; i++) {
    const q = ord[i]!;
    const ring = aneis[i]!;
    const chave = chaveDoAnel(ring) + (vidro[i] ? 'v' : '') + Math.round(topoZ(q) * 1e3);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    if (!aramado) {
      const cor = sombreado ? corDoPapel(c, q.papel, q.material ?? undefined) : undefined;
      const neutra = q.papel === 'tampo' ? mix(theme.bg, '#8c6a4a', 0.14) : mix(theme.bg, theme.inkSoft, 0.07);
      const color = cor ?? (vidro[i] ? mix(theme.bg, theme.inkSoft, 0.3) : neutra);
      const alpha = vidro[i] ? ALPHA_VIDRO : cor ? 1 : 0.85;
      fills.push({ polygons: [[ring]], color, alpha });
    }

    let coberta = false;
    if (!vidro[i]) {
      const [a0, b0, a1, b1] = caixas[i]!;
      for (let j = i + 1; j < ord.length && !coberta; j++) {
        if (vidro[j] || topoZ(ord[j]!) <= topoZ(q) + 1e-6) continue;
        const [c0, d0, c1, d1] = caixas[j]!;
        if (a0 < c0 - 1e-6 || b0 < d0 - 1e-6 || a1 > c1 + 1e-6 || b1 > d1 + 1e-6) continue;
        coberta = ring.every((v) => dentro(v.x, v.y, aneis[j]!));
      }
    }
    const frente = q.papel === 'porta' || q.papel === 'frente_gaveta';
    if (coberta && !frente) {
      if (fino) strokes.push({ pts: ring, closed: true, widthPx: 0.6, color: theme.inkSoft, alpha: 0.4, dash: [2, 3] });
      continue;
    }
    strokes.push({ pts: ring, closed: true, widthPx: frente ? 0.9 : 1, color: theme.inkSoft, alpha: frente ? 0.75 : 0.95 });
  }
}
