import type { MultiPolygon, Vec2 } from '@hestia/geom';
import type { AreaPlan, AreaPlanGraphics, HatchKind } from '@hestia/model';

export interface FillOp {
  polygons: MultiPolygon;
  color: string;
  alpha: number;
  /**
   * Hachura por cima do preenchimento; `alpha` (0..1) é a transparência da categoria (decisão 0015 §2.4). `zoomMin`: só
   * aparece a partir deste zoom (px/m): o shader a esconde abaixo dele, e a geometria não muda com o zoom.
   */
  hatch?: { kind: HatchKind; color: string; alpha?: number; zoomMin?: number };
  /** Faixa de contorno do elemento (não é superfície): fica no estilo arame e não sofre a transparência da categoria. */
  contour?: boolean;
  /**
   * Faixa de contorno em papel: `polygons` é a região do elemento, e a faixa (que `contour` marca) é a região menos o
   * recuo dela pela espessura corrente (`larguraEmPx`), calculada com o zoom por quem consome (`resolverZoom`, ou a
   * cena da GPU). Assim a geometria do nível não guarda polígono nenhum que dependa do zoom.
   */
  faixa?: Espessura;
  /**
   * Marcador em pixels de tela: o mesmo formato de `polygons`; cada vértice sai deslocado de `deslocamentoPx / zoom`
   * (em metros) da posição de `polygons`. O tamanho do marcador não muda com o zoom na tela.
   */
  deslocamentoPx?: Vec2[][][];
}

/**
 * Espessura em mm de papel na escala 1:`escala`. A GPU converte com o zoom corrente (piso de 1 px, depois `fator` e
 * `teto`), então o zoom não entra na geometria do traço.
 */
export interface PesoPapel {
  mm: number;
  escala: number;
  /** Fator sobre a largura já com o piso de 1 px (peso do traço dentro de um símbolo, seleção); ausente = 1. */
  fator?: number;
  /** Largura máxima em px (linhas finas da tela: nunca passam de 1 px); ausente = sem teto. */
  teto?: number;
}

/** Espessura de um traço: `widthPx` é a largura em pixels no zoom de construção; `papel`, quando existe, manda na GPU. */
export interface Espessura {
  widthPx: number;
  papel?: PesoPapel;
}

export interface StrokeOp {
  pts: Vec2[];
  closed: boolean;
  /**
   * Espessura em pixels de tela, no zoom em que o traço foi montado. Com `papel`, a espessura real sai do zoom corrente
   * (ver `larguraEmPx`); sem `papel`, vale esta.
   */
  widthPx: number;
  /** Peso de papel do traço (categorias de desenho): a GPU aplica o zoom no shader, sem refazer a geometria. */
  papel?: PesoPapel;
  color: string;
  alpha: number;
  /** [traço, vão] em pixels. */
  dash?: [number, number];
  /** Marcador em pixels de tela: cada ponto sai deslocado de `deslocamentoPx[i] / zoom` (m); mesmo tamanho para qualquer zoom. */
  deslocamentoPx?: Vec2[];
  /** Só aparece a partir deste zoom (px/m): o shader esconde o traço abaixo dele; ausente = sempre. */
  zoomMin?: number;
  /** Papel do traço na esquadria (ombreira, folha, arco...), para depuração e testes da prévia. */
  role?: string;
}

/**
 * Medidas de um rótulo em mm de papel (a conta com o zoom e a escala é feita no quadro, não na geometria): o corpo da
 * fonte e um deslocamento ao longo de (`ux`, `uy`). `ux` e `uy` ausentes não geram `dx` e `dy`.
 */
export interface PapelRotulo {
  escala: number;
  fontMm?: number;
  desvio?: { mm: number; ux?: number; uy?: number };
  /** Largura de quebra do texto em mm de papel: vira `widthPx` com o zoom corrente. */
  widthMm?: number;
}

