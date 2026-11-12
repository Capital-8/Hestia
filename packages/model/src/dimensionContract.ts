import type { Vec2 } from '@hestia/geom';
import type { Id } from './types.ts';

/**
 * CONTRATO do redesenho de cotas (docs/cotas/CONTRATO.md). Só tipos: as frentes B..G implementam contra eles.
 * Mudar este arquivo só com autorização do orquestrador.
 */

/** Feição de um elemento a que uma ponta de cota se prende (a cota acompanha o elemento). */
export type DimFeature =
  | 'wall-axis-a' | 'wall-axis-b'          // extremidades do eixo da parede
  | 'wall-face-lo' | 'wall-face-hi'        // faces da parede (perpendicular ao eixo)
  | 'opening-edge-a' | 'opening-edge-b'    // bordas da esquadria ao longo da parede
  | 'opening-center'
  | 'vertex' | 'edge'                      // vértice/aresta genérico (laje, escada, rampa...) indexado por `index`
  | 'part';                                // ponto de apoio de escada, rampa ou guarda-corpo, nomeado por `key` (ver dimensionRefs.ts)

/** Referência genérica a um elemento. Convive com o `DimensionRef` antigo (parede+ponta), distinto por `elementId`. */
export interface DimensionElementRef {
  elementId: Id;
  feature: DimFeature;
  /** Índice do vértice/aresta quando `feature` é 'vertex' | 'edge'. */
  index?: number;
  /** Nome do ponto de apoio quando `feature` é 'part' (ex.: `d0.t3.v1` = vértice 1 do degrau 3 do lance 0). */
  key?: string;
}

/** Marcador de ponta de cota. */
export type DimTick = 'slash' | 'arrow' | 'dot' | 'arrow-open' | 'arrow-filled';

/**
 * Convenção de leitura do valor (Revit: "Read Convention").
 * - `aligned`: acompanha o ângulo da linha de cota (padrão histórico), sempre legível por baixo/à esquerda;
 * - `upright`: igual a `aligned`, sem nunca ficar de cabeça para baixo (o mesmo clamp, explícito na família);
 * - `horizontal`: sempre horizontal, inclusive nas cotas verticais (comum em prancha de arquitetura).
 */
export type DimReadConvention = 'aligned' | 'upright' | 'horizontal';

/**
 * O que fazer com o valor quando ele não cabe no trecho.
 * - `leader`: afasta com linha de chamada e empilha em pistas (padrão histórico);
 * - `inside`: mantém centrado mesmo apertado (não afasta);
 * - `outside`: sempre fora da linha, com linha de chamada.
 */
export type DimTextFit = 'leader' | 'inside' | 'outside';

/**
 * Estilo de cotas (aparência). Medidas em mm de PAPEL (a escala da vista converte para o modelo).
 * É o corpo de uma **família de cotas** (`DimensionFamily`) e, no projeto antigo, o estilo global
 * (`ProjectSettings.dimensionStyle`). Campos da `Dimension` individual, quando presentes, sobrepõem o estilo.
 */
export interface DimensionStyle {
  tick: DimTick;
  /** Tamanho do marcador (mm de papel). */
  tickSize: number;
  textHeight: number;
  /** Família de fonte do texto (CAD: monoespaçada/técnica). */
  font: string;
  /** Folga entre a linha de extensão e o elemento (mm de papel). */
  extensionGap: number;
  /** Quanto a linha de extensão passa da linha de cota (mm de papel). */
  extensionOvershoot: number;
  /** Texto sobre a linha ('above'), centrado interrompendo-a ('centered'). */
  textPlacement: 'above' | 'centered';
  /** Folga entre a linha de cota e o texto 'above' (mm de papel). */
  textGap: number;
  /** Orientação de leitura do valor. */
  readConvention: DimReadConvention;
  /** Quando o texto não cabe no trecho: linha de chamada, dentro ou sempre fora. */
  textFit: DimTextFit;
  /** Quando o texto não cabe no trecho: usar linha de chamada (leader) e empilhar. */
  leaderWhenNoFit: boolean;
  /** Distância mínima entre linhas de cota empilhadas (mm de papel). */
  stackSpacing: number;
  unit: 'project' | 'm' | 'cm' | 'mm';
  precision: 0 | 1 | 2 | 3;
  prefix: string;
  suffix: string;
}

/** Resultado de resolver uma referência numa vista. `null` = elemento sumiu ou feição inválida. */
export type ResolvedDimPoint = Vec2 | null;

/**
 * Vista que hospeda cotas (planta de piso, planta de área, corte, elevação). Cada vista informa como projetar
 * o modelo para o plano 2D da cota; o desenho, o hit test e a edição são os MESMOS para todas.
 */
export interface DimensionViewAdapter {
  kind: 'plan' | 'area' | 'section' | 'elevation';
  /** Escala de impressão (1:n) da vista. */
  scale: number;
  /** Ponto 3D do modelo (x, y, z em m) -> coordenada 2D da vista onde a cota vive. */
  project(p: { x: number; y: number; z: number }): Vec2;
  /** Inverso quando faz sentido (plano de corte fixa a profundidade); `null` se a vista não permitir. */
  unproject(p: Vec2): { x: number; y: number; z: number } | null;
}

/** Resultado de editar o valor de uma cota (cota dirigida): comandos puros ou o motivo da recusa. */
export type DrivenEdit =
  | { ok: true; commands: unknown[] }   // `Command[]` de commands.ts (tipo frouxo aqui para não criar ciclo)
  | { ok: false; reason: string };
