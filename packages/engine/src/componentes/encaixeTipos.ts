import type { Vec2 } from '@hestia/geom';

/*
 * Contrato do solucionador de encaixe (PLANO-MODELAGEM-FLUIDA, F2). Tudo puro, numérico e em METROS e RADIANOS (nada de Project, nada de
 * THREE): é a fronteira que migra para Rust. Sistema local do móvel: x = largura, y = profundidade com a FRENTE em y = 0 e o FUNDO em
 * y = profundidade, z = altura. Mundo (planta): ponto = R(rotation) · E · local + (x, y), com E espelhando o eixo X local quando `mirrored`
 * (a mesma regra de `instancia.ts`). A frente do móvel aponta para a direção R · (0, −1) do mundo (E não muda y).
 */

/** Onde o móvel está: igual aos campos de `Component`. */
export interface Pose {
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
  /** Elevação da base sobre o nível (m). */
  z: number;
}

/** Caixa do móvel no sistema local (m). Pode ter y mínimo negativo (porta que sobra à frente). */
export interface CaixaLocal {
  min: [number, number, number];
  max: [number, number, number];
}

/** Um móvel para o encaixe: id, pose e caixa. */
export interface Corpo {
  id: string;
  pose: Pose;
  caixa: CaixaLocal;
}

/** Face de parede no plano: segmento orientado de `a` para `b`; a PARTE LIVRE da sala fica à ESQUERDA de a→b. */
export interface FaceDeParede {
  a: Vec2;
  b: Vec2;
}

/** Resultado de encaixar na parede. */
export interface EncaixeNaParede {
  pose: Pose;
  /** Índice da face usada na lista recebida. */
  face: number;
  /** Distância (m) que o fundo do móvel tinha da face antes do encaixe (≥ 0). */
  distancia: number;
}

/** Lado do vizinho a que o móvel se uniu. */
export type LadoDeUniao = 'esquerda' | 'direita';

export interface EncaixeNoVizinho {
  pose: Pose;
  vizinho: string;
  /** Lado do PRÓPRIO móvel (no sistema dele) que toca o vizinho. */
  lado: LadoDeUniao;
  /** Folga (m) entre as faces após o encaixe (0 = encostados). */
  folga: number;
}

/** Linha de guia a desenhar durante o arrasto. */
export interface Guia {
  tipo: 'frente' | 'fundo' | 'esquerda' | 'direita' | 'centro-x' | 'centro-y';
  a: Vec2;
  b: Vec2;
  /** Id do móvel com que alinha. */
  com: string;
}

/** Resultado de `colisoes`. */
export interface Colisoes {
  /** Ids dos móveis cuja caixa invade a deste (sobreposição em planta E em altura; encostar não conta). */
  moveis: string[];
  /** Índices das faces de parede que o móvel atravessa (o móvel passa da face para o lado de dentro da parede). */
  paredes: number[];
}

/** Resultado de `preencherVao`. */
export interface PreenchimentoDeVao {
  /** Larguras (m) dos módulos escolhidos, em ordem não crescente. */
  modulos: number[];
  /** Largura (m) do painel de enchimento que fecha a conta (0 = vão exato). */
  painel: number;
  /** Vão não coberto (m): sobra < `painelMin` que não coube nem como painel; 0 quando fechou. */
  sobra: number;
}

/**
 * Posição de um módulo ao longo de uma fila. Seja d = (b − a)/|b − a| e a parte livre da sala à ESQUERDA de a→b. Cada módulo fica com o
 * FUNDO (y = profundidade) sobre a linha e a FRENTE voltada para a esquerda de d; a rotação é `atan2(−d.y, −d.x)` (o x local corre
 * no sentido de −d), `mirrored` falso. Visto de frente, o módulo de índice 0 é o que está mais perto de `a`... e ocupa, ao longo da
 * linha, o trecho [inicio, inicio + largura] medido de `a`. A origem local (x = 0, y = 0) cai no ponto da linha a
 * `inicio + largura` de `a`, deslocado `profundidade` para a esquerda de d.
 */
export interface PosicaoNaFila {
  indice: number;
  /** Distância (m) de `a` ao início do trecho do módulo, ao longo da linha. */
  inicio: number;
  largura: number;
  pose: Pose;
}
