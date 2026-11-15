import { ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { formatQuantity, layerSpans, unitsOf, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { tiltValid } from './wallTilt.ts';
import { levelFrames } from './resolveFrames.ts';
import { semCortina } from './cortinaProjeto.ts';
import { resolveLevel } from './resolve.ts';
import { layerQuad } from './layerGeom.ts';
import { computeEnds, joinStatus } from './joins.ts';
import { sAtDepth, tangentAt, type WallFrame } from './frame.ts';
import { casarMonotono } from './wallTiltCasar.ts';
import { nodeWarp, type NodeWarp } from './wallTiltNo.ts';
import { levelRings, levelSet, levelSetAdaptive, type LevelSet, type Relation, type TiltJoinFail, type TiltWall } from './wallTiltJoin.ts';

/** Junção inclinada de um nível (F2.4): análise por camada, avisos e guarda do kernel. Núcleo geométrico em `wallTiltJoin.ts`. */
const failed = (r: object): r is Pick<TiltJoinFail, 'fail'> => 'fail' in r;

/** Avisos da junção inclinada (códigos de `ValidationIssue`, textos nos 7 idiomas do `egb_issue_tilt_*`). */
export type TiltAvisoCode = 'arcoInclinadoSemJuncao' | 'inclinacaoInviavelNaJuncao' | 'inclinacoesDiferentesEmContinuacao';
export interface TiltAviso {
  code: TiltAvisoCode;
  wallId: string;
  /** `inclinacoesDiferentesEmContinuacao`: degrau no topo H·|tan a − tan b|, em metros. */
  valor?: number;
}
/** Canto liso precisa de poucos níveis (J1: 3 a 10); passar disso é canto descontínuo em z (ex.: encosto entre arcos tangentes). */
const NIVEIS_SUAVES = 32;
/** Degrau mínimo (m) que justifica o aviso de continuação com inclinações diferentes. */
export const DEGRAU_MIN = 0.005;

/**
 * Anel de planta de uma camada em três situações: `raw` = junção vertical sobre a base (o que o resolvedor de planta
 * entrega; serve só para casar vértices), `p0` = nível da base com a espessura horizontal t/cosθ e `pH` = nível do topo.
 * As faces laterais são planas, então o anel na cota z é a interpolação linear p0 + (pH − p0)·z/H (exata em reta×reta).
 */
export interface WallTiltJoinLayer {
  layerIndex: number;
  raw: Vec2[];
  p0: Vec2[];
  pH: Vec2[];
}
export interface WallTiltJoin {
  H: number;
  layers: WallTiltJoinLayer[];
  /**
   * Níveis da junção (J2): cotas `zs` (reta×reta: [0, H/2, H]; com arco: níveis adaptativos, corda < 0,5 mm) e, em cada nível,
   * o anel de planta de cada camada (`rings[k]` é da `layers[k]`, mesma contagem e ordem de vértices que `layers[k].raw`).
   * `p0`/`pH` são o primeiro e o último nível. Ausente só em junções montadas à mão.
   */
  zs?: number[];
  levels?: Array<{ z: number; rings: Vec2[][] }>;
  /**
   * Nó de 3+ paredes retas (N1): deformação contínua da planta vertical do nó para a planta em cada cota (faixas das paredes e miolo).
   * O sólido a usa para o vértice de faixa que cai na zona do nó (o corte do resolvedor vertical é arbitrário nesta zona).
   * Ausente fora de nó.
   */
  nodes?: NodeWarp[];
}
/**
 * Cunha de transição (etapa R, ação B): prisma triangular que fecha o degrau de uma continuação reta×reta com inclinações
 * diferentes. Triângulo no plano perpendicular ao eixo, pelo nó: (0,0), (offA,H), (offB,H) (lateral à esquerda de `u`, cota z),
 * extrudado por `t` ao longo de `u`, centrado no nó. Volume exato = t · H · |offA − offB| / 2.
 */
export interface Cunha {
  /** Parede dona da junção (a mais antiga), que guarda `transicao: 'cunha'`. */
  wallId: string;
  node: Vec2;
  /** Eixo da continuação (unitário) e normal à esquerda. */
  u: Vec2;
  n: Vec2;
  H: number;
  t: number;
  offA: number;
  offB: number;
  volume: number;
}
export interface LevelTiltAnalysis {
  joins: Map<string, WallTiltJoin>;
  avisos: TiltAviso[];
  cunhas: Cunha[];
}

const tiltOf = (f: WallFrame): number => (f.wall.tilt && Number.isFinite(f.wall.tilt) ? f.wall.tilt : 0);

/** Algum elemento do projeto é parede inclinada? (guarda do kernel Rust: o contrato v19 não leva o `tilt`.) */
const comInclinada = new WeakMap<Project, boolean>();
export function projetoTemParedeInclinada(p: Project): boolean {
  let r = comInclinada.get(p);
  if (r === undefined) {
    r = Object.values(p.elements).some((e) => e.kind === 'wall' && !!e.tilt);
    comInclinada.set(p, r);
  }
  return r;
}

/** Anéis de planta de cada camada (com espessura) das paredes do conjunto, na cota do `LevelSet`. */
function ringsOf(ls: LevelSet, id: string): Map<number, Ring> | null {
  const f = ls.frames.get(id)!;
  const e = ls.ends.get(id)!;
  const out = new Map<number, Ring>();
  for (const sp of layerSpans(f.type)) {
    if (sp.layer.thickness < 1e-6) continue;
    out.set(sp.index, layerQuad(f, e, sAtDepth(f, sp.from), sAtDepth(f, sp.to)));
  }
  return out;
}

/** Ligações da base (pair, tee e nó de 3+ paredes retas) em que há parede inclinada; pontas livres ficam como estão. */
export function tiltRelations(frames: readonly WallFrame[], tol?: number): Relation[] {
  const list = [...frames];
  const rels: Relation[] = [];
  const seen = new Set<string>();
  for (const f of list) {
    for (const which of ['a', 'b'] as const) {
      const st = joinStatus(list, f.wall.id, which, tol);
      if (st.kind === 'pair') {
        const p = st.partners[0]!;
        const key = [`${f.wall.id}|${which}`, `${p.wallId}|${p.end}`].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        rels.push({ kind: 'pair', a: { id: f.wall.id, end: which }, b: { id: p.wallId, end: p.end } });
      } else if (st.kind === 'tee') {
        rels.push({ kind: 'tee', branch: { id: f.wall.id, end: which }, host: st.hostId });
      } else if (st.kind === 'node') {
        // Nó de 3+ paredes retas (N1). Com arco no nó, segue sem junção inclinada (como antes).
        const ends = [{ id: f.wall.id, end: which }, ...st.partners.map((p) => ({ id: p.wallId, end: p.end }))];
        const key = ends.map((e) => `${e.id}|${e.end}`).sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        if (ends.every((e) => !list.find((x) => x.wall.id === e.id)!.arc)) rels.push({ kind: 'node', ends });
      }
    }
  }
  return rels;
}

const ids = (r: Relation): string[] => (r.kind === 'pair' ? [r.a.id, r.b.id] : r.kind === 'node' ? r.ends.map((e) => e.id) : [r.branch.id, r.host]);

/**
 * Junção inclinada de um nível (F2.4). A topologia vem SÓ dos eixos da base (`joinStatus`); o topo reaplica a mesma
 * topologia aos eixos deslocados (`levelSet`). Reta×reta: anéis de camada em z=0 e z=H por parede ligada. Arco
 * inclinado (a própria parede ou a parceira): junção exata pelos níveis adaptativos da J2; só o par inviável (cone invertido,
 * sem cruzamento, fora da parede) cai no plano B (encosto) com `arcoInclinadoSemJuncao`. Cruzamento fora
 * da parede, cone invertido ou anel degenerado: a componente inteira degrada para corte simples e avisa
 * `inclinacaoInviavelNaJuncao`. `heights`: altura real (resolvida) por parede; ausente = faixa nominal do quadro.
 * Sem parede inclinada devolve vazio sem custo (caminho idêntico ao de hoje).
 */
export function analyzeLevelTilt(frames: readonly WallFrame[], heights: ReadonlyMap<string, number> = new Map(), tol?: number): LevelTiltAnalysis {
  if (!frames.some((f) => tiltOf(f) !== 0)) return { joins: new Map(), avisos: [], cunhas: [] };
  // Resolver, junção e avisos pedem a mesma análise do mesmo nível: guardada por conteúdo (identidade de parede, tipo, cotas e alturas),
  // com chave barata e estável. O resultado devolvido é compartilhado e não deve ser alterado.
  const chave = `${frames[0]!.wall.levelId}|${frames.length}`;
  const fontes: unknown[] = [tol];
  for (const f of frames) fontes.push(f.wall, f.type, f.z?.z0, f.z?.top, heights.get(f.wall.id));
  const antes = analiseMemo.get(chave);
  if (antes && antes.fontes.length === fontes.length && antes.fontes.every((x, i) => x === fontes[i])) return antes.valor;
  const valor = analyzeLevelTiltRaw(frames, heights, tol);
  if (analiseMemo.size >= 64) analiseMemo.delete(analiseMemo.keys().next().value as string);
  analiseMemo.set(chave, { fontes, valor });
  return valor;
}
const analiseMemo = new Map<string, { fontes: readonly unknown[]; valor: LevelTiltAnalysis }>();
/** Esvazia a memória da análise por nível; ver `cachesDeConteudo.ts`. */
export function esvaziarAnaliseInclinada(): void {
  analiseMemo.clear();
}

/**
 * Casa o anel vertical `raw` (vértices do resolvedor) com os anéis inclinados da mesma camada. A inclinação escala as
 * espessuras por 1/cosθ de cada parede, então camadas que na vertical coincidem sobre a linha de corte passam a ter
 * quebras próprias (mais vértices): a contagem NÃO é critério de viabilidade. Mesma contagem: índice a índice. Contagem
 * diferente: cada vértice de `raw` leva o vértice mais próximo da base (p0 ≈ raw na cota 0) e `pH` o de mesmo índice.
 * null só quando os anéis inclinados são degenerados, de sentido trocado ou de contagens incompatíveis entre si.
 */
function alinhar(raw: Vec2[], p0: Vec2[] | undefined, pH: Vec2[] | undefined): { p0: Vec2[]; pH: Vec2[] } | null {
  if (!p0 || !pH || p0.length !== pH.length) return null;
  const sg = Math.sign(ringArea(raw));
  let a = p0, b = pH;
  if (p0.length !== raw.length) {
    const idx = casarMonotono(raw, p0);
    a = idx.map((j) => p0[j]!);
    b = idx.map((j) => pH[j]!);
  }
  // O anel completo (todos os vértices) é que não pode inverter nem degenerar.
  const ok = Math.sign(ringArea(p0)) === sg && Math.sign(ringArea(pH)) === sg && Math.abs(ringArea(pH)) > 1e-9;
  return ok ? { p0: a, pH: b } : null;
}

const wrapPi = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const RUN_TOL = 1e-7;
interface Run { s: number; len: number }
/** Trechos contíguos (cíclicos) de vértices à mesma distância do centro do arco: as faces de arco do anel. */
function runsOf(poly: readonly Vec2[], c: Vec2): Run[] {
  const n = poly.length;
  const r = poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  let k0 = -1;
  for (let i = 0; i < n; i++) if (Math.abs(r[i]! - r[(i + n - 1) % n]!) >= RUN_TOL) { k0 = i; break; }
  if (k0 < 0) return [];
  const out: Run[] = [];
  let i = 0;
  while (i < n) {
    let len = 1;
    while (len < n && Math.abs(r[(k0 + i + len) % n]! - r[(k0 + i + len - 1) % n]!) < RUN_TOL) len++;
    if (len >= 2) out.push({ s: (k0 + i) % n, len });
    i += len;
  }
  return out;
}

/**
 * Leva o anel `ring` de um nível à contagem e à ordem de vértices de `raw` (anel vertical). Mesma contagem: índice a índice.
 * Contagem diferente (a grade das faces de arco depende do raio e do alcance): cada face de arco é reamostrada por fração
 * angular entre os cantos dela (cantos mantidos), as correntes entre faces casam por ordem (ou pelo vértice mais próximo)
 * e, sem faces de arco, vale o vértice mais próximo (como `alinhar`). null se o anel resultante é degenerado ou invertido.
 */
function alinharNivel(raw: Vec2[], ring: Vec2[], c: Vec2 | null, memo?: { idx?: number[]; m?: number }): Vec2[] | null {
  const n = raw.length, m = ring.length;
  const sg = Math.sign(ringArea(raw));
  const nearest = (p: Vec2, from: number, count: number): Vec2 => {
    let best = ring[from % m]!, d = Infinity;
    for (let k = 0; k < count; k++) { const q = ring[(from + k) % m]!; const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) { d = e; best = q; } }
    return best;
  };
  let out: Vec2[];
  const rr = c ? runsOf(raw, c) : [], lr = c ? runsOf(ring, c) : [];
  if (m === n) out = ring;
  else if (c && rr.length > 0 && rr.length === lr.length) {
    out = new Array<Vec2>(n);
    for (let k = 0; k < rr.length; k++) {
      const A = rr[k]!, B = lr[k]!;
      const ang = (poly: readonly Vec2[], i: number): number => Math.atan2(poly[i % poly.length]!.y - c.y, poly[i % poly.length]!.x - c.x);
      const cum = (poly: readonly Vec2[], run: Run): number[] => {
        const o = [0];
        for (let j = 1; j < run.len; j++) o.push(o[j - 1]! + wrapPi(ang(poly, run.s + j) - ang(poly, run.s + j - 1)));
        return o;
      };
      const ca = cum(raw, A), cb = cum(ring, B);
      const ta = ca[A.len - 1]!, tb = cb[B.len - 1]!;
      const phi0 = ang(ring, B.s), rho = Math.hypot(ring[B.s % m]!.x - c.x, ring[B.s % m]!.y - c.y);
      for (let j = 0; j < A.len; j++) {
        const lam = Math.abs(ta) < 1e-12 ? (A.len > 1 ? j / (A.len - 1) : 0) : ca[j]! / ta;
        const i = (A.s + j) % n;
        out[i] = j === 0 ? ring[B.s % m]! : j === A.len - 1 ? ring[(B.s + B.len - 1) % m]! : { x: c.x + rho * Math.cos(phi0 + lam * tb), y: c.y + rho * Math.sin(phi0 + lam * tb) };
      }
      // Corrente entre esta face e a seguinte (vértices fora de qualquer face).
      const An = rr[(k + 1) % rr.length]!, Bn = lr[(k + 1) % lr.length]!;
      const na = (An.s - (A.s + A.len) + 2 * n) % n, nb = (Bn.s - (B.s + B.len) + 2 * m) % m;
      for (let j = 0; j < na; j++) {
        const i = (A.s + A.len + j) % n;
        out[i] = na === nb ? ring[(B.s + B.len + j) % m]! : nb > 0 ? nearest(raw[i]!, B.s + B.len, nb) : nearest(raw[i]!, 0, m);
      }
    }
    if (out.some((q) => !q)) return null;
  } else if (memo) {
    // Sem faces de arco: casamento monótono feito na base (anel ≈ raw) e reaproveitado nos níveis acima (mesma contagem).
    if (!memo.idx || memo.m !== m) { memo.idx = casarMonotono(raw, ring); memo.m = m; }
    out = memo.idx.map((j) => ring[j]!);
  } else out = raw.map((r) => nearest(r, 0, m));
  const a = ringArea(out);
  return Number.isFinite(a) && Math.sign(a) === sg && Math.abs(a) > 1e-9 && out.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) ? out : null;
}

