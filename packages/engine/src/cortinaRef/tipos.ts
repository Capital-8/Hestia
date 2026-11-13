/**
 * Tipos LOCAIS de entrada da referência TS da parede cortina (decisão 0056, §4.2 e §4.3, fase 1).
 * Espelham `CurtainSpec`/`GridAxisSpec`/`MullionType`/`CurtainPanelType`/`CurtainInstance` do ADR, só com o que a
 * fase 1 usa. NÃO importam `@hestia/model`: quando os tipos oficiais existirem, troque este arquivo por reexportações
 * (os nomes dos campos são os do ADR) e deixe `CortinaEntrada` como o contrato dos testes de paridade.
 * A referência é usada SÓ por testes de paridade; o app nunca a chama.
 */

export type GridLayoutMode = 'fixedNumber' | 'fixedDistance' | 'maxDistance' | 'manual';
export type GridJustify = 'start' | 'center' | 'end';
export type GridAnchor = 'start' | 'end';

export interface GridAxisSpec {
  mode: GridLayoutMode;
  count?: number;
  distance?: number;
  justify?: GridJustify;
  positions?: number[];
  anchor?: GridAnchor;
  offset?: number;
  /** Só 0 até a fase 7; outro valor é ENTRADA. */
  angle?: number;
  /** Sobra menor que isto é fundida à célula vizinha (m). Ausente = `CURTAIN_MIN_REMAINDER`. */
  minRemainder?: number;
}

export type MullionShape = 'rect' | 'round' | 'L' | 'trapezoid' | 'corner';

export interface MullionProfile {
  shape: MullionShape;
  width: number;
  depth: number;
  thickness?: number;
  widthBack?: number;
}

/** `MullionType` do ADR mais as duas chaves numéricas que o contrato Rust usa (`id_num`, `material_num`). */
export interface MullionTypeRef {
  id: string;
  num: number;
  profile: MullionProfile;
  materialId: string;
  materialNum: number;
  offset?: number;
}

export interface CurtainMullions {
  interiorVertical: string | null;
  interiorHorizontal: string | null;
  borderStart: string | null;
  borderEnd: string | null;
  borderBottom: string | null;
  borderTop: string | null;
  corner: string | null;
  joinPriority: 'vertical' | 'horizontal';
}

export type CurtainPanelKind = 'glass' | 'solid' | 'empty';

export interface CurtainPanelTypeRef {
  id: string;
  num: number;
  kind: CurtainPanelKind;
  thickness: number;
  offset?: number;
  /** Quanto o painel entra no montante (m). Ausente = `CURTAIN_PANEL_BITE`. */
  bite?: number;
  materialId: string;
  materialNum: number;
}

export interface CurtainSpec {
  depth: number;
  u: GridAxisSpec;
  v: GridAxisSpec;
  mullions: CurtainMullions;
  defaultPanelTypeId: string;
  /** Célula com lado livre menor que isto gera aviso (m). Ausente = `CURTAIN_MIN_CELL`. */
  minCell?: number;
}

/**
 * Linha de grade (ADR §4.3). Gerada: eixo, índice 1..n-1 na grade gerada, posição normalizada (s/L ou z/H) e `n` (nº de
 * células do eixo na gravação). Extra: id da `AddedGridLine`.
 */
export type LineRef = { added: string } | { axis: 'u' | 'v'; index: number; pos: number; n: number };

/** Segmento de uma linha, entre duas linhas que a cruzam. `k` 0 = primeiro; `mid` = posição normalizada do meio (0..1). */
export interface SegmentRef {
  line: LineRef;
  k: number;
  nk: number;
  mid: number;
}

/** Chave de célula: índice MAIS posição normalizada do centro na gravação (ADR §4.4). */
export interface CellKey {
  i: number;
  j: number;
  s: number;
  z: number;
  nu: number;
  nv: number;
}

