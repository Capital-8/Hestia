import { ringArea, triangulate, type Mesh2D, type Polygon, type Vec2 } from '@hestia/geom';
import type { HatchKind } from '@hestia/model';
import { DOT_LEN, DOT_PX, HATCH_PX, HATCH_SPACING } from './hatch.ts';
import { primCode } from './hatchDefs.ts';
import { kPapel } from './espessura.ts';
import type { FillOp, HachuraPapel, PesoPapel, StrokeOp } from './types.ts';

/**
 * Atributos por vértice de um lote de traço (linhas, marcadores e faixas). A espessura e o tracejado saem do shader, então
 * a geometria não depende do zoom. Por vértice: `ext` (ao longo, lado, largura em px, fator), `dir` (direção ux, uy e
 * distância ao início do traço, em metros) e `padrao` (traço e período, em px, e o zoom mínimo; período 0 é linha inteira e
 * zoom mínimo 0 é sempre visível). `desl` (px) desloca o marcador na tela e `banda` marca o lado da região para a faixa de
 * contorno (só a metade interna do traço é desenhada).
 */
export interface TracoGpu {
  ext: number[];
  dir: number[];
  padrao: number[];
  desl?: number[];
  banda?: number[];
}

/**
 * Parâmetro do traço de papel que vale para o lote inteiro (é um uniform do material): o teto de largura em px que o
 * shader aplica depois do piso de 1 px. O fator, que varia de traço a traço (peso dentro de um símbolo, seleção), vai por
 * vértice.
 */
export interface PapelLote {
  /** Largura máxima em px; `SEM_TETO` quando o traço não tem teto. */
  teto: number;
}

/** Teto de largura que nunca limita (traço sem teto). */
export const SEM_TETO = 1e9;

/** Hachura procedural: padrão desenhado no fragment shader em coordenadas do mundo. O zoom mínimo vai por vértice em
 * `position.z` (o 2D não usa z), então uma cor/padrão é um lote só, como antes. */
export interface HachuraLote {
  kind: HatchKind;
  /** Hachura em mm de papel (estilo de prancha): o passo e as espessuras vêm da escala, não das constantes de tela. */
  papel?: HachuraPapel;
  /** "Linhas finas (tela)": a espessura de papel da hachura fica limitada a um fio. */
  fina?: boolean;
}

/**
 * Lote de uma camada da planta na GPU: os vértices (x, y, 0), os índices e a cor e o alfa do material. Lotes com a mesma
 * chave saem juntos numa malha só; a chave diz o tipo (`f|` preenchimento, `fm|` preenchimento-marcador, `h|` hachura,
 * `b|` faixa de contorno, `s|` traço, `sd|` traço-marcador), com cor e alfa. A cena usa o tipo para escolher o material.
 */
export interface LoteGpu {
  key: string;
  /** Chave do material, quando difere da do lote. */
  material?: string;
  color: string;
  alpha: number;
  pos: number[];
  idx: number[];
  traco?: TracoGpu;
  /** Traço em mm de papel: o `ext.z` é `kPapel` (ver `espessura.ts`) e o shader aplica o zoom com o piso de 1 px. */
  papel?: PapelLote;
  /** Deslocamento em pixels de tela por vértice (marcadores): o vertex shader o aplica com o zoom corrente. */
  desl?: number[];
  /** Faixa de contorno: só a metade interna do traço (o lado da região) é desenhada. */
  banda?: boolean;
  /** Hachura procedural do preenchimento. */
  hatch?: HachuraLote;
}

/**
 * Código do padrão de hachura no shader (0 = nenhum; o sólido é só um preenchimento). 5 a 9 são os padrões de prancha:
 * o fragment shader os desenha com as mesmas contas do gerador de CPU (`hatch.ts`).
 */
export const CODIGO_HACHURA: Record<HatchKind, number> = {
  none: 0,
  solid: 0,
  diagonal: 1,
  cross: 2,
  gesso: 3,
  dots: 4,
  brick: 5,
  concrete: 6,
  timber: 7,
  insulation: 8,
  earth: 9,
  // Padrões por primitivas (`hatchDefs.ts`): o código é o índice na tabela somado a PRIM_CODE_BASE.
  cmu: primCode('cmu')!,
  exposedBrick: primCode('exposedBrick')!,
  rcConcrete: primCode('rcConcrete')!,
  stone: primCode('stone')!,
  gravel: primCode('gravel')!,
  sand: primCode('sand')!,
  eps: primCode('eps')!,
  woolZigzag: primCode('woolZigzag')!,
  gypsum: primCode('gypsum')!,
  timberEnd: primCode('timberEnd')!,
  steel: primCode('steel')!,
};

