// Parede cortina (decisão 0056, §4): só tipos e constantes. Nada de regra aqui (no molde de guardaCorpoTypes.ts).
// Metros e radianos. A geometria não é guardada: a instância só guarda intenções, e o Rust resolve grade e peças.

import type { OpeningGlassKind } from './openingTypes.ts';
import type { Id } from './types.ts';

// ───────────── Grade (§4.2) ─────────────

export type GridLayoutMode = 'fixedNumber' | 'fixedDistance' | 'maxDistance' | 'manual';
export type GridJustify = 'start' | 'center' | 'end';
export type GridAnchor = 'start' | 'end';

/** Um eixo da grade. U corre ao longo do eixo da parede (comprimento L); V é vertical (altura H). */
export interface GridAxisSpec {
  mode: GridLayoutMode;
  /** fixedNumber: número de CÉLULAS (≥ 1) ao longo do eixo. */
  count?: number;
  /** fixedDistance: lado da célula cheia. maxDistance: lado máximo. (m, > 0) */
  distance?: number;
  /** fixedDistance: onde fica a sobra. Ausente = 'start' (células cheias a partir do início/base, sobra no fim/topo). */
  justify?: GridJustify;
  /** manual: posições das linhas internas, em metros a partir da âncora, estritamente crescentes. */
  positions?: number[];
  /** manual: de que ponta se medem as posições. Ausente = 'start'. */
  anchor?: GridAnchor;
  /** Deslocamento da grade inteira (m, positivo = em direção ao fim/topo). Linhas que saem do vão somem. Ausente = 0. */
  offset?: number;
  /** Ângulo das linhas deste eixo em relação à sua direção normal (rad). SÓ 0 até a fase 7; a validação recusa outro valor. */
  angle?: number;
}

// ───────────── Montantes (§4.2) ─────────────

export type MullionShape = 'rect' | 'round' | 'L' | 'trapezoid' | 'corner';

/** Seção do montante. Origem = interseção da linha de grade com o plano central do sistema; X ao longo da face, Y para fora. */
export interface MullionProfile {
  shape: MullionShape;
  /** Largura vista na face (m). round: diâmetro. */
  width: number;
  /** Profundidade na espessura do sistema (m). round: igual a `width`. Limitada à profundidade do sistema (aviso). */
  depth: number;
  /** L: espessura das abas (m). corner: espessura da chapa. */
  thickness?: number;
  /** trapezoid: largura da face interna (m); a externa é `width`. */
  widthBack?: number;
}

/** Revit: Position. `parallelToGround` só tem efeito com grade em ângulo (fase 7). */
export type MullionPosition = 'normalToFace' | 'parallelToGround';

export interface MullionType {
  id: Id;
  name: string;
  code?: string;
  profile: MullionProfile;
  materialId: Id;
  /** Deslocamento do perfil na profundidade, em relação ao plano central (m; positivo para fora). Ausente = 0. */
  offset?: number;
  position?: MullionPosition;
  /** Custo por metro linear (informativo). */
  cost?: number;
}

/** Papéis em que um tipo de montante entra. `null` = sem montante nesse papel (vidro colado / borda livre). */
export interface CurtainMullions {
  interiorVertical: Id | null;
  interiorHorizontal: Id | null;
  /** Bordas verticais: início e fim do eixo. */
  borderStart: Id | null;
  borderEnd: Id | null;
  /** Bordas horizontais: base e topo. */
  borderBottom: Id | null;
  borderTop: Id | null;
  /** Montante de canto entre duas cortinas em ângulo (fase 3). null = usa `borderStart/End`. */
  corner: Id | null;
  /** Quem corre contínuo na interseção. O outro é quebrado (aparado na face do contínuo). */
  joinPriority: 'vertical' | 'horizontal';
}

// ───────────── Painéis (§4.2) ─────────────

export type CurtainPanelKind = 'glass' | 'solid' | 'empty';

export interface CurtainPanelType {
  id: Id;
  name: string;
  code?: string;
  kind: CurtainPanelKind;
  /** Espessura do painel (m). `empty`: ignorada. */
  thickness: number;
  /** Deslocamento na profundidade (m; positivo para fora). Ausente = 0 (centrado). */
  offset?: number;
  /** Quanto o painel entra no montante, para a área bruta do vidro (m). Ausente = 0,012 (`GLASS_REBATE_DEFAULTS.depth`). */
  bite?: number;
  materialId: Id;
  /** `glass`: tipo de vidro (reusa o das esquadrias). */
  glassKind?: OpeningGlassKind;
  uValue?: number;
  fireRating?: string;
  /** R$ por m². */
  cost?: number;
}

// ───────────── Sistema (§4.2) ─────────────

export interface CurtainSpec {
  /** Profundidade do sistema (m): é a espessura da parede (`wallThicknessOf`). > 0. */
  depth: number;
  u: GridAxisSpec;
  v: GridAxisSpec;
  mullions: CurtainMullions;
  /** Painel de toda célula sem sobrescrita. */
  defaultPanelTypeId: Id;
  /**
   * Sobra menor que isto é fundida à célula vizinha em vez de virar célula (m), do sistema inteiro (decisão do dono,
   * §14.1). Ausente = `CURTAIN_MIN_REMAINDER` (0,05). Configurável no tipo.
   */
  minRemainder?: number;
  /** Célula com lado livre menor que isto gera aviso `cortina-celula-pequena` (m). Ausente = `CURTAIN_MIN_CELL` (0,15). */
  minCell?: number;
  /** Fase 4: lado do painel plano acima do qual o arco é refinado (m de corda). Ausente = deixa a grade mandar. */
  facetMaxChord?: number;
}