/**
 * Linha extra. `pos` é em metros a partir do início/base, medida quando o eixo tinha `comprimentoGravado` (m).
 * `locked` = posição absoluta; senão a fração `pos/comprimentoGravado` acompanha o eixo ("esticar com a parede").
 * Decisão desta referência: o ADR não põe o comprimento da gravação no tipo; sem ele, a posição é absoluta.
 */
export interface AddedGridLine {
  id: string;
  axis: 'u' | 'v';
  pos: number;
  locked?: boolean;
  mullionTypeId?: string;
  comprimentoGravado?: number;
}

/** Sobrescrita de linha. `pos` só vale em linha gerada (em linha extra é ENTRADA). `mullionTypeId: null` = sem montante. */
export interface LineOverride {
  line: LineRef;
  locked?: boolean;
  pos?: number;
  mullionTypeId?: string | null;
  comprimentoGravado?: number;
}

export interface PanelCellOverride {
  kind: 'panel';
  panelTypeId: string;
}

/** Porta ou janela na célula (fase 5). Só o tipo está aqui; a referência de fase 2 recusa com ENTRADA. */
export interface OpeningCellOverride {
  kind: 'opening';
  openingTypeId: string;
  flipHand: boolean;
  flipFacing: boolean;
}

export type CellOverride = PanelCellOverride | OpeningCellOverride;

export interface CellOverrideEntry {
  key: CellKey;
  override: CellOverride;
}

/**
 * Instância (ADR §4.3). `grid` sobrescreve o tipo campo a campo; o resto são as edições da fase 2.
 * A ordem de cada lista é a ordem de gravação: os resultados do remapeamento são por posição nessas listas.
 */
export interface CurtainInstanceRef {
  grid?: { u?: Partial<GridAxisSpec>; v?: Partial<GridAxisSpec> };
  defaultPanelTypeId?: string;
  addedLines?: AddedGridLine[];
  removedSegments?: SegmentRef[];
  lineOverrides?: LineOverride[];
  cells?: CellOverrideEntry[];
}

/** Um caso completo: o plano da cortina (L × H, de `wallZRange` e do eixo), o tipo, a instância e as tabelas de tipos. */
export interface CortinaEntrada {
  nome?: string;
  /** `cortina_num` das saídas. Ausente = 1. */
  num?: number;
  /** Comprimento do eixo (m) e altura (m). Ambos > 0. */
  L: number;
  H: number;
  tipo: CurtainSpec;
  instancia?: CurtainInstanceRef;
  montantes: MullionTypeRef[];
  paineis: CurtainPanelTypeRef[];
}

export const CURTAIN_MIN_REMAINDER = 0.05;
export const CURTAIN_MIN_CELL = 0.15;
export const CURTAIN_PANEL_BITE = 0.012;
/** Soldagem: linhas a menos disto viram uma; peça com comprimento menor que isto não existe. */
export const TOL_SOLDA = 1e-6;
/** Comparação de limiar e razão (sobra, divisão A/d): absorve só ruído de ponto flutuante. */
export const EPS_CMP = 1e-9;
/** Marca "sem tipo" nas colunas u32 (o `ID_AUSENTE` do esquema Rust). */
export const ID_AUSENTE = 4294967295;

export function erroEntrada(msg: string): Error {
  return new Error(`ENTRADA: ${msg}`);
}

/** Limites do §4.3 e do §6.4: acima disso o Rust devolve `LIMITE`. */
export const LIMITES = {
  addedLines: 128,
  removedSegments: 1024,
  lineOverrides: 256,
  cells: 1024,
  linhasPorEixo: 128,
  celulas: 4096,
} as const;

export function erroLimite(msg: string): Error {
  return new Error(`LIMITE: ${msg}`);
}

/** Leitura de vetor sob `noUncheckedIndexedAccess`: o índice é sempre válido por construção. */
export function at<T>(a: readonly T[], i: number): T {
  return a[i] as T;
}