type Par = Relation & { kind: 'pair' };
/** Continuação: eixos tangentes no nó e saindo em sentidos opostos (paredes em linha ou arcos tangentes). */
function emContinuacao(fa: WallFrame, fb: WallFrame, r: Par): boolean {
  const ua = tangentAt(fa, r.a.end === 'a' ? 0 : fa.length), ub = tangentAt(fb, r.b.end === 'a' ? 0 : fb.length);
  const sa = r.a.end === 'a' ? 1 : -1, sb = r.b.end === 'a' ? 1 : -1; // sentido do eixo saindo do nó
  const dot = (ua.x * ub.x + ua.y * ub.y) * sa * sb; // < 0: os eixos saem do nó em sentidos opostos (continuação)
  return Math.abs(ua.x * ub.y - ua.y * ub.x) < 1e-4 && dot < 0;
}

/** Cunha da junção reta×reta quando a parede dona (a mais antiga) pede `transicao: 'cunha'` na ponta ligada; senão null. */
function cunhaDe(fa: WallFrame, fb: WallFrame, r: Par, H: number): Cunha | null {
  const dona = fa.wall.order <= fb.wall.order ? { f: fa, end: r.a.end } : { f: fb, end: r.b.end };
  const cfg = dona.end === 'a' ? dona.f.wall.joinStart : dona.f.wall.joinEnd;
  if (cfg?.transicao !== 'cunha') return null;
  const sa = r.a.end === 'b' ? 1 : -1, sb = r.b.end === 'a' ? 1 : -1; // +1: a→b da parede acompanha o eixo da continuação
  const u = { x: fa.u.x * sa, y: fa.u.y * sa };
  const n = { x: -u.y, y: u.x };
  const tan = (f: WallFrame, s: number): number => s * H * Math.tan(((f.wall.tilt ?? 0) * Math.PI) / 180);
  const offA = tan(fa, sa), offB = tan(fb, sb);
  const t = Math.max(fa.thickness, fb.thickness);
  const node = r.a.end === 'a' ? fa.a : fa.b;
  return { wallId: dona.f.wall.id, node, u, n, H, t, offA, offB, volume: (t * H * Math.abs(offA - offB)) / 2 };
}

