// Validação do perfil da seção (A.2). O contorno (anéis e furos) é calculado só no kernel Rust; aqui o TS apenas
// recusa entrada inválida antes de ela chegar lá.

import type { Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { PERFIL_LIMITES, type PerfilForma, type VerticePerfil } from './estrTypes.ts';

const EPS = 1e-9;
const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const positivo = (n: unknown): n is number => finito(n) && n > 0;
const ponto = ([x, y]: VerticePerfil): Vec2 => ({ x, y });
const vertice = (v: unknown): v is VerticePerfil => Array.isArray(v) && v.length === 2 && finito(v[0]) && finito(v[1]);

const cruz = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const sinal = (v: number): number => (v > EPS ? 1 : v < -EPS ? -1 : 0);
const naCaixa = (a: Vec2, b: Vec2, p: Vec2): boolean =>
  Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;

/** Os segmentos [a,b] e [c,d] se tocam (cruzamento, toque em ponta ou sobreposição colinear). */
function segmentosSeTocam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = sinal(cruz(a, b, c));
  const d2 = sinal(cruz(a, b, d));
  const d3 = sinal(cruz(c, d, a));
  const d4 = sinal(cruz(c, d, b));
  if (d1 !== d2 && d3 !== d4) return true;
  return (d1 === 0 && naCaixa(a, b, c)) || (d2 === 0 && naCaixa(a, b, d)) || (d3 === 0 && naCaixa(c, d, a)) || (d4 === 0 && naCaixa(c, d, b));
}

/** Área com sinal do anel (positiva = anti-horário). */
function areaComSinal(pts: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** O anel é um polígono simples: vértices distintos, área não nula e nenhuma aresta toca outra não adjacente. */
function anelSimples(pts: readonly Vec2[]): boolean {
  const n = pts.length;
  if (n < 3 || Math.abs(areaComSinal(pts)) <= EPS) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const c = pts[(i + 2) % n]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) return false;
    // Arestas vizinhas só dividem o vértice comum: dobrar de volta sobre si mesmo (espinho) é cruzamento.
    if (sinal(cruz(a, b, c)) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentosSeTocam(a, b, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/** Alguma aresta do anel `r` toca alguma aresta do anel `s`. */
function aneisSeTocam(r: readonly Vec2[], s: readonly Vec2[]): boolean {
  for (let i = 0; i < r.length; i++) {
    for (let j = 0; j < s.length; j++) {
      if (segmentosSeTocam(r[i]!, r[(i + 1) % r.length]!, s[j]!, s[(j + 1) % s.length]!)) return true;
    }
  }
  return false;
}

/** Ponto dentro do polígono (regra par-ímpar); só usado com anéis que não se tocam. */
function dentro(p: Vec2, anel: readonly Vec2[]): boolean {
  let in_ = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i]!;
    const b = anel[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) in_ = !in_;
  }
  return in_;
}

function personalizadoIssue(p: Extract<PerfilForma, { forma: 'personalizado' }>, lang: Lang): string | null {
  if (!Array.isArray(p.anel) || p.anel.length < PERFIL_LIMITES.verticesMin || !p.anel.every(vertice)) return t(lang, 'md_estr_perfil_anel_pontos');
  const anel = p.anel.map(ponto);
  if (!anelSimples(anel)) return t(lang, 'md_estr_perfil_anel_simples');
  if (Math.abs(areaComSinal(anel)) <= PERFIL_LIMITES.areaMin) return t(lang, 'md_estr_perfil_area');
  const furos = (p.furos ?? []).map((f) => (Array.isArray(f) && f.length >= PERFIL_LIMITES.verticesMin && f.every(vertice) ? f.map(ponto) : null));
  for (let i = 0; i < furos.length; i++) {
    const f = furos[i];
    if (!f || !anelSimples(f)) return t(lang, 'md_estr_perfil_furo_simples', { i: i + 1 });
    if (aneisSeTocam(f, anel) || !dentro(f[0]!, anel)) return t(lang, 'md_estr_perfil_furo_dentro', { i: i + 1 });
    for (let j = 0; j < i; j++) {
      const g = furos[j]!;
      if (aneisSeTocam(f, g) || dentro(f[0]!, g) || dentro(g[0]!, f)) return t(lang, 'md_estr_perfil_furo_cruza', { i: i + 1, j: j + 1 });
    }
  }
  return null;
}

/**
 * Problema do perfil, ou null se for válido (A.2): dimensões finitas e maiores que zero; `tf*2 < h` (I e U), `tf < h`
 * (T e L), `tw < b`, `t*2 < min(b,h)`; anel personalizado simples com área > 1e-6 metro quadrado; furos dentro do anel, simples e
 * sem se tocar. Nunca lança: entrada de qualquer tipo vira mensagem.
 */
export function validarPerfil(p: PerfilForma, lang: Lang = 'pt'): string | null {
  const dim = t(lang, 'md_estr_perfil_dim');
  switch (p?.forma) {
    case 'retangular':
      return positivo(p.b) && positivo(p.h) ? null : dim;
    case 'circular':
      return positivo(p.d) ? null : dim;
    case 'L':
      if (!positivo(p.b) || !positivo(p.h) || !positivo(p.tf)) return dim;
      return p.tf < p.b && p.tf < p.h ? null : t(lang, 'md_estr_perfil_aba');
    case 'T':
    case 'I':
    case 'U': {
      if (!positivo(p.b) || !positivo(p.h) || !positivo(p.tf) || !positivo(p.tw)) return dim;
      const abas = p.forma === 'T' ? 1 : 2;
      if (p.tf * abas >= p.h) return t(lang, 'md_estr_perfil_aba');
      return p.tw < p.b ? null : t(lang, 'md_estr_perfil_alma');
    }
    case 'tuboRetangular':
      if (!positivo(p.b) || !positivo(p.h) || !positivo(p.t)) return dim;
      return p.t * 2 < Math.min(p.b, p.h) ? null : t(lang, 'md_estr_perfil_parede');
    case 'tuboCircular':
      if (!positivo(p.d) || !positivo(p.t)) return dim;
      return p.t * 2 < p.d ? null : t(lang, 'md_estr_perfil_parede');
    case 'personalizado':
      return personalizadoIssue(p, lang);
    default:
      return t(lang, 'md_estr_perfil_forma');
  }
}

/** Cópia profunda do perfil (os comandos guardam cópia, nunca a referência do chamador). */
export const copiarPerfil = (p: PerfilForma): PerfilForma => structuredClone(p);
