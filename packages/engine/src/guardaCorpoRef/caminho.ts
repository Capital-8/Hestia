/**
 * Referência TS do caminho hospedado do guarda-corpo (decisão 0055, Fase 3a). Reproduz `crates/geom-wasm/src/gc_caminho.rs` a partir das colunas de `CenaGC`
 * e devolve as mesmas quatro saídas planas de `guarda_caminhos`. Usada SÓ pelos testes de paridade; o app não a chama (o Rust é a verdade).
 */
import { arcFromSagitta, arcPointAt, type Vec2 } from '@hestia/geom';
import type { CenaGC } from '../kernelGuardaCorpo.ts';

export const AVISO_HOSPEDEIRO_DESCONTINUO = 1;
export const AVISO_DESLOCAMENTO_EXCEDE = 2;
export const LIMITE_ESQUADRIA = 2.5;
export const FLAG_CURVO = 1;
export const FLAG_FECHADO = 2;
export const FLAG_SOLDADO = 4;
export const FLAG_DIREITO = 8;
const GRADE = 1e-6;
const NIVEL_TODOS = 0xffffffff;

export interface SaidaCaminhos {
  trechos: number[];
  nos: number[];
  avisos: number[];
  valores: number[];
}

type P3 = [number, number, number];
interface Peca {
  origem: number;
  curvo: boolean;
  nos: P3[];
}
type Ref = [Vec2, Vec2];
interface Item {
  lance: boolean;
  iniRef: Ref | null;
  fimRef: Ref | null;
  esq: Peca | null;
  dir: Peca | null;
  anel: { pts: Vec2[]; z: number } | null;
}
type Linha = Record<string, number>;

const v = (x: number, y: number): Vec2 => ({ x, y });
const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
const mul = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const perp = (a: Vec2): Vec2 => v(-a.y, a.x);
const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
const grade = (x: number): number => Math.round(x / GRADE) * GRADE;
const normalizado = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? v(0, 0) : v(a.x / l, a.y / l);
};

function pontoSegmento(p: Vec2, a: Vec2, b: Vec2): [number, number] {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-18 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  return [dist(p, add(a, mul(ab, t))), t];
}

function amostrarCurva(a: Vec2, b: Vec2, sag: number, tol: number): [Vec2[], boolean] {
  const arc = Math.abs(sag) < 1e-6 || dist(a, b) < 1e-6 ? null : arcFromSagitta(a, b, sag);
  if (!arc) return [[a, b], false];
  const passo = 2 * Math.acos(Math.max(0, 1 - tol / arc.radius));
  const porCorda = passo > 1e-9 ? Math.ceil(Math.abs(arc.sweep) / passo) : 720;
  const porQuarto = Math.ceil((Math.abs(arc.sweep) / (Math.PI / 2)) * 8);
  const n = Math.min(720, Math.max(2, porCorda, porQuarto));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(arcPointAt(arc, (arc.length * i) / n, 0));
  out[0] = a;
  out[n] = b;
  return [out, true];
}

const acumulado = (p: Vec2[]): number[] => {
  const c = [0];
  for (let i = 0; i + 1 < p.length; i++) c.push(c[c.length - 1]! + dist(p[i]!, p[i + 1]!));
  return c;
};

function projetar(p: Vec2[], cum: number[], q: Vec2): [number, number] {
  let melhor: [number, number] = [0, Infinity];
  for (let i = 0; i + 1 < p.length; i++) {
    const [d, t] = pontoSegmento(q, p[i]!, p[i + 1]!);
    if (d < melhor[1]) melhor = [cum[i]! + t * (cum[i + 1]! - cum[i]!), d];
  }
  return melhor;
}

function pontoEm(p: Vec2[], cum: number[], s: number): Vec2 {
  for (let i = 0; i + 1 < p.length; i++) {
    if (s <= cum[i + 1]! || i === p.length - 2) {
      const l = cum[i + 1]! - cum[i]!;
      const t = l < 1e-18 ? 0 : Math.min(1, Math.max(0, (s - cum[i]!) / l));
      return add(p[i]!, mul(sub(p[i + 1]!, p[i]!), t));
    }
  }
  return p[0]!;
}

