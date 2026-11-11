import { unitsOf, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import type { ResolvedLevel, ResolvedRoof } from '@hestia/engine';
import type { Inference, PreviewItem } from '@hestia/tools';
import type { SketchDraft, SketchResult } from '@hestia/geom';
import type { Viewport } from '../viewport.ts';
import { effectiveGridStep, gridCovers, gridLayer, type GridLayer } from './grid.ts';
import type { PlanSlot, PlanScene } from './gpuPlan.ts';
import { buildPlanGeometry, buildPlanHoverOverlay, buildPlanLiveOverlay, buildPlanScreenOverlay, planBelowOf, planGeometrySelection } from './build.ts';
import { telhadosDoNivel } from './resolucao.ts';
import { resolvePlanTarget, type PlanTarget } from './planInput.ts';
import { assinaturaDeZoom } from './limiares.ts';
import { resolverRotulos, resolverZoom } from './zoomOps.ts';
import { dimPlanOps } from './dim.ts';
import { sketchOps, type SketchSelectionBox } from './sketch.ts';
import type { FillOp, LabelOp, PlanDrawList, PlanOps, PlanTheme, StrokeOp } from './types.ts';
import type { Lang } from '../i18n.ts';
import { contadores } from '../perf/registro.ts';

/** Esboço do perímetro em edição (só na planta): o rascunho, a validação dele, a linha sob o cursor e a caixa de seleção. */
export interface PlanSketch {
  draft: SketchDraft;
  result: SketchResult;
  hover: string | null;
  /** Caixa da janela de seleção em arraste, desenhada sobre o esboço. */
  box?: SketchSelectionBox | null;
}

/** Estado da planta que o quadro lê: o projeto, o nível, a vista e as opções; `version` é a versão do projeto. */
export interface PlanViewStateBase {
  project: Project;
  version: number;
  v: Viewport;
  theme: PlanTheme;
  dark: boolean;
  gpu: boolean;
  showGrid: boolean;
  /** Pavimento de referência escolhido (null = o de baixo, automático). */
  underlayLevel?: string | null;
  showUnderlay: boolean;
  showRoofProjection: boolean;
  thinLines: boolean;
  selection: Id[];
  hover: Id | null;
  /** Parede em conflito (decisão 0044), realçada em amarelo na camada de hover. */
  aviso?: Id | null;
  preview: PreviewItem[];
  inference: Inference | null;
  /** Elementos ocultos nesta vista (Hide in View + temporário). */
  hidden?: ReadonlySet<Id>;
  /** Elementos que o modo Reveal mostra com borda azul. */
  revealed?: ReadonlySet<Id>;
  /** Resolução do nível (o app a guarda em cache). */
  resolve: (id: Id) => ResolvedLevel;
  /** Esboço do perímetro em edição, desenhado sobre a planta (ausente fora do modo). */
  sketch?: PlanSketch | null;
  /** Rótulo em arraste (fantasma). */
  tagGhost?: { roomId: Id; at: Vec2 };
  /** Idioma dos textos fixos da planta (repassado ao `PlanInput`). Padrão `'pt'`. */
  lang?: Lang;
}

/**
 * Estado da planta: a vista por `viewId` (piso, cobertura ou planta de área; ver `PlanTarget`). Na cobertura a geometria lê o
 * nível resolvido (sem intervalo de vista) e os telhados de todos os níveis abaixo. As chaves incluem o id da vista, então
 * trocar entre piso, cobertura e planta de área refaz as camadas.
 */
export type PlanViewState = PlanViewStateBase & PlanTarget;

/** Resolução vazia do nível atual: a planta normal não a lê (ver `planFrameUpdateOf`). */
export function resolucaoVazia(levelId: Id): ResolvedLevel {
  return { levelId, walls: {}, clusters: [] };
}

/**
 * Atualização do quadro a partir do estado da planta: as chaves (a geometria só depende do que ela lê; a sobreposição, do
 * que aparece sobre ela) e as funções que refazem cada camada, chamadas só quando a chave muda.
 */
export function planFrameUpdateOf(s: PlanViewState): PlanFrameUpdate {
  const { project: p, v, theme, dark } = s;
  const lang = s.lang ?? 'pt';
  // A vista é resolvida UMA vez aqui; as chaves usam o id dela (não mais um sinalizador de modo) e o desenho o recebe por `planContext`.
  const { viewId, levelId, roofPlanMode: rp, areaPlan } = resolvePlanTarget(p, s);
  const geoSel = planGeometrySelection(p, levelId, s.selection, areaPlan, viewId);
  // A planta normal não usa a resolução do nível atual: `planViewOf` refaz a geometria com o corte (ver `planContext`).
  // Só a planta de cobertura lê `resolved`: o nível atual é resolvido só quando ela é desenhada, nunca na planta de piso.
  // O nível de baixo continua resolvido apenas quando a geometria é refeita (ver `planBelowOf`).
  const area = areaPlan !== undefined;
  const areaKey = area ? `${JSON.stringify(areaPlan)}|${s.tagGhost?.roomId ?? ''}` : '';
  // A planta de área usa as MESMAS sobreposições da planta de piso. Ela bloqueia as ferramentas de modelo
  // (`AREA_PLAN_TOOLS`), mas o `select` ainda move o elemento selecionado; por isso mantém destaque, alças e fantasmas
  // iguais aos do piso. Se o select virar somente leitura, suprimir as alças de modelo aqui.
  const base = { project: p, levelId, viewport: v, theme, dark, showGrid: s.showGrid, thinLines: s.thinLines, showRoofProjection: s.showRoofProjection, roofPlanMode: rp, areaPlan, viewId, tagGhost: s.tagGhost, hidden: s.hidden, revealed: s.revealed, lang };
  const visKey = s.hidden?.size || s.revealed?.size ? `${[...(s.hidden ?? [])].sort().join(',')}|${[...(s.revealed ?? [])].sort().join(',')}` : '';
  // Uma resolução por atualização, mesmo com as camadas de sobreposição sendo refeitas na mesma passagem.
  let resolvida: ResolvedLevel | null = null;
  const resolvido = (): ResolvedLevel => (rp ? (resolvida ??= s.resolve(levelId)) : resolucaoVazia(levelId));
  // O id da vista entra nas chaves: sem isso, trocar piso, cobertura e planta de área do mesmo nível reaproveitaria as camadas antigas.
  return {
    v,
    theme,
    gpu: s.gpu,
    showGrid: s.showGrid,
    geometryKey: `${s.version}|${levelId}|${viewId}|${dark}|${lang}|${s.showUnderlay}|${s.underlayLevel ?? ''}|${s.showRoofProjection}|${s.sketch ? 'dim' : ''}|${geoSel.join(',')}|${s.tagGhost?.roomId ?? ''}|${areaKey}|${visKey}`,
    // Três chaves de sobreposição: a seleção, o alvo do cursor e a camada viva (prévia, guias e captura). Cursor e
    // pré-visualização não refazem os destaques da seleção, e o hover não refaz a geometria do nível.
    overlayKey: `${s.version}|${levelId}|${viewId}|${dark}|${lang}|${s.selection.join(',')}|${areaKey}|${visKey}`,
    hoverKey: `${s.version}|${levelId}|${viewId}|${dark}|${lang}|${s.selection.join(',')}|${s.hover ?? ''}|${s.aviso ?? ''}|${areaKey}|${visKey}`,
    liveKey: `${JSON.stringify(s.preview)}|${JSON.stringify(s.inference)}|${sketchKey(s.sketch, v.zoom)}|${JSON.stringify(s.tagGhost ?? null)}|${areaKey}|${lang}`,
    // Só a geometria lê o nível de baixo: as referências são resolvidas apenas quando ela é refeita.
    geometry: () => {
      // A planta de área tem a sua própria opção de subpavimento; a planta de piso usa a opção global da vista.
      const showUnderlay = areaPlan ? areaPlan.graphics.showBelowLevel : s.showUnderlay;
      const abaixo = planBelowOf(p, levelId, s.resolve, showUnderlay, s.underlayLevel);
      // Cobertura: os telhados de todos os níveis abaixo (`planBelowOf` só dá os do pavimento de referência).
      const telhados = rp ? { belowRoofs: telhadosDosNiveisAbaixo(p, levelId) } : {};
      const g = buildPlanGeometry({ ...base, hideLabelRoomId: s.tagGhost?.roomId, resolved: resolvido(), ...abaixo, ...telhados, selection: geoSel, hover: null, preview: [], inference: null });
      // Com o esboço de perímetro aberto, o resto do desenho fica em cinza bem claro e as linhas do esboço se destacam.
      return s.sketch ? dimPlanOps(g, theme.bg) : g;
    },
    overlay: () => buildPlanScreenOverlay({ ...base, resolved: resolvido(), below: null, selection: s.selection, hover: null, preview: [], inference: null }),
    hover: () => buildPlanHoverOverlay({ ...base, resolved: resolvido(), below: null, selection: s.selection, hover: s.hover, aviso: s.aviso ?? null, preview: [], inference: null }),
    live: () => comEsboco(buildPlanLiveOverlay({ ...base, resolved: resolvido(), below: null, selection: s.selection, hover: null, preview: s.preview, inference: s.inference }), s.sketch, theme, v, unitsOf(p)),
  };
}

/** Telhados de todos os níveis abaixo do atual (planta de cobertura). Sem níveis abaixo, nenhum. */
function telhadosDosNiveisAbaixo(p: Project, levelId: Id): ResolvedRoof[] {
  const i = p.levels.findIndex((l) => l.id === levelId);
  return p.levels.slice(0, Math.max(0, i)).flatMap((l) => telhadosDoNivel(p, l.id));
}

/** Chave do esboço na sobreposição: conteúdo e zoom (as linhas dos arcos e o balão dependem do zoom); vazia fora do modo. */
function sketchKey(sk: PlanSketch | null | undefined, zoom: number): string {
  return sk ? `${zoom}|${JSON.stringify(sk)}` : '';
}

/** Junta as operações do esboço à sobreposição da planta (sem esboço, a sobreposição sai como está). */
function comEsboco(o: PlanOps, sk: PlanSketch | null | undefined, theme: PlanTheme, v: Viewport, units: ResolvedUnits): PlanOps {
  if (!sk) return o;
  const k = sketchOps(sk.draft, sk.result, theme, v, sk.hover, sk.box ?? null, units);
  return { fills: [...o.fills, ...k.fills], strokes: [...o.strokes, ...k.strokes], labels: [...o.labels, ...k.labels] };
}

/** O que a cena da planta precisa de uma vez: as chaves dizem quando cada camada muda; as funções a refazem. */
export interface PlanFrameUpdate {
  v: Viewport;
  theme: PlanTheme;
  /** Desenha na cena da GPU. Sem ela (modo CPU) as chaves e as camadas em memória continuam valendo. */
  gpu: boolean;
  showGrid: boolean;
  /** Pavimento de referência escolhido (null = o de baixo, automático). */
  underlayLevel?: string | null;
  /**
   * Chave da geometria do nível: projeto, nível, tema, opções de vista e o que a geometria lê da seleção (só as cotas e as
   * linhas/regiões de detalhe). Pan, zoom, cursor, ferramenta e a maior parte da seleção ficam fora dela. O zoom só refaz a
   * geometria quando passa de um limiar de detalhe (interface entre materiais): ver `PlanOps.limiares` e `assinaturaDeZoom`.
   */
  geometryKey: string;
  /**
   * Chave da sobreposição de seleção: projeto, nível, tema e seleção. Pan, zoom, cursor, prévia e ferramenta ficam fora
   * dela. Hover tem chave própria (`hoverKey`) e a camada viva (cursor, prévia, captura) tem `liveKey`.
   */
  overlayKey: string;
  /** Chave do realce do alvo sob o cursor: seleção + hover (o hover não refaz a sobreposição de seleção). */
  hoverKey?: string;
  /** Chave da camada viva: pré-visualização, inferência/captura e esboço (o cursor não refaz seleção nem hover). */
  liveKey?: string;
  geometry: () => PlanOps;
  overlay: () => PlanOps;
  hover?: () => PlanOps;
  live?: () => PlanOps;
}

/** Cena que recebe as camadas (a GPU da planta). */
export type PlanSceneSink = Pick<PlanScene, 'setSlot' | 'setBackground'>;

const EMPTY: PlanOps = { fills: [], strokes: [], labels: [] };

/** Mesma vista (centro, zoom e tamanho); `null` só é igual a `null`. */
export function sameView(a: Viewport | null, b: Viewport | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cx === b.cx && a.cy === b.cy && a.zoom === b.zoom && a.width === b.width && a.height === b.height;
}

/** Dois conjuntos de rótulos com o mesmo conteúdo (texto, posição e estilo), na mesma ordem. */
const samePapel = (a: LabelOp['papel'], b: LabelOp['papel']): boolean =>
  a === b || (!!a && !!b && a.escala === b.escala && a.fontMm === b.fontMm && a.widthMm === b.widthMm && a.desvio?.mm === b.desvio?.mm && a.desvio?.ux === b.desvio?.ux && a.desvio?.uy === b.desvio?.uy);

export function sameLabels(a: readonly LabelOp[], b: readonly LabelOp[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.at.x !== y.at.x || x.at.y !== y.at.y || x.text !== y.text || x.dx !== y.dx || x.dy !== y.dy || x.color !== y.color) return false;
    if (x.tone !== y.tone || x.fontPx !== y.fontPx || x.rotation !== y.rotation || x.center !== y.center || !samePapel(x.papel, y.papel)) return false;
    if (x.widthPx !== y.widthPx || x.bold !== y.bold || x.italic !== y.italic || x.underline !== y.underline || x.align !== y.align) return false;
    if (x.whiteSpace !== y.whiteSpace) return false;
    if (x.maskColor !== y.maskColor || x.maskBorderColor !== y.maskBorderColor || x.maskBoundary?.length !== y.maskBoundary?.length) return false;
    if (x.maskBoundary && y.maskBoundary && x.maskBoundary.some((p, j) => p.x !== y.maskBoundary![j]!.x || p.y !== y.maskBoundary![j]!.y)) return false;
  }
  return true;
}

