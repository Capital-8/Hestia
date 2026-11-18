import type { Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { TERRENO_LIMITES as L, type Terrain, type TerrainRegion } from './terrainTypes.ts';
import type { Project } from './types.ts';

/** Tolerância numérica das comparações geométricas dos anéis. */
const EPS = 1e-9;

export const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const inteiroEm = (n: unknown, min: number, max: number): boolean => finito(n) && Number.isInteger(n) && n >= min && n <= max;

/** Área com sinal do anel (positiva = anti-horário). */
export function areaAnelComSinal(pts: readonly Vec2[]): number {
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
export function anelTerrenoSimples(pts: readonly Vec2[]): boolean {
  const n = pts.length;
  if (n < 3 || Math.abs(areaAnelComSinal(pts)) <= EPS) return false;
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

/** Pares planos (x0, y0, x1, y1...) → pontos. */
export const paresParaPontos = (xy: readonly number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let k = 0; k + 1 < xy.length; k += 2) out.push({ x: xy[k]!, y: xy[k + 1]! });
  return out;
};

/** Checa finitude e limites de um vetor plano com `passo` números por ponto; `zEm` = posição do z (−1 = sem z). */
function vetorIssue(v: readonly unknown[], passo: number, zEm: number, lang: Lang): string | null {
  for (let k = 0; k < v.length; k++) {
    const n = v[k];
    if (!finito(n)) return t(lang, 'md_tn_numero');
    if (k % passo === zEm) {
      if (Math.abs(n) > L.cotaMax) return t(lang, 'md_tn_cota', { max: L.cotaMax });
    } else if (Math.abs(n) > L.coordMax) return t(lang, 'md_tn_coord', { max: L.coordMax });
  }
  return null;
}

/** Valida as listas de fontes (pontos, curvas, quebras) e os limites de quantidade. */
export function fontesIssue(pontos: readonly number[], curvas: Terrain['curvas'], quebras: Terrain['quebras'], bordaPts: number, lang: Lang = 'pt'): string | null {
  if (!Array.isArray(pontos) || pontos.length % 3 !== 0) return t(lang, 'md_tn_pontos_tam');
  if (!Array.isArray(curvas) || curvas.length > L.curvas) return t(lang, 'md_tn_limite_curvas', { max: L.curvas });
  if (!Array.isArray(quebras) || quebras.length > L.quebras) return t(lang, 'md_tn_limite_quebras', { max: L.quebras });
  let vertices = pontos.length / 3 + bordaPts;
  const p = vetorIssue(pontos, 3, 2, lang);
  if (p) return p;
  for (let i = 0; i < curvas.length; i++) {
    const c = curvas[i]!;
    if (!Array.isArray(c?.xy) || c.xy.length % 2 !== 0 || c.xy.length < 4) return t(lang, 'md_tn_curva_tam', { i: i + 1 });
    if (!finito(c.z) || Math.abs(c.z) > L.cotaMax) return t(lang, 'md_tn_cota', { max: L.cotaMax });
    const v = vetorIssue(c.xy, 2, -1, lang);
    if (v) return v;
    vertices += c.xy.length / 2;
  }
  for (let i = 0; i < quebras.length; i++) {
    const q = quebras[i]!;
    if (!Array.isArray(q?.xyz) || q.xyz.length % 3 !== 0 || q.xyz.length < 6) return t(lang, 'md_tn_quebra_tam', { i: i + 1 });
    const v = vetorIssue(q.xyz, 3, 2, lang);
    if (v) return v;
    vertices += q.xyz.length / 3;
  }
  return vertices > L.vertices ? t(lang, 'md_tn_limite_vertices', { max: L.vertices }) : null;
}

/** Valida a borda (A.3 item 6): 3 ou mais pontos, simples, área > 0 e anti-horária (o comando normaliza o sentido). */
export function bordaIssue(xy: readonly number[], lang: Lang = 'pt'): string | null {
  if (!Array.isArray(xy) || xy.length % 2 !== 0 || xy.length < 6) return t(lang, 'md_tn_borda_pontos');
  const v = vetorIssue(xy, 2, -1, lang);
  if (v) return v;
  const pts = paresParaPontos(xy);
  if (!anelTerrenoSimples(pts)) return t(lang, 'md_tn_borda_simples');
  return areaAnelComSinal(pts) > 0 ? null : t(lang, 'md_tn_borda_horario');
}

/**
 * Problema do terreno, ou null se estiver válido (A.3 item 6). Terreno com menos de 3 vértices é aceito (estado durante a
 * criação; o kernel avisa). Usada pelos comandos de terreno, que recusam terreno inválido.
 */
export function terrainIssue(tn: Terrain, lang: Lang = 'pt'): string | null {
  if (tn.borda !== undefined) {
    const b = bordaIssue(tn.borda, lang);
    if (b) return b;
  }
  const f = fontesIssue(tn.pontos, tn.curvas, tn.quebras, tn.borda ? tn.borda.length / 2 : 0, lang);
  if (f) return f;
  if (!finito(tn.intervaloCurvas) || tn.intervaloCurvas < L.intervaloMin) return t(lang, 'md_tn_intervalo', { min: L.intervaloMin });
  if (!inteiroEm(tn.mestraCada, 1, L.mestraMax)) return t(lang, 'md_tn_mestra', { max: L.mestraMax });
  if (!finito(tn.espessuraBase) || tn.espessuraBase < L.espessuraMin || tn.espessuraBase > L.espessuraMax) return t(lang, 'md_tn_espessura', { min: L.espessuraMin, max: L.espessuraMax });
  if (!Array.isArray(tn.linhasRotulo) || tn.linhasRotulo.length % 4 !== 0 || tn.linhasRotulo.length / 4 > L.linhasRotulo) return t(lang, 'md_tn_rotulos', { max: L.linhasRotulo });
  const r = vetorIssue(tn.linhasRotulo, 2, -1, lang);
  if (r) return r;
  if (!Array.isArray(tn.pontosCotados) || tn.pontosCotados.length % 2 !== 0 || tn.pontosCotados.length / 2 > L.pontosCotados) return t(lang, 'md_tn_cotados', { max: L.pontosCotados });
  return vetorIssue(tn.pontosCotados, 2, -1, lang);
}

/** Valida o contorno de uma região (3 a 512 pontos, simples, anti-horário, números dentro dos limites). */
export function contornoRegiaoIssue(c: readonly Vec2[], lang: Lang = 'pt'): string | null {
  if (!Array.isArray(c) || c.length < 3 || c.length > L.regiaoPontos) return t(lang, 'md_tn_reg_pontos', { max: L.regiaoPontos });
  const v = vetorIssue(c.flatMap((q) => [q?.x, q?.y]), 2, -1, lang);
  if (v) return v;
  if (!anelTerrenoSimples(c)) return t(lang, 'md_tn_reg_simples');
  return areaAnelComSinal(c) > 0 ? null : t(lang, 'md_tn_reg_horario');
}

/**
 * Problema da região, ou null se estiver válida (A.3 item 6). `p` é o projeto onde ela entra: o terreno dono precisa
 * existir e ter menos de 256 regiões (sem contar a própria região, caso ela já exista).
 */
export function terrainRegionIssue(r: TerrainRegion, p: Pick<Project, 'elements'>, lang: Lang = 'pt'): string | null {
  const dono = p.elements[r.terrenoId];
  if (dono?.kind !== 'terrain') return t(lang, 'md_tn_reg_terreno');
  if (r.papel !== 'subdivisao' && r.papel !== 'plataforma' && r.papel !== 'nivelada') return t(lang, 'md_tn_reg_papel');
  const outras = Object.values(p.elements).filter((e) => e.kind === 'terrainRegion' && e.terrenoId === r.terrenoId && e.id !== r.id).length;
  if (outras >= L.regioesPorTerreno) return t(lang, 'md_tn_reg_limite', { max: L.regioesPorTerreno });
  const c = contornoRegiaoIssue(r.contorno, lang);
  if (c) return c;
  if (!finito(r.cota) || Math.abs(r.cota) > L.cotaMax) return t(lang, 'md_tn_cota', { max: L.cotaMax });
  if (!finito(r.direcao)) return t(lang, 'md_tn_numero');
  if (!finito(r.inclinacao) || r.inclinacao < 0 || r.inclinacao > L.inclinacaoMax) return t(lang, 'md_tn_reg_inclinacao', { max: L.inclinacaoMax });
  const talude = (n: unknown): boolean => finito(n) && n >= 0 && n <= L.taludeMax;
  if (!talude(r.taludeCorte) || !talude(r.taludeAterro)) return t(lang, 'md_tn_reg_talude', { max: L.taludeMax });
  return null;
}
