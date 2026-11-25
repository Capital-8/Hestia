import { add, closestOnSegment, cross, dist, dot, len, mid, multiArea, norm, perp, pointInMulti, ringArea, sub, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { planeZ, type ResolvedRoof, type ResolvedRoofLayer, type ViewClass } from '@hestia/engine';
import { boundaryKindsOf, edgeSlopesOf } from '@hestia/engine/src/roofShapes.ts';
import { formatQuantity, isRoof, unitSymbol, unitsOf, view3dOf, type DetailLevel, type Id, type Project, type ResolvedUnits, type Roof } from '@hestia/model';
import { ARC_TURN_DEG } from '@hestia/tools/src/roofGeom.ts';
import type { Viewport } from '../viewport.ts';
import { mix } from './color.ts';
import { corPadraoSuperficie } from './materialPlan.ts';
import { fmtArea, labelPoint, outlineSelectionOps, SURFACE_TEXT_MM, type FloorOps } from './floors.ts';
import { poligonoEm, tracoEm } from './marcadores.ts';
import { slopeArrow } from './slabs.ts';
import { telhadosDoNivel } from './resolucao.ts';
import { defaultPaint, surfaceColor, type PlanPaint } from './style.ts';
import { arcoDoTelhado, ladosComSimbolo } from './roofsArco.ts';
import { aplicarCorte, telhadoOriginal } from './roofsCorte.ts';
import { gripsDoTelhado } from './roofsArcoEdge.ts';
import { corDaAresta, emPrancha, tomDaAgua } from './roofsAgua.ts';
import { gableSymbolOps } from './roofsEmpena.ts';
import { evitarSobreposicao } from './roofsRotulos.ts';
import { projecaoDoTelhado } from './roofsProjecao.ts';
import { espessurasDoTelhado } from './roofsTracos.ts';
import type { Espessura, PapelRotulo, PlanTheme, StrokeOp } from './types.ts';

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/** Afastamento (m) para testar de que lado de uma divisa está cada água. */
const SIDE = 1e-5;

const scale = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });

/** Contorno do telhado em planta: união das águas (as divisas internas somem). */
export const roofFootprint = (r: ResolvedRoof): MultiPolygon => union(...r.planes.map((pl) => pl.polygon));

/**
 * Cantos lógicos do contorno (os vértices que recebem alça). Um ponto interno de um arco amostrado tem a virada de
 * `ARC_TURN_DEG` ou menos entre os dois lados vizinhos e lados de comprimento parecido; um canto de verdade vira mais,
 * ou junta um lado longo a um lado curto (o encontro entre a aresta reta e o arco). Um ponto só colinear também não
 * é canto. Anel inteiro quase sem virada (círculo amostrado) não tem canto nenhum. (Mesmo critério de trecho de
 * `edgeGroupsOf`.)
 */
export function cantosLogicos(ring: Ring): boolean[] {
  const n = ring.length;
  if (n < 3) return ring.map(() => true);
  const sides = ring.map((p, i) => sub(ring[(i + 1) % n]!, p));
  const lens = sides.map(len);
  const similar = (a: number, b: number): boolean => {
    const maior = Math.max(a, b);
    return maior > 1e-9 && Math.min(a, b) >= 0.75 * maior;
  };
  const turns = ring.map((_, i) => {
    const prev = sides[(i - 1 + n) % n]!;
    const cur = sides[i]!;
    if (len(prev) < 1e-9 || len(cur) < 1e-9) return 180;
    return (Math.abs(Math.atan2(cross(prev, cur), dot(prev, cur))) * 180) / Math.PI;
  });
  if (turns.every((t) => t <= ARC_TURN_DEG)) return ring.map(() => false);
  return ring.map((_, i) => !(turns[i]! < ARC_TURN_DEG && similar(lens[(i - 1 + n) % n]!, lens[i]!)));
}

/** Área real de todas as águas: a área em planta de cada água vezes √(1 + i²), com 1 = percent/100. */
export const roofRealArea = (r: ResolvedRoof): number => r.planes.reduce((s, pl) => s + multiArea(pl.polygon) * Math.sqrt(1 + (pl.percent / 100) ** 2), 0);