/**
 * Cadeia contínua da parede `refId` (ação D): paredes ligadas em continuação (em linha ou arcos tangentes), com o fator de
 * sinal de cada uma em relação à referência (+1 = mesmo sentido a→b ao longo da cadeia, −1 = sentido oposto). A inclinação
 * que acompanha a da referência é `tiltRef · sinal`. Sem continuação devolve só a referência.
 */
export function cadeiaContinua(frames: readonly WallFrame[], refId: string, tol?: number): Array<{ id: string; sinal: 1 | -1 }> {
  const byId = new Map(frames.map((f) => [f.wall.id, f] as const));
  if (!byId.has(refId)) return [];
  const viz = new Map<string, Array<{ id: string; endA: 'a' | 'b'; endB: 'a' | 'b' }>>();
  const liga = (x: string, y: string, endX: 'a' | 'b', endY: 'a' | 'b'): void => { viz.set(x, [...(viz.get(x) ?? []), { id: y, endA: endX, endB: endY }]); };
  for (const r of tiltRelations(frames, tol)) {
    if (r.kind !== 'pair' || !emContinuacao(byId.get(r.a.id)!, byId.get(r.b.id)!, r)) continue;
    liga(r.a.id, r.b.id, r.a.end, r.b.end);
    liga(r.b.id, r.a.id, r.b.end, r.a.end);
  }
  // s(w): +1 se a→b de w segue o sentido g da cadeia. Chegando ao nó por X (sentido g se s·(fim b ? 1 : −1) = +1), Y sai do nó.
  const s = new Map<string, 1 | -1>([[refId, 1]]);
  const fila = [refId];
  while (fila.length) {
    const x = fila.shift()!;
    for (const v of viz.get(x) ?? []) {
      if (s.has(v.id)) continue;
      const d = s.get(x)! * (v.endA === 'b' ? 1 : -1);
      s.set(v.id, (d * (v.endB === 'a' ? 1 : -1)) as 1 | -1);
      fila.push(v.id);
    }
  }
  return [...s.entries()].map(([id, sinal]) => ({ id, sinal }));
}

