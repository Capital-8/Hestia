import { outline, openingShapeOf, validateOpeningShape, type OPt, type OpeningShape, type OpeningType } from '@hestia/model';
import type { OpeningGeometry } from './types.ts';

/**
 * Despacho do furo da parede (docs/estudo-esquadrias/24): vão retangular segue o caminho de sempre (retângulo por faixa de
 * altura, `resolve.ts`); vão com forma de contorno livre segue o caminho novo (booleana 3D em Rust, `furo_contorno_furar`).
 *
 * O caminho novo só vale com um CLIENTE instalado (`definirClienteFuroContorno`). Hoje ninguém o instala (o cliente TypeScript
 * da ABI é de outra entrega), então toda rota é 'retangular' e os números são os de antes. O contrato abaixo espelha o layout
 * da ABI (docs/estudo-esquadrias/21 §4 e §5): x ao longo da parede, y na espessura, z para cima, metros.
 */

/** Um vão com forma, no referencial da parede (origem do contorno = meio da base do vão). */
export interface VaoComContorno {
  openingId: string;
  /** Anel [x, z] anti-horário e aberto, relativo à origem do vão. */
  contorno: readonly OPt[];
  /** Posição x da origem do contorno ao longo da parede (a partir de `a`): o `offset` do vão. */
  x: number;
  /** Cota z da origem do contorno acima da base da parede: o peitoril. */
  soleira: number;
}

export interface PedidoFuroParede {
  wallId: string;
  comprimento: number;
  altura: number;
  /** Espessura de cada camada em y crescente. */
  espessuras: readonly number[];
  vaos: readonly VaoComContorno[];
}

/** Malha de uma camada já furada (a mesma de `MalhaCamada` do Rust). Índices locais à camada. */
export interface MalhaCamadaFurada {
  y0: number;
  y1: number;
  vertices: Float64Array;
  indices: Uint32Array;
  volume: number;
  volumeSemFuro: number;
}

export interface ResultadoFuroParede {
  camadas: MalhaCamadaFurada[];
  volume: number;
  volumeRemovido: number;
}

/** Porta do cliente do furo. `null` = não conseguiu (o chamador cai no caminho retangular). */
export interface ClienteFuroContorno {
  furarParede(pedido: PedidoFuroParede): ResultadoFuroParede | null;
}

let cliente: ClienteFuroContorno | null = null;

/** Instala (ou, com `null`, remove) o cliente do furo por contorno. É o ponto de injeção; sem ele tudo segue retangular. */
export function definirClienteFuroContorno(c: ClienteFuroContorno | null): void {
  cliente = c;
}

/** O cliente instalado, ou `null` (o padrão). */
export const clienteFuroContorno = (): ClienteFuroContorno | null => cliente;

/**
 * `{ forma }` para `openingGeometry`: a forma efetiva do vão quando existe e é válida; `{}` (retangular) quando o tipo não tem
 * forma ou ela é inválida (o aviso `forma-vao-invalida` aponta o problema, o vão continua retangular).
 */
export function formaDoVao(t: Pick<OpeningType, 'width' | 'height' | 'roughOversize' | 'shape'>, height?: number): { forma?: OpeningShape } {
  const s = openingShapeOf(t, height);
  return s && validateOpeningShape(s).length === 0 ? { forma: s } : {};
}

/** Contexto da parede hospedeira que decide se o caminho de contorno é aplicável. */
export interface ParedeDoFuro {
  /** Inclinação da parede (graus); ≠ 0 não é suportada no caminho de contorno. */
  tilt?: number;
}

/** Motivo de o vão com forma NÃO ir pelo contorno (para o aviso e a documentação). */
export type MotivoRetangular = 'sem-forma' | 'sem-cliente' | 'parede-curva' | 'parede-inclinada';

export interface RotaDoVao {
  via: 'retangular' | 'contorno';
  motivo?: MotivoRetangular;
}

/**
 * Decide o caminho do furo de UM vão. 'contorno' exige forma válida, cliente instalado e parede reta e vertical (parede curva
 * ou inclinada e topo em perfil ficam no caminho retangular até haver decisão, docs/estudo-esquadrias/22 §4.2).
 */
export function rotaDoVao(g: Pick<OpeningGeometry, 'forma' | 'curve'>, parede: ParedeDoFuro = {}): RotaDoVao {
  if (!g.forma) return { via: 'retangular', motivo: 'sem-forma' };
  if (g.curve) return { via: 'retangular', motivo: 'parede-curva' };
  if (parede.tilt) return { via: 'retangular', motivo: 'parede-inclinada' };
  if (!cliente) return { via: 'retangular', motivo: 'sem-cliente' };
  return { via: 'contorno' };
}

/** Separa os vãos de uma parede pelo caminho do furo. Os retangulares seguem em `resolve.ts` sem mudança. */
export function vaosPorRota(opens: readonly OpeningGeometry[], wallId: string, parede: ParedeDoFuro = {}): { retangulares: OpeningGeometry[]; comContorno: OpeningGeometry[] } {
  const retangulares: OpeningGeometry[] = [];
  const comContorno: OpeningGeometry[] = [];
  for (const g of opens) {
    if (g.hostId !== wallId) continue;
    (rotaDoVao(g, parede).via === 'contorno' ? comContorno : retangulares).push(g);
  }
  return { retangulares, comContorno };
}

/** Monta o pedido do furo para os vãos com contorno de uma parede (o contorno vem de `outline`, cordas de 1 mm). */
export function pedidoFuroDaParede(wallId: string, parede: { comprimento: number; altura: number; espessuras: readonly number[] }, vaos: readonly OpeningGeometry[]): PedidoFuroParede {
  return {
    wallId,
    comprimento: parede.comprimento,
    altura: parede.altura,
    espessuras: parede.espessuras,
    vaos: vaos.filter((g) => g.forma).map((g) => ({ openingId: g.openingId, contorno: outline(g.forma!), x: g.offset, soleira: g.sill })),
  };
}

/**
 * Fura a parede pelo cliente instalado. `null` quando não há cliente, não há vão com contorno ou o cliente falha: o chamador
 * mantém o caminho retangular.
 */
export function furarParedePorContorno(pedido: PedidoFuroParede): ResultadoFuroParede | null {
  if (!cliente || pedido.vaos.length === 0) return null;
  return cliente.furarParede(pedido);
}
