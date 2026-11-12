/**
 * Pontos de apoio em planta de escada, rampa e guarda-corpo: a UMA fonte dos pontos que a captura (snap) oferece e a que as
 * cotas associativas se prendem (`DimensionElementRef` com `feature: 'part'`). É a mesma geometria que a planta desenha.
 *
 * Cada ponto leva uma chave de texto que nomeia a peça e o vértice (`d0.t3.v1` = vértice 1 do degrau 3 do lance 0), então a
 * cota continua presa ao "mesmo" ponto quando o elemento muda de lugar ou de medida. Chave que some numa edição que muda a
 * topologia (menos degraus, peça removida) resolve para `null` e a cota guarda o último ponto.
 *
 * Tipos de ponto: `endpoint` (vértice), `midpoint` (meio de cada aresta) e `center` (centro de degrau, patamar e poste).
 * Segmentos: as arestas, para o pé da perpendicular (`nearest`/`perpendicular`) e o cruzamento entre arestas.
 *
 * - Escada: degraus e patamares, contorno externo (pegada), espelhos, chegada, eixo da subida e, com acabamento ligado,
 *   o piso acabado (quando difere do degrau), o bocel (faixa à frente do degrau) e a faixa do espelho acabado.
 * - Rampa: lances (com as bordas de início e fim), patamares, contorno externo e eixo dos lances.
 * - Guarda-corpo: eixo (o caminho no manual; o eixo que o kernel desenha no hospedado) e os contornos que o kernel desenha
 *   em planta para poste (cantos e centro), trilho, corrimão e painel. Balaústres, cabos, travessas e suportes ficam de fora
 *   (peças repetidas e minúsculas só poluiriam a captura). Sem o kernel pronto, só o eixo do guarda-corpo manual.
 */
