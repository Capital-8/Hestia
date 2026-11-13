/**
 * Contrato de entrada da parede cortina para o kernel Rust (ADR 0056 §4.2 e §4.3): só tipos, sem código. Os campos seguem os nomes do modelo; o
 * adaptador `kernelCortina.ts` os converte nas seções do kernel.
 */
import type { ExtremidadeCortinaKernel } from './cortinaExtremidades.ts';
import type { ENUM_CORTINA } from './kernelCortinaTabelas.ts';

// ───────────── entrada (contrato; os campos seguem o ADR 0056 §4.2 e §4.3) ─────────────

export type ModoGradeKernel = 'fixedNumber' | 'fixedDistance' | 'maxDistance' | 'manual';

/** Um eixo da grade. Na instância todo campo é opcional (ausente = herda do tipo); no tipo, só `mode` é obrigatório. */
export interface EixoGradeKernel {
  mode: ModoGradeKernel;
  count?: number;
  distance?: number;
  justify?: 'start' | 'center' | 'end';
  positions?: number[];
  anchor?: 'start' | 'end';
  offset?: number;
  angle?: number;
  minRemainder?: number;
}

/** Sobrescrita de eixo da instância: qualquer campo, inclusive `mode`. */
export type EixoGradeParcialKernel = Partial<EixoGradeKernel>;

export interface MontanteKernel {
  id: string;
  shape: 'rect' | 'round' | 'L' | 'trapezoid' | 'corner';
  width: number;
  depth: number;
  thickness?: number;
  widthBack?: number;
  offset?: number;
  position?: 'normalToFace' | 'parallelToGround';
  materialId?: string | null;
}

export interface PainelKernel {
  id: string;
  kind: 'glass' | 'solid' | 'empty';
  thickness: number;
  offset?: number;
  /** Quanto o painel entra no montante (m). Ausente = o padrão do Rust (0,012). */
  bite?: number;
  materialId?: string | null;
  /** Tipo de vidro do modelo, como número (informativo). */
  glassKind?: number;
}

export interface MontantesDoTipoKernel {
  interiorVertical: string | null;
  interiorHorizontal: string | null;
  borderStart: string | null;
  borderEnd: string | null;
  borderBottom: string | null;
  borderTop: string | null;
  corner: string | null;
  joinPriority: 'vertical' | 'horizontal';
}

export interface TipoCortinaKernel {
  id: string;
  depth: number;
  u: EixoGradeKernel;
  v: EixoGradeKernel;
  mullions: MontantesDoTipoKernel;
  defaultPanelTypeId: string;
  /** Célula livre com lado menor que isto gera aviso (m). Ausente = o padrão do Rust (0,15). */
  minCell?: number;
  facetMaxChord?: number;
  chainGrid?: 'segment' | 'chain';
}

export interface CortinaKernel {
  id: string;
  /** `nivel_num`: o índice do nível em `p.levels`. */
  levelNum: number;
  typeId: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Cota absoluta da base e altura (vêm de `wallZRange`; a cortina não as calcula). */
  zBase: number;
  height: number;
  sag?: number;
  flipped?: boolean;
  locationLine?: keyof typeof ENUM_CORTINA.locationLine;
  grid?: { u?: EixoGradeParcialKernel; v?: EixoGradeParcialKernel };
  defaultPanelTypeId?: string | null;
  /** Sobrescritas da fase 2 (ADR 0056 §4.3), na forma que o kernel recebe. */
  sobrescritas?: SobrescritasCortinaKernel;
  /**
   * Vizinhança das duas pontas (fase 3, seção 110): início e fim. Ausente = nenhuma vizinha nas duas (a cortina termina no eixo do nó, como na fase 2).
   * `noJoin` de cada ponta vem do modelo (`Wall.noJoinStart/End`).
   */
  extremidades?: readonly ExtremidadeCortinaKernel[];
  /** Cortina embutida numa parede comum (fase 5, seção 113): o vão no hospedeiro. A posição da cortina (a, b, zBase, height) já é o espelho dele. */
  hospedeiro?: HospedeiroCortinaKernel;
}

