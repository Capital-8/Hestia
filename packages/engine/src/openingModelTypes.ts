import type { OpeningGlassKind } from '@hestia/model';
/**
 * Modelo único da esquadria (docs/aberturas/E-spec-modelo-unico.md). Planta, corte, elevação, 3D e prévia do diálogo
 * desenham as MESMAS peças; nenhuma vista recalcula posição de batente, folha, vidro ou maçaneta por conta própria.
 *
 * Coordenadas locais do vão (metros):
 * - `t` ao longo da parede, 0 no centro do vão, positivo na direção `u` da parede;
 * - `s` na profundidade, 0 no plano médio da parede (a metade da espessura total), positivo para o lado de `n`
 *   (as faces da parede ficam em `±thickness/2`);
 * - `z` na altura, 0 na soleira do vão (o `sill` do tipo/instância), positivo para cima. A soleira de porta é z = 0.
 */

/** Papel da peça: define o desenho (hachura de corte, espessura de traço) e quais vistas a mostram. */
export type PartRole =
  | 'jamb' // ombreira do batente (cada lado)
  | 'stop' // batedor/rebaixo do batente
  | 'head' // travessa superior do batente
  | 'sillFrame' // travessa inferior do caixilho (janela)
  | 'threshold' // soleira de porta
  | 'leaf' // folha (porta ou janela)
  | 'leafPanel' // almofada/aleta/grelha (detalhe da folha)
  | 'glass'
  | 'muntin' // montante/travessa de divisão do vidro
  | 'mullion' // divisor de colunas do quadro (composição)
  | 'transom' // divisor de linhas do quadro (composição)
  | 'bead' // baguete do vidro (composição)
  | 'handle'
  | 'casing' // alizar
  | 'hinge' // dobradiça (ferragem)
  | 'sillBoard' // peitoril saliente
  | 'lintel' // verga
  | 'sillBeam' // contraverga
  | 'track' // trilho (correr, seccionada)
  | 'pocket'; // cavidade da porta de embutir (tracejada, dentro da parede)

/** Material lógico; o desenhista resolve para o `materialId` do tipo (`frame`, `glass`) ou do projeto. */
export type PartMaterial = 'frame' | 'leaf' | 'glass' | 'concrete' | 'casing' | 'metal';