function semColineares(nos: P3[]): P3[] {
  if (nos.length < 3) return nos;
  const out: P3[] = [nos[0]!];
  for (let k = 1; k < nos.length - 1; k++) {
    const a = out[out.length - 1]!;
    const u = normalizado(v(nos[k]![0] - a[0], nos[k]![1] - a[1]));
    const w = normalizado(v(nos[k + 1]![0] - nos[k]![0], nos[k + 1]![1] - nos[k]![1]));
    if (Math.abs(cross(u, w)) > 1e-9 || dot(u, w) < 0) out.push(nos[k]!);
  }
  out.push(nos[nos.length - 1]!);
  return out;
}

const semRepetidos = (p: Vec2[]): Vec2[] => {
  const out: Vec2[] = [];
  for (const q of p) if (out.length === 0 || dist(out[out.length - 1]!, q) > 1e-9) out.push(q);
  return out;
};

function deslocar(p: Vec2[], d: number, fechado: boolean): Array<[Vec2, number]> | null {
  const n = p.length;
  if (d === 0 || n < 2) return p.map((q, i) => [q, i]);
  const m = fechado ? n : n - 1;
  const nor = Array.from({ length: m }, (_, i) => perp(normalizado(sub(p[(i + 1) % n]!, p[i]!))));
  const out: Array<[Vec2, number]> = [];
  for (let k = 0; k < n; k++) {
    let n1: Vec2;
    let n2: Vec2;
    if (fechado) [n1, n2] = [nor[(k + m - 1) % m]!, nor[k % m]!];
    else if (k === 0) [n1, n2] = [nor[0]!, nor[0]!];
    else if (k === n - 1) [n1, n2] = [nor[m - 1]!, nor[m - 1]!];
    else [n1, n2] = [nor[k - 1]!, nor[k]!];
    const den = 1 + dot(n1, n2);
    const w = den > 1e-9 ? mul(add(n1, n2), d / den) : null;
    if (w && Math.hypot(w.x, w.y) <= LIMITE_ESQUADRIA * Math.abs(d)) out.push([add(p[k]!, w), k]);
    else {
      out.push([add(p[k]!, mul(n1, d)), k]);
      out.push([add(p[k]!, mul(n2, d)), k]);
    }
  }
  const total = fechado ? out.length : out.length - 1;
  for (let k = 0; k < total; k++) {
    const a = out[k]!;
    const b = out[(k + 1) % out.length]!;
    if (b[1] === (a[1] + 1) % n && b[1] !== a[1]) {
      if (dot(sub(b[0], a[0]), sub(p[b[1]]!, p[a[1]]!)) < 0) return null;
    }
  }
  return out;
}

function linhas(c: CenaGC, nome: keyof CenaGC['secoes']): Linha[] {
  const sec = c.secoes[nome];
  const n = c.nLinhas[nome];
  const out: Linha[] = [];
  for (let i = 0; i < n; i++) out.push(Object.fromEntries(Object.entries(sec).map(([k, col]) => [k, col[i]!])));
  return out.sort((a, b) => a['id_num']! - b['id_num']!);
}

