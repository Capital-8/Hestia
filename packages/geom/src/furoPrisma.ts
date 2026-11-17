/**
 * Furo do prisma em planta da camada: cliente TypeScript da exportação `furo_prisma_furar` (docs/estudo-esquadrias/25-furo-prisma-abi.md).
 *
 * Mesmo padrão de `furoContorno.ts`: o wasm é instanciado uma vez, a versão é conferida, os buffers de entrada são reservados
 * com `abi2_alocar` e liberados com `abi2_liberar`, e as saídas são copiadas e liberadas com `furo_saida_liberar`. Esta ABI tem
 * instância própria (`carregarFuroPrisma`), porque o estado de saída do wasm é único por instância: misturar as duas no mesmo
 * módulo apagaria as saídas uma da outra.
 *
 * Os planos de cada camada são (u, s) em metros: u ao longo da parede, s na espessura. O prisma se estende de z0 a z1. Na malha
 * de saída, x = u, y = s e z é a altura.
 */
import { ErroKernelGrave } from './kernel/v2/erros.ts';
import { CODIGOS } from './kernel/v2/esquema.gerado.ts';
import type { VaoContorno } from './furoContorno.ts';
import { erroDeChamada, erroDoCodigo, falhaGrave, InstanciaWasmFuro, lerErro, lerSaida, liberarTudo, num, reservar, TIPO_F64, TIPO_U32, type ExportsMemoriaFuro, type Reserva } from './furoWasm.ts';

/** Versão do layout desta ABI (`furo_prisma_abi_versao`). */
export const VERSAO_ABI_PRISMA = 1;

export type PontoPlanta = readonly [number, number];

/** Um polígono em planta: primeiro anel é o externo, os demais são furos. Orientação livre (o wasm normaliza). */
export type PoligonoPlanta = ReadonlyArray<ReadonlyArray<PontoPlanta>>;

/** Uma camada: multipolígono em planta e a faixa de z. */
export interface CamadaPrisma {
  poligonos: ReadonlyArray<PoligonoPlanta>;
  z0: number;
  z1: number;
}

/** Malha de uma camada furada. `vertices` é x, y, z intercalados (x = u, y = s); `indices` são locais à camada. */
export interface MalhaCamadaPrisma {
  z0: number;
  z1: number;
  volume: number;
  volumeSemFuro: number;
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface ResultadoPrismas {
  camadas: MalhaCamadaPrisma[];
  volume: number;
  volumeRemovido: number;
}

interface ExportsPrisma extends ExportsMemoriaFuro {
  furo_prisma_abi_versao(): number;
  furo_prisma_furar(
    nCamadas: number,
    nPoligonos: number,
    nAneis: number,
    nPontosPlanta: number,
    ptrPontosPlanta: number,
    ptrAneis: number,
    ptrPoligonos: number,
    ptrCamadas: number,
    ptrZ: number,
    nVaos: number,
    nPontos: number,
    ptrPontos: number,
    ptrVaos: number,
    ptrX: number,
    ptrSoleira: number,
  ): number;
}

type InstanciaPrisma = InstanciaWasmFuro & { readonly exports: ExportsPrisma };

/** Saídas, na ordem fixada pela ABI (doc 25 §3). */
const SAIDA = { meta: 0, contagens: 1, vertices: 2, indices: 3, totais: 4 } as const;
const SAIDAS_ESPERADAS = 5;

let atual: InstanciaPrisma | null = null;

/**
 * Compila e instancia o wasm que contém `furo_prisma_*` (o módulo com `abi2_alocar`). Versão errada ou exportações ausentes:
 * `ErroKernelGrave(VERSAO)`.
 */
export async function carregarFuroPrisma(bytes: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<void> {
  const modulo = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes as BufferSource);
  const instancia = new WebAssembly.Instance(modulo, {});
  const memory = instancia.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) throw new ErroKernelGrave(CODIGOS.VERSAO, 'o módulo não exporta "memory"');
  const exports = instancia.exports as unknown as ExportsPrisma;
  let versao: number;
  try {
    if (typeof exports.abi2_alocar !== 'function' || typeof exports.abi2_liberar !== 'function') {
      throw new Error('abi2_alocar/abi2_liberar ausentes');
    }
    versao = exports.furo_prisma_abi_versao();
  } catch (e) {
    throw new ErroKernelGrave(CODIGOS.VERSAO, `exportações do furo de prisma ausentes ou com falha (${String(e)})`);
  }
  if (versao !== VERSAO_ABI_PRISMA) throw new ErroKernelGrave(CODIGOS.VERSAO, `furo_prisma_abi_versao=${versao}, esperado ${VERSAO_ABI_PRISMA}`);
  atual = { exports, memory };
}