import { dist, ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { definirProvedorDeApoio, type Element, type GuardaCorpo, type Project, type Ramp, type Stair } from '@hestia/model';
import type { LinhaVistaGC } from './guardaCorpoVista.ts';
import { servicoGuardaCorpo } from './kernelGuardaCorpoServico.ts';
import { resolveRampOne } from './ramps.ts';
import { stairArrivalTop } from './stairArrival.ts';
import { stairArrivalFrame } from './stairBody.ts';
import { stairFinishModel } from './stairFinish.ts';
import { sampleChain } from './stairSketchGeom.ts';
import { resolveStairOne, type ResolvedStair } from './stairs.ts';

export type TipoApoio = 'endpoint' | 'midpoint' | 'center';

/** Ponto de apoio: posição em planta, tipo de captura e a chave que o nomeia dentro do elemento. */
export interface PontoApoio extends Vec2 {
  chave: string;
  tipo: TipoApoio;
}

/** Aresta de apoio (pé da perpendicular e cruzamentos), com a chave da aresta. */
export interface SegmentoApoio {
  chave: string;
  a: Vec2;
  b: Vec2;
}

export interface ApoioDoElemento {
  pontos: PontoApoio[];
  segmentos: SegmentoApoio[];
  /** Posição de cada ponto pela chave (as cotas leem por aqui). */
  porChave: ReadonlyMap<string, Vec2>;
}

/** Cota (m acima do nível) do plano de corte da planta do guarda-corpo, quando a vista não traz outra. */
export const CORTE_PADRAO_PLANTA_GC = 1.2;

/** Papéis de peça do guarda-corpo (`PAPEL_GC`) que entram na captura: poste, trilho, corrimão e painel. */
const PAPEIS_COM_APOIO = new Set([0, 2, 3, 5]);
const PAPEL_POSTE = 0;
const PAPEL_EIXO = 255;

/** Comprimento mínimo de uma aresta; abaixo disso as duas pontas são o mesmo ponto (amostragem de arco). */
const MIN_SEG = 1e-9;

/** Chave de posição com 6 casas: junções e amostras repetidas viram um ponto só. */
// units-ok: chave de deduplicação geométrica, não é texto de medida na interface.
const posKey = (q: Vec2): string => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;

/** Anel sem o ponto de fechamento repetido. */
function semFechamento(pts: readonly Vec2[]): Vec2[] {
  const out = pts.map((q) => ({ x: q.x, y: q.y }));
  if (out.length > 2 && dist(out[0]!, out[out.length - 1]!) < MIN_SEG) out.pop();
  return out;
}

/** Monta pontos e arestas sem repetição: o mesmo tipo na mesma posição, e a mesma aresta, valem uma vez só. */
class Montador {
  private readonly pontos: PontoApoio[] = [];
  private readonly segmentos: SegmentoApoio[] = [];
  private readonly vistos = new Set<string>();
  private readonly arestas = new Set<string>();

  ponto(chave: string, q: Vec2, tipo: TipoApoio): void {
    const k = `${tipo}|${posKey(q)}`;
    if (this.vistos.has(k)) return;
    this.vistos.add(k);
    this.pontos.push({ x: q.x, y: q.y, chave, tipo });
  }

  /** Só a aresta a→b (captura de aresta), sem ponto médio. */
  segmento(chave: string, a: Vec2, b: Vec2): void {
    if (dist(a, b) < MIN_SEG) return;
    const ka = posKey(a);
    const kb = posKey(b);
    const k = ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (this.arestas.has(k)) return;
    this.arestas.add(k);
    this.segmentos.push({ chave, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }

  /** Aresta a→b: o segmento e o ponto médio. */
  aresta(chave: string, mChave: string, a: Vec2, b: Vec2): void {
    if (dist(a, b) < MIN_SEG) return;
    this.segmento(chave, a, b);
    this.ponto(mChave, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint');
  }

  /** Contorno fechado: vértices, arestas (inclusive a de fechamento) e, se pedido, o centro. */
  anel(prefixo: string, ring: readonly Vec2[], centro = false, curvo = false): void {
    const r = semFechamento(ring);
    if (r.length === 0) return;
    if (curvo && r.length > 4) {
      // Perfil redondo (poste circular do kernel, 16 vértices): só os quatro quadrantes e o centro são pontos; os vértices e os
      // meios das cordas minúsculas só poluiriam. A borda continua captura de aresta (`nearest`, perpendicular).
      const ext = [r.reduce((m, q) => (q.x > m.x ? q : m)), r.reduce((m, q) => (q.y > m.y ? q : m)), r.reduce((m, q) => (q.x < m.x ? q : m)), r.reduce((m, q) => (q.y < m.y ? q : m))];
      ext.forEach((q, i) => this.ponto(`${prefixo}.q${i}`, q, 'endpoint'));
      for (let i = 0; i < r.length; i++) this.segmento(`${prefixo}.s${i}`, r[i]!, r[(i + 1) % r.length]!);
    } else {
      r.forEach((q, i) => this.ponto(`${prefixo}.v${i}`, q, 'endpoint'));
      if (r.length > 1) {
        const n = r.length > 2 ? r.length : 1;
        for (let i = 0; i < n; i++) this.aresta(`${prefixo}.s${i}`, `${prefixo}.m${i}`, r[i]!, r[(i + 1) % r.length]!);
      }
    }
    if (centro && r.length >= 3) this.ponto(`${prefixo}.c`, { x: r.reduce((s, q) => s + q.x, 0) / r.length, y: r.reduce((s, q) => s + q.y, 0) / r.length }, 'center');
  }

  /** Polilinha aberta: vértices e arestas. */
  linha(prefixo: string, pts: readonly Vec2[]): void {
    pts.forEach((q, i) => this.ponto(`${prefixo}.v${i}`, q, 'endpoint'));
    for (let i = 1; i < pts.length; i++) this.aresta(`${prefixo}.s${i - 1}`, `${prefixo}.m${i - 1}`, pts[i - 1]!, pts[i]!);
  }

  fim(): ApoioDoElemento {
    const porChave = new Map<string, Vec2>();
    for (const q of this.pontos) porChave.set(q.chave, { x: q.x, y: q.y });
    return { pontos: this.pontos, segmentos: this.segmentos, porChave };
  }
}

/**
 * Contorno vindo de operação booleana (união, diferença): o polígono do Clipper pode começar em outro vértice e girar ao contrário
 * quando o elemento é girado, o que trocaria as chaves dos pontos. Aqui ele ganha o sentido de `sentido` (sinal da área) e começa no
 * vértice mais próximo de `ancora` (um ponto que vem do croqui, estável); o mesmo contorno tem sempre as mesmas chaves.
 */
function canonico(ring: readonly Vec2[], ancora: Vec2, sentido: number): Ring {
  const r = semFechamento(ring);
  if (r.length < 3) return r;
  const orientado = Math.sign(ringArea(r)) === Math.sign(sentido) || sentido === 0 ? r : [...r].reverse();
  let k = 0;
  for (let i = 1; i < orientado.length; i++) if (dist(orientado[i]!, ancora) < dist(orientado[k]!, ancora) - 1e-9) k = i;
  return [...orientado.slice(k), ...orientado.slice(0, k)];
}

const mesmoAnel = (a: Ring, b: Ring): boolean => a.length === b.length && a.every((q, i) => dist(q, b[i]!) < 1e-7);

/** Ponto a meio comprimento da polilinha. */
function meioDaLinha(pts: readonly Vec2[]): Vec2 {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = dist(a, b);
    if (l > 0 && acc + l >= total / 2) {
      const t = (total / 2 - acc) / l;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += l;
  }
  return pts[0]!;
}

interface PecaAcabada {
  chave: string;
  anel: Ring;
}

/**
 * Acabamentos da escada que existem além do degrau: o piso acabado (só quando difere do degrau, ou seja, corre sob o espelho
 * acabado ou leva bocel), o bocel (a faixa à frente do degrau, geometria própria) e a faixa do espelho acabado. Guardado pela
 * escada resolvida: o modelo dos acabamentos (diferença de polígonos) só se refaz quando a escada muda.
 */
const acabamentos = new WeakMap<ResolvedStair, PecaAcabada[]>();

function acabamentoDaEscada(rs: ResolvedStair): PecaAcabada[] {
  const guardado = acabamentos.get(rs);
  if (guardado) return guardado;
  const out: PecaAcabada[] = [];
  const model = stairFinishModel(rs);
  if (model) {
    const h = rs.riserHeight;
    const espelhoDe = (n: number): Vec2[] | null => {
      const r = rs.risers.find((q) => Math.round((q.z0 - rs.baseZ) / h) + 1 === n);
      return r ? (r.points.length >= 2 ? r.points : [r.a, r.b]) : null;
    };
    for (const sol of model.solids) {
      if (sol.kind === 'riser') {
        out.push({ chave: `ef${sol.number}`, anel: canonico(sol.polygon, espelhoDe(sol.number)?.[0] ?? sol.polygon[0]!, 1) });
        continue;
      }
      const tipo = sol.stepKind === 'landing' ? 'p' : 't';
      const degrau = rs.steps.find((st) => st.componentIndex === sol.componentIndex && st.kind === (sol.stepKind ?? 'tread') && Math.abs(st.z - sol.z1) < 1e-6);
      if (!degrau) continue;
      const base = `${sol.componentIndex}.${tipo}${sol.number}`;
      const sentido = ringArea(degrau.polygon);
      if (!mesmoAnel(degrau.polygon, sol.polygon)) out.push({ chave: `pf${base}`, anel: canonico(sol.polygon, degrau.polygon[0]!, sentido) });
      if (!(sol.edgeLength > 0)) continue;
      // Bocel: a faixa à frente do espelho de baixo, geometria própria (já unida ao piso acabado em `pf`).
      const frente = espelhoDe(sol.number);
      if (sol.bocelPolygon && frente) out.push({ chave: `bo${base}`, anel: canonico(sol.bocelPolygon, frente[0]!, sentido) });
    }
  }
  acabamentos.set(rs, out);
  return out;
}

function montarEscada(p: Project, s: Stair, rs: ResolvedStair): ApoioDoElemento {
  const m = new Montador();
  for (const st of rs.steps) m.anel(`d${st.componentIndex}.${st.kind === 'tread' ? 't' : 'p'}${st.index}`, st.polygon, true);
  const origem = rs.steps[0]!.polygon;
  rs.footprint.forEach((poly, pi) => poly.forEach((ring, ri) => m.anel(`c${pi}.${ri}`, canonico(ring, origem[0]!, ringArea(origem)))));
  for (const r of rs.risers) m.linha(`e${r.componentIndex}.${r.index}`, r.points.length >= 2 ? r.points : [r.a, r.b]);
  // Chegada: o último degrau da própria escada, quando nenhuma laje/piso fecha o nível de topo.
  if (!stairArrivalTop(p, rs).covered) {
    const f = stairArrivalFrame(rs);
    if (f) m.anel('chegada', [f.a, f.b, { x: f.b.x + f.u.x * f.length, y: f.b.y + f.u.y * f.length }, { x: f.a.x + f.u.x * f.length, y: f.a.y + f.u.y * f.length }], true);
  }
  // Eixo da subida (o que a seta de subida percorre): o `path` explícito do lance ou os meios dos espelhos.
  const porLance = new Map<number, typeof rs.risers>();
  for (const r of rs.risers) porLance.set(r.componentIndex, [...(porLance.get(r.componentIndex) ?? []), r]);
  for (const [ci, rr] of [...porLance].sort((x, y) => x[0] - y[0])) {
    const c = s.components[ci];
    const explicito = c?.kind === 'run' && c.path.length > 0 ? sampleChain(c.path) : [];
    const eixo = explicito.length >= 2 ? explicito : [...rr].sort((x, y) => x.z0 - y.z0).map((r) => meioDaLinha(r.points.length >= 2 ? r.points : [r.a, r.b]));
    if (eixo.length >= 2) m.linha(`eixo${ci}`, eixo);
  }
  for (const a of acabamentoDaEscada(rs)) m.anel(a.chave, a.anel);
  return m.fim();
}

/** Escada pela escada resolvida e pelo fechamento da chegada: o que não muda entre edições de outros elementos é reaproveitado. */
const escadas = new WeakMap<ResolvedStair, { coberta: boolean; apoio: ApoioDoElemento }>();

function apoioDaEscada(p: Project, s: Stair): ApoioDoElemento | null {
  const rs = resolveStairOne(p, s);
  if (!rs || rs.steps.length === 0) return null;
  const coberta = stairArrivalTop(p, rs).covered;
  const guardado = escadas.get(rs);
  if (guardado && guardado.coberta === coberta) return guardado.apoio;
  const apoio = montarEscada(p, s, rs);
  escadas.set(rs, { coberta, apoio });
  return apoio;
}

function apoioDaRampa(p: Project, r: Ramp): ApoioDoElemento | null {
  const rr = resolveRampOne(p, r);
  if (!rr || (rr.flights.length === 0 && rr.landings.length === 0)) return null;
  const m = new Montador();
  for (const f of rr.flights) {
    m.anel(`l${f.componentIndex}`, f.polygon, true);
    m.linha(`l${f.componentIndex}.i`, f.startEdge);
    m.linha(`l${f.componentIndex}.f`, f.endEdge);
    m.linha(`eixo${f.componentIndex}`, [f.start, f.end]);
  }
  for (const l of rr.landings) m.anel(`p${l.componentIndex}`, l.polygon, true);
  const origem = (rr.flights[0]?.polygon ?? rr.landings[0]!.polygon) as Ring;
  rr.footprint.forEach((poly, pi) => poly.forEach((ring, ri) => m.anel(`c${pi}.${ri}`, canonico(ring, origem[0]!, ringArea(origem)))));
  return m.fim();
}

/** Linhas de planta do kernel agrupadas por guarda-corpo, uma vez por lista (a lista é a mesma enquanto o kernel não recalcula). */
const linhasPorGuarda = new WeakMap<readonly LinhaVistaGC[], Map<string, LinhaVistaGC[]>>();

function linhasDoGuarda(linhas: readonly LinhaVistaGC[], id: string): readonly LinhaVistaGC[] {
  let mapa = linhasPorGuarda.get(linhas);
  if (!mapa) {
    mapa = new Map();
    for (const l of linhas) {
      const lista = mapa.get(l.guardaId);
      if (lista) lista.push(l);
      else mapa.set(l.guardaId, [l]);
    }
    linhasPorGuarda.set(linhas, mapa);
  }
  return mapa.get(id) ?? [];
}

const guardas = new WeakMap<GuardaCorpo, { linhas: readonly LinhaVistaGC[] | null; apoio: ApoioDoElemento }>();

function apoioDoGuarda(p: Project, g: GuardaCorpo): ApoioDoElemento {
  const nivel = p.levels.find((l) => l.id === g.levelId);
  const todas = nivel ? servicoGuardaCorpo().planta(p, g.levelId, nivel.elevation + CORTE_PADRAO_PLANTA_GC, 1) : null;
  const guardado = guardas.get(g);
  if (guardado && guardado.linhas === todas) return guardado.apoio;
  const m = new Montador();
  const manual = g.hospedeiro.tipo === 'manual';
  if (g.hospedeiro.tipo === 'manual') {
    const pts = g.hospedeiro.caminho.map((q) => ({ x: q.x, y: q.y }));
    if (pts.length >= 2) {
      if (g.hospedeiro.fechado) m.anel('eixo0', pts);
      else m.linha('eixo0', pts);
    }
  }
  if (todas) {
    const porPapel = new Map<number, number>();
    let eixos = 0;
    for (const l of linhasDoGuarda(todas, g.id)) {
      if (l.papel === PAPEL_EIXO) {
        // O eixo do guarda-corpo manual é o caminho do modelo (chaves estáveis); o do hospedado só existe no kernel.
        if (!manual && l.pontos.length >= 2) m.linha(`eixo${eixos++}`, l.pontos);
        continue;
      }
      if (!PAPEIS_COM_APOIO.has(l.papel)) continue;
      const n = porPapel.get(l.papel) ?? 0;
      porPapel.set(l.papel, n + 1);
      const pts = semFechamento(l.pontos);
      if (pts.length >= 3) m.anel(`p${l.papel}.${n}`, pts, l.papel === PAPEL_POSTE, l.papel === PAPEL_POSTE);
      else if (pts.length === 2) m.linha(`p${l.papel}.${n}`, pts);
    }
  }
  const apoio = m.fim();
  guardas.set(g, { linhas: todas, apoio });
  return apoio;
}

/** Cache por projeto (escada e rampa): uma edição cria outro projeto, e o que depende só do elemento reaproveita o cálculo (caches acima). */
const porProjeto = new WeakMap<Project, Map<string, ApoioDoElemento | null>>();

/**
 * Pontos de apoio em planta da escada, rampa ou guarda-corpo, ou `null` quando o elemento não é um deles ou não tem
 * geometria resolvida (escada com topo abaixo da base, croqui inválido); a captura então cai no croqui, como antes.
 */
export function apoioDoElemento(p: Project, el: Element | undefined): ApoioDoElemento | null {
  if (!el || (el.kind !== 'stair' && el.kind !== 'ramp' && el.kind !== 'railing')) return null;
  // O guarda-corpo depende do kernel, que pode ficar pronto sem o projeto mudar: ele tem cache próprio (por elemento e pelas linhas do kernel).
  if (el.kind === 'railing') return apoioDoGuarda(p, el);
  let mapa = porProjeto.get(p);
  if (!mapa) {
    mapa = new Map();
    porProjeto.set(p, mapa);
  }
  if (mapa.has(el.id)) return mapa.get(el.id)!;
  const apoio = el.kind === 'stair' ? apoioDaEscada(p, el) : apoioDaRampa(p, el);
  mapa.set(el.id, apoio);
  return apoio;
}

/** Posição do ponto de apoio `chave` do elemento; null se o elemento ou a chave não existe mais. */
export function pontoDeApoio(p: Project, elementId: string, chave: string): Vec2 | null {
  const q = apoioDoElemento(p, p.elements[elementId])?.porChave.get(chave);
  return q ? { x: q.x, y: q.y } : null;
}

// As cotas associativas leem os pontos de apoio por aqui (o modelo não conhece o motor).
definirProvedorDeApoio({
  ponto: (p, id, key) => pontoDeApoio(p, id, key),
  candidatos: (p, el) => (apoioDoElemento(p, el)?.pontos ?? []).map((q) => ({ key: q.chave, point: { x: q.x, y: q.y } })),
});