/** Parâmetros da hachura procedural (uniformes do material; os mesmos números do padrão vetorial antigo). */
export const HACHURA_GPU = { espaco: HATCH_SPACING, linhaPx: HATCH_PX, pontoPx: DOT_PX, pontoM: DOT_LEN } as const;

/** Parâmetro de papel de um traço: sem teto quando não o declara. */
const papelDe = (p: PesoPapel): PapelLote => ({ teto: p.teto ?? SEM_TETO });
/** Sufixo de chave do traço de papel: igual ao de sempre (`|p`) quando não há teto. */
const sufixoPapel = (p: PapelLote): string => `|p${p.teto !== SEM_TETO ? `t${p.teto}` : ''}`;

const triCache = new WeakMap<Polygon, Mesh2D>();
/** Triangulação do polígono, guardada por identidade: a mesma geometria não se triangula duas vezes. */
function tri(p: Polygon): Mesh2D {
  let m = triCache.get(p);
  if (!m) {
    m = triangulate(p);
    triCache.set(p, m);
  }
  return m;
}

/** Dá o lote em que entra uma geometria de chave `key` (o corrente, se for a mesma chave). */
type ParaLote = (key: string, color: string, alpha: number, tracado: boolean, papel?: PapelLote) => LoteGpu;

/** Acrescenta os triângulos de `m` ao lote, com os vértices em (x, y, z). A hachura usa `z` para o zoom mínimo por
 * vértice (o 2D não usa a coordenada). */
function acrescentarMalha(b: LoteGpu, m: Mesh2D, z = 0): void {
  if (m.indices.length === 0) return;
  const base = b.pos.length / 3;
  for (let i = 0; i < m.positions.length; i += 2) b.pos.push(m.positions[i]!, m.positions[i + 1]!, z);
  for (const k of m.indices) b.idx.push(base + k);
}

/** Acrescenta ao lote o preenchimento `f` e a hachura procedural dele, se houver. */
function acrescentarPreenchimento(para: ParaLote, f: FillOp): void {
  const fillPolygon = (poly: Polygon, color: string, alpha: number): void => {
    const m = tri(poly);
    if (m.indices.length === 0) return;
    acrescentarMalha(para(`f|${color}|${alpha}`, color, alpha, false), m);
  };
  for (const poly of f.polygons) fillPolygon(poly, f.color, f.alpha);
  if (!f.hatch) return;
  const { kind, color } = f.hatch;
  const alpha = f.hatch.alpha ?? 1;
  const zoomMin = f.hatch.zoomMin ?? 0;
  const codigo = CODIGO_HACHURA[kind];
  // Sólido também é um lote com zoom mínimo: abaixo dele o fragmento some, sem refazer a geometria ao cruzar o limiar.
  if (kind !== 'solid' && codigo === 0) return;
  // Hachura procedural: o polígono é só o recorte (triangulado); as linhas/pontos saem do fragment shader em coordenadas do
  // mundo. Não há mais milhares de segmentos gerados na CPU nem um quad por trecho no buffer.
  for (const poly of f.polygons) {
    const m = tri(poly);
    if (m.indices.length === 0) continue;
    const papel = f.hatch.papel;
    const fina = f.hatch.fina === true;
    const chavePapel = papel ? `|p${papel.pitchMm}_${papel.lineMm}_${papel.dotMm}_${papel.escala}${fina ? '_fina' : ''}` : '';
    const b = para(`h|${codigo}|${color}|${alpha}${chavePapel}`, color, alpha, false);
    b.hatch = papel ? { kind, papel, ...(fina ? { fina } : {}) } : { kind };
    acrescentarMalha(b, m, zoomMin);
  }
}

/** Índices de uma forma pequena: leque para triângulo/quadrilátero (a maioria dos marcadores) e earcut para o resto. */
function indicesDaForma(forma: Polygon): number[] {
  const ring = forma[0];
  if (forma.length === 1 && ring) {
    if (ring.length === 3) return [0, 1, 2];
    if (ring.length === 4) return [0, 1, 2, 0, 2, 3];
  }
  return tri(forma).indices;
}

/**
 * Preenchimento-marcador (alças, pontinhos da grade): o polígono guarda a âncora repetida e `deslocamentoPx` a forma em
 * pixels. A triangulação é feita na forma em pixels (a âncora é degenerada), e o vertex shader aplica `deslocamentoPx`
 * com o zoom corrente — o zoom não refaz a geometria.
 */
