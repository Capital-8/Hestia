import { ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { formatQuantity, layerSpans, unitsOf, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { tiltValid } from './wallTilt.ts';
import { levelFrames } from './resolveFrames.ts';
import { semCortina } from './cortinaProjeto.ts';
import { resolveLevel } from './resolve.ts';
import { layerQuad } from './layerGeom.ts';
import { joinStatus } from './joins.ts';
import { sAtDepth, tangentAt, type WallFrame } from './frame.ts';
import { levelSet, type LevelSet, type Relation, type TiltJoinFail, type TiltWall } from './wallTiltJoin.ts';

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
}
export interface LevelTiltAnalysis {
  joins: Map<string, WallTiltJoin>;
  avisos: TiltAviso[];
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

/** Ligações da base (só pair e tee) em que há parede inclinada; nó de 3+ paredes e pontas livres ficam como estão. */
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
      }
    }
  }
  return rels;
}

const ids = (r: Relation): string[] => (r.kind === 'pair' ? [r.a.id, r.b.id] : [r.branch.id, r.host]);

/**
 * Junção inclinada de um nível (F2.4). A topologia vem SÓ dos eixos da base (`joinStatus`); o topo reaplica a mesma
 * topologia aos eixos deslocados (`levelSet`). Reta×reta: anéis de camada em z=0 e z=H por parede ligada. Arco
 * inclinado (a própria parede ou a parceira): plano B, sem junção, aviso `arcoInclinadoSemJuncao`. Cruzamento fora
 * da parede, cone invertido ou anel degenerado: a componente inteira degrada para corte simples e avisa
 * `inclinacaoInviavelNaJuncao`. `heights`: altura real (resolvida) por parede; ausente = faixa nominal do quadro.
 * Sem parede inclinada devolve vazio sem custo (caminho idêntico ao de hoje).
 */
export function analyzeLevelTilt(frames: readonly WallFrame[], heights: ReadonlyMap<string, number> = new Map(), tol?: number): LevelTiltAnalysis {
  if (!frames.some((f) => tiltOf(f) !== 0)) return { joins: new Map(), avisos: [] };
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
    const idx = raw.map((r) => {
      let best = 0, d = Infinity;
      p0.forEach((q, j) => { const e = Math.hypot(q.x - r.x, q.y - r.y); if (e < d) { d = e; best = j; } });
      return best;
    });
    a = idx.map((j) => p0[j]!);
    b = idx.map((j) => pH[j]!);
  }
  // O anel completo (todos os vértices) é que não pode inverter nem degenerar.
  const ok = Math.sign(ringArea(p0)) === sg && Math.sign(ringArea(pH)) === sg && Math.abs(ringArea(pH)) > 1e-9;
  return ok ? { p0: a, pH: b } : null;
}

