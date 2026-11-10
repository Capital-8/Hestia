/**
 * Referência TS da distribuição do guarda-corpo (decisão 0055, Fase 3c): postes (§5.5), balaústres (§5.6) e painéis (§5.7), sem a malha.
 * Espelha `crates/geom-wasm/src/gc_distribuicao.rs`; é usada SÓ pelo teste de paridade (`distribuicao.paridade.test.ts`), nunca pelo app.
 * Toda medida é horizontal (`s` = comprimento horizontal acumulado do trecho). Tolerância de paridade: 1e-6 m, contagens exatas.
 */

const EPS = 1e-9;
const EPS_S = 1e-7;

export const AVISO_PADRAO_NAO_CABE = 1;
export const AVISO_PADRAO_COMPRIMIDO = 2;
export const AVISO_VAO_SEM_ESPACO = 3;
export const AVISO_POSTE_SOBRA_CURTA = 4;

export const POSTE_INICIO = 0;
export const POSTE_FIM = 1;
export const POSTE_CANTO = 2;
export const POSTE_INTERMEDIARIO = 3;

const MODO_NENHUM = 0;
const MODO_MAXIMO = 1;
const MODO_FIXO = 2;
const MODO_NUMERO = 3;
const JUSTIF_INICIO = 0;
const JUSTIF_FIM = 1;
const SOBRA_EXTRA = 1;
const SOBRA_FOLGA_PONTAS = 2;
const QUEBRA_SEGMENTO = 0;
const QUEBRA_ANGULO = 1;
const ESCOPO_VAO = 0;
const ORIGEM_LANCE = 0;
const ORIGEM_CARACOL = 3;

export interface No3 { x: number; y: number; z: number }
export interface TrechoRef { nos: No3[]; curvo: boolean; fechado: boolean; origem: number }
export interface PosteRef { ativo: boolean; largura: number }
export interface ParamPostesRef {
  inicio: PosteRef; fim: PosteRef; canto: PosteRef; intermediario: PosteRef;
  angCanto: number; modo: number; espacamento: number; numero: number;
}
export interface ElemRef { largura: number | null; dist: number; lateral: number; base: number; topo: number }
export interface PadraoRef {
  elementos: ElemRef[]; periodo: number; justif: number; sobra: number; quebra: number; angQuebra: number; escopo: number;
  hBase: number; hTopo: number;
  porDegrau: { ativo: boolean; quantidade: number; distQuina: number; largura: number | null };
}
export interface DegrauRef { s0: number; prof: number; z: number }
export interface PainelRef { larguraMax: number; folga: number }
export interface ConfigRef { altura: number; postes: ParamPostesRef; padrao: PadraoRef | null; painel: PainelRef | null; degraus: DegrauRef[] }

export interface Percurso { nos: No3[]; s: number[]; n: number; total: number; fechado: boolean }
export interface Amostra { x: number; y: number; z: number; ux: number; uy: number }
export interface PosteSaida { s: number; papel: number; no: boolean; meia: number; x: number; y: number; z0: number; z1: number }
export interface BalaustreSaida { s: number; x: number; y: number; z0: number; z1: number; elem: number }
export interface AvisoSaida { codigo: number; s: number; valor: number }
export interface SaidaRef { postes: PosteSaida[]; balaustres: BalaustreSaida[]; paineis: Array<[number, number]>; avisos: AvisoSaida[] }

export function percurso(t: TrechoRef): Percurso {
  let nos: No3[] = [];
  for (const p of t.nos) {
    const q = nos[nos.length - 1];
    if (!q || Math.hypot(q.x - p.x, q.y - p.y) > EPS) nos.push(p);
  }
  if (t.fechado && nos.length > 1) {
    const a = nos[0]!;
    const b = nos[nos.length - 1]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) <= EPS) nos = nos.slice(0, -1);
  }
  const n = nos.length;
  const fechado = t.fechado && n >= 3;
  if (fechado) nos.push(nos[0]!);
  const s = [0];
  for (let i = 0; i + 1 < nos.length; i++) s.push(s[s.length - 1]! + Math.hypot(nos[i + 1]!.x - nos[i]!.x, nos[i + 1]!.y - nos[i]!.y));
  return { nos, s, n, total: s[s.length - 1]!, fechado };
}