/**
 * Quadro da planta: decide, a cada atualização, quais camadas da cena refazer. A geometria do nível só é refeita quando
 * a sua chave muda; a seleção, o hover e a camada viva têm chaves próprias (cursor e prévia não tocam os destaques da
 * seleção), e a grade só é refeita quando o passo (que sai do zoom) ou a área coberta mudam. Pan dentro da área coberta
 * não refaz nenhuma camada: só a câmera (feita por quem chama).
 */
export class PlanFrame {
  private geomKey: string | null = null;
  private ovKey: string | null = null;
  private hovKey: string | null = null;
  private livKey: string | null = null;
  private gridKey: string | null = null;
  private grid: GridLayer | null = null;
  private gridOn = false;
  private geom: PlanOps = EMPTY;
  private ov: PlanOps = EMPTY;
  private hov: PlanOps = EMPTY;
  private liv: PlanOps = EMPTY;
  private bg: string | null = null;
  /** Rótulos da planta (geometria e sobreposições) no zoom corrente. Trocam de referência só quando o conteúdo muda. */
  private labelsValue: LabelOp[] = [];
  /** Rótulos sem o zoom aplicado (medidas em papel), na ordem de desenho. */
  private labelsLivres: LabelOp[] = [];
  /** Limiares de detalhe da geometria atual e a assinatura do zoom em que ela foi feita. */
  private limiares: number[] = [];
  private assinatura = 0;
  /** Zoom do último quadro e o dos rótulos resolvidos. */
  private zoom = Number.NaN;
  private zoomRotulos = Number.NaN;
  /** Camadas resolvidas para o zoom (modo CPU e conferência), guardadas por camada e zoom. */
  private resolvidas: { geom: PlanOps; ov: PlanOps; hov: PlanOps; liv: PlanOps; zoom: number; geomRes: PlanOps; ovRes: PlanOps; hovRes: PlanOps; livRes: PlanOps } | null = null;

