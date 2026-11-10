import { add, difference, dist, dot, intersection, lerp, mul, multiArea, norm, perp, pointInMulti, rotate, sub, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { sampleChain, spiralParamsOf, stairArrivalFrame, stairArrivalTop, stairFinishModel, type ResolvedStair, type ResolvedStairRiser, type ResolvedStairStep, type SpiralParams } from '@hestia/engine';
import { isStair, stairFinishOf, unitsOf, type DetailLevel, type Id, type Project } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { mix } from './color.ts';
import { labelPoint, outlineSelectionOps, type FloorOps } from './floors.ts';
import { riserPoints, risersInClimbOrder } from '../stairRisers.ts';
import { tracoEm } from './marcadores.ts';
import { defaultPaint, espessuraDeCorte, espessuraDeProjecao, surfaceColor, type PlanPaint } from './style.ts';
import type { Espessura, PapelRotulo, PlanTheme, StrokeOp } from './types.ts';
import { t, type Lang } from '../i18n.ts';

/**
 * Cota de corte padrão, em m acima da base do lance (1,20 m, como o corte padrão do intervalo de vista). A planta usa a
 * cota absoluta da vista (`StairView`); sem ela, vale esta, relativa à base de cada escada.
 */
export const STAIR_CUT_HEIGHT = 1.2;

/** Cotas absolutas da vista para as escadas (decisão 0013 §4): plano de corte e topo do intervalo. */
export interface StairView {
  cutZ: number;
  topZ: number;
}

/** Traço (px) do tracejado dos degraus acima da cota de corte. */
export const STAIR_DASH: [number, number] = [6, 3];

/** Rótulos da escada em mm de papel, no mesmo padrão das anotações (decisão 0019). */
const STAIR_TEXT_MM = 1.6;
const STAIR_TAG_MM = 1.6;
const STAIR_SOBE_OFFSET_MM = 2.35;

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/**
 * Número visível do degrau na planta (decisão 0011 §1 item 6): o espelho que ele alcança, `k = round((zTopo − baseZ) / h)`.
 * O patamar conta como degrau, como no Revit, e recebe o seu número (L com 8 + 8 espelhos: 1..7, patamar 8, 9..15 e a
 * chegada 16). É contínuo na escada: o `index` do motor reinicia em cada lance. Usa a cota, não a contagem, então um lance
 * com erro de croqui ainda conta os seus espelhos. Sem altura real do espelho, vale o índice do lance.
 */
export function treadNumber(s: ResolvedStair, st: ResolvedStairStep): number {
  if (!(s.riserHeight > 0)) return st.index;
  return Math.round((st.z - s.baseZ) / s.riserHeight);
}

/**
 * Último degrau da escada monolítica: a chegada, a faixa atrás do último espelho (a mesma peça que o 3D desenha, com o
 * mesmo comprimento), na cota do topo. Sem chegada (outro estilo de lance, ou o último espelho não fecha), null.
 */
export function arrivalRing(s: ResolvedStair): Ring | null {
  const f = stairArrivalFrame(s);
  if (!f) return null;
  const d = mul(f.u, f.length);
  return [f.a, f.b, add(f.b, d), add(f.a, d)];
}

/** Pegada da escada em planta: a dos degraus mais a chegada (o último degrau), como no 3D. A seleção e o fantasma usam esta. */
export function planFootprint(s: ResolvedStair): MultiPolygon {
  const last = arrivalRing(s);
  const base = last ? union(s.footprint, [[last]]) : s.footprint;
  if (base.length > 0) return base;
  // Sem degraus (topo <= base): a caixa do croqui é a pegada, para a escada continuar selecionável na planta.
  if (s.sketchBounds) {
    const { minX, minY, maxX, maxY } = s.sketchBounds;
    return [[[{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]]];
  }
  return base;
}

/** Ponto a meio comprimento da polilinha (ponto médio do espelho). */
export function polyMid(pts: Vec2[]): Vec2 {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const L = dist(a, b);
    if (L > 0 && acc + L >= total / 2) return lerp(a, b, (total / 2 - acc) / L);
    acc += L;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

/** Ponto de corte na caminhada (entre pontos médios de espelhos) em que ela passa pela cota de corte. */
export interface StairCut {
  at: Vec2;
  /** Sentido da caminhada no ponto (unitário). */
  walk: Vec2;
  /** Sentido do corte, perpendicular à caminhada. */
  across: Vec2;
  /** Meia-largura do símbolo (m): meia largura do lance mais um pequeno avanço de cada lado (`AVANCO_CORTE_PX` em pixels). */
  half: number;
}

/** Avanço do símbolo de corte além de cada lado do lance, em pixels de tela. */
export const AVANCO_CORTE_PX = 8;
/** Amplitude dos dentes do símbolo de corte, em pixels de tela. */
const DENTE_CORTE_PX = 4;
/** Comprimento da ponta da seta de subida, em pixels de tela. */
const PONTA_SETA_PX = 7;

const chord = (r: ResolvedStairRiser): number => dist(r.a, r.b);

/**
 * Corte da planta: o primeiro trecho da caminhada automática (pontos médios dos espelhos em ordem de subida) que cruza
 * a cota `cutZ` (absoluta; por padrão `baseZ + STAIR_CUT_HEIGHT`). Null quando o lance não chega a essa cota (ou não
 * tem dois espelhos): o símbolo de corte só aparece onde o plano cruza a escada.
 */
export function stairCut(s: ResolvedStair, risers: ResolvedStairRiser[], zoom: number, cutZ: number = s.baseZ + STAIR_CUT_HEIGHT): StairCut | null {
  const c = stairCutBase(s, risers, cutZ);
  return c ? { ...c, half: c.half + AVANCO_CORTE_PX / zoom } : null;
}

/** Corte da escada sem o avanço em pixels: `half` é só a meia largura do lance (m). O avanço o desenho aplica em pixels. */
export function stairCutBase(s: ResolvedStair, risers: ResolvedStairRiser[], cutZ: number = s.baseZ + STAIR_CUT_HEIGHT): StairCut | null {
  const mids = risers.map((r) => polyMid(riserPoints(r)));
  for (let i = 0; i + 1 < risers.length; i++) {
    const h0 = (risers[i]!.z0 + risers[i]!.z1) / 2;
    const h1 = (risers[i + 1]!.z0 + risers[i + 1]!.z1) / 2;
    if (!(h1 > h0 && h0 <= cutZ && cutZ <= h1)) continue;
    const walkVec = sub(mids[i + 1]!, mids[i]!);
    if (dist(mids[i + 1]!, mids[i]!) < 1e-9) return null;
    const walk = norm(walkVec);
    const width = (chord(risers[i]!) + chord(risers[i + 1]!)) / 2;
    return { at: lerp(mids[i]!, mids[i + 1]!, (cutZ - h0) / (h1 - h0)), walk, across: perp(walk), half: width / 2 };
  }
  return null;
}

/**
 * Símbolo de corte: zigue-zague curto que cruza a caminhada na cota de corte (oito dentes), na espessura dada. A meia
 * largura do lance fica em metros; o avanço de 8 px de cada lado e os dentes de 4 px são marcadores em pixels.
 */
function cutSymbol(c: StairCut, color: string, espessura: Espessura): StrokeOp {
  const teeth = 8;
  const pts: Vec2[] = [];
  const deslocamentoPx: Vec2[] = [];
  for (let j = 0; j <= teeth; j++) {
    const s = -c.half + (2 * c.half * j) / teeth;
    const sPx = -AVANCO_CORTE_PX + (2 * AVANCO_CORTE_PX * j) / teeth;
    pts.push(add(c.at, mul(c.across, s)));
    deslocamentoPx.push(add(mul(c.across, sPx), mul(c.walk, j % 2 === 0 ? -DENTE_CORTE_PX : DENTE_CORTE_PX)));
  }
  return { pts, closed: false, deslocamentoPx, ...espessura, color, alpha: 1 };
}

/**
 * Pontos que levam a seta pelo eixo do patamar entre dois lances. L: o canto onde os eixos dos lances se cruzam. U: eixos
 * paralelos, então atravessa o patamar pela metade da profundidade. Sem patamar entre eles, nada (a ligação reta vale).
 */
function landingConnector(s: ResolvedStair, ciA: number, ciB: number, prev: Vec2[], next: Vec2[]): Vec2[] {
  const landing = s.steps.find((x) => x.kind === 'landing' && x.componentIndex > ciA && x.componentIndex < ciB);
  if (!landing || prev.length < 2 || next.length < 2) return [];
  const a = prev[prev.length - 1]!;
  const u1 = norm(sub(a, prev[prev.length - 2]!));
  const b = next[0]!;
  const u2 = norm(sub(next[1]!, b));
  const d = sub(b, a);
  const cross = u1.x * u2.y - u1.y * u2.x;
  if (Math.abs(cross) > 1e-6) {
    const t = (d.x * u2.y - d.y * u2.x) / cross;
    return t > -EPS ? [add(a, mul(u1, t))] : [];
  }
  const half = Math.max(0, ...landing.polygon.map((q) => dot(sub(q, a), u1))) / 2;
  const p1 = add(a, mul(u1, half));
  return [p1, add(p1, sub(d, mul(u1, dot(d, u1))))];
}

/**
 * Caminhada da seta de subida, do primeiro ao último espelho, por lance: a caminhada explícita do lance (quando tem)
 * ou os pontos médios dos espelhos em ordem de subida. Um lance só tem espelhos resolvidos quando o croqui é válido
 * (o motor valida a caminhada), então a explícita usada aqui já foi aceita. Lances sem espelho resolvido não entram.
 */
export function climbWalk(p: Project, s: ResolvedStair, risers: ResolvedStairRiser[], arrival: { covered: boolean } = stairArrivalTop(p, s)): Vec2[] {
  const model = p.elements[s.id];
  const components = isStair(model) ? model.components : [];
  const byComponent = new Map<number, ResolvedStairRiser[]>();
  for (const r of risers) byComponent.set(r.componentIndex, [...(byComponent.get(r.componentIndex) ?? []), r]);
  const out: Vec2[] = [];
  let prev: { ci: number; walk: Vec2[] } | null = null;
  for (const [ci, rs] of [...byComponent].sort((x, y) => x[0] - y[0])) {
    const c = components[ci];
    const explicit = c?.kind === 'run' && c.path.length > 0 ? sampleChain(c.path) : [];
    const walk = explicit.length >= 2 ? explicit : rs.map((r) => polyMid(riserPoints(r)));
    // A seta passa pelo eixo do patamar: o canto do L, ou a travessia do U, em vez de cortar em diagonal.
    if (prev) out.push(...landingConnector(s, prev.ci, ci, prev.walk, walk));
    out.push(...walk);
    prev = { ci, walk };
  }
  // E termina no último degrau desenhado: a chegada, quando ela é um degrau da própria escada (sem laje/piso no nível de
  // topo); com laje/piso, o degrau de chegada é o piso do nível e a seta para no último espelho, sem sobrar além dele.
  if (!arrival.covered) {
    const last = arrivalRing(s);
    const lastAt = last && out.length > 0 ? labelPoint([[last]]) : null;
    if (lastAt) out.push(lastAt);
  }
  return out;
}

/** Seta de subida: a caminhada (explícita ou pelos pontos médios) com ponta de 7 px (marcador em pixels) no último espelho, na espessura dada. */
export function climbArrow(pts: Vec2[], color: string, espessura: Espessura): StrokeOp[] {
  if (pts.length < 2) return [];
  const tip = pts[pts.length - 1]!;
  const back = mul(norm(sub(tip, pts[pts.length - 2]!)), -1);
  const wing = (a: number): Vec2 => mul(rotate(back, a), PONTA_SETA_PX);
  const style = { ...espessura, color, alpha: 0.9 };
  return [
    { pts, closed: false, ...style },
    { ...tracoEm(tip, [wing(Math.PI / 6), { x: 0, y: 0 }, wing(-Math.PI / 6)], false), ...style },
  ];
}

/** Contorno de um degrau ou patamar (linha fina, `widthPx`): tracejado quando o topo fica acima da cota de corte. */
function outlineOps(polygon: Vec2[], z: number, color: string, cutZ: number, espessura: Espessura): StrokeOp {
  const above = z > cutZ + 1e-9;
  return { pts: polygon, closed: true, ...espessura, color, alpha: 1, ...(above ? { dash: STAIR_DASH } : {}) };
}

/** Desloca a etiqueta `mm` de papel para um lado da seta (perpendicular ao primeiro trecho), para não cruzar a linha. */
const beside = (u: Vec2, mm: number, escala: number): PapelRotulo => ({ escala, desvio: { mm, ux: -u.y, uy: -u.x } });

/** Lados do círculo do poste de caracol (decisão 0014 §1 item 9): entre 24 e 48. Planta e DXF usam o mesmo. */
export const SPIRAL_POST_SIDES = 48;
/** Fração do vão radial (de `rInner` a `rOuter`) em que o rótulo de uma volta de cima se põe quando coincide com a de baixo. */
const SPIRAL_LABEL_FRACTION = 0.3;
const EPS = 1e-9;
/** Área (m²) abaixo da qual uma sobreposição é um traço, não uma região (ruído do recorte). */
const SLIVER = 1e-7;

/** Anel do poste de caracol: círculo de raio `r` em `c`, com `SPIRAL_POST_SIDES` vértices. */
export function spiralPostRing(c: Vec2, r: number): Vec2[] {
  return Array.from({ length: SPIRAL_POST_SIDES }, (_, i) => {
    const t = (2 * Math.PI * i) / SPIRAL_POST_SIDES;
    return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
  });
}

/**
 * Parâmetros do caracol de cada lance da escada, pelo índice do componente (`StairRun.spiral`). Vazio para escada sem
 * caracol. Lê o modelo, não o croqui: o croqui resolvido não guarda o metadado.
 */
export function spiralByComponent(p: Project, s: ResolvedStair): Map<number, SpiralParams> {
  const out = new Map<number, SpiralParams>();
  const model = p.elements[s.id];
  if (!isStair(model)) return out;
  model.components.forEach((c, i) => {
    const sp = c.kind === 'run' ? spiralParamsOf(c) : undefined;
    if (sp) out.set(i, sp);
  });
  return out;
}

/** Degraus e patamares de baixo (cota ≤ corte), em planta: o que a volta de cima não pode cobrir (memo por escada e corte). */
const coverMemo = new WeakMap<ResolvedStair, { cutZ: number; cover: MultiPolygon }>();
function lowerCover(s: ResolvedStair, cutZ: number): MultiPolygon {
  const hit = coverMemo.get(s);
  if (hit && hit.cutZ === cutZ) return hit.cover;
  const lower: MultiPolygon[] = s.steps.filter((st) => st.z <= cutZ + EPS).map((st) => [[st.polygon]]);
  const cover = lower.length > 0 ? union(...lower) : [];
  coverMemo.set(s, { cutZ, cover });
  return cover;
}

/**
 * Preenchimento de um degrau acima do corte. Fora da área de baixo, é o degrau inteiro. Sobre a volta de baixo, sai só o
 * que sobra (ou nada, se ela cobre tudo): a volta de cima não pinta por cima da de baixo. Null = sem preenchimento.
 */
function aboveFill(ring: Ring, cover: MultiPolygon): MultiPolygon | null {
  if (cover.length === 0) return [[ring]];
  if (multiArea(intersection([[ring]], cover)) <= SLIVER) return [[ring]];
  const rest = difference([[ring]], cover);
  return multiArea(rest) > SLIVER ? rest : null;
}

/**
 * Ponto do rótulo de um degrau. Num caracol, um degrau cujo centro cai sobre um degrau de cota mais baixa (voltas
 * sobrepostas em planta) põe o rótulo dentro do próprio setor, mais perto da borda interna, para não coincidir com o de
 * baixo. Fora disso, é o centro do degrau (`labelPoint`), como nos demais lances.
 */
function treadLabelAt(st: ResolvedStairStep, steps: ResolvedStairStep[], spirals: ReadonlyMap<number, SpiralParams>): Vec2 | null {
  const at = labelPoint([[st.polygon]]);
  const sp = spirals.get(st.componentIndex);
  if (!at || !sp) return at;
  const covered = steps.some((o) => o !== st && o.z < st.z - EPS && pointInMulti(at, [[o.polygon]]));
  if (!covered) return at;
  const ang = Math.atan2(at.y - sp.center.y, at.x - sp.center.x);
  const rho = sp.rInner + SPIRAL_LABEL_FRACTION * (sp.rOuter - sp.rInner);
  return { x: sp.center.x + rho * Math.cos(ang), y: sp.center.y + rho * Math.sin(ang) };
}

/**
 * Poste de cada caracol da escada (decisão 0014 §1 item 9): círculo de raio `rInner` com contorno. Só o estilo `post` tem
 * preenchimento (material do poste); o monolítico e o demais mostram só o contorno. Acima da cota de corte (base do lance),
 * tracejado e sem preenchimento, como os degraus.
 */
function postOps(p: Project, s: ResolvedStair, spirals: ReadonlyMap<number, SpiralParams>, cutZ: number, fillBase: string, dark: boolean, lineColor: string, paint: PlanPaint): FloorOps {
  const out = empty();
  const above = s.baseZ > cutZ + EPS;
  const pm = p.materials[s.type.postMaterialId];
  const color = surfaceColor(pm?.color ?? '#999999', fillBase, dark ? 0.42 : 0.74, paint);
  for (const sp of spirals.values()) {
    const ring = spiralPostRing(sp.center, sp.rInner);
    if (!above && s.type.runStyle === 'post') out.fills.push({ polygons: [[ring]], color, alpha: 1 });
    out.strokes.push(outlineOps(ring, s.baseZ, lineColor, cutZ, espessuraDeProjecao(paint)));
  }
  return out;
}

/**
 * Escadas do nível na planta (decisão 0011 §1). Preenchimento dos degraus e patamares com a cor do material do tipo
 * (mesma regra dos pisos); contorno de cada degrau (tracejado acima da cota de corte); linha de cada espelho; símbolo
 * de corte e seta de subida "SOBE" pela caminhada (explícita, se válida, senão automática). No grosseiro, só o preenchimento do contorno. No fino,
 * número de cada degrau (`treadNumber`: contínuo na escada, o espelho que o degrau alcança). Com etiquetas ligadas, o código do tipo no centroide.
 *
 * Com `view` (intervalo de vista, decisão 0013 §4), a cota de corte é a da vista e a escada que começa acima de `view.topZ`
 * não sai; a que começa abaixo sai inteira, até o seu próprio topo (o fim do lance não some por passar do topo da vista). Sem `view`, vale a cota de 1,20 m de cada escada e não há topo.
 *
 * Caracol (decisão 0014 §1 item 9): as voltas sobrepõem-se em planta. Degrau acima do corte não pinta sobre a volta de
 * baixo (`aboveFill`); o rótulo de cima sai para dentro do setor (`treadLabelAt`) e, acima do corte, em tom claro
 * (`tone: 'soft'`); o poste é um círculo (`postOps`).
 *
 * Chegada (`stairArrivalTop`): sem laje/piso fechando o nível de topo, ela é o último degrau da escada e sai preenchida,
 * contornada e numerada N; com laje/piso, o degrau de chegada é o piso do nível e a planta termina no último espelho (a
 * pegada de seleção/fantasma continua incluindo a chegada).
 */
export function stairFills(
  p: Project,
  stairs: ResolvedStair[],
  theme: PlanTheme,
  dark: boolean,
  detail: DetailLevel,
  v: Viewport,
  view?: StairView,
  paint: PlanPaint = defaultPaint('stair', v.zoom),
  scale = 100,
  lang: Lang = 'pt',
): FloorOps {
  const out = empty();
  const corte = espessuraDeCorte(paint);
  const projecao = espessuraDeProjecao(paint);
  const fillBase = dark ? theme.bg : '#ffffff';
  const lineColor = mix(theme.ink, fillBase, 0.35);
  for (const s of stairs) {
    const cutZ = view?.cutZ ?? s.baseZ + STAIR_CUT_HEIGHT;
    // Escada que começa abaixo do topo da vista sai inteira, até o próprio topo: cortar no topo da vista (2,30 m) tirava o fim do lance.
    // O que passa do topo da vista fica só no contorno, sem preenchimento (fora da faixa de vista).
    const viewTop = view?.topZ ?? Infinity;
    if (s.baseZ > viewTop + 1e-9) continue;
    // Sem degraus (topo não acima da base, croqui sem espelhos): desenha a caixa do croqui para a escada não sumir
    // da planta e continuar selecionável. O erro fica no painel; o elemento não é apagado (decisão 0041).
    if (s.steps.length === 0) {
      if (s.sketchBounds) {
        const b = s.sketchBounds;
        const ring = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];
        out.strokes.push({ pts: ring, closed: true, ...corte, color: theme.ink, alpha: 0.7 });
      }
      continue;
    }
    const topZ = Math.max(viewTop, s.topZ);
    const steps = s.steps.filter((st) => st.z <= topZ + 1e-9);
    const m = p.materials[s.type.materialId];
    const color = surfaceColor(m?.color ?? '#999999', fillBase, dark ? 0.42 : 0.74, paint);
    const spirals = spiralByComponent(p, s);
    // A chegada só é degrau da própria escada quando o nível de topo não é fechado por laje/piso: com laje/piso, o degrau
    // de chegada é o piso do nível e a planta termina no último espelho.
    const arrival = stairArrivalTop(p, s);
    const post = postOps(p, s, spirals, cutZ, fillBase, dark, lineColor, paint);
    // Acabamentos (piso e espelho): o modelo só existe com algum ligado; cada um pinta no material próprio.
    const finish = stairFinishModel(s);
    const finCfg = stairFinishOf(s.type);
    const finishColor = (on: boolean, id: Id): string | null => (finish && on ? surfaceColor(p.materials[id]?.color ?? '#999999', fillBase, dark ? 0.42 : 0.74, paint) : null);
    const inView = (z: number): boolean => z <= viewTop + 1e-9;
    if (detail === 'coarse') {
      const seen = steps.filter((st) => inView(st.z));
      if (seen.length === 0 && s.steps.length > 0) continue;
      const footprint = seen.length === s.steps.length ? s.footprint : union(...seen.map((st) => [[st.polygon]]));
      const last = !arrival.covered && inView(s.topZ) ? arrivalRing(s) : null;
      out.fills.push({ polygons: last ? union(footprint, [[last]]) : footprint, color, alpha: 1 });
      out.fills.push(...post.fills);
      continue;
    }
    // Só o caracol tem voltas sobrepostas em planta: o recorte pela volta de baixo é feito só nele.
    const cover = spirals.size > 0 ? lowerCover(s, cutZ) : [];
    for (const st of steps) {
      const fill = !inView(st.z) ? null : st.z > cutZ + EPS ? aboveFill(st.polygon, cover) : [[st.polygon]];
      if (fill) out.fills.push({ polygons: fill, color, alpha: 1 });
      // Acabamento do piso: o material próprio por cima da estrutura, na mesma região (o bocel não muda a planta).
      const tf = finishColor(finCfg.treadOn, finCfg.treadMaterialId);
      if (fill && tf) out.fills.push({ polygons: fill, color: tf, alpha: 1 });
      out.strokes.push(outlineOps(st.polygon, st.z, lineColor, cutZ, projecao));
    }
    // Acabamento do espelho: a faixa do espelho acabado, no material dele (só onde o espelho está dentro da vista).
    const rf = finishColor(finCfg.riserOn, finCfg.riserMaterialId);
    if (rf) for (const f of finish!.solids) if (f.kind === 'riser' && f.z1 <= topZ + 1e-9 && inView(f.z1)) out.fills.push({ polygons: [[f.polygon]], color: rf, alpha: 1 });
    const last = arrival.covered ? null : arrivalRing(s);
    if (last) {
      if (inView(s.topZ)) out.fills.push({ polygons: [[last]], color, alpha: 1 });
      out.strokes.push(outlineOps(last, s.topZ, lineColor, cutZ, projecao));
    }
    out.fills.push(...post.fills);
    out.strokes.push(...post.strokes);
    const risers = risersInClimbOrder(s).filter((r) => r.z1 <= topZ + 1e-9);
    for (const r of risers) out.strokes.push({ pts: riserPoints(r), closed: false, ...corte, color: theme.ink, alpha: 1 });
    const walk = climbWalk(p, s, risers, arrival);
    out.strokes.push(...climbArrow(walk, theme.ink, corte));
    if (walk.length >= 2) {
      const u = norm(sub(walk[1]!, walk[0]!));
      out.labels.push({ at: walk[0]!, text: t(lang, 'rn_stair_up'), papel: { ...beside(u, STAIR_SOBE_OFFSET_MM, scale), fontMm: STAIR_TEXT_MM } });
    }
    const cut = stairCutBase(s, risers, cutZ);
    if (cut) out.strokes.push(cutSymbol(cut, theme.ink, corte));
    // Numeração dos degraus no médio e no fino (o grosseiro só preenche a pegada, e saiu acima). O patamar é um degrau.
    for (const st of steps) {
      const at = treadLabelAt(st, steps, spirals);
      if (at) out.labels.push({ at, text: String(treadNumber(s, st)), papel: { escala: scale, fontMm: STAIR_TEXT_MM }, ...(st.z > cutZ + EPS ? { tone: 'soft' as const } : {}) });
    }
    const lastAt = last ? labelPoint([[last]]) : null;
    if (last && lastAt) out.labels.push({ at: lastAt, text: String(s.riserCount), papel: { escala: scale, fontMm: STAIR_TEXT_MM }, ...(s.topZ > cutZ + EPS ? { tone: 'soft' as const } : {}) });
    if (p.settings.showTags) {
      const at = labelPoint(planFootprint(s));
      if (at) out.labels.push({ at, text: s.type.code, papel: { escala: scale, fontMm: STAIR_TAG_MM } });
    }
  }
  return out;
}

/** Escadas do nível abaixo, apagadas como os pisos e lajes de referência (D4): só o preenchimento e o contorno. */
export function belowStairOps(stairs: ResolvedStair[], theme: PlanTheme): FloorOps {
  const out = empty();
  for (const s of stairs) {
    out.fills.push({ polygons: s.footprint, color: theme.underlay, alpha: 0.22 });
    for (const st of s.steps) out.strokes.push({ pts: st.polygon, closed: true, widthPx: 1, color: theme.underlay, alpha: 0.7 });
  }
  return out;
}

/** Destaque de seleção e de hover das escadas, no padrão dos pisos e lajes (contorno da pegada). */
export function stairSelectionOps(p: Project, stairs: ResolvedStair[], selection: Id[], hover: Id | null, theme: PlanTheme, v: Viewport, grips = true): FloorOps {
  const parts = stairs.map((s) => ({ id: s.id, polygon: planFootprint(s) }));
  return outlineSelectionOps(parts, selection, hover, !p.settings.showTags, theme, unitsOf(p), v, grips);
}