/** Inclinação na unidade do projeto, como nas demais cotas da planta: "30 %", "27,5 %" (ou graus). */
export const fmtPercent = (u: ResolvedUnits, p: number): string =>
  `${formatQuantity(u, 'slope', p / 100, { decimals: 1, trim: true, withUnit: false })} ${unitSymbol(u, 'slope')}`;

/** Cota absoluta com vírgula decimal, com sinal: "+5,70" (cota da cumeeira, D6). */
export const fmtElevation = (u: ResolvedUnits, z: number): string => `+${formatQuantity(u, 'length', Math.abs(z), { withUnit: false })}`;

/** Camada de topo: a de menor `below`, a que se vê de cima. */
function topLayer(r: ResolvedRoof): ResolvedRoofLayer | undefined {
  return r.layers.reduce<ResolvedRoofLayer | undefined>((best, l) => (!best || l.below < best.below ? l : best), undefined);
}

/** Cor base das águas: a do material da camada de topo (ou o token de telha) já misturada com o papel. */
export function roofFillBase(p: Project, r: ResolvedRoof, theme: PlanTheme, dark: boolean, paint: PlanPaint): string {
  const top = topLayer(r);
  const m = top ? p.materials[top.materialId] : undefined;
  // Sem cor no material do tipo, a água cai no token de telha (terracota), e não no cinza padrão.
  const matColor = (m ? corPadraoSuperficie(m, { dark, detail: 'medium' }).fundo : '').trim() || theme.roofTile;
  // Pouca mistura com o papel: a água deve ler na cor do material (o telhado é o assunto da vista), e não num tom lavado.
  return surfaceColor(matColor, dark ? theme.bg : '#ffffff', dark ? 0.2 : 0.25, paint);
}

/** Cor da aresta de um telhado: um pouco mais escura que o preenchimento das águas. */
export function roofEdgeColor(p: Project, r: ResolvedRoof, theme: PlanTheme, dark: boolean, paint: PlanPaint): string {
  return emPrancha(paint) ? theme.ink : corDaAresta(roofFillBase(p, r, theme, dark, paint));
}

/**
 * Desloca a etiqueta `mm` de papel para o lado da seta (perpendicular a ela, y da tela cresce para baixo), para não
 * cruzar a haste. A conversão em pixels, com o zoom e a escala, é feita no quadro (`resolverRotulo`).
 */
const beside = (u: Vec2, mm: number, escala: number): PapelRotulo => ({ escala, desvio: { mm, ux: -u.y, uy: -u.x } });

/** Deslocamento em pixels de tela de um vetor do mundo (y da tela cresce para baixo). */
const screenOffset = (w: Vec2, px: number): { dx: number; dy: number } => ({ dx: w.x * px, dy: -w.y * px });

/**
 * Desvio do rótulo de área: para cima e para o lado do eixo da seta de caimento, de modo que o texto não fique rente à
 * haste. O afastamento lateral é a metade da altura do texto (corpo × 1,2) mais uma folga; o desvio para cima tira o
 * rótulo da ponta da seta, como antes. Sem seta (grosseiro), só sobe um pouco.
 */
function areaLabelOffset(up: Vec2 | undefined, coarse: boolean): NonNullable<PapelRotulo['desvio']> {
  if (coarse || !up) return { mm: coarse ? 1.0 : 5.2, ux: 0, uy: -1 };
  const len = Math.hypot(up.x, up.y);
  if (len < 1e-9) return { mm: 5.2, ux: 0, uy: -1 };
  // Descida da água em coordenadas de tela (y para baixo) e a normal à esquerda dela.
  const sx = -up.x / len;
  const sy = up.y / len;
  let px = -sy;
  let py = sx;
  // Lado em que o texto cresce para a direita (fora do eixo) ou, na seta vertical, para cima.
  if (px < -1e-9 || (Math.abs(px) <= 1e-9 && py > 0)) {
    px = -px;
    py = -py;
  }
  const lateral = (SURFACE_TEXT_MM * 1.2) / 2 + 1.2;
  const dx = px * lateral;
  const dy = py * lateral - 5.2;
  const mm = Math.hypot(dx, dy);
  return { mm, ux: dx / mm, uy: dy / mm };
}