  constructor(private readonly scene: PlanSceneSink) {}

  /** Rótulos atuais. Mesma referência enquanto o conteúdo não muda: quem exibe compara por ela. */
  get labels(): LabelOp[] {
    return this.labelsValue;
  }

  /** Esquece o que está na cena (por exemplo ao sair da vista de corte): o próximo quadro refaz tudo. */
  reset(): void {
    this.geomKey = null;
    this.ovKey = null;
    this.hovKey = null;
    this.livKey = null;
    this.gridKey = null;
    this.grid = null;
    this.gridOn = false;
    this.geom = EMPTY;
    this.ov = EMPTY;
    this.hov = EMPTY;
    this.liv = EMPTY;
    this.bg = null;
    this.labelsValue = [];
    this.labelsLivres = [];
    this.limiares = [];
    this.assinatura = 0;
    this.zoom = Number.NaN;
    this.zoomRotulos = Number.NaN;
    this.resolvidas = null;
  }

  update(u: PlanFrameUpdate): void {
    const { v, theme } = u;
    const sink = u.gpu ? this.scene : null;
    if (this.bg !== theme.bg) {
      this.bg = theme.bg;
      sink?.setBackground(theme.bg);
    }

    // Grade: o que muda com o zoom é o passo (e o tamanho dos pontinhos, que é em pixels). Enquanto o passo e a área
    // coberta não mudam, o zoom não a refaz: as linhas têm 1 px no shader e os pontos são marcadores em pixels.
    this.gridOn = u.showGrid;
    if (!u.showGrid) {
      if (this.gridKey !== null) this.setSlot(sink, 'grid', [], [], v);
      this.gridKey = null;
      this.grid = null;
    } else {
      const gk = `${effectiveGridStep(v.zoom, v.gridStep)}|${theme.gridMinor}|${theme.gridMajor}|${theme.inkSoft}`;
      if (this.grid === null || this.gridKey !== gk || !gridCovers(this.grid, v)) {
        this.grid = gridLayer(v, theme);
        this.gridKey = gk;
        this.setSlot(sink, 'grid', this.grid.fills, this.grid.strokes, v);
        contadores.contarRebuild('grade');
      }
    }

    this.zoom = v.zoom;
    let labelsChanged = false;
    // A geometria é refeita quando a chave muda ou quando o zoom passa de um limiar de detalhe (interface entre materiais).
    if (u.geometryKey !== this.geomKey || assinaturaDeZoom(this.limiares, v.zoom) !== this.assinatura) {
      this.geomKey = u.geometryKey;
      this.geom = u.geometry();
      this.limiares = this.geom.limiares ?? [];
      this.assinatura = assinaturaDeZoom(this.limiares, v.zoom);
      this.setSlot(sink, 'fillsBase', this.geom.fills, [], v);
      this.setSlot(sink, 'strokesBase', [], this.geom.strokes, v);
      contadores.contarRebuild('geometria');
      labelsChanged = true;
    }
    // Seleção, hover e camada viva: três chaves e três pares de lotes. Rótulos iguais aos de antes mantêm a referência.
    if (u.overlayKey !== this.ovKey) {
      this.ovKey = u.overlayKey;
      const next = u.overlay();
      this.setSlot(sink, 'fillsSel', next.fills, [], v);
      this.setSlot(sink, 'strokesSel', [], next.strokes, v);
      contadores.contarRebuild('sobreposicao');
      const same = sameLabels(this.ov.labels, next.labels);
      if (!same) labelsChanged = true;
      this.ov = { fills: next.fills, strokes: next.strokes, labels: same ? this.ov.labels : next.labels };
    }
    if (u.hoverKey !== undefined && u.hoverKey !== this.hovKey) {
      this.hovKey = u.hoverKey;
      const next = u.hover?.() ?? EMPTY;
      this.setSlot(sink, 'fillsHover', next.fills, [], v);
      this.setSlot(sink, 'strokesHover', [], next.strokes, v);
      contadores.contarRebuild('sobreposicao');
      const same = sameLabels(this.hov.labels, next.labels);
      if (!same) labelsChanged = true;
      this.hov = { fills: next.fills, strokes: next.strokes, labels: same ? this.hov.labels : next.labels };
    }
    if (u.liveKey !== undefined && u.liveKey !== this.livKey) {
      this.livKey = u.liveKey;
      const next = u.live?.() ?? EMPTY;
      this.setSlot(sink, 'fillsLive', next.fills, [], v);
      this.setSlot(sink, 'strokesLive', [], next.strokes, v);
      contadores.contarRebuild('sobreposicao');
      const same = sameLabels(this.liv.labels, next.labels);
      if (!same) labelsChanged = true;
      this.liv = { fills: next.fills, strokes: next.strokes, labels: same ? this.liv.labels : next.labels };
    }
    if (labelsChanged) this.labelsLivres = [...this.geom.labels, ...this.ov.labels, ...this.hov.labels, ...this.liv.labels];
    // Os rótulos levam as medidas em papel; a fonte e o deslocamento em px saem aqui, com o zoom do quadro.
    if (labelsChanged || this.zoomRotulos !== v.zoom) {
      this.zoomRotulos = v.zoom;
      const next = resolverRotulos(this.labelsLivres, v.zoom);
      if (!sameLabels(this.labelsValue, next)) this.labelsValue = next === this.labelsLivres ? [...next] : next;
    }
  }