const nSeg = (p: Percurso): number => Math.max(0, p.nos.length - 1);

function dirSeg(p: Percurso, k: number): [number, number] {
  const a = p.nos[k]!;
  const b = p.nos[k + 1]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return [(b.x - a.x) / l, (b.y - a.y) / l];
}

function inclinacao(p: Percurso, k: number): number {
  return (p.nos[k + 1]!.z - p.nos[k]!.z) / (p.s[k + 1]! - p.s[k]!);
}

function dirNo(p: Percurso, i: number): [number, number] {
  const m = nSeg(p);
  let prev: number | null;
  let next: number | null;
  if (i === 0) {
    prev = p.fechado ? m - 1 : null;
    next = 0;
  } else if (i >= m) {
    prev = m - 1;
    next = p.fechado ? 0 : null;
  } else {
    prev = i - 1;
    next = i;
  }
  if (prev !== null && next !== null) {
    const da = dirSeg(p, prev);
    const db = dirSeg(p, next);
    const sx = da[0] + db[0];
    const sy = da[1] + db[1];
    const l = Math.hypot(sx, sy);
    return l < 1e-9 ? db : [sx / l, sy / l];
  }
  if (prev !== null) return dirSeg(p, prev);
  if (next !== null) return dirSeg(p, next);
  return [1, 0];
}

export function giro(p: Percurso, i: number): number {
  const m = nSeg(p);
  let a: number;
  let b: number;
  if (i === 0) {
    if (!p.fechado || m === 0) return 0;
    a = m - 1;
    b = 0;
  } else if (i >= m) return 0;
  else {
    a = i - 1;
    b = i;
  }
  const da = dirSeg(p, a);
  const db = dirSeg(p, b);
  return Math.abs(Math.atan2(da[0] * db[1] - da[1] * db[0], da[0] * db[0] + da[1] * db[1]));
}

export function amostra(p: Percurso, sIn: number): Amostra {
  if (p.nos.length < 2) {
    const q = p.nos[0] ?? { x: 0, y: 0, z: 0 };
    return { x: q.x, y: q.y, z: q.z, ux: 1, uy: 0 };
  }
  const s = Math.min(Math.max(sIn, 0), p.total);
  const m = nSeg(p);
  // Mesmo critério da busca binária do Rust: o índice exato se existe, senão o segmento anterior.
  let k = 0;
  const exato = p.s.indexOf(s);
  if (exato >= 0) k = Math.min(exato, m - 1);
  else {
    let lo = 0;
    while (lo < p.s.length && p.s[lo]! < s) lo++;
    k = Math.min(Math.max(lo - 1, 0), m - 1);
  }
  let dir: [number, number] | null = null;
  for (const cand of [k, k + 1]) {
    if (cand < p.s.length && Math.abs(p.s[cand]! - s) < EPS_S) dir = dirNo(p, cand);
  }
  const a = p.nos[k]!;
  const b = p.nos[k + 1]!;
  const t = Math.min(Math.max((s - p.s[k]!) / (p.s[k + 1]! - p.s[k]!), 0), 1);
  const [ux, uy] = dir ?? dirSeg(p, k);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, ux, uy };
}

function novoPoste(p: Percurso, s: number, papel: number, no: boolean, pp: ParamPostesRef, altura: number): PosteSaida {
  const par = papel === POSTE_INICIO ? pp.inicio : papel === POSTE_FIM ? pp.fim : papel === POSTE_CANTO ? pp.canto : pp.intermediario;
  const a = amostra(p, s);
  return { s, papel, no, meia: par.largura / 2, x: a.x, y: a.y, z0: a.z, z1: a.z + altura };
}

