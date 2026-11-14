import { union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { guardaCorpoCorteOps } from './guardaCorpo.ts';
import { massaCorteOps } from './massa.ts';
import { CLOSED, openingLinePaths, type ProjectedRing, type SectionBeyond, type SectionOpening, type SectionOrigin, type SectionResult } from '@hestia/engine';
import { dimensionStyleOf, formatQuantity, GRAPHICS_CATEGORIES, SECTION_TEXT_MM, unitsOf, type GraphicsCategory, type HatchKind, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { thinStrokes } from '../plan/thin.ts';
import { AVISO, AVISO_ALPHA } from '../aviso.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { Espessura, FillOp, LabelOp, PlanDrawList, PlanTheme, StrokeOp } from '../plan/types.ts';
import type { Viewport } from '../viewport.ts';
import { hasSectionAnnotations, sectionAnnotationOps } from './annotations.ts';
import { projetarComPerfis } from './perfis.ts';
import { ownerOf, sectionItems, type SectionItem } from './pick.ts';
import { sectionStyleOf } from './style.ts';

export interface SectionInput {
  project: Project;
  section: SectionResult;
  viewport: Viewport;
  theme: PlanTheme;
  dark: boolean;
  showGrid: boolean;
  /** Elementos ocultos nesta vista (Hide in View + temporário). */
  hidden?: ReadonlySet<Id>;
  /** Elementos que o modo Reveal mostra com borda azul. */
  revealed?: ReadonlySet<Id>;
  /** Cotas, textos e detalhes pertencentes à vista de corte/elevação. */
  annotations?: import('@hestia/model').SectionAnnotations;
  /** Extensões 2D das linhas de nível nesta vista, em `t`. */
  levelExtents?: Record<Id, { a: number; b: number }>;
  /** Seleção e cursor (decisão 0016): realçados por cima do desenho. Sem ele, o desenho é o de sempre. */
  highlight?: { selection: Id[]; hover: Id | null; aviso?: Id[] };
  /** Linhas finas só na tela (decisão 0015): todo traço do modelo sai com 1 px. Padrão desligado; a prancha não passa. */
  thinLines?: boolean;
}

/** Caixilho de vidro (opaco na linha oculta, como o dono decidiu) e folha de porta: cores fixas do desenho. */
const GLASS_FILL = '#bfe3f5';
const DOOR_FILL = '#e6d2ae';

/** Borda do modo Reveal (Hide in View/Reveal): azul de 2 px sobre o desenho normal. */
const REVEAL_COLOR = '#2563eb';
const REVEAL_WIDTH = 2;

/**
 * Zoom mínimo da hachura do corte/elevação (px/m). Abaixo dele o padrão some, como sempre: antes a decisão era tomada ao
 * montar a lista (e o zoom refazia a geometria); agora vai no `zoomMin` do preenchimento e quem esconde é o shader.
 */
export const SECTION_HATCH_ZOOM_MIN = 40;

/**
 * Folga do limiar da hachura (px/m). O `zoomMin` vai por vértice e a GPU interpola em float32: no zoom exato do limiar a
 * interpolação pode cair um fio acima de 40 e esconder o padrão. Um milésimo de px/m abaixo elimina o caso sem mudar o
 * desenho em nenhum zoom observável.
 */
const HATCH_ZOOM_EPS = 1e-3;

const ringsOf = (m: MultiPolygon): Ring[] => m.flatMap((p) => p);

const fmt = (u: ResolvedUnits, z: number): string => `${z >= 0 ? '+' : '−'}${formatQuantity(u, 'length', Math.abs(z), { withUnit: false })}`;

/** Categoria gráfica de uma origem do motor (parede, piso, laje, telhado ou escada). */
const categoryOf = (o: SectionOrigin): GraphicsCategory => ownerOf(o)?.kind ?? 'wall';

/**
 * Lista de desenho do corte/elevação: x = distância ao longo da linha, y = cota. Os polígonos já são a parte visível
 * (linha oculta, no motor): aqui só se pinta. Segue a hierarquia de peso do Revit: o que é cortado leva hachura e
 * linha pesada; o que está além aparece mais fino e esmaecido (mais longe, mais claro); vãos são caixilho ou folha
 * opacos. A ordem de pintura é do mais longe ao mais perto, com o corte por último.
 */
export function buildSectionDrawList(input: SectionInput): PlanDrawList {
  const { project: p, section: s, theme, viewport: v } = input;
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  const paper = input.dark ? theme.bg : '#ffffff';
  const maxDepth = Math.max(1e-6, ...s.beyond.map((b) => b.depth), ...s.openings.map((o) => o.depth));
  const style = sectionStyleOf(p, v.zoom);
  const { detail, paint, visual, saved } = style;
  // Arame e grosso não têm superfícies: no arame só contornos; no grosso, só os contornos do modelo.
  const wire = visual === 'wireframe';
  const noFill = wire || detail === 'coarse';
  const cutWidth = (c: GraphicsCategory): Espessura => (saved ? paint[c].cut : { widthPx: 1 });
  const projWidth = (c: GraphicsCategory): Espessura => (saved ? paint[c].proj : { widthPx: 1 });
  const openingEdge = (c: GraphicsCategory, cut: boolean): Espessura => (saved ? (cut ? paint[c].cut : paint[c].proj) : { widthPx: cut ? 1.6 : 1.2 });
  const symbolWidth = (c: GraphicsCategory): Espessura => (saved ? paint[c].proj : { widthPx: 1 });
  /**
   * Espessura de um traço já com o peso de papel: `widthPx` é o valor do zoom de montagem (prancha, prévia, CPU) e `papel`
   * deixa a GPU (e o `larguraEmPx` do Canvas2D) aplicar o zoom corrente. Sem `papel`, o `zoomMin`/a largura antigos valem.
   */
  const strokeWidth = (e: Espessura): Pick<StrokeOp, 'widthPx' | 'papel'> => (e.papel ? { widthPx: e.widthPx, papel: e.papel } : { widthPx: e.widthPx });
  /** Hachura do corte/elevação: a decisão do zoom virou `zoomMin` (o shader esconde abaixo dele, sem refazer a lista). */
  const hatchZoomMin = detail === 'fine' ? 0 : SECTION_HATCH_ZOOM_MIN - HATCH_ZOOM_EPS;
  const hatchFor = (kind: HatchKind | undefined, color: string): { kind: HatchKind; color: string; zoomMin?: number } | undefined =>
    !wire && kind && kind !== 'none' ? { kind, color, ...(hatchZoomMin > 0 ? { zoomMin: hatchZoomMin } : {}) } : undefined;
  const halftone = (color: string, pt: PlanPaint): string => (pt.halftone ? mix(color, paper, 0.5) : color);
  // Para o contorno externo de uma vista com categoria oculta: a silhueta do motor une tudo, então ela é refeita dos itens visíveis.
  const silhouetteParts: MultiPolygon[] = [];
  // Hide in View/Reveal: o input já traz os conjuntos efetivos da vista. `hidden` não é desenhado; `revealed` só ganha
  // contorno azul por cima do desenho normal (a vista tira os revelados de `hidden`, mas os dois são independentes aqui).
  const hidden = input.hidden;
  const revealed = input.revealed;
  const hasHidden = (hidden?.size ?? 0) > 0;
  const isHidden = (id: Id | undefined): boolean => id !== undefined && (hidden?.has(id) ?? false);
  const isRevealed = (id: Id | undefined): boolean => id !== undefined && (revealed?.has(id) ?? false);
  /** Origem oculta: o dono (parede, piso, laje, telhado, escada, rampa) ou o próprio vão. */
  const originHidden = (o: SectionOrigin): boolean => isHidden(ownerOf(o)?.id) || isHidden(o.openingId);
  const revealStrokes: StrokeOp[] = [];
  const revealOutline = (polygons: MultiPolygon): void => {
    for (const ring of ringsOf(polygons)) revealStrokes.push({ pts: ring, closed: true, widthPx: REVEAL_WIDTH, color: REVEAL_COLOR, alpha: 1 });
  };

  // Solo e níveis: linhas finas tracejadas ao longo de todo o comprimento. O nome/cota do nível sai como texto de papel
  // (mm × escala da vista), sem a caixa do rótulo de interface: é anotação de nível, como a marca de corte na planta.
  for (const l of s.levels) {
    const extent = input.levelExtents?.[l.levelId];
    const x0 = extent ? Math.min(extent.a, extent.b) : -0.5;
    const x1 = extent ? Math.max(extent.a, extent.b) : s.length + 0.5;
    const edge = [
      { x: x0, y: l.z },
      { x: x1, y: l.z },
    ];
    strokes.push({ pts: edge, closed: false, widthPx: 1, color: theme.inkSoft, alpha: 0.9, dash: [10, 5] });
    labels.push({
      at: edge[1]!,
      text: `${l.name} ${fmt(unitsOf(input.project), l.z)}`,
      papel: { escala: style.scale, fontMm: SECTION_TEXT_MM, desvio: { mm: 2, ux: 1, uy: -0.9 } },
      // Alinhado à direita: o texto termina depois da ponta da linha de nível e cresce para dentro do desenho (não
      // estoura a moldura da vista, como acontecia com o rótulo ancorado à esquerda).
      align: 'right',
      color: theme.inkSoft,
    });
  }

  const drawBeyond = (b: SectionBeyond): void => {
    const owner = ownerOf(b);
    if (owner && isHidden(owner.id)) return;
    const cat = categoryOf(b);
    const pt = paint[cat];
    if (!pt.visible) return;
    silhouetteParts.push(b.polygons);
    const base = pt.color ?? p.materials[b.materialId]?.color ?? '#999999';
    if (!noFill) {
      const fade = 0.55 + 0.35 * (b.depth / maxDepth);
      const color = pt.visual === 'shaded' ? base : mix(mix(base, paper, 0.55), paper, fade * 0.35);
      const hatch = hatchFor(b.hatch, halftone(mix(base, input.dark ? '#ffffff' : '#000000', 0.45), pt));
      fills.push({ polygons: b.polygons, color: halftone(color, pt), alpha: pt.alpha, hatch });
    }
    const line = mix(theme.ink, paper, 0.35 + 0.4 * (b.depth / maxDepth));
    for (const ring of ringsOf(b.polygons)) strokes.push({ pts: ring, closed: true, ...strokeWidth(projWidth(cat)), color: halftone(line, pt), alpha: 1 });
    if (owner && isRevealed(owner.id)) revealOutline(b.polygons);
  };

  /**
   * Desenho do vão no corte e na elevação a partir do MODELO ÚNICO (`o.model`): o batente com rebaixo, a folha com o
   * estilo, o vidro com as divisões, a maçaneta, as bandeiras, o alizar, o peitoril e as vergas saem de `projectParts`
   * (elevação: eixo `s`; corte transversal: eixo `t`, com hachura nas peças cortadas). As linhas de abertura vêm de
   * `openingLinePaths`, com a convenção do projeto. A ordem de pintura é do mais longe ao mais perto, com o corte por
   * último. Sem `model` (lista sintética), cai no retângulo de antes.
   */
  const drawOpening = (o: SectionOpening): void => {
    if (isHidden(o.openingId)) return;
    const { polygons, kind, cut, t0, t1, z0, z1, model } = o;
    const pt = paint[kind];
    if (!pt.visible) return;
    if (isRevealed(o.openingId)) revealOutline(polygons);
    const edge = openingEdge(kind, cut);
    const outline = (): void => {
      for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, ...strokeWidth(edge), color: halftone(theme.ink, pt), alpha: 1 });
    };
    const symbol = (pts: Vec2[], dashed: boolean): void => {
      if (detail === 'coarse') return;
      strokes.push({ pts, closed: false, ...strokeWidth(symbolWidth(kind)), color: halftone(theme.inkSoft, pt), alpha: 1, ...(dashed ? { dash: [4, 3] as [number, number] } : {}) });
    };
    if (!model) {
      if (!noFill) fills.push({ polygons, color: halftone(pt.color ?? (kind === 'window' ? GLASS_FILL : DOOR_FILL), pt), alpha: pt.alpha });
      outline();
      return;
    }
    // Vista face (largura do modelo) x corte transversal (espessura): a projeção da pegada sobre a linha decide.
    const faceOn = Math.abs(t1 - t0 - model.width) <= Math.abs(t1 - t0 - model.thickness);
    const cx = (t0 + t1) / 2;
    const frameBase = pt.color ?? p.materials[o.frameMaterialId]?.color ?? '#9aa0a6';
    const frameColor = pt.visual === 'shaded' ? frameBase : mix(frameBase, paper, 0.5);
    // Folha (papel `leaf`): o material da folha do tipo, ou o do batente quando o tipo não informa outro.
    const leafId = o.leafMaterialId ?? o.frameMaterialId;
    const leafBase = pt.color ?? p.materials[leafId]?.color ?? '#9aa0a6';
    const leafColor = pt.visual === 'shaded' ? leafBase : mix(leafBase, paper, 0.5);
    const concrete = p.materials['mat_concreto'];
    const materialIdOf = (part: SectionOpening['model']['parts'][number]): string | null =>
      part.material === 'concrete'
        ? 'mat_concreto'
        : part.material === 'glass'
          ? o.glassMaterialId
          : part.material === 'leaf'
            ? leafId
            : o.frameMaterialId;
    // Cor da peça: vidro e concreto têm cor própria; a folha de porta mantém o tom do desenho; a folha de janela e o
    // resto seguem o material de cada papel.
    const colorOf = (part: SectionOpening['model']['parts'][number]): string => {
      if (part.material === 'glass') return pt.color ?? GLASS_FILL;
      if (part.material === 'concrete') return concrete?.color ?? '#8f9296';
      if (kind === 'door' && (part.role === 'leaf' || part.role === 'leafPanel')) return DOOR_FILL;
      if (part.material === 'leaf') return leafColor;
      return frameColor;
    };
    // Peça cortada pelo plano da seção transversal: o plano está na posição `t = cutT` do vão.
    const isCut = (part: SectionOpening['model']['parts'][number]): boolean => !faceOn && part.box.t0 - 1e-9 <= o.cutT && part.box.t1 + 1e-9 >= o.cutT;
    const hatchOf = (part: SectionOpening['model']['parts'][number]): { kind: HatchKind; color: string; zoomMin?: number } | undefined => {
      if (!isCut(part) || wire) return undefined;
      const id = materialIdOf(part);
      const mat = id ? p.materials[id] : undefined;
      if (!mat || mat.hatch === 'none') return undefined;
      return { kind: mat.hatch, color: mix(mat.color, input.dark ? '#ffffff' : '#000000', 0.45), ...(SECTION_HATCH_ZOOM_MIN > 0 ? { zoomMin: SECTION_HATCH_ZOOM_MIN - HATCH_ZOOM_EPS } : {}) };
    };
    const toScreen = (u: number, z: number): Vec2 => (faceOn ? { x: cx - o.viewSide * u, y: z0 + z } : { x: cx + o.sSign * u, y: z0 + z });
    // Peças do mesmo `group` são UMA peça física (alizar): o contorno e o preenchimento são a união delas.
    type Unidade = { itens: ProjectedRing[]; depth: number; cut: boolean };
    const porGrupo = new Map<string, Unidade>();
    const unidades: Unidade[] = [];
    for (const item of projetarComPerfis(model, faceOn ? 's' : 't', CLOSED)) {
      if (!item.part.group) {
        unidades.push({ itens: [item], depth: item.depth, cut: isCut(item.part) });
        continue;
      }
      let u = porGrupo.get(item.part.group);
      if (!u) {
        u = { itens: [], depth: 0, cut: false };
        porGrupo.set(item.part.group, u);
        unidades.push(u);
      }
      u.itens.push(item);
      u.depth += item.depth;
      u.cut ||= isCut(item.part);
    }
    for (const u of porGrupo.values()) u.depth /= u.itens.length;
    const ordered = unidades.sort((a, b) => {
      if (a.cut !== b.cut) return Number(a.cut) - Number(b.cut);
      return faceOn ? (a.depth - b.depth) * o.viewSide : a.depth - b.depth;
    });
    // Vão livre: só contorno, sem X; a janela sem folha mostra a soleira, como no modelo (decisão 0024 §3).
    outline();
    for (const item of ordered) {
      const rings = item.itens.map((x) => x.ring.map((q) => toScreen(q.u, q.z))).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      const polygons: MultiPolygon = rings.length === 1 ? [[rings[0]!]] : union(...rings.map((r): MultiPolygon => [[r]]));
      const primeira = item.itens[0]!.part;
      const cortada = item.itens.find((x) => isCut(x.part))?.part;
      const hatch = cortada ? hatchOf(cortada) : undefined;
      if (!noFill) fills.push({ polygons, color: halftone(colorOf(primeira), pt), alpha: pt.alpha, ...(hatch ? { hatch } : {}) });
      const dash = primeira.dashed ? { dash: [6, 3] as [number, number] } : {};
      for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, ...strokeWidth(edge), color: halftone(theme.ink, pt), alpha: 1, ...dash });
    }
    // Linha central só na janela de correr (2 ou 3 folhas), como antes (C6).
    const slides = model.openings.filter((x) => x.kind === 'slide').length;
    if (faceOn && slides >= 2) {
      const jamb = model.parts.find((x) => x.role === 'jamb');
      const fw = jamb ? jamb.box.t1 - jamb.box.t0 : 0;
      const inner = t1 - t0 - 2 * fw;
      for (let i = 1; i < slides; i++) {
        const t = t0 + fw + (i * inner) / slides;
        strokes.push({ pts: [{ x: t, y: z0 + fw }, { x: t, y: z1 - fw }], closed: false, ...strokeWidth(symbolWidth(kind)), color: theme.ink, alpha: 0.7 });
      }
    }
    // Linhas de abertura (V, seta) com a convenção do projeto; a coordenada `u` já sai da função em tela.
    if (faceOn) {
      for (const line of openingLinePaths(model, o.viewSide, o.openingLine, 'elevation')) {
        symbol(line.pts.map((q) => ({ x: cx + q.u, y: z0 + q.z })), line.dashed);
      }
    }
  };

  // Pintura do mais longe ao mais perto: além e vãos pela profundidade; o corte (profundidade 0) por último.
  type Paint = { depth: number; cut: boolean; draw: () => void };
  const cutPaint = s.cut.flatMap((r): Paint[] => {
    // Corte unido por material: `parts` guarda o polígono visível de cada origem. Com Hide in View, some só a peça oculta;
    // sem `parts` (lista sintética), a região inteira só some quando todas as origens estiverem ocultas.
    let polygons = r.polygons;
    let sources = r.sources;
    let parts = r.parts;
    if (hasHidden) {
      if (r.parts) {
        const kept = r.parts.filter((part) => !originHidden(part.origin));
        if (kept.length === 0) return [];
        if (kept.length !== r.parts.length) polygons = union(...kept.map((part) => part.polygons));
        parts = kept;
        sources = kept.map((part) => part.origin);
      } else {
        const kept = r.sources.filter((o) => !originHidden(o));
        if (r.sources.length > 0 && kept.length === 0) return [];
        sources = kept.length > 0 ? kept : r.sources;
      }
    }
    const cats = [...new Set(sources.map(categoryOf))];
    if (!cats.some((c) => paint[c].visible)) return [];
    const cat = cats.find((c) => paint[c].visible) ?? 'wall';
    const pt = paint[cat];
    return [{
      depth: 0,
      cut: true,
      draw: () => {
        silhouetteParts.push(polygons);
        const m = p.materials[r.materialId];
        if (!noFill) {
          const base = pt.color ?? m?.color ?? '#999999';
          const color = pt.visual === 'shaded' ? base : mix(base, paper, input.dark ? 0.5 : 0.58);
          const hatchKind = r.hatch ?? m?.hatch;
          const hatch = hatchFor(hatchKind, halftone(mix(pt.color ?? m?.color ?? '#999999', input.dark ? '#ffffff' : '#000000', 0.45), pt));
          fills.push({ polygons, color: halftone(color, pt), alpha: pt.alpha, hatch });
        }
        const line = halftone(mix(theme.ink, paper, 0.35), pt);
        for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, ...strokeWidth(cutWidth(cat)), color: line, alpha: 1 });
        // Reveal do corte unido: contorna só as peças reveladas (sem `parts`, a região inteira, se alguma origem foi revelada).
        const revealParts = parts?.filter((part) => isRevealed(ownerOf(part.origin)?.id));
        if (revealParts && revealParts.length > 0) for (const part of revealParts) revealOutline(part.polygons);
        else if (!parts && sources.some((o) => isRevealed(ownerOf(o)?.id))) revealOutline(polygons);
      },
    }];
  });
  const paintList: Paint[] = [
    ...s.beyond.map((b): Paint => ({ depth: b.depth, cut: false, draw: () => drawBeyond(b) })),
    ...s.openings.map((o): Paint => ({ depth: o.depth, cut: false, draw: () => drawOpening(o) })),
    ...cutPaint,
  ];
  paintList.sort((x, y) => y.depth - x.depth || Number(x.cut) - Number(y.cut));
  for (const item of paintList) item.draw();
  // Membranas de piso e laje: linha tracejada na cota da face (decisão 0023 §5), na espessura do corte do dono.
  for (const m of s.membranes) {
    const owner = ownerOf(m);
    if (owner && isHidden(owner.id)) continue;
    const cat = categoryOf(m);
    if (!paint[cat].visible) continue;
    strokes.push({ pts: [...m.pts], closed: false, ...strokeWidth(cutWidth(cat)), color: theme.inkSoft, alpha: 0.9, dash: [6, 3] });
    if (owner && isRevealed(owner.id)) revealStrokes.push({ pts: [...m.pts], closed: false, widthPx: REVEAL_WIDTH, color: REVEAL_COLOR, alpha: 1 });
  }

  // Contorno externo: a união das regiões visíveis (o que está atrás de um sólido não entra). Com categoria oculta (ou
  // elemento oculto nesta vista), a silhueta do motor (que une tudo) é refeita só com os itens que ficaram.
  const hiddenAny = GRAPHICS_CATEGORIES.some((c) => !paint[c].visible);
  const silhouette = hiddenAny || hasHidden ? (silhouetteParts.length > 0 ? union(...silhouetteParts) : []) : s.silhouette;
  for (const ring of ringsOf(silhouette)) strokes.push({ pts: ring, closed: true, widthPx: 2.2, color: theme.ink, alpha: 1 });

  // Anotações da vista de corte/elevação (cotas, textos, detalhes e etiquetas), por cima do desenho do modelo. A
  // geometria delas é `(t,z)`: distância ao longo do corte e cota. Sem `annotations`, nada muda no desenho.
  if (hasSectionAnnotations(input.annotations)) {
    // Escala e aparência da categoria 'anotação' vêm da própria vista (barra de controle da vista), como na planta.
    const notes = sectionAnnotationOps(input, {
      scale: style.scale,
      style: dimensionStyleOf(input.project.settings),
      paint: style.paint.annotation,
      hoverId: input.highlight?.hover ?? null,
      selectedIds: input.highlight?.selection ?? [],
    });
    fills.push(...notes.fills);
    strokes.push(...notes.strokes);
    labels.push(...notes.labels);
  }

  if (input.thinLines) thinStrokes(strokes);
  // Borda azul do Reveal por cima do desenho normal e com a largura própria (não passa pelo `thinStrokes`).
  if (revealStrokes.length > 0) strokes.push(...revealStrokes);
  // Guarda-corpo revelado: a borda azul sai depois do desenho dele (como as outras reveladas, sem o `thinStrokes`).
  const revealGC: StrokeOp[] = [];
  // Massas (ficha V3): pelo mesmo caminho do guarda-corpo, antes dele; a categoria 'mass' e a ocultação da vista valem dentro de `massaCorteOps`.
  massaCorteOps(p, s, theme, input.dark, hidden, paint.mass, fills, strokes, input.highlight);
  guardaCorpoCorteOps(p, s, theme, input.dark, hidden, paint.railing, fills, strokes, { revelados: revealed, contorno: (pts) => revealGC.push({ pts, closed: true, widthPx: REVEAL_WIDTH, color: REVEAL_COLOR, alpha: 1 }) }, input.highlight);
  strokes.push(...revealGC);
  if (input.highlight) highlightOps(s, input.highlight, theme, fills, strokes);

  return { background: theme.bg, fills, strokes, labels };
}