/** Cota absoluta de uma divisa entre águas (cumeeira, espigão ou rincão) no ponto médio: a maior das águas que a encostam; null se nenhuma. */
export function ridgeElevation(r: ResolvedRoof, a: Vec2, b: Vec2): number | null {
  const m = mid(a, b);
  const n = perp(norm(sub(b, a)));
  const zs: number[] = [];
  for (const pl of r.planes) {
    if (pointInMulti(add(m, scale(n, SIDE)), pl.polygon) || pointInMulti(sub(m, scale(n, SIDE)), pl.polygon)) zs.push(planeZ(pl, m));
  }
  return zs.length ? Math.max(...zs) : null;
}

/** Cumeeira mais alta do telhado: ponto médio da linha 'ridge' de maior cota absoluta; null sem cumeeira. */
export function highestRidge(r: ResolvedRoof): { at: Vec2; z: number; a: Vec2; b: Vec2 } | null {
  let best: { at: Vec2; z: number; a: Vec2; b: Vec2 } | null = null;
  for (const ln of r.lines) {
    if (ln.kind !== 'ridge') continue;
    const z = ridgeElevation(r, ln.a, ln.b);
    if (z !== null && (!best || z > best.z)) best = { at: mid(ln.a, ln.b), z, a: ln.a, b: ln.b };
  }
  return best;
}

/**
 * Empena (aresta sem inclinação, kind 'gable'): traço cheio e mais escuro que as arestas internas. O símbolo de perfil
 * (triângulo) é desenhado uma vez por aresta do contorno (`gableSymbolOps`), e não por trecho que o motor parte nas
 * águas.
 */
function gableLineOps(a: Vec2, b: Vec2, theme: PlanTheme, espessura: Espessura): StrokeOp[] {
  return [{ pts: [a, b], closed: false, ...espessura, color: theme.ink, alpha: 1 }];
}

/**
 * Símbolo "define inclinação" de cada aresta do contorno (A11, como no Revit): triângulo no meio da aresta, apontando
 * para dentro. Cheio na cor de destaque quando a aresta define inclinação (com o percentual ao lado, para fora);
 * vazado e cinza quando não define. `espessura`: a da projeção do telhado (linha fina de anotação). O triângulo é um
 * marcador em pixels (4,5 px de meia base, 8 px de altura): tem o mesmo tamanho na tela para qualquer zoom. O percentual
 * vem de `edgeSlopesOf`, a mesma leitura do motor (forma e direção), e não da lista guardada: só vale o positivo.
 */
function defineSlopeOps(r: Roof, theme: PlanTheme, espessura: Espessura, u: ResolvedUnits): FloorOps {
  const out = empty();
  const b = r.boundary;
  const ccw = ringArea(b) > 0;
  const slopes = edgeSlopesOf(r);
  const visivel = ladosComSimbolo(r);
  const w = 4.5;
  const h = 8;
  b.forEach((a, i) => {
    const c = b[(i + 1) % b.length]!;
    if (dist(a, c) < 1e-6 || !visivel[i]) return;
    const t = norm(sub(c, a));
    const left = perp(t);
    const inward = ccw ? left : scale(left, -1);
    const m = mid(a, c);
    const tri: Vec2[] = [scale(t, -w), scale(t, w), scale(inward, h)];
    const slope = slopes[i] ?? null;
    if (slope === null || slope <= 0) {
      out.strokes.push({ ...tracoEm(m, tri, true), ...espessura, color: theme.inkSoft, alpha: 1 });
      return;
    }
    out.fills.push({ ...poligonoEm(m, tri), color: theme.accent, alpha: 1 });
    out.labels.push({ at: m, text: fmtPercent(u, slope), ...screenOffset(scale(inward, -1), 14) });
  });
  return out;
}

/**
 * Contorno de um telhado selecionado: traço sólido de 2 px nas arestas que definem inclinação e tracejado nas empenas
 * (arestas sem inclinação). Os segmentos do anel são agrupados em corridas contínuas do mesmo tipo.
 */