export function postes(p: Percurso, curvo: boolean, pp: ParamPostesRef, altura: number, avisos: AvisoSaida[]): PosteSaida[] {
  let nos: PosteSaida[] = [];
  if (p.nos.length < 2) return nos;
  const n = p.n;
  const m = nSeg(p);
  for (let i = 0; i < n; i++) {
    const s = p.s[i]!;
    if (!p.fechado && i === 0) {
      if (pp.inicio.ativo) nos.push(novoPoste(p, s, POSTE_INICIO, true, pp, altura));
    } else if (!p.fechado && i === n - 1) {
      if (pp.fim.ativo) nos.push(novoPoste(p, s, POSTE_FIM, true, pp, altura));
    } else if (!curvo) {
      const [a, b] = i === 0 ? [m - 1, 0] : [i - 1, i];
      if (giro(p, i) > pp.angCanto + EPS) {
        if (pp.canto.ativo) nos.push(novoPoste(p, s, POSTE_CANTO, true, pp, altura));
      } else if (Math.abs(inclinacao(p, a!) - inclinacao(p, b!)) > 1e-9) {
        if (pp.intermediario.ativo && pp.modo !== MODO_NENHUM) nos.push(novoPoste(p, s, POSTE_INTERMEDIARIO, true, pp, altura));
        else if (pp.canto.ativo) nos.push(novoPoste(p, s, POSTE_CANTO, true, pp, altura));
      }
    }
  }
  const meiaNo = (s: number): number =>
    nos.filter((q) => Math.abs(q.s - s) < EPS_S || (p.fechado && s > p.total - EPS_S && q.s < EPS_S)).reduce((mx, q) => Math.max(mx, q.meia), 0);
  const lim: number[] = [0, ...nos.map((q) => q.s).filter((s) => s > EPS_S && s < p.total - EPS_S), p.total];
  const inter: PosteSaida[] = [];
  if (pp.intermediario.ativo && pp.modo !== MODO_NENHUM) {
    const meiaI = pp.intermediario.largura / 2;
    for (let w = 0; w + 1 < lim.length; w++) {
      const a = lim[w]!;
      const b = lim[w + 1]!;
      const l = b - a;
      if (l <= EPS) continue;
      const pos: number[] = [];
      if (pp.modo === MODO_MAXIMO && pp.espacamento > 0) {
        const k = Math.ceil(l / pp.espacamento - EPS) - 1;
        for (let j = 1; j <= Math.max(k, 0); j++) pos.push(a + (l * j) / (k + 1));
      } else if (pp.modo === MODO_FIXO && pp.espacamento > 0) {
        let j = 1;
        while (a + j * pp.espacamento < b - EPS) {
          pos.push(a + j * pp.espacamento);
          j += 1;
        }
        const resto = l - (j - 1) * pp.espacamento;
        if (resto < 0.3 * pp.espacamento - EPS) avisos.push({ codigo: AVISO_POSTE_SOBRA_CURTA, s: b, valor: resto });
      } else if (pp.modo === MODO_NUMERO && pp.numero > 0) {
        for (let j = 1; j <= pp.numero; j++) pos.push(a + (l * j) / (pp.numero + 1));
      }
      const ma = meiaNo(a);
      const mb = meiaNo(b);
      for (const s of pos) {
        if (s - a < ma + meiaI - EPS || b - s < mb + meiaI - EPS) continue;
        inter.push(novoPoste(p, s, POSTE_INTERMEDIARIO, false, pp, altura));
      }
    }
  }
  nos = nos.concat(inter);
  nos.sort((x, y) => x.s - y.s || x.papel - y.papel);
  return nos;
}

function meiaEm(ps: PosteSaida[], p: Percurso, s: number): number {
  return ps
    .filter((q) => Math.abs(q.s - s) < EPS_S || (p.fechado && s > p.total - EPS_S && q.s < EPS_S))
    .reduce((mx, q) => Math.max(mx, q.meia), 0);
}