function analyzeLevelTiltRaw(frames: readonly WallFrame[], heights: ReadonlyMap<string, number>, tol?: number): LevelTiltAnalysis {
  const out: LevelTiltAnalysis = { joins: new Map(), avisos: [], cunhas: [] };
  if (!frames.some((f) => tiltOf(f) !== 0)) return out;
  const byId = new Map(frames.map((f) => [f.wall.id, f] as const));
  const hasTilt = (r: Relation): boolean => ids(r).some((id) => tiltOf(byId.get(id)!) !== 0);
  const avisoOnce = new Set<string>();
  const warn = (code: TiltAvisoCode, wallId: string, valor?: number): void => {
    if (avisoOnce.has(`${code}|${wallId}`)) return;
    avisoOnce.add(`${code}|${wallId}`);
    out.avisos.push(valor === undefined ? { code, wallId } : { code, wallId, valor });
  };
  /** Ligação inviável: com arco o aviso é o do arco inclinado sem junção; reta×reta, `inclinacaoInviavelNaJuncao`. */
  const codigoInviavel = (r: Relation): TiltAvisoCode => (ids(r).some((id) => byId.get(id)!.arc) ? 'arcoInclinadoSemJuncao' : 'inclinacaoInviavelNaJuncao');
  const heightOf = (f: WallFrame): number => heights.get(f.wall.id) ?? (f.z ? f.z.top - f.z.z0 : 3);
  const rels: Relation[] = [];
  for (const r of tiltRelations(frames, tol).filter(hasTilt)) {
    if (r.kind === 'pair') {
      // Continuação (paredes em linha ou arcos tangentes): não há cruzamento de eixos; com inclinações diferentes o topo faz degrau.
      const fa = byId.get(r.a.id)!, fb = byId.get(r.b.id)!;
      if (emContinuacao(fa, fb, r)) {
        // Inclinações no mesmo referencial: parede com a→b contrário ao eixo da continuação troca o sinal (esquerda de a→b).
        const ka = r.a.end === 'b' ? 1 : -1, kb = r.b.end === 'a' ? 1 : -1;
        const step = Math.max(heightOf(fa), heightOf(fb)) * Math.abs(ka * Math.tan((tiltOf(fa) * Math.PI) / 180) - kb * Math.tan((tiltOf(fb) * Math.PI) / 180));
        if (step > DEGRAU_MIN) {
          warn('inclinacoesDiferentesEmContinuacao', r.a.id, step);
          if (!fa.arc && !fb.arc) {
            const c = cunhaDe(fa, fb, r, Math.max(heightOf(fa), heightOf(fb)));
            if (c) out.cunhas.push(c);
            continue;
          }
        } else if (!fa.arc && !fb.arc) continue; // mesma inclinação em linha: corte plano exato
      }
    }
    rels.push(r); // arco inclinado também entra: junção exata pelos níveis adaptativos (J2); só o inviável cai no plano B com aviso
  }
  // Componentes conexas pelas ligações que sobraram.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const r of rels) {
    const [x, ...rest] = ids(r);
    if (!parent.has(x!)) parent.set(x!, x!);
    for (const y of rest) {
      if (!parent.has(y)) parent.set(y, y);
      parent.set(find(y), find(x!));
    }
  }
  const comps = new Map<string, Relation[]>();
  for (const r of rels) {
    const k = find(ids(r)[0]!);
    comps.set(k, [...(comps.get(k) ?? []), r]);
  }
  let rawEndsMemo: ReturnType<typeof computeEnds> | undefined;
  /** Junções do conjunto de ligações (anéis por camada e parede), ou null quando alguma cota/camada é inviável. */
  const evalRels = (crel: readonly Relation[]): Map<string, WallTiltJoin> | null => {
    const wallIds = [...new Set(crel.flatMap(ids))];
    const mk = (tilted: boolean): Map<string, TiltWall> =>
      new Map(wallIds.map((id) => [id, { frame: byId.get(id)!, tiltDeg: tilted ? tiltOf(byId.get(id)!) : 0 }] as const));
    const tilted = mk(true);
    // Nó de N paredes: a base vertical do resolvedor (corte reto no nó etc.) é o anel `raw`; os níveis vêm do cruzamento das faces (N1).
    const rawEnds = crel.some((r) => r.kind === 'node') ? (rawEndsMemo ??= computeEnds([...frames], tol)) : undefined;
    const rawSet = levelSet(mk(false), crel, 0, undefined, rawEnds);
    const baseSet = levelSet(tilted, crel, 0);
    if (failed(rawSet) || failed(baseSet)) return null;
    const topSets = new Map<number, LevelSet | TiltJoinFail>();
    const top = (H: number): LevelSet | TiltJoinFail => {
      let t = topSets.get(H);
      if (!t) topSets.set(H, (t = levelSet(tilted, crel, H)));
      return t;
    };
    const joins = new Map<string, WallTiltJoin>();
    const comArco = wallIds.some((id) => !!byId.get(id)!.arc);
    // Com arco os cantos não são retas em z: níveis adaptativos (um conjunto por altura distinta); reta×reta: 0, H/2 e H.
    const adaptativos = new Map<number, { zs: number[]; sets: LevelSet[] } | TiltJoinFail>();
    const niveis = (H: number): { zs: number[]; sets: LevelSet[] } | TiltJoinFail => {
      let r = adaptativos.get(H);
      if (!r) adaptativos.set(H, (r = levelSetAdaptive(tilted, crel, H)));
      return r;
    };
    const nodeRels = crel.filter((r): r is Relation & { kind: 'node' } => r.kind === 'node');
    const warps = nodeRels.length ? nodeRels.map((r, i) => {
      const ids2 = r.ends.map((e) => e.id);
      const zr = Math.min(...ids2.map((id) => heightOf(byId.get(id)!)));
      const tz = top(zr);
      if (failed(tz)) return null;
      return nodeWarp(rawSet.nodeLevels![i]!, baseSet.nodeLevels![i]!, tz.nodeLevels![i]!, zr, new Map(ids2.map((id) => [id, tiltOf(byId.get(id)!)] as const)));
    }) : [];
    if (warps.some((w) => !w)) return null;
    const nodesOf = (id: string): NodeWarp[] => nodeRels.flatMap((r, i) => (r.ends.some((e) => e.id === id) ? [warps[i]!] : []));
    for (const id of wallIds) {
      const f = byId.get(id)!;
      const H = heightOf(f);
      if (!(H > 0)) return null;
      const layers: WallTiltJoinLayer[] = [];
      if (comArco) {
        const ad = niveis(H);
        // Mais de NIVEIS_SUAVES níveis = canto descontínuo em z (ex.: encosto entre arcos tangentes): não há junção suave, vale o plano B.
        if (failed(ad) || ad.zs.length > NIVEIS_SUAVES) return null;
        const per = ad.sets.map((ls) => levelRings(ls, id));
        const raw = ringsOf(rawSet, id)!;
        const centro = f.arc ? f.arc.center : null;
        const aligned: Vec2[][][] = [];
        for (const [layerIndex, r0] of raw) {
          const rs: Vec2[][] = [];
          const memo: { idx?: number[]; m?: number } = {};
          for (const m of per) {
            const q = m.get(layerIndex);
            const al = q ? alinharNivel(r0, q, centro, memo) : null;
            if (!al) return null;
            rs.push(al);
          }
          layers.push({ layerIndex, raw: r0, p0: rs[0]!, pH: rs[rs.length - 1]! });
          aligned.push(rs);
        }
        const ndA = nodesOf(id);
        joins.set(id, { H, layers, zs: ad.zs, levels: ad.zs.map((z, i) => ({ z, rings: aligned.map((rs) => rs[i]!) })), ...(ndA.length ? { nodes: ndA } : {}) });
        continue;
      }
      const ts = top(H);
      if (failed(ts)) return null;
      const raw = ringsOf(rawSet, id)!, p0 = ringsOf(baseSet, id)!, pH = ringsOf(ts, id)!;
      for (const [layerIndex, r0] of raw) {
        const al = alinhar(r0, p0.get(layerIndex), pH.get(layerIndex));
        if (!al) return null;
        layers.push({ layerIndex, raw: r0, p0: al.p0, pH: al.pH });
      }
      const mid = layers.map((l) => l.p0.map((a, k) => ({ x: (a.x + l.pH[k]!.x) / 2, y: (a.y + l.pH[k]!.y) / 2 })));
      const nd = nodesOf(id);
      joins.set(id, { H, layers, zs: [0, H / 2, H], levels: [{ z: 0, rings: layers.map((l) => l.p0) }, { z: H / 2, rings: mid }, { z: H, rings: layers.map((l) => l.pH) }], ...(nd.length ? { nodes: nd } : {}) });
    }
    return joins;
  };
  for (const crel0 of comps.values()) {
    let crel = crel0;
    // Nó inviável (parede curta, cone agudo, miolo inválido): degrada SÓ aquele nó, com aviso; o resto da componente segue.
    const nos = crel.filter((r): r is Relation & { kind: 'node' } => r.kind === 'node');
    if (nos.length) {
      const ruins = nos.filter((r) => !evalRels([r]));
      for (const r of ruins) for (const id of ids(r)) if (tiltOf(byId.get(id)!) !== 0) warn('inclinacaoInviavelNaJuncao', id);
      crel = crel.filter((r) => !(ruins as Relation[]).includes(r));
      if (!crel.length) continue;
    }
    let joins = evalRels(crel);
    if (!joins) {
      // Plano B: só o par problemático (ou todos, se o conjunto ainda falhar) vira encosto, com a ponta de uma parede cortada
      // pelo plano da face da outra em toda a altura; sobra no máximo a espessura da hospedeira. Ver S1 "Não passou".
      const tee = (r: Relation & { kind: 'pair' }, flip: boolean): Relation => (flip ? { kind: 'tee', branch: r.b, host: r.a.id } : { kind: 'tee', branch: r.a, host: r.b.id });
      const comoTee = (r: Relation & { kind: 'pair' }): Relation | null => [tee(r, false), tee(r, true)].find((c) => evalRels([c])) ?? null;
      // D2: decisão por PAR: entra no conjunto aceito só se o conjunto segue viável com ele; o que reprova vira encosto local.
      const aceitos: Relation[] = [];
      const asTee = (r: Relation, force: boolean): Relation | null => (r.kind === 'pair' && (force || !evalRels([...aceitos, r])) ? comoTee(r) : (aceitos.push(r), r));
      const avisar = (r: Relation): void => { for (const id of ids(r)) if (tiltOf(byId.get(id)!) !== 0) warn(codigoInviavel(r), id); };
      for (const force of [false, true]) {
        aceitos.length = 0;
        const plano = crel.map((r) => asTee(r, force));
        const mant = plano.filter((r): r is Relation => !!r);
        joins = mant.length ? evalRels(mant) : new Map<string, WallTiltJoin>();
        if (joins) {
          crel.forEach((r, i) => { if (plano[i] !== r) avisar(r); });
          break;
        }
      }
      if (!joins) { crel.forEach(avisar); continue; }
    }
    for (const [id, j] of joins) out.joins.set(id, j);
  }
  return out;
}