function selectedRingOps(r: ResolvedRoof, roof: Roof, theme: PlanTheme): StrokeOp[] {
  // Empenas pelo tipo de cada aresta no motor (`boundaryKindsOf`), o mesmo critério das linhas de empena da planta.
  const kinds = boundaryKindsOf(roof);
  const gables: Array<[Vec2, Vec2]> = roof.boundary.flatMap((a, i): Array<[Vec2, Vec2]> => {
    const c = roof.boundary[(i + 1) % roof.boundary.length]!;
    return kinds[i] === 'gable' ? [[a, c]] : [];
  });
  const onGable = (p: Vec2, q: Vec2): boolean => {
    const m = mid(p, q);
    return gables.some(([a, c]) => dist(closestOnSegment(m, a, c), m) < 1e-6);
  };
  const out: StrokeOp[] = [];
  for (const ring of roofFootprint(r).flat()) {
    const n = ring.length;
    const gap = ring.map((p, i) => onGable(p, ring[(i + 1) % n]!));
    const s0 = gap.indexOf(true);
    if (s0 < 0) {
      out.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
      continue;
    }
    // Começa numa empena: as corridas seguintes não se partem no fim do anel.
    let k = 0;
    while (k < n) {
      const dashed = gap[(s0 + k) % n]!;
      const pts: Vec2[] = [ring[(s0 + k) % n]!];
      let j = k;
      while (j < n && gap[(s0 + j) % n] === dashed) {
        pts.push(ring[(s0 + j + 1) % n]!);
        j++;
      }
      out.push({ pts, closed: false, widthPx: 2, color: theme.select, alpha: 1, ...(dashed ? { dash: [10, 5] as [number, number] } : {}) });
      k = j;
    }
  }
  return out;
}

/**
 * Contorno do beiral (`roofFootprint`) conforme o intervalo de vista:
 * - telhado totalmente acima do plano de corte: traço de projeção tracejado na cor da aresta (sem rosa);
 * - telhado cortado pelo plano (ou sem classificação): faixa de corte cheia, como o contorno das lajes;
 * - telhado abaixo do corte: linha fina contínua e clara, sem competir com o preenchimento.
 */
function beiralOps(foot: MultiPolygon, cls: ViewClass | undefined, theme: PlanTheme, fillBase: string, esp: ReturnType<typeof espessurasDoTelhado>, aresta: string): FloorOps {
  if (cls === 'projection-above') {
    return { fills: [], strokes: foot.flat().map((ring) => ({ pts: ring, closed: true, ...esp.projecao, color: aresta, alpha: 1, dash: [6, 3] as [number, number] })), labels: [] };
  }
  if (cls === 'projection-below' || cls === 'beyond') {
    return { fills: [], strokes: foot.flat().map((ring) => ({ pts: ring, closed: true, ...esp.projecao, color: aresta, alpha: 0.8 })), labels: [] };
  }
  return { fills: [{ polygons: foot, color: mix(theme.ink, fillBase, 0.35), alpha: 1, contour: true, faixa: esp.beiral }], strokes: [], labels: [] };
}

/** Opções de desenho dos telhados (D6). */
export interface RoofOpsOptions {
  /**
   * Planta de cobertura: água opaca (alpha 1) e cota absoluta da cumeeira sempre visível, mesmo sem etiquetas ligadas.
   * A PlanInput liga por `roofPlanMode`.
   */
  planMode?: boolean;
  /** Telhados fora do intervalo de vista (decisão 0013): não têm águas desenhadas. */
  hidden?: ReadonlySet<Id>;
  /** Contorno tracejado dos telhados `hidden` (projeção da cobertura, opção independente do topo). */
  showProjection?: boolean;
  /** Telhados ocultos pela categoria da vista (decisão 0015 §2.4): saem também da projeção, que é só do intervalo. */
  categoryHidden?: ReadonlySet<Id>;
  /** Estilo da categoria telhado nesta vista (cores, pesos, transparência, meio-tom); padrão do Hestia se ausente. */
  paint?: PlanPaint;
  /**
   * Estado de cada telhado no intervalo de vista (`PlanView.cls`): decide o contorno do beiral (tracejado acima do
   * corte, cheio no corte). Ausente = telhado cortado (comportamento antigo).
   */
  classes?: ReadonlyMap<Id, ViewClass>;
  /** Cota do plano de corte da planta (m): o telhado `cut` só aparece abaixo dela. Ausente = sem corte. */
  cutZ?: number;
  /** Azimute do sol (graus, 0 = leste) para o tom das águas; padrão = o sol da vista 3D do projeto. */
  sunAzimuth?: number;
  /** Só a projeção de todos os telhados (planta de área): nenhuma água cheia é desenhada. */
  projectionOnly?: boolean;
}