function cadeiaLanceEscada(esp0: Linha[], curvas: Linha[], zBase: number, tol: number): { nos: P3[]; curvo: boolean } | null {
  if (curvas.length === 0) return null;
  let poly: Vec2[] = [];
  let curvo = false;
  for (const c of curvas) {
    const [pts, arco] = amostrarCurva(v(c['ax']!, c['ay']!), v(c['bx']!, c['by']!), c['sag']!, tol);
    curvo ||= arco;
    poly.push(...pts);
  }
  poly = semRepetidos(poly);
  if (poly.length < 2) return null;
  const esp = [...esp0].sort((a, b) => a['indice']! - b['indice']!);
  if (esp.length === 0) return { nos: poly.map((q) => [q.x, q.y, zBase]), curvo };
  const sDo = (pl: Vec2[], cum: number[], i: number): number => {
    const [sa, da] = projetar(pl, cum, v(esp[i]!['ax']!, esp[i]!['ay']!));
    const [sb, db] = projetar(pl, cum, v(esp[i]!['bx']!, esp[i]!['by']!));
    return da <= db ? sa : sb;
  };
  const ult = esp.length - 1;
  let cum = acumulado(poly);
  let s0 = sDo(poly, cum, 0);
  let s1 = sDo(poly, cum, ult);
  if (s0 > s1) {
    poly = [...poly].reverse();
    cum = acumulado(poly);
    s0 = sDo(poly, cum, 0);
    s1 = sDo(poly, cum, ult);
  }
  const z0 = esp[0]!['z1']!;
  const z1 = esp[ult]!['z1']!;
  if (ult === 0 || Math.abs(s1 - s0) < 1e-9) return { nos: poly.map((q) => [q.x, q.y, z1]), curvo };
  const zEm = (s: number): number => z0 + ((z1 - z0) * (s - s0)) / (s1 - s0);
  const nos: P3[] = [];
  const p0 = pontoEm(poly, cum, s0);
  nos.push([p0.x, p0.y, z0]);
  poly.forEach((q, k) => {
    if (cum[k]! > s0 + 1e-9 && cum[k]! < s1 - 1e-9) nos.push([q.x, q.y, zEm(cum[k]!)]);
  });
  const p1 = pontoEm(poly, cum, s1);
  nos.push([p1.x, p1.y, z1]);
  return { nos: curvo ? nos : semColineares(nos), curvo };
}

function anelDe(pts: Array<[number, Vec2, number]>): { pts: Vec2[]; z: number } | null {
  if (pts.length === 0) return null;
  const ord = [...pts].sort((a, b) => a[0] - b[0]);
  const z = ord[0]![2];
  const a = ord.map((x) => x[1]);
  if (a.length > 1 && dist(a[0]!, a[a.length - 1]!) < 1e-9) a.pop();
  return a.length < 3 ? null : { pts: a, z };
}

function itensEscada(c: CenaGC, escId: number, tol: number): Item[] {
  const esc = linhas(c, 'escadas_gc').find((e) => e['id_num'] === escId)!;
  const comps = linhas(c, 'escada_componentes_gc')
    .filter((x) => x['escada_num'] === escId)
    .sort((a, b) => a['indice']! - b['indice']!);
  const curvasT = linhas(c, 'escada_curvas_gc');
  const espT = linhas(c, 'escada_espelhos_gc');
  const patT = linhas(c, 'escada_patamares_gc');
  const itens: Item[] = [];
  for (const k of comps) {
    const id = k['id_num']!;
    if (k['tipo'] === 0) {
      const esp = espT.filter((e) => e['componente_num'] === id).sort((a, b) => a['indice']! - b['indice']!);
      const ref = (e: Linha | undefined): Ref | null => (e ? [v(e['ax']!, e['ay']!), v(e['bx']!, e['by']!)] : null);
      const origem = k['caracol'] ? 3 : 0;
      const mk = (lado: number): Peca | null => {
        const ch = cadeiaLanceEscada(
          esp,
          curvasT.filter((x) => x['componente_num'] === id && x['lado'] === lado).sort((a, b) => a['ordem']! - b['ordem']!),
          esc['z_base']!,
          tol,
        );
        return ch ? { origem, curvo: ch.curvo || !!k['caracol'], nos: ch.nos } : null;
      };
      itens.push({ lance: true, iniRef: ref(esp[0]), fimRef: ref(esp[esp.length - 1]), esq: mk(0), dir: mk(1), anel: null });
    } else {
      const pts = patT.filter((p) => p['componente_num'] === id).map((p): [number, Vec2, number] => [p['indice']!, v(p['x']!, p['y']!), p['z']!]);
      itens.push({ lance: false, iniRef: null, fimRef: null, esq: null, dir: null, anel: anelDe(pts) });
    }
  }
  return itens;
}