function analyzeLevelTiltRaw(frames: readonly WallFrame[], heights: ReadonlyMap<string, number>, tol?: number): LevelTiltAnalysis {
  const out: LevelTiltAnalysis = { joins: new Map(), avisos: [] };
  if (!frames.some((f) => tiltOf(f) !== 0)) return out;
  const byId = new Map(frames.map((f) => [f.wall.id, f] as const));
  const hasTilt = (r: Relation): boolean => ids(r).some((id) => tiltOf(byId.get(id)!) !== 0);
  const avisoOnce = new Set<string>();
  const warn = (code: TiltAvisoCode, wallId: string, valor?: number): void => {
    if (avisoOnce.has(`${code}|${wallId}`)) return;
    avisoOnce.add(`${code}|${wallId}`);
    out.avisos.push(valor === undefined ? { code, wallId } : { code, wallId, valor });
  };
  const heightOf = (f: WallFrame): number => heights.get(f.wall.id) ?? (f.z ? f.z.top - f.z.z0 : 3);
  const rels: Relation[] = [];
  for (const r of tiltRelations(frames, tol).filter(hasTilt)) {
    if (r.kind === 'pair') {
      // Continuação (paredes em linha ou arcos tangentes): não há cruzamento de eixos; com inclinações diferentes o topo faz degrau.
      const fa = byId.get(r.a.id)!, fb = byId.get(r.b.id)!;
      const ua = tangentAt(fa, r.a.end === 'a' ? 0 : fa.length), ub = tangentAt(fb, r.b.end === 'a' ? 0 : fb.length);
      const sa = r.a.end === 'a' ? 1 : -1, sb = r.b.end === 'a' ? 1 : -1; // sentido do eixo saindo do nó
      const dot = (ua.x * ub.x + ua.y * ub.y) * sa * sb; // < 0: os eixos saem do nó em sentidos opostos (continuação)
      if (Math.abs(ua.x * ub.y - ua.y * ub.x) < 1e-4 && dot < 0) {
        const step = Math.max(heightOf(fa), heightOf(fb)) * Math.abs(Math.tan((tiltOf(fa) * Math.PI) / 180) - Math.tan((tiltOf(fb) * Math.PI) / 180));
        if (step > DEGRAU_MIN) { warn('inclinacoesDiferentesEmContinuacao', r.a.id, step); continue; }
        if (!fa.arc && !fb.arc) continue; // mesma inclinação em linha: corte plano exato
      }
    }
    if (ids(r).some((id) => byId.get(id)!.arc)) {
      for (const id of ids(r)) if (tiltOf(byId.get(id)!) !== 0) warn('arcoInclinadoSemJuncao', id);
    } else rels.push(r);
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
  /** Junções do conjunto de ligações (anéis por camada e parede), ou null quando alguma cota/camada é inviável. */
  const evalRels = (crel: readonly Relation[]): Map<string, WallTiltJoin> | null => {
    const wallIds = [...new Set(crel.flatMap(ids))];
    const mk = (tilted: boolean): Map<string, TiltWall> =>
      new Map(wallIds.map((id) => [id, { frame: byId.get(id)!, tiltDeg: tilted ? tiltOf(byId.get(id)!) : 0 }] as const));
    const tilted = mk(true);
    const rawSet = levelSet(mk(false), crel, 0);
    const baseSet = levelSet(tilted, crel, 0);
    if (failed(rawSet) || failed(baseSet)) return null;
    const topSets = new Map<number, LevelSet | TiltJoinFail>();
    const top = (H: number): LevelSet | TiltJoinFail => {
      let t = topSets.get(H);
      if (!t) topSets.set(H, (t = levelSet(tilted, crel, H)));
      return t;
    };
    const joins = new Map<string, WallTiltJoin>();
    for (const id of wallIds) {
      const H = heightOf(byId.get(id)!);
      const ts = top(H);
      if (failed(ts) || !(H > 0)) return null;
      const raw = ringsOf(rawSet, id)!, p0 = ringsOf(baseSet, id)!, pH = ringsOf(ts, id)!;
      const layers: WallTiltJoinLayer[] = [];
      for (const [layerIndex, r0] of raw) {
        const al = alinhar(r0, p0.get(layerIndex), pH.get(layerIndex));
        if (!al) return null;
        layers.push({ layerIndex, raw: r0, p0: al.p0, pH: al.pH });
      }
      joins.set(id, { H, layers });
    }
    return joins;
  };
  for (const crel of comps.values()) {
    let joins = evalRels(crel);
    if (!joins) {
      // Plano B: só o par problemático (ou todos, se o conjunto ainda falhar) vira encosto, com a ponta de uma parede cortada
      // pelo plano da face da outra em toda a altura; sobra no máximo a espessura da hospedeira. Ver S1 "Não passou".
      const tee = (r: Relation & { kind: 'pair' }, flip: boolean): Relation => (flip ? { kind: 'tee', branch: r.b, host: r.a.id } : { kind: 'tee', branch: r.a, host: r.b.id });
      const asTee = (r: Relation, force: boolean): Relation => {
        if (r.kind !== 'pair' || (!force && evalRels([r]))) return r;
        return [tee(r, false), tee(r, true)].find((c) => evalRels([c])) ?? r;
      };
      for (const force of [false, true]) {
        const plano = crel.map((r) => asTee(r, force));
        joins = evalRels(plano);
        if (joins) {
          crel.forEach((r, i) => { if (plano[i] !== r) for (const id of ids(r)) if (tiltOf(byId.get(id)!) !== 0) warn('inclinacaoInviavelNaJuncao', id); });
          break;
        }
      }
      if (!joins) {
        for (const id of new Set(crel.flatMap(ids))) if (tiltOf(byId.get(id)!) !== 0) warn('inclinacaoInviavelNaJuncao', id);
        continue;
      }
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
