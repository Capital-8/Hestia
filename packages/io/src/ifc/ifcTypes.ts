import type { Id } from '@hestia/model';

/** Ponto em planta, em metros (x para a direita, y para cima). */
export interface IfcPoint {
  x: number;
  y: number;
}

/** Anel sem o vértice de fechamento repetido. */
export type IfcRing = IfcPoint[];

/** Polígono: [contorno, ...furos]. */
export type IfcPolygon = IfcRing[];

/** Plano de cota absoluta: z = a·x + b·y + c (a = b = 0 é cota constante). */
export interface IfcPlane {
  a: number;
  b: number;
  c: number;
}

/** Sólido prismático entre duas faces planas (topo e fundo, cotas absolutas): piso, laje, água de telhado, degrau. */
export interface IfcPrism {
  polygon: IfcPolygon;
  top: IfcPlane;
  bottom: IfcPlane;
}

/** Parede resolvida: contornos em planta (união das camadas, sem vãos; um por pedaço) e cotas absolutas da base e da altura. */
export interface IfcWallGeo {
  wallId: Id;
  footprints: IfcPolygon[];
  baseZ: number;
  height: number;
}

/**
 * Peça da esquadria no sistema local do vão: `t` ao longo da parede (0 no centro), `s` na espessura (0 no eixo da
 * parede, positivo para o lado de `z × u`, a normal esquerda de `u`) e `z` acima do peitoril. É a mesma caixa do modelo
 * único do engine (`OpeningPart.box`), já resolvida em material do projeto.
 */
export interface IfcOpeningPartGeo {
  t0: number;
  t1: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  /** Material do projeto que dá cor/transparência à peça (batente, vidro, metal, concreto...). */
  materialId: Id;
  /** Papel no modelo único (`jamb`, `leaf`, `glass`, `muntin`, `handle`...), para diagnóstico e testes. */
  role?: string;
}

/**
 * Vão resolvido: eixo `u` ao longo da parede, centro em planta, esquadria (`width` × `height`), vão bruto (`roughWidth` ×
 * `roughHeight`, com `roughBottomZ` na cota absoluta) e cota absoluta do peitoril (`sillZ`). `thickness` é a espessura da parede.
 * `parts` é a esquadria detalhada do modelo único; quando ausente, o exportador mantém o corpo único de compatibilidade.
 */
export interface IfcOpeningGeo {
  openingId: Id;
  center: IfcPoint;
  u: IfcPoint;
  width: number;
  height: number;
  roughWidth: number;
  roughHeight: number;
  roughBottomZ: number;
  sillZ: number;
  thickness: number;
  parts?: IfcOpeningPartGeo[];
}

/** Lance de escada resolvido: peças do corpo (degraus, chegada, poste) e contagens. */
export interface IfcFlightGeo {
  componentIndex: number;
  pieces: IfcPrism[];
  treads: number;
  risers: number;
}

/** Escada resolvida: lances (IfcStairFlight), patamares (IfcSlab LANDING) e altura real do espelho. */
/** Lance da rampa resolvido: prisma do corpo (topo inclinado) e comprimento horizontal. */
export interface IfcRampFlightGeo {
  componentIndex: number;
  prism: IfcPrism;
  length: number;
}

/** Rampa resolvida: lances (IfcRampFlight), patamares (IfcSlab LANDING) e forma do percurso. */
export interface IfcRampGeo {
  rampId: Id;
  levelId: Id;
  shape: 'straight' | 'lshape' | 'ushape';
  slope: number;
  flights: IfcRampFlightGeo[];
  landings: IfcPrism[];
}

export interface IfcStairGeo {
  stairId: Id;
  levelId: Id;
  spiral: boolean;
  riserHeight: number;
  flights: IfcFlightGeo[];
  landings: IfcPrism[];
}

/** Lance da rampa resolvido: prisma do corpo (topo inclinado) e comprimento horizontal. */
export interface IfcRampFlightGeo {
  componentIndex: number;
  prism: IfcPrism;
  length: number;
}

/** Rampa resolvida: lances (IfcRampFlight), patamares (IfcSlab LANDING) e forma do percurso. */
export interface IfcRampGeo {
  rampId: Id;
  levelId: Id;
  shape: 'straight' | 'lshape' | 'ushape';
  slope: number;
  flights: IfcRampFlightGeo[];
  landings: IfcPrism[];
}

/**
 * Geometria RESOLVIDA do projeto, montada por quem pode importar o engine (apps/web): o io não importa o engine
 * (docs/01 §1). Pisos, lajes e águas de telhado vêm como prismas; as cotas são absolutas e o io as põe na cota do nível.
 */
