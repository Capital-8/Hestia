import { LIMITES_CORPO } from '@hestia/model';
import type { Caminho, Expr } from '@hestia/model';
import type { CaminhoResolvido } from './corposTipos.ts';

/*
 * Caminho 3D com curvas tangentes (cotovelo de tubo), CONTRATO.md §2.3 "Caminho com curvas". Puro e determinístico:
 * nunca lança por entrada do usuário, devolve `{ ok: false, erro }`. Aqui tudo em METROS.
 */

type V3 = [number, number, number];
export type ResultadoCaminho = { ok: true; caminho: CaminhoResolvido } | { ok: false; erro: string };

const EPS_RETO = 1e-6;
const EPS_COMPRIMENTO = 1e-9;
/** Pontos consecutivos mais próximos que isto (m) são um só (1e-7 m = 0,1 µm; abaixo da resolução de 1 µm da família). */
export const LIMIAR_TRECHO = 1e-7;
const TOL_TRECHO = 1e-6;
const SEGMENTOS_PADRAO = 12;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const soma = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Curva {
  /** Comprimento tangente t = R·tan(φ/2); 0 em canto vivo ou colinear. */
  t: number;
  raio: number;
  phi: number;
  d1: V3;
  d2: V3;
}

/** Arredonda a 1 µm (a unidade de resolução da família). */
const microm = (m: number): number => Math.round(m * 1e6) / 1e6;

/**
 * Arredonda os cantos de uma polilinha 3D com arcos tangentes. `raios[i]` é o raio no vértice interior `i + 1` (0 = vivo).
 * `segmentosPorCurva` passos por arco (o arco tem `segmentos + 1` pontos, A e B inclusos).
 */
export function filetarCaminho(pontos: V3[], raios: number[], segmentosPorCurva: number): ResultadoCaminho {
  const n = pontos.length;
  if (n < 2) return { ok: false, erro: 'o caminho precisa de ao menos 2 pontos' };
  if (n > LIMITES_CORPO.pontosCaminho) return { ok: false, erro: `o caminho passa de ${LIMITES_CORPO.pontosCaminho} pontos` };
  const segs = Math.round(segmentosPorCurva);
  if (!Number.isFinite(segs) || segs < 2 || segs > LIMITES_CORPO.segmentosCurva) {
    return { ok: false, erro: `segmentos por curva fora de 2..${LIMITES_CORPO.segmentosCurva}` };
  }
  const dirs: V3[] = [];
  const comprimentos: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (!a || !b || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return { ok: false, erro: 'ponto do caminho inválido' };
    const d = sub(b, a);
    const c = Math.sqrt(dot(d, d));
    if (c < EPS_COMPRIMENTO) return { ok: false, erro: `segmento ${i + 1} do caminho tem comprimento zero` };
    dirs.push(mul(d, 1 / c));
    comprimentos.push(c);
  }
  const curvas: Curva[] = [];
  for (let i = 1; i < n - 1; i++) {
    const d1 = dirs[i - 1];
    const d2 = dirs[i];
    const r = raios[i - 1] ?? 0;
    if (!d1 || !d2) return { ok: false, erro: 'caminho inconsistente' };
    if (!Number.isFinite(r) || r < 0) return { ok: false, erro: `raio inválido no vértice ${i + 1}` };
    const phi = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
    if (r > 0 && phi > Math.PI - EPS_RETO) return { ok: false, erro: 'retorno de 180° não pode ter curva' };
    const ativo = r > 0 && phi >= EPS_RETO;
    curvas.push({ t: ativo ? r * Math.tan(phi / 2) : 0, raio: ativo ? r : 0, phi, d1, d2 });
  }
  const tDe = (v: number): number => curvas[v - 1]?.t ?? 0;
  for (let j = 0; j + 1 < n; j++) {
    if (tDe(j) + tDe(j + 1) > (comprimentos[j] ?? 0) + TOL_TRECHO) {
      return { ok: false, erro: `curvas se sobrepõem no trecho ${j + 1}` };
    }
  }
  const brutos: V3[] = [];
  const verticesBrutos: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pontos[i];
    const c = curvas[i - 1];
    if (!p) return { ok: false, erro: 'caminho inconsistente' };
    if (!c || c.raio === 0) {
      verticesBrutos.push(brutos.length);
      brutos.push(p);
      continue;
    }
    const a = sub(p, mul(c.d1, c.t));
    const perp = sub(c.d2, mul(c.d1, dot(c.d2, c.d1)));
    const norma = Math.sqrt(dot(perp, perp));
    const nrm = mul(perp, 1 / norma);
    const centro = soma(a, mul(nrm, c.raio));
    for (let s = 0; s <= segs; s++) {
      const th = (c.phi * s) / segs;
      brutos.push(soma(centro, soma(mul(nrm, -c.raio * Math.cos(th)), mul(c.d1, c.raio * Math.sin(th)))));
    }
  }
  return limparTrechos(brutos, verticesBrutos);
}