  /** Lista de desenho completa (para o modo CPU e para a conferência): mesma ordem de desenho da cena. */
  drawList(theme: PlanTheme): PlanDrawList {
    // Faixas e marcadores saem do zoom do último quadro; o resultado fica guardado enquanto as camadas e o zoom não mudam.
    let r = this.resolvidas;
    if (!r || r.geom !== this.geom || r.ov !== this.ov || r.hov !== this.hov || r.liv !== this.liv || r.zoom !== this.zoom) {
      r = {
        geom: this.geom, ov: this.ov, hov: this.hov, liv: this.liv, zoom: this.zoom,
        geomRes: resolverZoom(this.geom, this.zoom), ovRes: resolverZoom(this.ov, this.zoom), hovRes: resolverZoom(this.hov, this.zoom), livRes: resolverZoom(this.liv, this.zoom),
      };
      this.resolvidas = r;
    }
    return {
      background: theme.bg,
      fills: [...r.geomRes.fills, ...r.ovRes.fills, ...r.hovRes.fills, ...r.livRes.fills],
      strokes: [...(this.gridOn && this.grid ? this.grid.strokes : []), ...r.geomRes.strokes, ...r.ovRes.strokes, ...r.hovRes.strokes, ...r.livRes.strokes],
      labels: this.labelsValue,
    };
  }

  private setSlot(sink: PlanSceneSink | null, slot: PlanSlot, fills: FillOp[], strokes: StrokeOp[], v: Viewport): void {
    sink?.setSlot(slot, fills, strokes, v);
  }
}