/** Vão da cortina embutida no hospedeiro (`CurtainHost` do modelo): centro ao longo do hospedeiro a partir de `a`, largura, peitoril sobre a base e altura (m). */
export interface HospedeiroCortinaKernel {
  wallId: string;
  offset: number;
  width: number;
  sill: number;
  height: number;
}

/** Esquadria numa célula (fase 5, seção 112): a chave da célula é a de `celulasSobrescritas`; `tipoAbertura` é o id de um tipo de `EntradaCenaCortina.tiposAbertura`. */
export interface EsquadriaCelulaKernel {
  i: number;
  j: number;
  nu: number;
  nv: number;
  s: number;
  z: number;
  tipoAbertura: string;
  flipHand: boolean;
  flipFacing: boolean;
  /** 'cell' (padrão) preenche a célula; 'grid' = a grade foi ajustada ao tamanho nominal. */
  fit?: 'cell' | 'grid';
  align?: 'center' | 'start' | 'end';
  /** Peitoril por instância (m). Ausente ou null = a base da região. */
  sillOverride?: number | null;
}

/** Tipo de abertura da seção 7 (`tipos_abertura`), sem `id_num`: as colunas por nome (ver `colunasDoTipoAbertura` de `kernelA3.ts`). */
export interface TipoAberturaKernel {
  id: string;
  valores: Readonly<Record<string, number>>;
}

/**
 * Sobrescritas de uma cortina (fase 2). `comprimentoGravado` é o comprimento do eixo na gravação (m): a posição de uma linha não travada acompanha a
 * fração `pos / comprimentoGravado`. Segmento de linha gerada: `linha` é o índice gravado (0 ou `n` é a borda), `posNorm` a posição normalizada da linha
 * e `n` o nº de células do eixo na gravação. Segmento de linha extra: `linha` é o `id` da extra.
 */
export interface SobrescritasCortinaKernel {
  linhasExtras?: readonly { id: string; eixo: 'u' | 'v'; pos: number; travada?: boolean; comprimentoGravado: number; montante?: string }[];
  segmentosRemovidos?: readonly { eixo: 'u' | 'v'; origem: 'gerada' | 'extra'; linha: number | string; posNorm?: number; n?: number; k: number; nk: number; mid: number }[];
  /** `montante`: ausente = herda do eixo; `null` = sem montante; um id = o tipo. */
  linhasSobrescritas?: readonly { eixo: 'u' | 'v'; linha: number; n: number; posNorm: number; pos?: number; travada?: boolean; comprimentoGravado: number; montante?: string | null }[];
  celulasSobrescritas?: readonly { i: number; j: number; nu: number; nv: number; s: number; z: number; painel: string }[];
  /** Esquadrias nas células (fase 5, seção 112). */
  esquadrias?: readonly EsquadriaCelulaKernel[];
}

export type { ExtremidadeCortinaKernel } from './cortinaExtremidades.ts';

export interface EntradaCenaCortina {
  montantes: readonly MontanteKernel[];
  paineis: readonly PainelKernel[];
  tipos: readonly TipoCortinaKernel[];
  cortinas: readonly CortinaKernel[];
  /** Tipos de abertura (seção 7) que as esquadrias das células referenciam; só os usados. */
  tiposAbertura?: readonly TipoAberturaKernel[];
  /** `hospedeiro_num` (a `id_num` da parede hospedeira na seção 1 do kernel das paredes) de uma cortina embutida; ausente ou sem resposta = `ID_AUSENTE`. */
  hospedeiroNum?: (wallId: string) => number | undefined;
  /** `material_num` de um material do modelo (o mesmo mapa da cena das paredes, se houver); `null` ou ausente = `ID_AUSENTE`. */
  materialNum?: (id: string | null | undefined) => number;
}