export interface IfcGeometry {
  walls: IfcWallGeo[];
  openings: IfcOpeningGeo[];
  floors: Array<{ floorId: Id; prisms: IfcPrism[] }>;
  slabs: Array<{ slabId: Id; prisms: IfcPrism[] }>;
  ceilings?: Array<{ ceilingId: Id; prisms: IfcPrism[] }>;
  roofs: Array<{ roofId: Id; planes: IfcPrism[] }>;
  stairs: IfcStairGeo[];
  /** Rampas resolvidas. Ausente = nenhuma (mantém os montadores antigos de geometria válidos). */
  ramps?: IfcRampGeo[];
  /** Guarda-corpos resolvidos pelo kernel (malha por parte). Ausente = nenhum. */
  railings?: IfcGuardaCorpoGeo[];
  /**
   * Paredes cortina resolvidas pelo kernel (decisão 0056, §11). Ausente = nenhuma resolvida (sem kernel): a cortina sai como parede
   * genérica (`IFCWALL`, em `walls`) e o exportador registra o aviso.
   */
  curtains?: IfcCurtainGeo;
  /**
   * Massas conceituais resolvidas pelo kernel (ficha X1): a malha `lod 2` de cada massa, uma casca por cópia do arranjo. Ausente (ou massa que não
   * está na lista, por exemplo sem kernel) = a massa não é exportada e o exportador registra o aviso.
   */
  masses?: IfcMassaGeo[];
}

/** Massa conceitual resolvida pelo kernel: a malha `massa_malha` (lod 2) já separada por massa, com as quantidades de `quant_massa` quando existem. */
export interface IfcMassaGeo {
  massaId: Id;
  /** Posições (x, y, z de mundo) e índices de triângulos; as cascas das cópias do arranjo vão na mesma malha, uma depois da outra. */
  mesh: { positions: number[]; indices: number[] };
  /** Número de cascas (cópias do arranjo) na malha. */
  copias: number;
  /** Volume, áreas e altura somados sobre as cópias; ausente = sem `Pset_Hestia_Massa` de quantidades. */
  quantidades?: { volume: number; areaLateral: number; areaBase: number; areaTopo: number; altura: number };
}

/** Protótipo de montante ou de painel do kernel: uma geometria de comprimento unitário, compartilhada por todas as instâncias dele. */
export interface IfcCurtainPrototypeGeo {
  /** Número do protótipo na malha (chave das instâncias). */
  proto: number;
  /** 0 montante, 1 painel de vidro, 2 painel sólido (`PAPEL_MALHA_CORTINA`). */
  papel: 0 | 1 | 2;
  /** Tipo de montante (papel 0) ou de painel do modelo; `null` quando o kernel não o resolveu. */
  typeId: Id | null;
  /** Forma do perfil do montante (`corner` vira `USERDEFINED` com `ObjectType` `CORNER`); ausente nos painéis. */
  shape?: string;
  materialId: Id | null;
  /** Malha do protótipo em coordenadas locais (metros, comprimento unitário): posições em triplas x, y, z e índices de triângulos. */
  mesh: { positions: readonly number[]; indices: readonly number[] };
}

/** Instância de um protótipo: a matriz 3 × 4 (12 números, linha-maior, `[r0 r1 r2 t]`) que leva o protótipo ao mundo (cota absoluta). */
export interface IfcCurtainInstanceGeo {
  proto: number;
  matrix: readonly number[];
}

/** Quantitativos da cortina do motor (`quant_cortina`), já agregados por parede. */
export interface IfcCurtainQuantities {
  /** Comprimento do eixo (m). */
  length: number;
  /** Área bruta do sistema, L × H (em metros quadrados). */
  grossArea: number;
  /** Área de vidro visível (em metros quadrados), soma dos painéis de vidro. */
  glassArea: number;
  /** Área do painel sólido visível (em metros quadrados). */
  solidArea: number;
  /** Comprimento de montante somado (m), todos os papéis de montante. */
  mullionLength: number;
}

/** Parede cortina resolvida pelo kernel: contorno em planta (para a face externa), instâncias e quantitativos. */
export interface IfcCurtainWallGeo {
  wallId: Id;
  /** Contorno da cortina em planta (um polígono: [contorno]), para decidir se a face dá para fora. */
  footprint: IfcPolygon;
  instances: IfcCurtainInstanceGeo[];
  quantities: IfcCurtainQuantities;
}

/** Cortinas do projeto resolvidas pelo kernel: os protótipos (globais, um por tipo de montante ou de painel) e as paredes. */
export interface IfcCurtainGeo {
  prototypes: IfcCurtainPrototypeGeo[];
  walls: IfcCurtainWallGeo[];
}

/** Papel de uma parte do guarda-corpo, como em `guarda_malha` (ADR 0055 §6.2). */
export type IfcPapelGC = 'poste' | 'balaustre' | 'trilho' | 'corrimao' | 'suporte' | 'painel' | 'cabo' | 'travessa';

/** Grupo de malha de um guarda-corpo (papel + material): posições em metros, cota absoluta, índices 0-based de triângulos. */
export interface IfcParteGC {
  papel: IfcPapelGC;
  materialId: Id;
  mesh: { positions: readonly number[]; indices: readonly number[] };
  /** Painel de vidro (`CURTAIN_PANEL`); os demais painéis saem `SHEET`. */
  vidro?: boolean;
  /** Número de peças no grupo (balaústres, painéis...), só para o nome. */
  pecas?: number;
}

/** Guarda-corpo resolvido pelo kernel: a malha de `guarda_malha` já separada por guarda-corpo, mais o comprimento. */
export interface IfcGuardaCorpoGeo {
  guardaId: Id;
  partes: IfcParteGC[];
  /** Comprimento desenvolvido (m) de `quant_guarda`; ausente = sem `Qto_RailingBaseQuantities`. */
  comprimentoDesenvolvido?: number;
}