function itensRampa(c: CenaGC, rampaId: number): Item[] {
  const lances = linhas(c, 'rampa_lances_gc').filter((l) => l['rampa_num'] === rampaId);
  const patT = linhas(c, 'rampa_patamares_gc').filter((p) => p['rampa_num'] === rampaId);
  const ordem: Array<[number, boolean]> = lances.map((l) => [l['indice']!, true]);
  for (const idx of [...new Set(patT.map((p) => p['componente']!))]) ordem.push([idx, false]);
  ordem.sort((a, b) => a[0] - b[0] || Number(b[1]) - Number(a[1]));
  const itens: Item[] = [];
  for (const [idx, lance] of ordem) {
    if (lance) {
      const l = lances.find((x) => x['indice'] === idx)!;
      const a = v(l['ax']!, l['ay']!);
      const b = v(l['bx']!, l['by']!);
      const cc = v(l['cx']!, l['cy']!);
      const d = v(l['dx']!, l['dy']!);
      let dir = v(l['ex']! - l['sx']!, l['ey']! - l['sy']!);
      if (Math.hypot(dir.x, dir.y) < 1e-9) dir = sub(mul(add(cc, d), 0.5), mul(add(a, b), 0.5));
      const ref0 = mul(add(a, b), 0.5);
      const aEsq = cross(dir, sub(a, ref0)) >= cross(dir, sub(b, ref0));
      const cEsq = cross(dir, sub(cc, ref0)) >= cross(dir, sub(d, ref0));
      const [ea, da] = aEsq ? [a, b] : [b, a];
      const [ec, dc] = cEsq ? [cc, d] : [d, cc];
      const mk = (p: Vec2, q: Vec2): Peca => ({ origem: 0, curvo: false, nos: [[p.x, p.y, l['z0']!], [q.x, q.y, l['z1']!]] });
      itens.push({ lance: true, iniRef: [a, b], fimRef: [cc, d], esq: mk(ea, ec), dir: mk(da, dc), anel: null });
    } else {
      const pts = patT.filter((p) => p['componente'] === idx).map((p): [number, Vec2, number] => [p['indice']!, v(p['x']!, p['y']!), p['z']!]);
      itens.push({ lance: false, iniRef: null, fimRef: null, esq: null, dir: null, anel: anelDe(pts) });
    }
  }
  return itens;
}

const custoAresta = (a: Vec2, b: Vec2, r: Ref): number => pontoSegmento(a, r[0], r[1])[0] + pontoSegmento(b, r[0], r[1])[0];

function cadeiasPatamar(anel: Vec2[], z: number, entrada: Ref | null, saida: Ref | null): [Peca | null, Peca | null] {
  const n = anel.length;
  const ar = (i: number): [Vec2, Vec2] => [anel[i]!, anel[(i + 1) % n]!];
  const mel = (i: number): Vec2 => mul(add(ar(i)[0], ar(i)[1]), 0.5);
  const melhor = (r: Ref, fora: number | null): number => {
    let best = -1;
    let bc = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === fora) continue;
      const cst = custoAresta(ar(i)[0], ar(i)[1], r);
      if (cst < bc) [best, bc] = [i, cst];
    }
    return Math.max(best, 0);
  };
  const longe = (de: number): number => {
    let best = -1;
    let bd = -Infinity;
    for (let i = 0; i < n; i++) {
      if (i === de) continue;
      const d = dist(mel(i), mel(de));
      // Empate: o menor índice vence (espelha o `then(j.cmp(&i))` do Rust).
      if (d > bd) [best, bd] = [i, d];
    }
    return Math.max(best, 0);
  };
  let a: number;
  let b: number;
  if (entrada && saida) {
    a = melhor(entrada, null);
    b = melhor(saida, a);
  } else if (entrada) {
    a = melhor(entrada, null);
    b = longe(a);
  } else if (saida) {
    b = melhor(saida, null);
    a = longe(b);
  } else {
    a = 0;
    b = longe(0);
  }
  const c1: Vec2[] = [];
  for (let i = (a + 1) % n; ; i = (i + 1) % n) {
    c1.push(anel[i]!);
    if (i === b) break;
  }
  const c2: Vec2[] = [];
  for (let i = (b + 1) % n; ; i = (i + 1) % n) {
    c2.push(anel[i]!);
    if (i === a) break;
  }
  c2.reverse();
  const me = mel(a);
  const soma = (c: Vec2[]): Vec2 => c.reduce((s, q) => add(s, q), v(0, 0));
  const cen = mul(soma(anel), 1 / n);
  const din = sub(cen, me);
  const k1 = cross(din, sub(mul(soma(c1), 1 / c1.length), me));
  const k2 = cross(din, sub(mul(soma(c2), 1 / c2.length), me));
  const [esq, dir] = k1 >= k2 ? [c1, c2] : [c2, c1];
  const mk = (c: Vec2[]): Peca | null => (c.length < 2 ? null : { origem: 1, curvo: false, nos: c.map((q): P3 => [q.x, q.y, z]) });
  return [mk(esq), mk(dir)];
}

