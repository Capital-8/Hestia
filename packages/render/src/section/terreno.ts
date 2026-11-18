import { guardaCorpoNoPonto, mapaCorteAterroLigado, guardaCorposNaCaixa, linhasVisiveisGC, planoDaSecao, servicoTerreno, ServicoTerreno, type LinhaCorteTN, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import type { HatchKind, Id, Project, Terrain } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { ALFA_MAPA, COR_ATERRO, COR_CORTE } from '../plan/terrenoMapa.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { FillOp, PlanTheme, StrokeOp } from '../plan/types.ts';

type Pt = { x: number; y: number };

/** Cor do solo sem material nem cor própria (a mesma do 3D). */
export const COR_PADRAO_TERRENO = '#b5a27a';
/** [traço, vão] do perfil do terreno existente (papel 1), em px. */
export const TRACO_PERFIL_EXISTENTE: [number, number] = [6, 4];

/**
 * Terreno no corte e na elevação (ficha V3): as linhas vêm do kernel (`terreno_corte`) em `(s, z)` do plano da vista, as mesmas coordenadas do resto
 * do desenho, e o mecanismo é o do guarda-corpo (`section/guardaCorpo.ts`): camada própria fora do `SectionResult`, visibilidade pelo `hidden` e
 * pela categoria, seleção e realce sobre as mesmas linhas desenhadas. Nenhum caminho TS gera o perfil: sem kernel pronto nada é desenhado. O lote
 * não entra, e a região só altera o perfil (superfície proposta); nenhuma das duas é desenhada como elemento.
 * Papel 0 (cortado): contorno de corte da categoria `site` e preenchimento (hachura do material, senão cor sólida); papel 1 (perfil existente):
 * tracejado fino; papel 2 (silhueta): linha fina; papel 3 (silhueta do existente): tracejado fino, como o papel 1.
 * Com o mapa de corte e aterro ligado, o perfil proposto e o existente do mesmo terreno delimitam polígonos de corte (existente acima) e de aterro
 * (proposto acima), nas cores e na transparência do mapa da planta (`corteAterroNaSecaoOps`).
 */

/** Como a vista pinta (vêm do desenho do corte: arame e detalhe grosso sem preenchimento, hachura com o zoom mínimo, meio-tom da categoria). */
export interface OpcoesTerrenoCorte {
  noFill: boolean;
  hatchFor: (kind: HatchKind | undefined, color: string) => FillOp['hatch'];
  halftone: (color: string, paint: PlanPaint) => string;
}

export interface OpsTerrenoCorte {
  fills: FillOp[];
  strokes: StrokeOp[];
  /** Contorno azul do modo Reveal, para entrar depois do desenho (como o das outras categorias). */
  reveal: StrokeOp[];
}

const ORDEM_PAPEL = { silhuetaExistente: 0, silhueta: 1, perfilExistente: 2, cortado: 3 } as const;

/**
 * Linhas do terreno visíveis no plano da vista: vazias sem terreno no projeto, sem plano, sem kernel pronto ou com o terreno oculto. O corte não
 * depende do nível: todo terreno do projeto aparece. Ordenadas do mais longe ao mais perto (silhueta, perfil existente, cortado).
 */
export function linhasDoTerrenoNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined): LinhaCorteTN[] {
  if (!ServicoTerreno.temTerreno(p)) return [];
  const plano = planoDaSecao(s);
  if (!plano) return [];
  const r = servicoTerreno().corte(p, { x: plano.a.x, y: plano.a.y }, { x: plano.b.x - plano.a.x, y: plano.b.y - plano.a.y }, plano.depth, null);
  if (!r) return [];
  return r.filter((l) => l.pontos.length >= 2 && !hidden?.has(l.terrenoId)).sort((a, b) => ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel]);
}

const emPlano = (l: LinhaCorteTN): Pt[] => l.pontos.map((q) => ({ x: q.s, y: q.z }));

/**
 * Desenho do terreno no corte e na elevação, para ir ANTES dos elementos do edifício (fica atrás). `paint` é o da categoria `site`; com ela
 * desligada nada sai.
 */
