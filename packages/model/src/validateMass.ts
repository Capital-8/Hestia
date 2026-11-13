import type { Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { MASSA_LIMITES, type ArranjoMassa, type Mass, type PerfilMassa, type SecaoMassa } from './massTypes.ts';

/** Tolerância numérica das comparações de z e de rotação (a regra é "≤ π" e "passo ≥ 0,01"). */
const EPS = 1e-9;

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const inteiroEm = (n: unknown, min: number, max: number): boolean => finito(n) && Number.isInteger(n) && n >= min && n <= max;

/** Área com sinal do anel (positiva = anti-horário). */
export function areaComSinal(pts: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

const cruz = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const sinal = (v: number): number => (v > EPS ? 1 : v < -EPS ? -1 : 0);
const noSegmento = (a: Vec2, b: Vec2, p: Vec2): boolean =>
  Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;

/** Os segmentos [a,b] e [c,d] se tocam (inclui toque em ponta e colinear sobreposto). */
function segmentosSeTocam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = sinal(cruz(a, b, c));
  const d2 = sinal(cruz(a, b, d));
  const d3 = sinal(cruz(c, d, a));
  const d4 = sinal(cruz(c, d, b));
  if (d1 !== d2 && d3 !== d4 && d1 * d2 <= 0 && d3 * d4 <= 0) return true;
  return (d1 === 0 && noSegmento(a, b, c)) || (d2 === 0 && noSegmento(a, b, d)) || (d3 === 0 && noSegmento(c, d, a)) || (d4 === 0 && noSegmento(c, d, b));
}

/** O anel é um polígono simples: nenhuma aresta toca outra não adjacente, vértices distintos e área não nula. */
export function anelSimples(pts: readonly Vec2[]): boolean {
  const n = pts.length;
  if (n < 3 || Math.abs(areaComSinal(pts)) <= EPS) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) return false;
    for (let j = i + 1; j < n; j++) {
      // Arestas vizinhas só compartilham o vértice comum; o toque delas é checado pela área e pelo comprimento.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentosSeTocam(a, b, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

function perfilIssue(p: PerfilMassa, i: number, lang: Lang): string | null {
  const dim = (v: unknown): boolean => finito(v) && v > 0;
  switch (p.forma) {
    case 'circulo':
      return dim(p.raio) ? null : t(lang, 'md_mass_perfil_dim', { i: i + 1 });
    case 'elipse':
      return dim(p.rx) && dim(p.ry) ? null : t(lang, 'md_mass_perfil_dim', { i: i + 1 });
    case 'poligono':
      if (!dim(p.raio)) return t(lang, 'md_mass_perfil_dim', { i: i + 1 });
      return inteiroEm(p.lados, 3, 64) ? null : t(lang, 'md_mass_poligono_lados', { i: i + 1 });
    case 'livre': {
      const pts = p.pontos;
      if (!Array.isArray(pts) || pts.length < 3 || pts.length > MASSA_LIMITES.pontosLivre) return t(lang, 'md_mass_livre_pontos', { i: i + 1, max: MASSA_LIMITES.pontosLivre });
      if (pts.some((q) => !finito(q?.x) || !finito(q?.y))) return t(lang, 'md_mass_perfil_dim', { i: i + 1 });
      if (!anelSimples(pts)) return t(lang, 'md_mass_livre_simples', { i: i + 1 });
      return areaComSinal(pts) > 0 ? null : t(lang, 'md_mass_livre_horario', { i: i + 1 });
    }
    default:
      return t(lang, 'md_mass_perfil_dim', { i: i + 1 });
  }
}

/** Valida a pilha de seções (regras 1 a 4 e 8 de A.3 item 5). */
export function secoesIssue(secoes: readonly SecaoMassa[], lang: Lang = 'pt'): string | null {
  if (!Array.isArray(secoes) || secoes.length < 2 || secoes.length > MASSA_LIMITES.secoes) return t(lang, 'md_mass_secoes_qtd', { min: 2, max: MASSA_LIMITES.secoes });
  for (let i = 0; i < secoes.length; i++) {
    const s = secoes[i]!;
    if (!finito(s.z) || !finito(s.rotacao) || !finito(s.dx) || !finito(s.dy)) return t(lang, 'md_mass_numero', { i: i + 1 });
    if (!finito(s.escala) || s.escala <= 0) return t(lang, 'md_mass_escala', { i: i + 1 });
    if (i === 0 && Math.abs(s.z) > EPS) return t(lang, 'md_mass_z_primeira');
    if (i > 0 && s.z - secoes[i - 1]!.z < MASSA_LIMITES.passoZMin - EPS) return t(lang, 'md_mass_z_crescente', { i: i + 1, passo: MASSA_LIMITES.passoZMin });
    if (i > 0 && Math.abs(s.rotacao - secoes[i - 1]!.rotacao) > MASSA_LIMITES.rotacaoMaxVizinha + EPS) return t(lang, 'md_mass_rotacao_vizinha', { i: i + 1 });
    const p = perfilIssue(s.perfil, i, lang);
    if (p) return p;
  }
  return null;
}

/** Valida o arranjo polar (regra 6 de A.3 item 5). */
export function arranjoIssue(a: ArranjoMassa, lang: Lang = 'pt'): string | null {
  if (!inteiroEm(a?.n, 2, MASSA_LIMITES.copias)) return t(lang, 'md_mass_arranjo_n', { max: MASSA_LIMITES.copias });
  if (!finito(a.cx) || !finito(a.cy) || !finito(a.anguloTotal)) return t(lang, 'md_mass_arranjo_numero');
  return null;
}

/**
 * Problema da massa, ou null se estiver válida (A.3 item 5). Usada por `addMass` e `updateMass`, que recusam massa
 * inválida. Perfil livre horário é inválido aqui; os comandos normalizam o sentido antes de validar.
 */
export function massIssue(m: Mass, lang: Lang = 'pt'): string | null {
  if (!finito(m.origem?.x) || !finito(m.origem?.y) || !finito(m.baseOffset)) return t(lang, 'md_mass_numero', { i: 0 });
  if (m.interpolacao !== 'linear' && m.interpolacao !== 'suave') return t(lang, 'md_mass_interpolacao');
  if (!inteiroEm(m.resolucao, MASSA_LIMITES.resolucaoMin, MASSA_LIMITES.resolucaoMax)) return t(lang, 'md_mass_resolucao', { min: MASSA_LIMITES.resolucaoMin, max: MASSA_LIMITES.resolucaoMax });
  const s = secoesIssue(m.secoes, lang);
  if (s) return s;
  return m.arranjo ? arranjoIssue(m.arranjo, lang) : null;
}