/**
 * Telhados sobre a lista de águas (D1), na representação de projeção do BIM: cada água tem a cor e a hachura discreta
 * do material da camada de topo (o `roofTile` quando o material não tem cor), com um tom pela direção da queda e pela
 * inclinação, na mesma luz do sol do 3D (`tomDaAgua`). O preenchimento é quase opaco (0,96; 0,97 no grosseiro, 1 na
 * planta de cobertura), para a grade da planta não competir com o tom. Fora do grosseiro: o contorno do beiral segue o
 * intervalo de vista (`beiralOps`): tracejado de projeção na cor da aresta acima do corte, cheio no corte; cumeeira,
 * espigão e rincão como arestas finas (rincão tracejado); empena em traço cheio mais escuro; por água, seta de caimento
 * (da subida para a descida) com o percentual. Não há rosa na planta pronta (a pegada rosa é só do modo de edição). A cumeeira mais alta leva a cota absoluta ("▲ +5,70") afastada da linha, com etiquetas ligadas ou na planta de
 * cobertura; com etiquetas ligadas, código e área real no centroide da água maior. Os rótulos são posicionados sem
 * sobreposição (`evitarSobreposicao`).
 */
export function roofOps(roofs: ResolvedRoof[], p: Project, theme: PlanTheme, dark: boolean, detail: DetailLevel, v: Viewport, opts: RoofOpsOptions = {}, scale = 100): FloorOps {
  const out = empty();
  const fillBase = dark ? theme.bg : '#ffffff';
  const coarse = detail === 'coarse';
  const fine = detail === 'fine';
  const planMode = opts.planMode === true;
  // Opaco o bastante para a grade não aparecer através do telhado; a seleção e as anotações são desenhadas depois.
  const alpha = planMode ? 1 : 0.98;
  // Espessuras do telhado (decisão 0015 §2.1): beiral e empena de corte; arestas internas e setas finas (projeção).
  const paint = opts.paint ?? defaultPaint('roof', v.zoom);
  const esp = espessurasDoTelhado(paint);
  const sunAzimuth = opts.sunAzimuth ?? view3dOf(p).sunAzimuth;
  // Telhado atravessado pelo plano de corte: só a parte abaixo do plano é vista (a linha de corte é o contorno dela).
  for (const r of aplicarCorte(roofs, opts.classes, opts.cutZ, planMode).roofs) {
    const top = topLayer(r);
    const m = top ? p.materials[top.materialId] : undefined;
    const base = roofFillBase(p, r, theme, dark, paint);
    // Hachura discreta, mas visível: o tom por água continua sendo o que diferencia as superfícies. O zoom mínimo vai
    // para o shader (`zoomMin`) e a geometria não muda com o zoom (o `resolverZoom` faz o mesmo no caminho CPU).
    const cp = corPadraoSuperficie(m, { dark, detail, baseMisturaPadrao: base, misturaPadrao: 0.35 });
    const hatch = cp.padrao ? { ...cp.padrao, alpha: 0.26, ...(fine ? {} : { zoomMin: 40 }) } : undefined;
    const aresta = emPrancha(paint) ? theme.ink : corDaAresta(base);
    for (const pl of r.planes) out.fills.push({ polygons: pl.polygon, color: emPrancha(paint) ? base : tomDaAgua(base, pl.up, pl.percent, sunAzimuth), alpha, hatch });
    const model = p.elements[r.roofId];
    const cls = opts.classes?.get(r.roofId);
    const foot = roofFootprint(r);
    if (!coarse) {
      const beiral = beiralOps(foot, cls, theme, fillBase, esp, aresta);
      out.fills.push(...beiral.fills);
      out.strokes.push(...beiral.strokes);
      // Arestas internas de um arco (geratrizes entre facetas do mesmo trecho curvo) não são cumeeira nem espigão: saem.
      // Um trecho curvo leva uma seta e um percentual só, na faceta do meio (`comSinal`).
      const arco = arcoDoTelhado(p, r);
      for (const ln of r.lines) {
        if (ln.kind === 'eave' || arco.deArco(ln)) continue;
        if (ln.kind === 'gable') {
          out.strokes.push(...gableLineOps(ln.a, ln.b, theme, esp.empena));
          continue;
        }
        // Cumeeira, espigão e rincão são arestas finas entre superfícies (sem a hierarquia grossa e preta do CAD).
        const dash: [number, number] | undefined = ln.kind === 'valley' ? [6, 3] : undefined;
        out.strokes.push({ pts: [ln.a, ln.b], closed: false, ...esp.projecao, color: aresta, alpha: 1, ...(dash ? { dash } : {}) });
      }
      // Símbolo de perfil da empena: um por aresta do contorno do telhado (o motor parte a aresta nas águas, mas o
      // símbolo é da empena inteira).
      if (isRoof(model)) {
        const kinds = boundaryKindsOf(model);
        model.boundary.forEach((a, i) => {
          if (kinds[i] !== 'gable') return;
          const c = model.boundary[(i + 1) % model.boundary.length]!;
          if (dist(a, c) < 1e-6) return;
          out.strokes.push(...gableSymbolOps(a, c, foot, theme, esp.empena, scale));
        });
      }
      for (const [k, pl] of r.planes.entries()) {
        const at = labelPoint(pl.polygon);
        if (!at || !arco.comSinal(k) || pl.percent === 0) continue; // telhado plano: sem seta nem "0,0 %"
        const down = { x: -pl.up.x, y: -pl.up.y };
        // Seta de caimento em verde (tinta própria do caimento), na espessura de projeção.
        out.strokes.push(...slopeArrow(down, at, v, { ...theme, ink: theme.roofSlope }, esp.projecao));
        // Deslocamento lateral em mm de papel: 2 mm garantem que a etiqueta não cruze a haste da seta.
        out.labels.push({ at, text: fmtPercent(unitsOf(p), pl.percent), papel: { ...beside(down, 2.0, scale), fontMm: SURFACE_TEXT_MM } });
      }
    }
    if (planMode || p.settings.showTags) {
      const rd = highestRidge(r);
      // Cota afastada da linha da cumeeira, deslocada na normal: não encosta no traço nem no rótulo da área.
      if (rd) {
        const n = perp(norm(sub(rd.b, rd.a)));
        const lado = Math.abs(n.y) > 1e-9 ? (n.y >= 0 ? n : { x: -n.x, y: -n.y }) : n.x >= 0 ? n : { x: -n.x, y: -n.y };
        out.labels.push({ at: rd.at, text: `▲ ${fmtElevation(unitsOf(p), rd.z)}`, papel: { escala: scale, fontMm: SURFACE_TEXT_MM, desvio: { mm: 3.0, ux: lado.x, uy: -lado.y } } });
      }
    }
    if (p.settings.showTags) {
      // Área no centroide da água maior (e não no centro da pegada, que pode cair numa divisa).
      let maior = r.planes[0];
      for (const pl of r.planes) if (maior && multiArea(pl.polygon) > multiArea(maior.polygon)) maior = pl;
      const at = maior ? labelPoint(maior.polygon) : labelPoint(foot);
      const text = [p.roofTypes[r.typeId]?.code, fmtArea(unitsOf(p), roofRealArea(telhadoOriginal.get(r) ?? r), 1)].filter(Boolean).join(' · ');
      // Fino/médio: acima e ao lado do eixo da seta de caimento, que sai do mesmo centroide; grosseiro: só acima.
      if (at) out.labels.push({ at, text, papel: { escala: scale, fontMm: SURFACE_TEXT_MM, desvio: areaLabelOffset(maior?.up, coarse) } });
    }
  }
  evitarSobreposicao(out.labels);
  return out;
}