function acrescentarMarcador(para: ParaLote, f: FillOp): void {
  const desloc = f.deslocamentoPx;
  if (!desloc) return;
  f.polygons.forEach((poly, pi) => {
    const forma = desloc[pi];
    if (!forma) return;
    const indices = indicesDaForma(forma);
    if (indices.length === 0) return;
    const b = para(`fm|${f.color}|${f.alpha}`, f.color, f.alpha, false);
    b.desl ??= [];
    const base = b.pos.length / 3;
    const planos = forma.flat();
    let k = 0;
    for (const ring of poly) {
      for (const pt of ring) {
        b.pos.push(pt.x, pt.y, 0);
        const o = planos[k++];
        b.desl!.push(o?.x ?? 0, o?.y ?? 0);
      }
    }
    for (const idx of indices) b.idx.push(base + idx);
  });
}

/**
 * Faixa de contorno (piso, laje, forro, telhado) como traço: a faixa é a região menos o recuo dela pela largura; desenhar
 * o traço com o dobro da largura e descartar a metade externa dá a mesma imagem sem polígono que dependa do zoom. O lado
 * da região é decidido pela orientação do anel (`aBanda`), então furos também funcionam.
 */
function acrescentarBanda(para: ParaLote, f: FillOp): void {
  const faixa = f.faixa!;
  const papel = faixa.papel ? { ...faixa.papel, fator: (faixa.papel.fator ?? 1) * 2 } : undefined;
  const papelLote = papel ? papelDe(papel) : undefined;
  const ext = papel ? kPapel(papel) : faixa.widthPx * 2;
  const fator = papel?.fator ?? 1;
  const sufixo = papelLote ? sufixoPapel(papelLote) : '';
  f.polygons.forEach((poly) => {
    const b = para(`b|${f.color}|${f.alpha}${sufixo}`, f.color, f.alpha, true, papelLote);
    b.banda = true;
    poly.forEach((ring, ri) => {
      // O interior da região está à esquerda do anel quando a orientação combina com o papel dele (externo ou furo).
      const regiaoNaEsquerda = (ri === 0) === (ringArea(ring) > 0);
      const lado = regiaoNaEsquerda ? 1 : -1;
      let dist = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        dist = quad(b, p, q, ext, dist, [0, 0], fator, 0, undefined, undefined, lado);
      }
    });
  });
}

/** Acumulador de lotes: troca de lote só quando muda a chave. */
class Lotes {
  readonly lista: LoteGpu[] = [];
  private cur: LoteGpu | null = null;
  flush(): void {
    if (this.cur && this.cur.idx.length > 0) this.lista.push(this.cur);
    this.cur = null;
  }

  /** Lote corrente de chave `key`, ou um novo. `papel` só vale para traço. */
  para: ParaLote = (key, color, alpha, tracado, papel) => {
    if (this.cur && this.cur.key === key) return this.cur;
    this.flush();
    const novo: LoteGpu = { key, color, alpha, pos: [], idx: [] };
    if (tracado) novo.traco = { ext: [], dir: [], padrao: [] };
    if (papel) novo.papel = papel;
    this.cur = novo;
    return novo;
  };
}

/**
 * Lotes de uma camada, na ordem em que os itens aparecem: troca de lote só quando muda cor, alfa ou tipo. Sem triângulos
 * não há lote. A ordem devolvida é a de desenho (o `renderOrder` da malha é a posição no vetor). Nenhum lote depende do
 * zoom: hachura, faixa de contorno e marcadores são resolvidos no shader com o zoom corrente.
 */
export function montarLotesCamada(fills: readonly FillOp[], strokes: readonly StrokeOp[]): LoteGpu[] {
  const lotes = new Lotes();
  const para = lotes.para;
  for (const f of fills) {
    if (f.faixa) {
      acrescentarBanda(para, f);
      continue;
    }
    if (f.deslocamentoPx) {
      acrescentarMarcador(para, f);
      continue;
    }
    acrescentarPreenchimento(para, f);
  }
  lotes.flush();

  for (const s of strokes) {
    const papel = s.papel !== undefined ? papelDe(s.papel) : undefined;
    const base = `s|${s.color}|${s.alpha}${papel ? sufixoPapel(papel) : ''}`;
    tracar(lotes.para(s.deslocamentoPx ? `sd|${base.slice(2)}` : base, s.color, s.alpha, true, papel), s);
  }
  lotes.flush();
  return lotes.lista;
}

/** Arestas consecutivas de uma polilinha (fechada: mais a aresta de volta, se houver pontos suficientes). */
export function edges(pts: Vec2[], closed: boolean): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i]!, pts[i + 1]!]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1]!, pts[0]!]);
  return out;
}

/** Período do tracejado em pixels (traço e período), ou [0, 0] se a linha é inteira. */
export function padraoDoTracejado(dash: [number, number] | undefined): [number, number] {
  if (!dash || dash[0] <= 0 || dash[1] <= 0) return [0, 0];
  return [dash[0], dash[0] + dash[1]];
}

