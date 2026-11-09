/**
 * Referência TS da varredura de perfil do guarda-corpo (decisão 0055, Fase 3b). Espelha `crates/geom-wasm/src/gc_varredura.rs` passo a passo
 * (mesmas fórmulas e mesma ordem de operações); usada só pelos testes de paridade (`varredura.paridade.test.ts`). O app não a chama.
 */
import type { PecaMalha, V3 } from './malha.ts';

export const LIMITE_ESQUADRIA = 2.5;
export const SOLDA_RAIO_LARGURAS = 1;
export const SOLDA_SEGMENTOS = 8;
export const GANSO_SEGMENTOS = 12;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a: V3): number => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => { const n = norma(a); return n < 1e-300 ? a : mul(a, 1 / n); };
const dist = (a: V3, b: V3): number => norma(sub(a, b));
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export type P2 = [number, number];

export function perfilCircular(diametro: number, lados: number): P2[] {
  const n = lados >= 3 ? Math.min(lados, 256) : diametro > 0.08 ? 24 : 16;
  const r = diametro / 2;
  return Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return [r * Math.cos(a), r * Math.sin(a)] as P2; });
}
export const perfilRetangular = (l: number, a: number): P2[] => [[-l / 2, -a / 2], [l / 2, -a / 2], [l / 2, a / 2], [-l / 2, a / 2]];