export function terrenoCorteOps(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  dark: boolean,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  opcoes: OpcoesTerrenoCorte,
  revelados?: ReadonlySet<Id>,
): OpsTerrenoCorte {
  const out: OpsTerrenoCorte = { fills: [], strokes: [], reveal: [] };
  if (!paint.visible) return out;
  const papel = dark ? theme.bg : '#ffffff';
  const { noFill, hatchFor, halftone } = opcoes;
  const linhas = linhasDoTerrenoNoCorte(p, s, hidden);
  for (const l of linhas) {
    const pts = emPlano(l);
    const t = p.elements[l.terrenoId] as Terrain | undefined;
    const material = t?.materialId ? p.materials[t.materialId] : undefined;
    const base = paint.color ?? material?.color ?? t?.color ?? COR_PADRAO_TERRENO;
    if (l.papel === 'cortado') {
      if (!noFill && pts.length >= 3) {
        const cor = paint.visual === 'shaded' ? base : mix(base, papel, dark ? 0.5 : 0.58);
        const hatch = hatchFor(material?.hatch, halftone(mix(base, dark ? '#ffffff' : '#000000', 0.45), paint));
        out.fills.push({ polygons: [[pts]], color: halftone(cor, paint), alpha: paint.alpha, hatch });
      }
      out.strokes.push({ pts, closed: true, ...paint.cut, color: halftone(paint.color ?? mix(theme.ink, papel, 0.35), paint), alpha: 1 });
    } else if (l.papel === 'perfilExistente' || l.papel === 'silhuetaExistente') {
      out.strokes.push({ pts, closed: false, ...paint.proj, color: halftone(mix(paint.color ?? theme.ink, papel, 0.45), paint), alpha: 1, dash: TRACO_PERFIL_EXISTENTE });
    } else {
      out.strokes.push({ pts, closed: false, ...paint.proj, color: halftone(mix(paint.color ?? theme.ink, papel, 0.2), paint), alpha: 1 });
    }
    if (revelados?.has(l.terrenoId)) out.reveal.push({ pts, closed: l.papel === 'cortado', widthPx: 2, color: '#2563eb', alpha: 1 });
  }
  if (mapaCorteAterroLigado()) out.fills.push(...corteAterroNaSecaoOps(linhas));
  return out;
}

const EPS_Z = 1e-9;
const EPS_S = 1e-9;

/**
 * Cota de uma polilinha em `s` crescente nas pontas do intervalo `[a, b]` (`a < b`), que cai inteiro dentro de um segmento não vertical: assim um degrau
 * (vértices com o mesmo `s`) dá a cota da esquerda e a da direita, e não uma rampa. `k` é o índice do segmento (só avança).
 */
function cotasNoIntervalo(pts: readonly Pt[], k: { i: number }, a: number, b: number): [number, number] {
  while (k.i < pts.length - 2 && (pts[k.i + 1]!.x - pts[k.i]!.x < EPS_S || pts[k.i + 1]!.x <= a + EPS_S)) k.i++;
  const p = pts[k.i]!;
  const q = pts[k.i + 1]!;
  const f = (x: number): number => (q.x - p.x < EPS_S ? p.y : p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x));
  return [f(a), f(b)];
}

/** Aresta do polígono de um trecho do perfil proposto: os pontos do solo cortado sem os dois da base (fechamento por baixo). */
const perfilDeCortado = (l: LinhaCorteTN): Pt[] => l.pontos.slice(0, Math.max(0, l.pontos.length - 2)).map((q) => ({ x: q.s, y: q.z }));