/**
 * Avisos da junção inclinada (F2.4) para a lista de problemas: `arcoInclinadoSemJuncao` (plano B do S1) e
 * `inclinacaoInviavelNaJuncao` (cruzamento fora da parede, cone invertido, anel degenerado, ou arco inclinado que não
 * cabe na altura REAL do topo: revalida a pendência da F2.1, em que a altura anexada a piso/telhado não é resolvida
 * no modelo). Projeto sem parede inclinada: lista vazia e nenhum cálculo.
 */
export function wallTiltJoinIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  if (!projetoTemParedeInclinada(p)) return [];
  const out: ValidationIssue[] = [];
  for (const lv of p.levels) {
    const frames = levelFrames(p, lv.id).filter((f) => semCortina(p, [f.wall]).length > 0);
    if (!frames.some((f) => tiltOf(f) !== 0)) continue;
    const rl = resolveLevel(p, lv.id);
    const heights = new Map(Object.values(rl.walls).map((w) => [w.wallId, w.height] as const));
    const an = analyzeLevelTilt(frames, heights, p.settings?.joinTolerance);
    const seen = new Set<string>();
    const push = (code: TiltAvisoCode, id: string, valor?: number): void => {
      if (seen.has(`${code}|${id}`)) return;
      seen.add(`${code}|${id}`);
      const key = code === 'arcoInclinadoSemJuncao' ? 'egb_issue_tilt_arc_nojoin' : code === 'inclinacoesDiferentesEmContinuacao' ? 'egb_issue_tilt_continuation' : 'egb_issue_tilt_infeasible';
      const args: Record<string, string> = valor === undefined ? { id } : { id, valor: formatQuantity(unitsOf(p), 'length', valor) };
      out.push({ severity: 'warning', code, message: tr(lang, key, args), elementId: id });
    };
    for (const a of an.avisos) push(a.code, a.wallId, a.valor);
    for (const f of frames) {
      const tilt = tiltOf(f);
      const h = heights.get(f.wall.id);
      if (!tilt || !f.arc || h === undefined) continue;
      if (!tiltValid({ tiltDeg: tilt, H: h, t: f.thickness, R: f.arc.radius })) push('inclinacaoInviavelNaJuncao', f.wall.id);
    }
  }
  return out;
}