export interface LabelOp {
  at: Vec2;
  text: string;
  /** Cor do texto; ausente usa a cor da anotação no tema. */
  color?: string;
  /** Deslocamento em pixels a partir do ponto. */
  dx?: number;
  dy?: number;
  /** 'soft': rótulo mais claro (degrau acima do corte, decisão 0014 §1 item 9). */
  tone?: 'info' | 'accent' | 'soft';
  /** Estilo do valor da cota durante o desenho: tipografia monoespaçada e sem caixa. */
  appearance?: 'dimension-preview';
  /** Texto de anotação (decisão 0019): tamanho da fonte em px de tela, rotação em graus, centrado em `at`. */
  fontPx?: number;
  rotation?: number;
  center?: boolean;
  widthPx?: number;
  /** Família da fonte do texto de anotação (estilo de cotas); ausente usa a do CSS. */
  fontFamily?: string;
  /**
   * Quebra de linha do texto de tela: `'pre-wrap'` preserva as quebras de `\n` do texto e a quebra por `widthPx`; ausente
   * mantém o comportamento antigo (uma linha). O render de tela (PlanLabels) o aplica no estilo do rótulo.
   */
  whiteSpace?: 'pre-wrap' | 'nowrap' | 'normal';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Polígono de máscara em coordenadas de modelo, desenhado sobre o canvas na camada sincronizada de anotação. */
  maskBoundary?: Vec2[];
  maskColor?: string;
  maskBorderColor?: string;
  /** Medidas em papel: `resolverZoom` as converte em `fontPx`, `dx` e `dy` com o zoom corrente. */
  papel?: PapelRotulo;
}