function limitesDeVao(p: Percurso, ps: PosteSaida[]): Array<[number, number]> {
  const todos = [0, ...ps.map((q) => q.s).filter((v) => v > EPS_S && v < p.total - EPS_S), p.total];
  const out: number[] = [];
  for (const v of todos) if (out.length === 0 || Math.abs(v - out[out.length - 1]!) >= EPS_S) out.push(v);
  return out.map((v) => [v, meiaEm(ps, p, v)]);
}

function posicoesNoVao(pad: PadraoRef, cum: number[], lu: number, sRef: number, avisos: AvisoSaida[]): Array<[number, number]> {
  const d = cum[cum.length - 1]!;
  const per0 = pad.periodo;
  let out: Array<[number, number]> = [];
  if (lu < EPS) {
    avisos.push({ codigo: AVISO_VAO_SEM_ESPACO, s: sRef, valor: lu });
    return out;
  }
  if (lu + EPS < d) {
    avisos.push({ codigo: AVISO_PADRAO_NAO_CABE, s: sRef, valor: lu });
    cum.forEach((c, j) => {
      if (c <= lu + EPS) out.push([c, j]);
    });
    return out;
  }
  let u0: number;
  let per: number;
  let k: number;
  if (pad.justif === 3) {
    const m = Math.max(Math.ceil((lu - d) / per0 - EPS), 0);
    if (m < 0.5) {
      u0 = 0;
      per = per0;
      k = 1;
    } else {
      per = (lu - d) / m;
      if (per < 0.5 * per0 - EPS) avisos.push({ codigo: AVISO_PADRAO_COMPRIMIDO, s: sRef, valor: per });
      u0 = 0;
      k = m + 1;
    }
  } else {
    k = Math.floor((lu - d) / per0 + EPS) + 1;
    const sobra = lu - ((k - 1) * per0 + d);
    per = per0;
    if (pad.justif === JUSTIF_INICIO) u0 = pad.sobra === SOBRA_FOLGA_PONTAS ? sobra / 2 : 0;
    else if (pad.justif === JUSTIF_FIM) u0 = pad.sobra === SOBRA_FOLGA_PONTAS ? sobra / 2 : sobra;
    else u0 = sobra / 2;
  }
  for (let r = 0; r < k; r++) cum.forEach((c, j) => out.push([u0 + r * per + c, j]));
  if (pad.sobra === SOBRA_EXTRA && (pad.justif === JUSTIF_INICIO || pad.justif === JUSTIF_FIM)) {
    const sobra = lu - ((k - 1) * per + d);
    if (sobra > EPS && sobra >= per / 2 - EPS) out.push([pad.justif === JUSTIF_INICIO ? lu : 0, 0]);
  }
  out = out.sort((a, b) => a[0] - b[0]);
  return out;
}

const colide = (ps: PosteSaida[], s: number, meia: number, sa: number, sb: number): boolean =>
  ps.some((q) => q.s > sa + EPS_S && q.s < sb - EPS_S && Math.abs(q.s - s) < q.meia + meia - EPS);