const areaComSinal = (p: P2[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return s / 2;
};

export function perfilDe(forma: number, largura: number, altura: number, pontos: P2[], lados: number): P2[] {
  if (forma === 0) return perfilCircular(largura, lados);
  if (forma === 1) return perfilRetangular(largura, altura);
  const p = pontos.slice();
  if (areaComSinal(p) < 0) p.reverse();
  return p;
}

export function triangularPerfil(p: P2[]): [number, number, number][] {
  const resto = p.map((_, i) => i);
  const saida: [number, number, number][] = [];
  const cr = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  while (resto.length > 3) {
    const n = resto.length;
    let achou = -1;
    for (let i = 0; i < n; i++) {
      const a = resto[(i + n - 1) % n], b = resto[i], c = resto[(i + 1) % n];
      if (cr(p[a], p[b], p[c]) <= 1e-14) continue;
      const dentro = resto.some((k) => k !== a && k !== b && k !== c && cr(p[a], p[b], p[k]) >= 0 && cr(p[b], p[c], p[k]) >= 0 && cr(p[c], p[a], p[k]) >= 0);
      if (!dentro) { achou = i; break; }
    }
    const i = achou < 0 ? 0 : achou;
    saida.push([resto[(i + n - 1) % n], resto[i], resto[(i + 1) % n]]);
    resto.splice(i, 1);
  }
  if (resto.length === 3) saida.push([resto[0], resto[1], resto[2]]);
  return saida;
}

export interface Quadro { t: V3; n: V3; b: V3 }

const rodar = (v: V3, k: V3, ang: number): V3 => {
  const s = Math.sin(ang), c = Math.cos(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
};
const ortonormalizar = (n: V3, t: V3): V3 => unit(sub(n, mul(t, dot(n, t))));

export function limparNos(nos: V3[], tol: number, fechado: boolean): V3[] {
  const r: V3[] = [];
  for (const p of nos) if (r.length === 0 || dist(r[r.length - 1], p) > tol) r.push(p);
  if (fechado && r.length > 1 && dist(r[0], r[r.length - 1]) <= tol) r.pop();
  return r;
}

export function quadros(nos: V3[], fechado: boolean): Quadro[] {
  const m = nos.length;
  if (m < 2) return [];
  const ns = fechado ? m : m - 1;
  const q: Quadro[] = [];
  for (let s = 0; s < ns; s++) {
    const t = unit(sub(nos[(s + 1) % m], nos[s]));
    let n: V3;
    if (s === 0) n = Math.hypot(t[0], t[1]) < 1e-9 ? [1, 0, 0] : unit([-t[1], t[0], 0]);
    else {
      const ant = q[s - 1];
      const k = cross(ant.t, t);
      const sen = norma(k);
      const n0 = sen < 1e-14 ? ant.n : rodar(ant.n, mul(k, 1 / sen), Math.atan2(sen, dot(ant.t, t)));
      n = ortonormalizar(n0, t);
    }
    q.push({ t, n, b: cross(t, n) });
  }
  return q;
}

const anel = (p: V3, q: Quadro, m: V3, perfil: P2[]): V3[] => {
  const d = dot(q.t, m);
  return perfil.map(([a, b]) => {
    const w = add(mul(q.n, a), mul(q.b, b));
    return add(p, sub(w, mul(q.t, dot(w, m) / d)));
  });
};

const faixa = (pc: PecaMalha, ra: number, rb: number, np: number): void => {
  for (let j = 0; j < np; j++) {
    const j1 = (j + 1) % np;
    pc.triangulos.push([ra + j, ra + j1, rb + j1]);
    pc.triangulos.push([ra + j, rb + j1, rb + j]);
  }
};

export function varrer(nosEntrada: V3[], fechado: boolean, perfil: P2[], limite: number): PecaMalha {
  const nos = limparNos(nosEntrada, 1e-9, fechado);
  const m = nos.length;
  const pc: PecaMalha = { vertices: [], triangulos: [] };
  if (m < 2 || perfil.length < 3 || (fechado && m < 3)) return pc;
  const q = quadros(nos, fechado);
  const ns = q.length, np = perfil.length;
  const ini = new Array<number>(m).fill(0), fim = new Array<number>(m).fill(0);
  const bandas: [number, number][] = [];
  const empurrar = (r: V3[]): number => { const i = pc.vertices.length; for (const v of r) pc.vertices.push(v); return i; };
  for (let i = 0; i < m; i++) {
    const ent = fechado ? (i + ns - 1) % ns : i > 0 ? i - 1 : null;
    const sai = fechado || i < ns ? i : null;
    if (ent === null && sai !== null) ini[i] = empurrar(anel(nos[i], q[sai], q[sai].t, perfil));
    else if (ent !== null && sai === null) fim[i] = empurrar(anel(nos[i], q[ent], q[ent].t, perfil));
    else if (ent !== null && sai !== null) {
      const soma = add(q[ent].t, q[sai].t);
      const cosm = norma(soma) / 2;
      if (cosm > 1e-9 && 1 / cosm <= limite) {
        const mm = mul(soma, 1 / norma(soma));
        const r = anel(nos[i], q[ent], mm, perfil);
        const r2 = anel(nos[i], q[sai], mm, perfil);
        const ig = r.every((a, k) => dist(a, r2[k]) < 1e-9);
        const a = empurrar(r);
        fim[i] = a;
        if (ig) ini[i] = a;
        else { ini[i] = empurrar(r2); bandas.push([a, ini[i]]); }
      } else {
        fim[i] = empurrar(anel(nos[i], q[ent], q[ent].t, perfil));
        ini[i] = empurrar(anel(nos[i], q[sai], q[sai].t, perfil));
        bandas.push([fim[i], ini[i]]);
      }
    }
  }
  for (let s = 0; s < ns; s++) faixa(pc, ini[s], fim[(s + 1) % m], np);
  for (const [a, b] of bandas) faixa(pc, a, b, np);
  if (!fechado) {
    for (const t of triangularPerfil(perfil)) {
      pc.triangulos.push([fim[m - 1] + t[0], fim[m - 1] + t[1], fim[m - 1] + t[2]]);
      pc.triangulos.push([ini[0] + t[0], ini[0] + t[2], ini[0] + t[1]]);
    }
  }
  return pc;
}

export function filete(nosEntrada: V3[], raio: number, tolCorda: number, nFixo: number | null): V3[] {
  const nos = limparNos(nosEntrada, 1e-9, false);
  const m = nos.length;
  if (m < 3 || raio <= 0) return nos;
  const r: V3[] = [nos[0]];
  for (let i = 1; i < m - 1; i++) {
    const t1 = unit(sub(nos[i], nos[i - 1])), t2 = unit(sub(nos[i + 1], nos[i]));
    const phi = Math.acos(clamp(dot(t1, t2), -1, 1));
    if (phi < 1e-6 || phi > Math.PI - 1e-6) { r.push(nos[i]); continue; }
    const lim = 0.5 * Math.min(dist(nos[i - 1], nos[i]), dist(nos[i], nos[i + 1]));
    const t = Math.min(raio * Math.tan(phi / 2), lim);
    const re = t / Math.tan(phi / 2);
    const p1 = sub(nos[i], mul(t1, t));
    const k = unit(cross(t1, t2));
    const nc = unit(cross(k, t1));
    const c = add(p1, mul(nc, re));
    const u0 = sub(p1, c);
    const n = nFixo !== null ? Math.max(nFixo, 1) : Math.max(Math.ceil(phi / Math.max(2 * Math.acos(1 - Math.min(tolCorda / re, 1)), 1e-6)), 2);
    for (let j = 0; j <= n; j++) r.push(add(c, rodar(u0, k, (phi * j) / n)));
  }
  r.push(nos[m - 1]);
  return r;
}

export const soldar = (nos: V3[], larguraPerfil: number): V3[] => filete(nos, larguraPerfil * SOLDA_RAIO_LARGURAS, 0, SOLDA_SEGMENTOS);

export type Transicao = 'nenhuma' | 'simples' | 'pescoco-de-ganso';
export const raioTransicaoSimples = (d: number): number => Math.max(2 * d, 0.15);
export const distanciaGanso = (d: number): number => Math.max(3 * d, 0.3);

export function corrimaoLancePatamar(lance: V3[], patamar: V3[], hLance: number, hPatamar: number, diametro: number, transicao: Transicao): V3[][] {
  const l = lance.map((p): V3 => [p[0], p[1], p[2] + hLance]);
  const p = patamar.map((q): V3 => [q[0], q[1], q[2] + hPatamar]);
  if (l.length < 2 || p.length < 2) return [l, p].filter((v) => v.length >= 2);
  const lu = l[l.length - 1], pu = p[0];
  const dl = unit(sub(lu, l[l.length - 2]));
  const dp = unit(sub(p[1], pu));
  const dlh = unit([dl[0], dl[1], 0]);
  const dph = unit([dp[0], dp[1], 0]);
  const colinear = dot(dlh, dph) > Math.cos((3 * Math.PI) / 180);
  if (!colinear) return [[...l, ...p]];
  if (transicao === 'nenhuma') return [l, p];
  const hLen = Math.hypot(dl[0], dl[1]);
  const m = hLen < 1e-12 ? 0 : dl[2] / hLen;
  const zL = lu[2], zP = pu[2];
  const ponto = (s: number, z: number): V3 => [lu[0] + dlh[0] * s, lu[1] + dlh[1] * s, z];
  const s0 = -dist([l[0][0], l[0][1], 0], [lu[0], lu[1], 0]);
  if (transicao === 'simples') {
    if (Math.abs(m) < 1e-9) return [[...l, ...p.slice(1)]];
    const sQ = (zP - zL) / m;
    const ultimo = p[p.length - 1];
    const sFim = dist([ultimo[0], ultimo[1], 0], [lu[0], lu[1], 0]);
    if (sQ <= s0 || sQ >= sFim) return [[...l, ...p]];
    return [filete([l[0], ponto(sQ, zP), ultimo], raioTransicaoSimples(diametro), 0.002, null)];
  }
  const dg = Math.min(distanciaGanso(diametro), 0.9 * -s0);
  const g = ponto(-dg, zL - m * dg);
  const e = ponto(0, zP);
  const cam: V3[] = [l[0]];
  if (dg > 1e-9) {
    cam.push(g);
    for (let j = 1; j < GANSO_SEGMENTOS; j++) {
      const u = j / GANSO_SEGMENTOS;
      const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
      const z = h00 * g[2] + h10 * dg * m + h01 * e[2] + h11 * dg * 0;
      cam.push(ponto(-dg + dg * u, z));
    }
  }
  cam.push(e, ...p.slice(1));
  return [cam];
}

export interface ExtensaoPonta { comprimento: number; maisPiso: boolean; horizontal: boolean }

function ponta(c: V3[], fim: boolean, e: ExtensaoPonta, prof: number): V3 | null {
  const comp = e.comprimento + (e.maisPiso ? prof : 0);
  if (comp <= 0 || c.length < 2) return null;
  const n = c.length;
  const [p, v] = fim ? [c[n - 1], sub(c[n - 1], c[n - 2])] : [c[0], sub(c[0], c[1])];
  const d = e.horizontal ? unit([v[0], v[1], 0]) : unit(v);
  if (norma(d) < 0.5) return null;
  return add(p, mul(d, comp));
}

export function estender(c: V3[], ini: ExtensaoPonta | null, fim: ExtensaoPonta | null, profundidadePiso: number): V3[] {
  const r = c.slice();
  const ni = ini ? ponta(c, false, ini, profundidadePiso) : null;
  const nf = fim ? ponta(c, true, fim, profundidadePiso) : null;
  if (ni) r.unshift(ni);
  if (nf) r.push(nf);
  return r;
}

export const comprimentoCaminho = (c: V3[]): number => { let s = 0; for (let i = 0; i + 1 < c.length; i++) s += dist(c[i], c[i + 1]); return s; };

export function posicoesSuportes(l: number, layout: number, espac: number, numero: number, justif: number, postes: number[]): number[] {
  if (l <= 0) return [];
  const uniforme = (n: number): number[] => (n <= 1 ? [l / 2] : Array.from({ length: n }, (_, i) => (l * i) / (n - 1)));
  if (layout === 1 && espac > 0) {
    if (justif === 0) { const v: number[] = []; for (let i = 0; i * espac <= l + 1e-9; i++) v.push(i * espac); return v; }
    if (justif === 1) { const v: number[] = []; for (let i = 0; l - i * espac >= -1e-9; i++) v.push(l - i * espac); return v.reverse(); }
    if (justif === 2) { const n = Math.floor(l / espac + 1e-9) + 1; const p0 = (l - (n - 1) * espac) / 2; return Array.from({ length: n }, (_, i) => p0 + i * espac); }
    return uniforme(Math.ceil(l / espac) + 1);
  }
  if (layout === 2) return postes.filter((s) => s >= -1e-9 && s <= l + 1e-9);
  if (layout === 3 && numero > 0) return uniforme(numero);
  if (layout === 4 && espac > 0) return uniforme(Math.max(Math.ceil(l / espac), 1) + 1);
  if (layout === 5 && espac > 0) return uniforme(Math.max(Math.floor(l / espac), 1) + 1);
  return [];
}

export function suporte(ponto: V3, tangente: V3, lado: number, comprimento: number, perfil: P2[]): PecaMalha {
  const h = unit([-tangente[1], tangente[0], 0]);
  return varrer([ponto, add(ponto, mul(h, lado * comprimento))], false, perfil, LIMITE_ESQUADRIA);
}