/** Lista de desenho neutra: tanto o renderizador de GPU quanto o de CPU a consomem. */
export interface PlanDrawList {
  background: string;
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

/**
 * Uma camada da planta (geometria do nível ou sobreposição), sem o fundo. A geometria do nível não guarda medida em
 * pixels resolvida com o zoom: faixas, marcadores e rótulos levam a especificação (`faixa`, `deslocamentoPx`, `papel`),
 * e `resolverZoom` a converte no zoom corrente. As decisões que mudam com o zoom (hachura, detalhe) ficam em `limiares`.
 */
export interface PlanOps {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
  /**
   * Zooms em que alguma decisão da geometria muda de lado (hachura a partir de 40 px/m, espessura equivalente de uma região
   * a 5 px, interface entre materiais a 1,6 px...), em ordem crescente e sem repetição. Entre dois limiares seguidos a
   * geometria é a mesma; só a camada que os guarda precisa saber disso (ver `assinaturaDeZoom`).
   */
  limiares?: number[];
}

/**
 * Perfil de visibilidade da planta: o que a vista desenha. A planta de piso usa `FLOOR_PLAN_PROFILE`; a de área usa
 * `resolveViewProfile(plan).layers` (modelo), que traduz os gráficos da própria planta (paredes claras, sem pisos nem cotas por padrão) e
 * acrescenta as anotações da vista. É por ele que a planta de área reaproveita o mesmo motor da planta de piso.
 */
export interface PlanProfile {
  /** Paredes: claras (planta de área), normais (planta de piso) ou ocultas. */
  walls: 'light' | 'normal' | 'hidden';
  /** Símbolos e etiquetas de aberturas (portas e janelas). */
  openings: boolean;
  /** Pisos e lajes do nível. */
  floors: boolean;
  /** Cotas (do nível, ou da vista quando ela tem as suas). */
  dimensions: boolean;
  /** Textos livres (do nível, ou da vista). */
  texts: boolean;
  /** Linhas e regiões de detalhe (do nível, ou da vista). */
  detail: boolean;
  /** Etiquetas de elemento, de parede e de abertura. */
  tags: boolean;
  /** Grades de eixos. */
  grids: boolean;
  /** Marcas de corte e elevação. */
  sectionMarks: boolean;
  /** Ambientes: preenchimento, contorno, diagonais e etiqueta de ambiente. */
  rooms: boolean;
  /** Diagonais de referência dos ambientes (planta de área). */
  referenceLines: boolean;
  /** Pavimento de referência (nível de baixo apagado). */
  underlay: boolean;
  /** Projeção da cobertura (contorno tracejado dos telhados fora do intervalo de vista). */
  roofProjection: boolean;
  /** Escadas do nível (e do nível de baixo quando há subpavimento). */
  stairs: boolean;
  /** Rampas do nível (e do nível de baixo quando há subpavimento). */
  ramps: boolean;
  /** Telhados: cheios (planta de piso), só projeção (planta de área) ou ocultos. */
  roofs: 'full' | 'projection' | 'hidden';
  /** Etiquetas persistentes do nível (`Level.tags`), além das etiquetas de parede/abertura. */
  elementTags: boolean;
  /** Objetos importados (viga, pilar, mobiliário...). */
  generic: boolean;
  /** Forros (só a vista para cima os desenha de qualquer forma). */
  ceilings: boolean;
}

/** Perfil da planta de piso: tudo o que a planta de nível desenha, com as paredes normais. */
export const FLOOR_PLAN_PROFILE: PlanProfile = {
  walls: 'normal',
  openings: true,
  floors: true,
  dimensions: true,
  texts: true,
  detail: true,
  tags: true,
  grids: true,
  sectionMarks: true,
  rooms: true,
  referenceLines: false,
  underlay: true,
  roofProjection: true,
  stairs: true,
  ramps: true,
  roofs: 'full',
  elementTags: true,
  generic: true,
  ceilings: true,
};

/** Perfil da planta de área: paredes claras, diagonais e etiquetas; o resto só quando a vista pedir. */
export const AREA_PLAN_PROFILE: PlanProfile = {
  walls: 'light',
  openings: false,
  floors: false,
  dimensions: false,
  texts: false,
  detail: false,
  tags: true,
  grids: true,
  sectionMarks: true,
  rooms: true,
  referenceLines: true,
  underlay: false,
  roofProjection: false,
  stairs: true,
  ramps: true,
  roofs: 'projection',
  elementTags: false,
  generic: false,
  ceilings: false,
};

/**
 * Perfil de desenho de uma planta de área, a partir dos gráficos dela. As anotações próprias da vista (guardadas em
 * `annotations`) aparecem mesmo com as opções de cota/anotação desligadas: elas foram criadas nesta vista e não são as
 * do nível. Sem anotações próprias, valem as opções dos gráficos (que filtram o fallback para as do nível).
 */
export function areaPlanProfile(plan: Pick<AreaPlan, 'graphics'>): PlanProfile {
  const g: AreaPlanGraphics = plan.graphics;
  return {
    walls: g.showWalls,
    openings: g.showOpenings,
    floors: g.showFloors,
    dimensions: g.showDimensions,
    texts: g.showAnnotations,
    detail: g.showAnnotations,
    tags: g.showAnnotations,
    grids: g.showGrids === true,
    sectionMarks: g.showSectionMarks === true,
    rooms: true,
    referenceLines: g.referenceLines !== 'never',
    underlay: g.showBelowLevel,
    roofProjection: false,
    stairs: g.showStairs !== false,
    ramps: g.showStairs !== false,
    roofs: g.showRoofs === false ? 'hidden' : 'projection',
    elementTags: g.showAnnotations,
    generic: g.showGeneric === true,
    ceilings: false,
  };
}

export interface PlanTheme {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  ink: string;
  inkSoft: string;
  accent: string;
  guide: string;
  select: string;
  /** Linha do esboço sob o cursor, antes do clique: azul claro para não se confundir com a linha selecionada. */
  selectHover: string;
  underlay: string;
  /** Prévia da escada por tom (limites, espelhos, caminhada, patamar e degraus calculados). */
  stairBoundary: string;
  stairRiser: string;
  stairPath: string;
  stairLanding: string;
  stairTread: string;
  /** Pegada do telhado com balanço: contorno tracejado de 1 px (o desenho que o usuário traçou, sem o beiral). */
  roofFootprint: string;
  /** Seta de caimento do telhado na planta (1 px): verde, para não se confundir com a tinta do desenho. */
  roofSlope: string;
  /** Cor de telha quando o material do tipo de telhado não tem cor: terracota discreta, legível nos dois temas. */
  roofTile: string;
  /** Laço de furo do esboço (preenchimento translúcido): laranja, para indicar abertura, legível nos dois temas. */
  sketchHole: string;
}

export const LIGHT: PlanTheme = {
  bg: '#fbfbfa',
  gridMinor: '#e9ebee',
  gridMajor: '#d6dae0',
  ink: '#16181c',
  inkSoft: '#7a828c',
  accent: '#0f766e',
  guide: '#c2410c',
  select: '#1d6fe0',
  selectHover: '#5b9bf0',
  underlay: '#b7bec7',
  stairBoundary: '#2563eb',
  stairRiser: '#ea580c',
  stairPath: '#15803d',
  stairLanding: '#7e22ce',
  stairTread: '#64748b',
  roofFootprint: '#c2185b',
  roofSlope: '#1f6f5c',
  roofTile: '#c9795a',
  sketchHole: '#e8890c',
};

export const DARK: PlanTheme = {
  bg: '#16191d',
  gridMinor: '#23282e',
  gridMajor: '#2f363e',
  ink: '#e8eaee',
  inkSoft: '#7d8691',
  accent: '#2dd4bf',
  guide: '#fb923c',
  select: '#5aa2ff',
  selectHover: '#8fc0ff',
  underlay: '#4b5560',
  stairBoundary: '#60a5fa',
  stairRiser: '#fb923c',
  stairPath: '#4ade80',
  stairLanding: '#c084fc',
  stairTread: '#94a3b8',
  roofFootprint: '#ff6fb0',
  roofSlope: '#5cc3a6',
  roofTile: '#8a4f3b',
  sketchHole: '#ffb04d',
};