/** Traço de uma polilinha (inteira, tracejada ou marcador): cada aresta vira um quad, com a distância acumulada. */
function tracar(b: LoteGpu, s: StrokeOp): void {
  const padrao = padraoDoTracejado(s.dash);
  // Com `papel`, o vértice leva a espessura em unidades de mundo por zoom (o shader põe o zoom e o piso de 1 px).
  const ext = s.papel ? kPapel(s.papel) : s.widthPx;
  const fator = s.papel?.fator ?? 1;
  const pts = s.pts;
  const offs = s.deslocamentoPx;
  const n = pts.length;
  if (n < 2) return;
  const arestas = s.closed && n > 2 ? n : n - 1;
  let dist = 0;
  for (let i = 0; i < arestas; i++) {
    const j = (i + 1) % n;
    const p = pts[i]!;
    const q = pts[j]!;
    const op = offs?.[i];
    const oq = offs?.[j];
    // Marcador de âncora repetida (alça, ponta de seta): a direção sai do deslocamento em pixels.
    const mesmaAncora = Math.hypot(q.x - p.x, q.y - p.y) < 1e-12;
    const direcao = mesmaAncora && op && oq ? ([op, oq] as [Vec2, Vec2]) : undefined;
    dist = quad(b, p, q, ext, dist, padrao, fator, s.zoomMin ?? 0, op && oq ? [op, oq] : undefined, direcao);
  }
}

/**
 * Trecho de `p` a `q` como quad de quatro vértices (dois triângulos). Os vértices guardam o ponto de extremo, o lado e a
 * largura em pixels; o shader desloca cada um em tela (meia espessura para os lados e a ponta de meia espessura nos
 * extremos). `dist` é a distância ao início do traço até `p`, e `padrao` o tracejado (ver `padraoDoTracejado`).
 * `desl` são os deslocamentos em px das duas pontas (marcador); `direcao`, quando existe, define a direção da aresta em
 * vez de `p`→`q` (marcadores de âncora repetida). `lado` é o lado da região na faixa de contorno. Devolve a distância até
 * `q`. Trecho de comprimento zero não gera vértice.
 */
export function quad(
  b: LoteGpu,
  p: Vec2,
  q: Vec2,
  widthPx: number,
  dist = 0,
  padrao: [number, number] = [0, 0],
  fator = 1,
  zoomMin = 0,
  desl?: [Vec2, Vec2],
  direcao?: [Vec2, Vec2],
  lado = 1,
): number {
  const t = b.traco;
  if (!t) throw new Error('quad: o lote precisa ser de traço');
  const [a, z] = direcao ?? [p, q];
  const dx = z.x - a.x;
  const dy = z.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return dist;
  const ux = dx / L;
  const uy = dy / L;
  const base = b.pos.length / 3;
  if (desl) t.desl ??= [];
  if (b.banda) t.banda ??= [];
  // Ordem dos vértices: (extremo, ao longo, lado), a mesma da geometria antiga em metros.
  const corners: Array<[Vec2, number, number, number, Vec2 | undefined]> = [
    [p, -1, 1, dist, desl?.[0]],
    [p, -1, -1, dist, desl?.[0]],
    [q, 1, -1, dist + L, desl?.[1]],
    [q, 1, 1, dist + L, desl?.[1]],
  ];
  for (const [pt, along, sign, d, o] of corners) {
    b.pos.push(pt.x, pt.y, 0);
    t.ext.push(along, sign, widthPx, fator);
    t.dir.push(ux, uy, d);
    t.padrao.push(padrao[0], padrao[1], zoomMin);
    if (desl) t.desl!.push(o?.x ?? 0, o?.y ?? 0);
    if (b.banda) t.banda!.push(lado);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return dist + L;
}

/**
 * Trechos ligados (traço de `dash`, espaço de `gap`) ao longo das arestas da polilinha, em metros. Referência do tracejado
 * antigo (quads recortados por zoom): o shader faz o mesmo recorte pelo padrão em pixels, sem refazer a geometria.
 */
export function dashSegments(pts: Vec2[], closed: boolean, dash: number, gap: number): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  let on = true;
  let left = dash;
  for (const [a, b] of edges(pts, closed)) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-12) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    let t = 0;
    while (t < L) {
      const step = Math.min(left, L - t);
      if (on) out.push([{ x: a.x + ux * t, y: a.y + uy * t }, { x: a.x + ux * (t + step), y: a.y + uy * (t + step) }]);
      t += step;
      left -= step;
      if (left <= 1e-12) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
  return out;
}