/**
 * Telhados do nível na planta (D1), antes das etiquetas e depois das paredes e aberturas. Os `hidden` (fora do intervalo
 * de vista) saem; com `showProjection`, cada um deixa a sua projeção (`projecaoDoTelhado`): contorno, linhas internas e
 * preenchimento leve. Na planta de cobertura fica só o contorno.
 */
export function roofFills(p: Project, levelId: Id, theme: PlanTheme, dark: boolean, detail: DetailLevel, v: Viewport, opts: RoofOpsOptions = {}, scale = 100): FloorOps {
  const all = telhadosDoNivel(p, levelId);
  const hidden = opts.hidden;
  const off = opts.categoryHidden;
  const paint = opts.paint ?? defaultPaint('roof', v.zoom);
  const esp = espessurasDoTelhado(paint);
  const sunAzimuth = opts.sunAzimuth ?? view3dOf(p).sunAzimuth;
  // Planta de área: só a projeção, sem água cheia (o telhado cheio esconderia paredes e ambientes).
  if (opts.projectionOnly) {
    const out = empty();
    if (opts.showProjection !== true) return out;
    for (const r of all) {
      if (off?.has(r.roofId)) continue;
      const rica = opts.planMode !== true;
      const pr = projecaoDoTelhado(r, p, roofFootprint(r), roofFillBase(p, r, theme, dark, paint), theme, esp, sunAzimuth, scale, { rica, coarse: detail === 'coarse', prancha: emPrancha(paint) });
      out.fills.push(...pr.fills);
      out.strokes.push(...pr.strokes);
    }
    return out;
  }
  const out = roofOps(all.filter((r) => !hidden?.has(r.roofId)), p, theme, dark, detail, v, opts, scale);
  // Telhados ocultos: a projeção só aparece com a opção ligada (o rosa é só do modo de edição).
  for (const r of all) {
    if (!hidden?.has(r.roofId) || off?.has(r.roofId) || opts.showProjection !== true) continue;
    const rica = opts.planMode !== true;
    const pr = projecaoDoTelhado(r, p, roofFootprint(r), roofFillBase(p, r, theme, dark, paint), theme, esp, sunAzimuth, scale, { rica, coarse: detail === 'coarse', prancha: emPrancha(paint) });
    out.fills.push(...pr.fills);
    out.strokes.push(...pr.strokes);
  }
  return out;
}