export function balaustres(
  p: Percurso, curvo: boolean, origem: number, ps: PosteSaida[], pad: PadraoRef, degraus: DegrauRef[], avisos: AvisoSaida[],
): BalaustreSaida[] {
  if (pad.elementos.length === 0 || pad.elementos.length > 16 || !(pad.periodo > EPS)) throw new Error('ENTRADA');
  const out: BalaustreSaida[] = [];
  if (p.nos.length < 2) return out;
  const larg = (e: ElemRef): number => e.largura ?? 0;
  const cum: number[] = [];
  let acc = 0;
  pad.elementos.forEach((e, j) => {
    if (j > 0) acc += e.dist;
    cum.push(acc);
  });
  const wIni = larg(pad.elementos[0]!);
  const wFim = larg(pad.elementos[pad.elementos.length - 1]!);
  const colocar = (s: number, elem: number, z0: number, z1: number, lateral: number): void => {
    if (z1 <= z0 + EPS) return;
    if (out.length + 1 > 20000) throw new Error('LIMITE');
    const a = amostra(p, s);
    out.push({ s, x: a.x - a.uy * lateral, y: a.y + a.ux * lateral, z0, z1, elem });
  };
  const pd = pad.porDegrau;
  if (pd.ativo && (origem === ORIGEM_LANCE || origem === ORIGEM_CARACOL) && degraus.length > 0 && pd.quantidade >= 1) {
    const q = pd.quantidade;
    const meiaPd = (pd.largura ?? 0) / 2;
    if (pd.largura !== null) {
      for (const dg of degraus) {
        const passo = (dg.prof - pd.distQuina) / q;
        for (let j = 0; j < q; j++) {
          const s0 = dg.s0 + pd.distQuina + j * passo;
          if (s0 < -0.005 || s0 > p.total + 0.005) continue;
          const s = Math.min(Math.max(s0, 0), p.total);
          if (colide(ps, s, meiaPd, -1, p.total + 1)) continue;
          colocar(s, -1, dg.z, amostra(p, s).z + pad.hTopo, 0);
        }
      }
    }
    return out;
  }
  let front: Array<[number, number]> =
    pad.escopo === ESCOPO_VAO ? limitesDeVao(p, ps) : [[0, meiaEm(ps, p, 0)], [p.total, meiaEm(ps, p, p.total)]];
  if (!curvo) {
    const m = nSeg(p);
    for (let i = 1; i < Math.min(p.n, m + 1); i++) {
      if (!p.fechado && i === p.n - 1) continue;
      const quebra = pad.quebra === QUEBRA_SEGMENTO ? true : pad.quebra === QUEBRA_ANGULO ? giro(p, i) > pad.angQuebra + EPS : false;
      if (quebra) front.push([p.s[i]!, meiaEm(ps, p, p.s[i]!)]);
    }
  }
  front.sort((a, b) => a[0] - b[0]);
  const f2: Array<[number, number]> = [];
  for (const f of front) {
    const ult = f2[f2.length - 1];
    if (ult && Math.abs(f[0] - ult[0]) < EPS_S) ult[1] = Math.max(ult[1], f[1]);
    else f2.push([f[0], f[1]]);
  }
  front = f2;
  for (let w = 0; w + 1 < front.length; w++) {
    const [sa, ma] = front[w]!;
    const [sb, mb] = front[w + 1]!;
    const a = ma + wIni / 2;
    const b = mb + wFim / 2;
    const lu = sb - sa - a - b;
    for (const [u, j] of posicoesNoVao(pad, cum, lu, sa, avisos)) {
      const s = sa + a + u;
      const e = pad.elementos[j]!;
      if (e.largura === null) continue;
      if (colide(ps, s, e.largura / 2, sa, sb)) continue;
      const base = amostra(p, s).z;
      colocar(s, j, base + pad.hBase + e.base, base + pad.hTopo + e.topo, e.lateral);
    }
  }
  return out;
}

export function paineis(p: Percurso, ps: PosteSaida[], pn: PainelRef, avisos: AvisoSaida[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (p.nos.length < 2) return out;
  const lim = limitesDeVao(p, ps);
  for (let w = 0; w + 1 < lim.length; w++) {
    const [sa, ma] = lim[w]!;
    const [sb, mb] = lim[w + 1]!;
    const avail = sb - sa - ma - mb - 2 * pn.folga;
    const n = pn.larguraMax > EPS ? Math.max(Math.ceil(avail / pn.larguraMax - EPS), 1) : 1;
    const largura = (avail - (n - 1) * pn.folga) / n;
    if (largura <= EPS) {
      avisos.push({ codigo: AVISO_VAO_SEM_ESPACO, s: sa, valor: largura });
      continue;
    }
    for (let i = 0; i < n; i++) {
      const s0 = sa + ma + pn.folga + i * (largura + pn.folga);
      out.push([s0, s0 + largura]);
    }
  }
  return out;
}

export function distribuir(t: TrechoRef, cfg: ConfigRef): SaidaRef {
  const p = percurso(t);
  const avisos: AvisoSaida[] = [];
  const ps = postes(p, t.curvo, cfg.postes, cfg.altura, avisos);
  const bal = cfg.padrao ? balaustres(p, t.curvo, t.origem, ps, cfg.padrao, cfg.degraus, avisos) : [];
  const pan = cfg.painel ? paineis(p, ps, cfg.painel, avisos) : [];
  return { postes: ps, balaustres: bal, paineis: pan, avisos };
}

// --- formato JSON dos casos de ouro (compartilhado com o teste cargo) ---------------------------------------------------------------------------

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: Json, k: string, d: number): number => (typeof v?.[k] === 'number' ? v[k] : d);
const posteDe = (v: Json): PosteRef => ({ ativo: v !== null && v !== undefined, largura: typeof v === 'number' ? v : 0.05 });