/** Diz se `carregarFuroPrisma` já rodou com sucesso. */
export const furoPrismaCarregado = (): boolean => atual !== null;

function instanciaCarregada(): InstanciaPrisma {
  if (atual === null) throw new Error('furo de prisma: wasm não carregado (chame carregarFuroPrisma antes)');
  return atual;
}

/** Buffers de entrada já empacotados no formato da ABI (doc 25 §3). */
interface Empacotado {
  pontosPlanta: Float64Array;
  aneis: Uint32Array;
  poligonos: Uint32Array;
  camadas: Uint32Array;
  z: Float64Array;
  pontos: Float64Array;
  vaos: Uint32Array;
  x: Float64Array;
  soleira: Float64Array;
  nVaos: number;
  nPontos: number;
}

function empacotar(camadas: readonly CamadaPrisma[], vaos: readonly VaoContorno[]): Empacotado {
  const pontosPlanta: number[] = [];
  const aneis: number[] = [0];
  const poligonos: number[] = [0];
  const idxCamadas: number[] = [0];
  const z: number[] = [];
  for (const c of camadas) {
    for (const poligono of c.poligonos) {
      for (const anel of poligono) {
        for (const [u, s] of anel) pontosPlanta.push(u, s);
        aneis.push(pontosPlanta.length / 2);
      }
      poligonos.push(aneis.length - 1);
    }
    idxCamadas.push(poligonos.length - 1);
    z.push(c.z0, c.z1);
  }

  const nVaos = vaos.length;
  let nPontos = 0;
  for (const v of vaos) nPontos += v.contorno.length;
  const pontos = new Float64Array(2 * nPontos);
  const idxVaos = new Uint32Array(nVaos + 1);
  const x = new Float64Array(nVaos);
  const soleira = new Float64Array(nVaos);
  let p = 0;
  vaos.forEach((v, i) => {
    for (const [px, pz] of v.contorno) {
      pontos[2 * p] = px;
      pontos[2 * p + 1] = pz;
      p++;
    }
    idxVaos[i + 1] = p;
    x[i] = v.x;
    soleira[i] = v.soleira;
  });

  return {
    pontosPlanta: Float64Array.from(pontosPlanta),
    aneis: Uint32Array.from(aneis),
    poligonos: Uint32Array.from(poligonos),
    camadas: Uint32Array.from(idxCamadas),
    z: Float64Array.from(z),
    pontos,
    vaos: idxVaos,
    x,
    soleira,
    nVaos,
    nPontos,
  };
}