/** Valores padrão dos limiares (decisão do dono, §14.1): ponto de partida, editáveis em `CurtainSpec`. */
export const CURTAIN_MIN_REMAINDER = 0.05;
export const CURTAIN_MIN_CELL = 0.15;

// ───────────── Instância (§4.3) ─────────────

/** Linha de grade. Gerada (pelo índice na grade resolvida) ou extra (por id). */
export type LineRef =
  | { added: Id }
  | { axis: 'u' | 'v'; index: number; pos: number; n: number }; // index: 1..n-1; pos = posição/L (ou /H); n = nº de células do eixo na gravação

/** Segmento de uma linha, entre duas linhas que a cruzam (as bordas contam). */
export interface SegmentRef {
  line: LineRef;
  /** Índice do segmento ao longo da linha (0 = primeiro) e total na gravação. */
  k: number;
  nk: number;
  /** Posição normalizada do meio do segmento ao longo da linha (0..1). */
  mid: number;
}

/** Chave de célula: ÍNDICE mais POSIÇÃO NORMALIZADA (decisão do dono, item 3). */
export interface CellKey {
  /** Coluna (U), 0 = a primeira a partir do início. */
  i: number;
  /** Fileira (V), 0 = a de baixo. */
  j: number;
  /** s/L do centro da célula na gravação (0..1). */
  s: number;
  /** z/H do centro da célula na gravação (0..1). */
  z: number;
  /** Nº de colunas na gravação. */
  nu: number;
  /** Nº de fileiras na gravação. */
  nv: number;
}

export interface AddedGridLine {
  id: Id;
  axis: 'u' | 'v';
  /** Posição (m) a partir do início/base. */
  pos: number;
  /** `locked`: mantém a posição absoluta ao mudar L ou H. Senão acompanha a fração `pos/L` gravada. */
  locked?: boolean;
  /** Montante deste tipo em vez do interior do sistema; null = esta linha sem montante (como em LineOverride). */
  mullionTypeId?: Id | null;
  /** Linha criada por "Ajustar grade à porta" (§7.4): segue a célula-porta. */
  boundTo?: CellKey;
}

export interface LineOverride {
  line: LineRef;
  locked?: boolean;
  /** Nova posição (m). Só em linha gerada. */
  pos?: number;
  /** null = esta linha sem montante. */
  mullionTypeId?: Id | null;
}

// ───────────── Sobrescrita de célula (§4.3) ─────────────

export interface PanelCellOverride {
  kind: 'panel';
  panelTypeId: Id;
}

/** Porta ou janela na célula (decisão do dono, item 4). Definida agora, implementada na fase 5. */
export interface OpeningCellOverride {
  kind: 'opening';
  openingTypeId: Id;
  /** Mesma semântica de `Opening`: inverte a dobradiça e o sentido de abertura. */
  flipHand: boolean;
  flipFacing: boolean;
  /** 'cell' (padrão) = a esquadria assume o tamanho livre da célula; 'grid' = a grade foi ajustada ao tamanho nominal. */
  fit?: 'cell' | 'grid';
  /** Alinhamento da porta na célula original quando fit = 'grid'. */
  align?: 'center' | 'start' | 'end';
  /** Ids das `AddedGridLine` criadas para esta esquadria (a remoção da esquadria remove as linhas que sobraram sem uso). */
  linkedLines?: Id[];
  /** Altura de peitoril por instância (janela). Ausente = a base da célula. */
  sillOverride?: number | null;
  mark: string;
}

export type CellOverride = PanelCellOverride | OpeningCellOverride;

export interface CellOverrideEntry {
  key: CellKey;
  override: CellOverride;
}

// ───────────── Hospedagem (§4.3, fase 5) ─────────────

export interface CurtainHost {
  /** Parede comum que recebe a cortina. Se for apagada, a cortina é promovida a independente (§8.3). */
  wallId: Id;
  /** Centro do vão ao longo do hospedeiro, a partir de `a` (m). */
  offset: number;
  width: number;
  /** Base do vão sobre a base do hospedeiro (m) e altura do vão (m). */
  sill: number;
  height: number;
}

export interface CurtainInstance {
  /** Sobrescreve o eixo U e/ou V do tipo, campo a campo (campo ausente herda do tipo). */
  grid?: { u?: Partial<GridAxisSpec>; v?: Partial<GridAxisSpec> };
  defaultPanelTypeId?: Id;
  addedLines?: AddedGridLine[];
  removedSegments?: SegmentRef[];
  lineOverrides?: LineOverride[];
  cells?: CellOverrideEntry[];
  host?: CurtainHost;
}

/**
 * Subelemento da parede cortina escolhido com o Tab (ADR 0056, fase 2, §10): a parede continua sendo a seleção comum e isto é o que está
 * dentro dela (linha de grade, segmento de uma linha ou célula). Vive no estado do editor, não no projeto: nada aqui é gravado.
 */
export type SubelementoCortina =
  | { wallId: Id; kind: 'line'; line: LineRef }
  | { wallId: Id; kind: 'segment'; segment: SegmentRef }
  | { wallId: Id; kind: 'cell'; cell: CellKey };

/** Limites do §4.3: acima disso o Rust devolve `LIMITE` e o app avisa. */
export const CURTAIN_LIMITS = {
  addedLines: 128,
  removedSegments: 1024,
  lineOverrides: 256,
  cells: 1024,
  positions: 128,
  cellsPerCurtain: 4096,
  linesPerAxis: 128,
} as const;
