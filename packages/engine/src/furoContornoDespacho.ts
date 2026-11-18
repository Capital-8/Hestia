import { outline, openingShapeOf, validateOpeningShape, type OpeningShapeInput, type OPt, type OpeningShape } from '@hestia/model';
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

/**
 * Alvo do furo da troca atômica (docs/estudo-esquadrias/25 e 26): UMA camada da parede = prismas em planta pós-junção, um por
 * faixa de altura. Anéis em [u, s] (u ao longo da parede, s na espessura), `z0`/`z1` relativos à base da parede. Espelha a ABI
 * `furo_prisma_furar`; no máximo 32 prismas por pedido (limite da ABI).
 */
export interface CamadaPrismaPedido {
  poligonos: Array<Array<Array<[number, number]>>>;
  z0: number;
  z1: number;
}

export interface PedidoFuroPrisma {
  wallId: string;
  camadas: CamadaPrismaPedido[];
  vaos: readonly VaoComContorno[];
}

/** Malha furada de um prisma (x = u, y = s, z relativo à base da parede). Índices locais ao prisma. */
export interface MalhaPrismaFurada {
  z0: number;
  z1: number;
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  volume: number;
  volumeSemFuro: number;
}

export interface ResultadoFuroPrisma {
  camadas: MalhaPrismaFurada[];
  volume: number;
  volumeRemovido: number;
}

/**
 * Retorno do acabamento que segue o contorno (`retorno_do_vao`, `ModoRetorno::Contorno`, docs/estudo-esquadrias/22 §1).
 * `espessura` e `recuo` (soma das camadas envolventes entre esta e o núcleo) vêm do tipo de parede; `y0`/`y1` é a faixa de s.
 */
export interface PedidoRetornoVao {
  contorno: readonly OPt[];
  x: number;
  soleira: number;
  espessura: number;
  recuo: number;
  y0: number;
  y1: number;
}

export interface ResultadoRetornoVao {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  volume: number;
  areaExposta: number;
}

/**
 * Porta do cliente do furo. `null` = não conseguiu (o chamador cai no caminho retangular). Os dois últimos métodos são
 * opcionais: sem `furarPrisma` o vão com forma fura em retângulo na hora de montar a camada; sem `retornoDoVao` não há retorno.
 */
export interface ClienteFuroContorno {
  furarParede(pedido: PedidoFuroParede): ResultadoFuroParede | null;
  furarPrisma?(pedido: PedidoFuroPrisma): ResultadoFuroPrisma | null;
  retornoDoVao?(pedido: PedidoRetornoVao): ResultadoRetornoVao | null;
}

let cliente: ClienteFuroContorno | null = null;
let versao = 0;
const memo = new Map<string, unknown>();
const MEMO_LIMITE = 256;

/** Instala (ou, com `null`, remove) o cliente do furo por contorno. É o ponto de injeção; sem ele tudo segue retangular. */
export function definirClienteFuroContorno(c: ClienteFuroContorno | null): void {
  cliente = c;
  versao++;
  memo.clear();
}

/** Muda a cada troca de cliente: entra nas chaves de cache de quem guarda o resultado do furo (3D). */
export const versaoClienteFuro = (): number => versao;

function memoizado<T>(chave: string, f: () => T): T {
  if (memo.has(chave)) return memo.get(chave) as T;
  const r = f();
  if (memo.size >= MEMO_LIMITE) memo.delete(memo.keys().next().value as string);
  memo.set(chave, r);
  return r;
}

/** Fura uma camada (prismas pós-junção) pelo cliente; `null` sem cliente, sem `furarPrisma`, sem vão ou em falha. Com memo por conteúdo. */
export function furarPrismaPorContorno(pedido: PedidoFuroPrisma): ResultadoFuroPrisma | null {
  const c = cliente;
  if (!c?.furarPrisma || pedido.vaos.length === 0 || pedido.camadas.length === 0) return null;
  return memoizado(`p|${JSON.stringify(pedido)}`, () => c.furarPrisma!(pedido));
}

/** Retorno do acabamento no contorno pelo cliente (memo); `null` sem cliente, sem `retornoDoVao` ou em falha. */
export function retornoPorContorno(pedido: PedidoRetornoVao): ResultadoRetornoVao | null {
  const c = cliente;
  if (!c?.retornoDoVao) return null;
  return memoizado(`r|${JSON.stringify(pedido)}`, () => c.retornoDoVao!(pedido));
}

/** O cliente instalado, ou `null` (o padrão). */
export const clienteFuroContorno = (): ClienteFuroContorno | null => cliente;

/**
 * `{ forma }` para `openingGeometry`: a forma efetiva do vão quando existe e é válida; `{}` (retangular) quando o tipo não tem
 * forma ou ela é inválida (o aviso `forma-vao-invalida` aponta o problema, o vão continua retangular).
 */
export function formaDoVao(t: OpeningShapeInput, height?: number): { forma?: OpeningShape } {
  const s = openingShapeOf(t, height);
  return s && validateOpeningShape(s).length === 0 ? { forma: s } : {};
}

/** Contexto da parede hospedeira que decide se o caminho de contorno é aplicável. */
export interface ParedeDoFuro {
  /** Inclinação da parede (graus); ≠ 0 não é suportada no caminho de contorno. */
  tilt?: number;
  /** Topo ou base em perfil (telhado, piso, laje): o prisma de planta é plano, então fica no caminho retangular. */
  perfil?: boolean;
  /** Parede do mesmo cluster é inclinada: a junção inclinada refaz as faixas, fica no caminho retangular. */
  clusterInclinado?: boolean;
}

/** Motivo de o vão com forma NÃO ir pelo contorno (para o aviso e a documentação). */
export type MotivoRetangular = 'sem-forma' | 'sem-cliente' | 'parede-curva' | 'parede-inclinada' | 'parede-com-perfil' | 'cluster-inclinado';

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
  if (parede.clusterInclinado) return { via: 'retangular', motivo: 'cluster-inclinado' };
  if (parede.perfil) return { via: 'retangular', motivo: 'parede-com-perfil' };
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