function lerResultado(inst: InstanciaPrisma, camadas: number): ResultadoPrismas {
  if (inst.exports.furo_saida_n() !== SAIDAS_ESPERADAS) throw falhaGrave(`furo_saida_n != ${SAIDAS_ESPERADAS} após sucesso`);
  const meta = lerSaida(inst, SAIDA.meta, TIPO_F64, 'meta') as Float64Array;
  const contagens = lerSaida(inst, SAIDA.contagens, TIPO_U32, 'contagens') as Uint32Array;
  const vertices = lerSaida(inst, SAIDA.vertices, TIPO_F64, 'vertices') as Float64Array;
  const indices = lerSaida(inst, SAIDA.indices, TIPO_U32, 'indices') as Uint32Array;
  const totais = lerSaida(inst, SAIDA.totais, TIPO_F64, 'totais') as Float64Array;
  if (meta.length !== 4 * camadas || contagens.length !== 2 * camadas || totais.length !== 2) {
    throw falhaGrave('tamanhos de saída incoerentes com o número de camadas');
  }
  let somaV = 0;
  let somaT = 0;
  for (let k = 0; k < camadas; k++) {
    somaV += num(contagens, 2 * k);
    somaT += num(contagens, 2 * k + 1);
  }
  if (vertices.length !== 3 * somaV || indices.length !== somaT) throw falhaGrave('tamanhos de vértices ou índices incoerentes com as contagens');

  const saida: MalhaCamadaPrisma[] = [];
  let offV = 0;
  let offT = 0;
  for (let k = 0; k < camadas; k++) {
    const nv = num(contagens, 2 * k);
    const nt = num(contagens, 2 * k + 1);
    saida.push({
      z0: num(meta, 4 * k),
      z1: num(meta, 4 * k + 1),
      volume: num(meta, 4 * k + 2),
      volumeSemFuro: num(meta, 4 * k + 3),
      vertices: vertices.slice(3 * offV, 3 * (offV + nv)),
      indices: indices.slice(offT, offT + nt),
    });
    offV += nv;
    offT += nt;
  }
  return { camadas: saida, volume: num(totais, 0), volumeRemovido: num(totais, 1) };
}

/**
 * Fura as camadas em prisma de planta com os vãos dados (contorno [x, z] anti-horário, aberto, na origem do vão; `x` e `soleira`
 * como em `furarParedePorContorno`). O vão é cortado por inteiro através de cada planta, então a remoção é o contorno x a
 * espessura da planta naquele u.
 * Erro de entrada ou de limite: `ErroKernelLeve` (ENTRADA ou LIMITE). Falha interna: `ErroKernelGrave`.
 */
export function furarPrismas(camadas: readonly CamadaPrisma[], vaos: readonly VaoContorno[]): ResultadoPrismas {
  const inst = instanciaCarregada();
  const e = empacotar(camadas, vaos);
  const nCamadas = camadas.length;
  const nPoligonos = e.poligonos.length - 1;
  const nAneis = e.aneis.length - 1;
  const nPontosPlanta = e.pontosPlanta.length / 2;

  const reservas: Reserva[] = [];
  let codigo: number;
  try {
    const pPontosPlanta = reservar(inst, e.pontosPlanta, reservas);
    const pAneis = reservar(inst, e.aneis, reservas);
    const pPoligonos = reservar(inst, e.poligonos, reservas);
    const pCamadas = reservar(inst, e.camadas, reservas);
    const pZ = reservar(inst, e.z, reservas);
    const pPontos = reservar(inst, e.pontos, reservas);
    const pVaos = reservar(inst, e.vaos, reservas);
    const pX = reservar(inst, e.x, reservas);
    const pSoleira = reservar(inst, e.soleira, reservas);
    codigo = inst.exports.furo_prisma_furar(
      nCamadas,
      nPoligonos,
      nAneis,
      nPontosPlanta,
      pPontosPlanta,
      pAneis,
      pPoligonos,
      pCamadas,
      pZ,
      e.nVaos,
      e.nPontos,
      pPontos,
      pVaos,
      pX,
      pSoleira,
    );
  } catch (err) {
    throw erroDeChamada(err);
  } finally {
    liberarTudo(inst, reservas);
  }

  if (codigo !== CODIGOS.OK) throw erroDoCodigo(codigo, lerErro(inst));

  try {
    return lerResultado(inst, nCamadas);
  } finally {
    inst.exports.furo_saida_liberar();
  }
}