/** Calcula as quatro saídas de `guarda_caminhos` para o nível (`null` = todos). `tolJuncao` é o argumento da consulta. */
export function guardaCaminhosRef(c: CenaGC, nivel: number | null, tolJuncao: number): SaidaCaminhos {
  const out: SaidaCaminhos = { trechos: [], nos: [], avisos: [], valores: [] };
  const tipos = linhas(c, 'tipos_guarda');
  const caminhos = linhas(c, 'guarda_caminhos_manuais');
  const emitir = (guarda: number, trecho: { n: number }, p: Peca, nos: P3[], flags: number, inverter: boolean): void => {
    const ns = inverter ? [...nos].reverse() : nos;
    out.trechos.push(guarda, trecho.n, p.origem, ns.length, flags | (p.curvo ? FLAG_CURVO : 0));
    for (const q of ns) out.nos.push(grade(q[0]), grade(q[1]), grade(q[2]));
    trecho.n++;
  };
  const aviso = (guarda: number, codigo: number, trecho: number, indice: number, vals: number[]): void => {
    out.avisos.push(guarda, codigo, trecho, indice);
    out.valores.push(...vals);
  };
  for (const g of linhas(c, 'guardas_corpo')) {
    const gid = g['id_num']!;
    if (nivel !== null && nivel !== NIVEL_TODOS && g['nivel_num'] !== nivel) continue;
    const tipo = tipos.find((t) => t['id_num'] === g['tipo_num'])!;
    const desloc = g['desloc']!;
    if (g['hosp'] === 0) {
      const pts = caminhos.filter((x) => x['guarda_num'] === gid).sort((a, b) => a['indice']! - b['indice']!);
      let plano: Vec2[] = [];
      let z: number[] = [];
      for (const q of pts) {
        const p = v(q['x']!, q['y']!);
        if (plano.length === 0 || dist(plano[plano.length - 1]!, p) > 1e-9) {
          plano.push(p);
          z.push(g['cota_base']! + q['dz']!);
        }
      }
      const fechado = g['fechado'] === 1;
      if (fechado && plano.length > 2 && dist(plano[0]!, plano[plano.length - 1]!) < 1e-9) {
        plano = plano.slice(0, -1);
        z = z.slice(0, -1);
      }
      if (plano.length < 2) continue;
      const d = g['lado_desloc'] === 0 ? desloc : g['lado_desloc'] === 1 ? -desloc : 0;
      const off = deslocar(plano, d, fechado);
      if (!off) {
        aviso(gid, AVISO_DESLOCAMENTO_EXCEDE, 0, 0, [desloc, 0, plano[0]!.x, plano[0]!.y, z[0]!]);
        continue;
      }
      emitir(gid, { n: 0 }, { origem: 2, curvo: false, nos: [] }, off.map(([q, s]): P3 => [q.x, q.y, z[s]!]), fechado ? FLAG_FECHADO : 0, g['inverter'] === 1);
      continue;
    }
    const itens = g['hosp'] === 1 ? itensEscada(c, g['hosp_num']!, tipo['tol_corda']!) : itensRampa(c, g['hosp_num']!);
    for (let k = 0; k < itens.length; k++) {
      const it = itens[k]!;
      if (it.lance || !it.anel) continue;
      const [e, d] = cadeiasPatamar(it.anel.pts, it.anel.z, k > 0 ? itens[k - 1]!.fimRef : null, itens[k + 1]?.iniRef ?? null);
      it.esq = e;
      it.dir = d;
    }
    const trecho = { n: 0 };
    const lados = g['lados']!;
    for (const lado of [0, 1]) {
      const bitLance = lado === 0 ? 1 : 4;
      const bitPat = lado === 0 ? 2 : 8;
      const runs: Array<Array<[number, Peca]>> = [];
      let run: Array<[number, Peca]> = [];
      const gaps: Array<[number, number[]]> = [];
      itens.forEach((it, k) => {
        const ligado = (lados & (it.lance ? bitLance : bitPat)) !== 0;
        const peca = lado === 0 ? it.esq : it.dir;
        if (ligado && peca) {
          const ult = run[run.length - 1];
          if (ult) {
            const fim = ult[1].nos[ult[1].nos.length - 1]!;
            const ini = peca.nos[0]!;
            const folga = Math.hypot(ini[0] - fim[0], ini[1] - fim[1]);
            if (ult[0] + 1 !== k) {
              runs.push(run);
              run = [];
            } else if (folga > tolJuncao) {
              gaps.push([k, [folga, tolJuncao, ini[0], ini[1], ini[2]]]);
              runs.push(run);
              run = [];
            }
          }
          run.push([k, peca]);
        } else if (run.length > 0) {
          runs.push(run);
          run = [];
        }
      });
      if (run.length > 0) runs.push(run);
      let prox = trecho.n;
      const inicioDe: Array<[number, number]> = [];
      for (const r of runs) {
        inicioDe.push([r[0]![0], prox]);
        prox += r.length;
      }
      for (const [k, vals] of gaps) aviso(gid, AVISO_HOSPEDEIRO_DESCONTINUO, inicioDe.find((x) => x[0] === k)?.[1] ?? trecho.n, k, vals);
      const d = (g['pos_base'] === 0) === (lado === 1) ? desloc : -desloc;
      for (const r of runs) {
        const plano: Vec2[] = [];
        const inicio: number[] = [];
        r.forEach(([, p], i) => {
          const salto = i > 0 ? 1 : 0;
          inicio.push(plano.length - salto);
          for (const q of p.nos.slice(salto)) plano.push(v(q[0], q[1]));
        });
        const off = deslocar(plano, d, false);
        if (!off) {
          const q = r[0]![1].nos[0]!;
          aviso(gid, AVISO_DESLOCAMENTO_EXCEDE, trecho.n, r[0]![0], [desloc, 0, q[0], q[1], q[2]]);
          trecho.n += r.length;
          continue;
        }
        const pecas = r.map(([, p], i): [Peca, P3[]] => {
          const a = inicio[i]!;
          const b = a + p.nos.length - 1;
          return [p, off.filter(([, s]) => s >= a && s <= b).map(([q, s]): P3 => [q.x, q.y, p.nos[s - a]![2]])];
        });
        // Inverter reverte a sequência inteira (ordem dos trechos e nós de cada um); só reverter os nós faria lance, patamar e lance em zigue-zague.
        if (g['inverter'] === 1) pecas.reverse();
        pecas.forEach(([p, nos], i) => emitir(gid, trecho, p, nos, (i > 0 ? FLAG_SOLDADO : 0) | (lado === 1 ? FLAG_DIREITO : 0), g['inverter'] === 1));
      }
    }
  }
  return out;
}