/**
 * Destaque de seleção e de hover dos telhados (D1), no padrão das lajes; a área é a real. Telhado selecionado: contorno
 * sólido nas arestas com inclinação, tracejado nas empenas, e o símbolo "define inclinação" de cada aresta (A11). Sem
 * `grips`, o contorno de seleção fica e o símbolo de edição de caimento sai (planta de área somente leitura).
 */
export function roofSelectionOps(
  p: Project,
  levelId: Id,
  selection: Id[],
  hover: Id | null,
  theme: PlanTheme,
  v: Viewport,
  hidden?: ReadonlySet<Id>,
  paint: PlanPaint = defaultPaint('roof', v.zoom),
  grips = true,
): FloorOps {
  const roofs = telhadosDoNivel(p, levelId).filter((r) => !hidden?.has(r.roofId));
  // Alças só nos cantos lógicos: um arco amostrado não vira uma fileira de quadradinhos.
  const parts = roofs.map((r) => ({ id: r.roofId, polygon: roofFootprint(r), area: roofRealArea(r), grips: gripsDoTelhado(p.elements[r.roofId], cantosLogicos) }));
  const base = outlineSelectionOps(parts, selection, hover, !p.settings.showTags, theme, unitsOf(p), v, grips);
  // O contorno de 2 px do destaque padrão é trocado pelo de `selectedRingOps` (sólido ou tracejado por aresta).
  const out: FloorOps = { fills: base.fills, strokes: base.strokes.filter((s) => !(s.closed && s.widthPx === 2)), labels: base.labels };
  const sel = new Set(selection);
  for (const r of roofs) {
    const roof = p.elements[r.roofId];
    if (!sel.has(r.roofId) || !isRoof(roof)) continue;
    out.strokes.push(...selectedRingOps(r, roof, theme));
    if (grips) {
      const sym = defineSlopeOps(roof, theme, espessurasDoTelhado(paint).projecao, unitsOf(p));
      out.fills.push(...sym.fills);
      out.strokes.push(...sym.strokes);
      out.labels.push(...sym.labels);
    }
  }
  return out;
}