/**
 * Realce por seleção e por cursor (decisão 0016, seção "Seleção em cortes e elevações"). Um item selecionado (ou cujo
 * dono está selecionado) ganha contorno na cor de seleção e preenchimento translúcido (0,25) sobre as partes visíveis.
 * O item sob o cursor, se não estiver selecionado, ganha só um contorno fraco. Vai por último, por cima do desenho.
 * Corte unido: as peças guardam a origem (`parts`), então só a parte do dono selecionado é realçada. Sem `parts` (o
 * motor não separa as origens), vale o item inteiro.
 */
function highlightOps(s: SectionResult, hl: { selection: Id[]; hover: Id | null; aviso?: Id[] }, theme: PlanTheme, fills: FillOp[], strokes: StrokeOp[]): void {
  const aviso = new Set(hl.aviso ?? []);
  if (hl.selection.length === 0 && hl.hover === null && aviso.size === 0) return;
  const polysOf = (item: SectionItem, id: Id): MultiPolygon => {
    if (!item.owners.some((o) => o.id === id)) return [];
    if (!item.parts) return item.polygons;
    const parts = item.parts.filter((part) => ownerOf(part.origin)?.id === id);
    if (parts.length === 0) return [];
    return parts.length === 1 ? parts[0]!.polygons : union(...parts.map((part) => part.polygons));
  };
  for (const item of sectionItems(s)) {
    // Decisão 0044: a parede em conflito ganha o amarelo do aviso por cima da seleção/cursor.
    const av = [...aviso].map((id) => polysOf(item, id)).filter((m) => m.length > 0);
    if (av.length > 0) {
      const polygons = av.length === 1 ? av[0]! : union(...av);
      fills.push({ polygons, color: AVISO, alpha: AVISO_ALPHA });
      for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, widthPx: 2.5, color: AVISO, alpha: 1 });
      continue;
    }
    const sel = hl.selection.map((id) => polysOf(item, id)).filter((m) => m.length > 0);
    if (sel.length > 0) {
      const polygons = sel.length === 1 ? sel[0]! : union(...sel);
      fills.push({ polygons, color: theme.select, alpha: 0.25 });
      for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
    } else if (hl.hover !== null) {
      const polygons = polysOf(item, hl.hover);
      for (const ring of ringsOf(polygons)) strokes.push({ pts: ring, closed: true, widthPx: 1.5, color: theme.select, alpha: 0.55 });
    }
  }
}

/** Caixa para enquadrar o desenho, com folga lateral e vertical. */
export function sectionBox(s: SectionResult): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: -0.8, maxX: s.length + 2.2, minY: s.zMin - 0.5, maxY: s.zMax + 0.5 };
}