/** Distância entre dois pontos (m). */
const distancia = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Remove pontos consecutivos a menos de `LIMIAR_TRECHO` (m), para não sobrar segmento ~0 com direção invertida (defeito
 * do arco que começa exatamente num vértice). O primeiro e o último ponto são mantidos: um intermediário quase
 * coincidente com o anterior é descartado; o último substitui o anterior quando está a menos de um limiar dele.
 * `vertices` é reapontado para o ponto que sobrou. Caminho inteiro ~0 é erro, sem lançar.
 */
function limparTrechos(brutos: V3[], verticesBrutos: number[]): ResultadoCaminho {
  const saida: number[] = [];
  const mapa: number[] = [];
  const pontoEm = (k: number): V3 => [saida[k * 3] ?? 0, saida[k * 3 + 1] ?? 0, saida[k * 3 + 2] ?? 0];
  const ultimo = brutos.length - 1;
  for (let j = 0; j <= ultimo; j++) {
    const p = brutos[j];
    if (!p) return { ok: false, erro: 'caminho inconsistente' };
    const k = saida.length / 3 - 1;
    if (k < 0 || distancia(p, pontoEm(k)) >= LIMIAR_TRECHO) {
      saida.push(p[0], p[1], p[2]);
      mapa.push(k + 1);
      continue;
    }
    if (j < ultimo) {
      mapa.push(k);
      continue;
    }
    if (k === 0) return { ok: false, erro: 'caminho com comprimento ~0' };
    saida[k * 3] = p[0];
    saida[k * 3 + 1] = p[1];
    saida[k * 3 + 2] = p[2];
    mapa.push(k);
  }
  const vertices: number[] = [];
  for (const j of verticesBrutos) {
    const idx = mapa[j];
    if (idx !== undefined && vertices[vertices.length - 1] !== idx) vertices.push(idx);
  }
  return { ok: true, caminho: { pontos: saida, vertices } };
}

/** Avalia uma fórmula em mm; `null` quando inválida. */
export type AvaliadorMm = (e: Expr) => number | null;

/** Avalia as fórmulas do caminho (mm → m, 1 µm), valida limites e arredonda os cantos. */
export function resolverCaminho(caminho: Caminho, avaliar: AvaliadorMm): ResultadoCaminho {
  if (caminho.pontos.length > LIMITES_CORPO.pontosCaminho) {
    return { ok: false, erro: `o caminho passa de ${LIMITES_CORPO.pontosCaminho} pontos` };
  }
  const medida = (e: Expr, onde: string): number | string => {
    const v = avaliar(e);
    return v === null || !Number.isFinite(v) ? `fórmula inválida em ${onde}` : microm(v / 1000);
  };
  const pontos: V3[] = [];
  for (let i = 0; i < caminho.pontos.length; i++) {
    const xyz = (caminho.pontos[i] ?? []).map((e, k) => medida(e, `pontos[${i}][${k}]`));
    const [x, y, z] = xyz;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      return { ok: false, erro: xyz.find((v): v is string => typeof v === 'string') ?? `ponto ${i} inválido` };
    }
    pontos.push([x, y, z]);
  }
  const raios: number[] = [];
  for (let i = 0; i < (caminho.raios?.length ?? 0); i++) {
    const e = caminho.raios?.[i];
    const r = e === undefined ? 0 : medida(e, `raios[${i}]`);
    if (typeof r === 'string') return { ok: false, erro: r };
    if (r < 0) return { ok: false, erro: `raio negativo em raios[${i}]` };
    raios.push(r);
  }
  let segmentos = SEGMENTOS_PADRAO;
  if (caminho.segmentosPorCurva !== undefined) {
    const v = avaliar(caminho.segmentosPorCurva);
    if (v === null || !Number.isFinite(v)) return { ok: false, erro: 'fórmula inválida em segmentosPorCurva' };
    segmentos = Math.round(v);
  }
  return filetarCaminho(pontos, raios, segmentos);
}