/** Caixa alinhada aos eixos locais (`t0 < t1`, `s0 < s1`, `z0 < z1`), no estado FECHADO. */
export interface PartBox {
  t0: number;
  t1: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/**
 * Movimento da peça do estado fechado para o aberto.
 * - `rotate`: gira em torno do eixo vertical (`axis: 'z'`, passa por (t, s)) ou do eixo horizontal paralelo a `t`
 *   (`axis: 't'`, passa por (s, z)). `sign` (±1) diz para que lado o ângulo positivo leva a peça; o ângulo (rad)
 *   é dado por quem desenha (`OpenState.angle`).
 * - `slide`: desliza `travel` metros na direção unitária (`dt`, `ds`, `dz`); a fração aberta vem de `OpenState.slide`.
 */
export type PartMotion =
  | { kind: 'rotate'; axis: 'z'; t: number; s: number; sign: 1 | -1 }
  | { kind: 'rotate'; axis: 't'; s: number; z: number; sign: 1 | -1 }
  | { kind: 'slide'; dt: number; ds: number; dz: number; travel: number }
  /**
   * Folha dobrável/sanfonada: painéis articulados em cadeia a partir de uma ombreira. `index` (0..) é a posição do painel na
   * cadeia, `tAnchor` a posição t da ombreira fixa, `dir` o sentido de t em que a cadeia se estende no estado fechado, `s` o
   * plano médio da folha e `panelWidth` a largura de cada painel. Com ângulo θ os painéis alternam ±θ e a ponta livre recua.
   * `sign` leva o ângulo positivo para o lado de abertura.
   */
  | { kind: 'fold'; tAnchor: number; dir: 1 | -1; s: number; sign: 1 | -1; index: number; panelWidth: number };

/**
 * Seção da peça, para peças que não são caixas (batente com rebaixo). `plane 'ts'`: `pts` são (t, s) e a peça é extrudada em z entre
 * `box.z0` e `box.z1` (ombreira); `plane 'sz'`: `pts` são (s, z), extrudada em t entre `box.t0` e `box.t1` (travessa). `box` é sempre a caixa
 * envolvente exata do prisma. Uma peça com `profile` é UMA peça física (não duas caixas coladas).
 *
 * `plane 'tz'`: `pts` são (t, z) e a peça é extrudada em s entre `box.s0` e `box.s1` (disco ou cilindro com eixo perpendicular
 * à folha: roseta, haste, bola).
 */
export interface PartProfile {
  plane: 'ts' | 'sz' | 'tz';
  pts: Array<[number, number]>;
}

export interface OpeningPart {
  /** Estável entre chamadas (ex.: 'jamb-left', 'leaf-0', 'glass-0-1'). */
  id: string;
  role: PartRole;
  material: PartMaterial;
  box: PartBox;
  /** Seção não retangular (batente). Ausente = a peça é a própria caixa. */
  profile?: PartProfile;
  /** Peças com o mesmo `group` formam UMA peça física: o desenho une os contornos (ex.: alizar de 3 lados). */
  group?: string;
  /** Ausente = peça fixa. */
  motion?: PartMotion;
  /** Índice da folha a que pertence (folha, vidro, divisões e maçaneta dela se movem juntos). */
  leaf?: number;
  /** Desenhar tracejada (peça oculta/abaixo/acima): cavidade de embutir, trilho, projeção do portão. */
  dashed?: boolean;
  /** Tipo de vidro da peça de vidro (`role` 'glass'): simples = o do tipo; composição = o da célula. Ausente = incolor. */
  glassKind?: OpeningGlassKind;
}

/** Como a folha se abre, para as linhas de abertura (V) e o arco de giro. */
export interface LeafOpening {
  leaf: number;
  kind: 'side' | 'top' | 'bottom' | 'pivot' | 'slide' | 'fold' | 'overhead' | 'louver' | 'tilt' | 'fixed';
  /** Altura (z local) do eixo horizontal da janela basculante (`kind 'tilt'`). */
  axisZ?: number;
  /** Abre para os dois lados (porta vai-e-vem): `side` é o lado principal. */
  both?: boolean;
  /** Eixo do deslizamento: 't' (horizontal, padrão) ou 'z' (vertical: guilhotina, portão seccionado). */
  slideAxis?: 't' | 'z';
  /** Lado em que a folha abre: +1 para o lado de `n`, −1 para o oposto. 0 em correr/fixa. */
  side: 1 | -1 | 0;
  /** Posição t da dobradiça (giro lateral/pivô) ou 0. */
  hingeT: number;
  /** Posição t do lado oposto à dobradiça (trinco). */
  latchT: number;
  /** Eixo do giro em planta (t, s) e raio do arco (comprimento da folha). */
  pivot: { t: number; s: number };
  radius: number;
  /** Faixa em z da folha, para o V em elevação. */
  z0: number;
  z1: number;
}

/**
 * Ferragem que não coube inteira no contorno (docs/estudo-esquadrias/42): `pedido` é o que o tipo pede (dobradiças de uma folha, ou 1
 * maçaneta) e `colocado` o que ficou presa à folha (0 = nenhuma). Nada fica solto: o que não tem onde prender sai e o aviso fica.
 */
export interface FerragemAviso {
  tipo: 'hinge' | 'handle';
  /** Chave da folha no id das peças (`hinge-<folha>-<k>`, `handle-<folha>-...`). */
  folha: string;
  pedido: number;
  colocado: number;
}

export interface OpeningModel {
  kind: 'door' | 'window';
  /** Vão nominal (largura × altura do tipo) e espessura total da parede. */
  width: number;
  height: number;
  thickness: number;
  /** Centro e extensão (s) do núcleo da parede onde o batente se assenta (DEC-1). */
  core: { s0: number; s1: number };
  parts: OpeningPart[];
  openings: LeafOpening[];
  /** Vão livre: sem folha nem caixilho; `parts` traz só o que o vão tem (soleira, verga). */
  void: boolean;
  /** Só em vão com forma: ferragem reduzida ou removida porque a folha não tem onde prendê-la. Ausente = nada reduzido. */
  ferragemAvisos?: FerragemAviso[];
}

/** Estado de abertura pedido ao transformar uma peça: ângulo em radianos (folhas que giram) e fração 0..1 (correr). */
export interface OpenState {
  angle: number;
  slide: number;
}

export const CLOSED: OpenState = { angle: 0, slide: 0 };