/** Área absoluta (laço de Gauss) de um anel. */
function areaDoAnel(r: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Polígonos de corte e de aterro entre um trecho de P e um de E (`s` crescente, os dois), na faixa de `s` em que ambos existem. */
function poligonosEntre(P: readonly Pt[], E: readonly Pt[], corte: Pt[][], aterro: Pt[][]): void {
  if (P.length < 2 || E.length < 2) return;
  const lo = Math.max(P[0]!.x, E[0]!.x);
  const hi = Math.min(P[P.length - 1]!.x, E[E.length - 1]!.x);
  if (hi - lo < EPS_S) return;
  const ss = [...new Set([lo, hi, ...P.map((q) => q.x), ...E.map((q) => q.x)].filter((x) => x >= lo && x <= hi))].sort((a, b) => a - b);
  // Pontos (s, zP, zE): dois por intervalo (cota à direita do começo e à esquerda do fim), com os cruzamentos de sinal de zE - zP inseridos como
  // pontos de diferença nula (dentro do intervalo ou num degrau).
  const amostras: Array<{ s: number; zp: number; ze: number }> = [];
  const poe = (x: number, zp: number, ze: number): void => {
    const prev = amostras[amostras.length - 1];
    if (prev) {
      const d0 = prev.ze - prev.zp;
      const d1 = ze - zp;
      if ((d0 > EPS_Z && d1 < -EPS_Z) || (d0 < -EPS_Z && d1 > EPS_Z)) {
        const t = d0 / (d0 - d1);
        const zc = prev.zp + (zp - prev.zp) * t;
        amostras.push({ s: prev.s + (x - prev.s) * t, zp: zc, ze: zc });
      }
    }
    amostras.push({ s: x, zp, ze });
  };
  const kp = { i: 0 };
  const ke = { i: 0 };
  for (let n = 0; n + 1 < ss.length; n++) {
    const a = ss[n]!;
    const b = ss[n + 1]!;
    if (b - a < EPS_S) continue;
    const [p0, p1] = cotasNoIntervalo(P, kp, a, b);
    const [e0, e1] = cotasNoIntervalo(E, ke, a, b);
    poe(a, p0, e0);
    poe(b, p1, e1);
  }
  const sinal = (a: { zp: number; ze: number }): number => (a.ze - a.zp > EPS_Z ? 1 : a.ze - a.zp < -EPS_Z ? -1 : 0);
  let i = 0;
  while (i < amostras.length) {
    const sg = sinal(amostras[i]!);
    if (sg === 0) { i++; continue; }
    let j = i;
    while (j + 1 < amostras.length && sinal(amostras[j + 1]!) === sg) j++;
    const trecho = amostras.slice(Math.max(0, i - 1), Math.min(amostras.length, j + 2));
    // Corte: E acima de P (o solo existente sai); aterro: P acima de E (solo acrescentado).
    const baixo = trecho.map((a): Pt => ({ x: a.s, y: sg > 0 ? a.zp : a.ze }));
    const alto = trecho.map((a): Pt => ({ x: a.s, y: sg > 0 ? a.ze : a.zp })).reverse();
    const anel: Pt[] = [];
    for (const q of [...baixo, ...alto]) {
      const u = anel[anel.length - 1];
      if (!u || Math.abs(u.x - q.x) > EPS_S || Math.abs(u.y - q.y) > EPS_Z) anel.push(q);
    }
    if (anel.length >= 3 && areaDoAnel(anel) > 1e-9) (sg > 0 ? corte : aterro).push(anel);
    i = j + 1;
  }
}

/**
 * Corte e aterro no corte e na elevação: por terreno, une o perfil proposto P (topo do solo cortado, papel 0) e o existente E (papel 1) por `s`, insere
 * os cruzamentos de sinal de `z_E - z_P` e fecha um polígono por trecho de mesmo sinal. Corte onde E está acima de P, aterro onde P está acima de E,
 * com as cores e a transparência do mapa da planta. Sem papel 1 (terreno sem plataforma nem região nivelada) E = P e nada sai. Saem no máximo dois
 * preenchimentos (corte e aterro) com um polígono por trecho. Quem chama decide se o mapa está ligado e entrega só as linhas visíveis.
 */
export function corteAterroNaSecaoOps(linhas: readonly LinhaCorteTN[]): FillOp[] {
  const corte: Pt[][] = [];
  const aterro: Pt[][] = [];
  const terrenos = new Set(linhas.map((l) => l.terrenoId));
  for (const id of terrenos) {
    const Ps = linhas.filter((l) => l.terrenoId === id && l.papel === 'cortado').map(perfilDeCortado);
    const Es = linhas.filter((l) => l.terrenoId === id && l.papel === 'perfilExistente').map(emPlano);
    for (const P of Ps) for (const E of Es) poligonosEntre(P, E, corte, aterro);
  }
  const out: FillOp[] = [];
  if (corte.length > 0) out.push({ polygons: corte.map((r) => [r]), color: COR_CORTE, alpha: ALFA_MAPA });
  if (aterro.length > 0) out.push({ polygons: aterro.map((r) => [r]), color: COR_ATERRO, alpha: ALFA_MAPA });
  return out;
}

/** Realce do terreno selecionado ou sob o cursor (decisão 0016): contorno na cor de seleção, e preenchimento 0,25 no solo cortado. Vai por último. */
export function terrenoCorteRealce(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  highlight: { selection: readonly Id[]; hover: Id | null } | undefined,
): { fills: FillOp[]; strokes: StrokeOp[] } {
  const out = { fills: [] as FillOp[], strokes: [] as StrokeOp[] };
  if (!paint.visible || !highlight || (highlight.selection.length === 0 && highlight.hover === null)) return out;
  const selecionados = new Set<Id>(highlight.selection);
  for (const l of linhasDoTerrenoNoCorte(p, s, hidden)) {
    const pts = emPlano(l);
    const fechada = l.papel === 'cortado';
    if (selecionados.has(l.terrenoId)) {
      if (fechada && pts.length >= 3) out.fills.push({ polygons: [[pts]], color: theme.select, alpha: 0.25 });
      out.strokes.push({ pts, closed: fechada, widthPx: 2, color: theme.select, alpha: 1 });
    } else if (highlight.hover === l.terrenoId) {
      out.strokes.push({ pts, closed: fechada, widthPx: 1.5, color: theme.select, alpha: 0.55 });
    }
  }
  return out;
}

/** As linhas do terreno no formato das do guarda-corpo, para usar a mesma seleção: o solo cortado é peça fechada (papel 0), o resto polilinha (255). */
function comoLinhasVista(ls: readonly LinhaCorteTN[]): LinhaVistaGC[] {
  return ls.map((l) => ({ guardaId: l.terrenoId, papel: l.papel === 'cortado' ? 0 : 255, estilo: l.papel === 'cortado' ? 0 : 1, pontos: emPlano(l) }));
}

/**
 * Terreno sob o ponto (s, z) do corte ou da elevação: o solo cortado vale no interior e na borda; o perfil existente e a silhueta, pela distância à
 * linha (`tolerance`, em unidades do desenho). Oculto ou categoria desligada não é alvo. Quem chama deve preferir o elemento do edifício a este.
 */
export function pickTerrenoNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, point: Pt, tolerance: number): Id | null {
  if (!paint.visible) return null;
  return guardaCorpoNoPonto(comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)), new Set<Id>(), point, tolerance);
}

/** Terrenos visíveis no desenho do corte ou da elevação (sem repetição). */
export function terrenosVisiveisNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint): Id[] {
  if (!paint.visible) return [];
  return [...new Set(linhasVisiveisGC(comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)), new Set<Id>()).map((l) => l.guardaId))];
}

/**
 * Terrenos que a caixa de seleção pega (coordenadas (s, z)): janela (`b.x >= a.x`) = todas as linhas dele dentro; cruzamento = alguma linha toca a caixa.
 * A seleção do guarda-corpo ignora polilinhas abertas; aqui o perfil e a silhueta entram como polígono de área nula (ida e volta), que tem as mesmas
 * arestas e vértices.
 */
export function terrenosNaCaixaDoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, a: Pt, b: Pt): Id[] {
  if (!paint.visible) return [];
  const linhas = comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)).map((l): LinhaVistaGC => (l.papel === 0 ? l : { ...l, papel: 0, pontos: [...l.pontos, ...l.pontos.slice(1, -1).reverse()] }));
  return guardaCorposNaCaixa(linhas, new Set<Id>(), a, b);
}