export function casoParaConfig(c: Json): { trecho: TrechoRef; cfg: ConfigRef } {
  const trecho: TrechoRef = {
    nos: (c.nos as number[][]).map((q) => ({ x: q[0]!, y: q[1]!, z: q[2]! })),
    curvo: c.curvo === true,
    fechado: c.fechado === true,
    origem: typeof c.origem === 'number' ? c.origem : 2,
  };
  const pj = c.postes;
  const postesCfg: ParamPostesRef = {
    inicio: posteDe(pj.inicio), fim: posteDe(pj.fim), canto: posteDe(pj.canto), intermediario: posteDe(pj.intermediario),
    angCanto: num(pj, 'ang_canto', 0.0873), modo: num(pj, 'modo', 0), espacamento: num(pj, 'espacamento', 0), numero: num(pj, 'numero', 0),
  };
  let padrao: PadraoRef | null = null;
  if (c.padrao) {
    const d = c.padrao;
    const pd = d.por_degrau ?? {};
    padrao = {
      elementos: (d.elementos as Json[]).map((e) => ({
        largura: typeof e.largura === 'number' ? e.largura : null, dist: num(e, 'dist', 0), lateral: num(e, 'lateral', 0), base: num(e, 'base', 0), topo: num(e, 'topo', 0),
      })),
      periodo: num(d, 'periodo', 0.11), justif: num(d, 'justif', 3), sobra: num(d, 'sobra', 0), quebra: num(d, 'quebra', 2), angQuebra: num(d, 'ang_quebra', 0.0873),
      escopo: num(d, 'escopo', 0), hBase: num(d, 'h_base', 0.1), hTopo: num(d, 'h_topo', 1),
      porDegrau: { ativo: pd.ativo === true, quantidade: num(pd, 'quantidade', 1), distQuina: num(pd, 'dist_quina', 0), largura: typeof pd.largura === 'number' ? pd.largura : null },
    };
  }
  const painel = c.painel ? { larguraMax: num(c.painel, 'largura_max', 0), folga: num(c.painel, 'folga', 0) } : null;
  const degraus: DegrauRef[] = ((c.degraus ?? []) as Json[]).map((d) => ({ s0: num(d, 's0', 0), prof: num(d, 'prof', 0.28), z: num(d, 'z', 0) }));
  return { trecho, cfg: { altura: num(c, 'altura', 1.1), postes: postesCfg, padrao, painel, degraus } };
}

/** Saída no mesmo formato (e na mesma ordem de colunas) que o teste cargo grava em `esperado`. */
export function saidaParaJson(o: SaidaRef): { postes: number[][]; balaustres: number[][]; paineis: number[][]; avisos: number[][] } {
  return {
    postes: o.postes.map((q) => [q.s, q.papel, q.x, q.y, q.z0, q.z1]),
    balaustres: o.balaustres.map((b) => [b.s, b.x, b.y, b.z0, b.z1, b.elem]),
    paineis: o.paineis.map((q) => [q[0], q[1]]),
    avisos: o.avisos.map((a) => [a.codigo, a.s]),
  };
}
