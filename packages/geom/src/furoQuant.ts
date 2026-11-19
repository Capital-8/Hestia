/**
 * Cliente TypeScript das exportações de quantitativo e retorno do vão por contorno (`furo_quant_vao`, `furo_retorno_vao`,
 * `furo_quant_parede`; docs/estudo-esquadrias/27-ligacao-real.md). Mesmo padrão de `furoPrisma.ts`: instância própria
 * (o estado de saída do wasm é único por instância), buffers de entrada com `abi2_alocar`/`abi2_liberar`, saídas copiadas e
 * liberadas com `furo_saida_liberar`.
 *
 * Erro de entrada ou de limite: `ErroKernelLeve`. Falha interna ou trap: `ErroKernelGrave`.
 */
import { ErroKernelGrave } from './kernel/v2/erros.ts';
import { CODIGOS } from './kernel/v2/esquema.gerado.ts';
import type { PoligonoPlanta } from './furoPrisma.ts';
import { erroDeChamada, erroDoCodigo, falhaGrave, type InstanciaWasmFuro, lerErro, lerSaida, liberarTudo, num, reservar, TIPO_F64, TIPO_U32, type ExportsMemoriaFuro, type Reserva } from './furoWasm.ts';

/** Versão do layout desta ABI (`furo_quant_abi_versao`). */
export const VERSAO_ABI_QUANT = 1;

export type PontoContorno = readonly [number, number];

export interface QuantidadeVao {
  largura: number;
  altura: number;
  /** Área do contorno real (m2). */
  area: number;
  /** Perímetro do contorno real, base incluída (m). */
  perimetro: number;
  /** `largura x altura`. */
  areaEnvelope: number;
}

export interface EntradaRetornoContorno {
  contorno: readonly PontoContorno[];
  /** Posição x da origem do vão ao longo da parede e cota z (peitoril). */
  x: number;
  soleira: number;
  /** Espessura pedida e teto da camada de acabamento (m). */
  espessura: number;
  espessuraAcabamento?: number;
  /** Soma das camadas envolventes entre esta e o núcleo: desloca o contorno para dentro antes do anel (m, >= 0). */
  recuo?: number;
  /** Faixa em s (espessura da parede) que o retorno ocupa. */
  y0: number;
  y1: number;
  /**
   * `'contorno'` (ombreiras, verga/arco e soleira), `'ombreiras'`, ou `'contorno-sem-base'` (ombreiras e verga/arco, sem a faixa
   * da soleira: o vão que toca o piso, docs/estudo-esquadrias/33). Este último e `recorte` exigem `furo_retorno_vao_ext`.
   */
  modo?: 'contorno' | 'ombreiras' | 'contorno-sem-base';
  /** Polígonos de planta [u, s] em que o retorno pode existir (a pegada menos as paredes vizinhas); vazio ou ausente = sem recorte. */
  recorte?: ReadonlyArray<PoligonoPlanta>;
  /**
   * Parede curva (docs/estudo-esquadrias/33 §4): raio assinado do eixo (`k * R`). `x` é o comprimento de eixo, `y0`/`y1` a lateral s, o
   * `recorte` está no referencial local (u, s) e a malha sai nele. Exige `furo_retorno_vao_curvo` (`furoRetornoCurvoCarregado()`).
   */
  raio?: number;
}

export interface ResultadoRetornoContorno {
  espessura: number;
  limitada: boolean;
  y0: number;
  y1: number;
  areaAnel: number;
  areaLivre: number;
  volume: number;
  areaExposta: number;
  /** x, y, z intercalados, já com `x` e `soleira` do vão. */
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface QuantidadeCamadaFurada {
  y0: number;
  y1: number;
  espessura: number;
  volumeLiquido: number;
  volumeBruto: number;
  volumeRemovido: number;
  areaFaceBruta: number;
  areaFaceLiquida: number;
  areaFaceOposta: number;
  areaFuroNaFace: number;
}

export interface QuantidadeParede {
  camadas: QuantidadeCamadaFurada[];
  volumeLiquido: number;
  volumeRemovido: number;
}

export interface VaoQuant {
  contorno: readonly PontoContorno[];
  x: number;
  soleira: number;
}

interface ExportsQuant extends ExportsMemoriaFuro {
  furo_quant_abi_versao(): number;
  furo_quant_vao(nPontos: number, ptrPontos: number): number;
  furo_retorno_vao(nPontos: number, ptrPontos: number, x: number, soleira: number, espessura: number, espessuraAcabamento: number, recuo: number, y0: number, y1: number, modo: number): number;
  furo_retorno_ext_abi_versao?(): number;
  furo_retorno_vao_ext?(nPontos: number, ptrPontos: number, x: number, soleira: number, espessura: number, espessuraAcabamento: number, recuo: number, y0: number, y1: number, modo: number, nPoligonos: number, nAneis: number, nPontosRec: number, ptrPontosRec: number, ptrAneis: number, ptrPoligonos: number): number;
  furo_retorno_curvo_abi_versao?(): number;
  furo_retorno_vao_curvo?(nPontos: number, ptrPontos: number, x: number, soleira: number, espessura: number, espessuraAcabamento: number, recuo: number, y0: number, y1: number, modo: number, nPoligonos: number, nAneis: number, nPontosRec: number, ptrPontosRec: number, ptrAneis: number, ptrPoligonos: number, raio: number): number;
  furo_quant_parede(nVaos: number, nPontos: number, ptrPontos: number, ptrVaos: number, ptrX: number, ptrSoleira: number, nCamadas: number, ptrEspessuras: number, comprimento: number, altura: number): number;
}

type InstanciaQuant = InstanciaWasmFuro & { readonly exports: ExportsQuant };

let atual: InstanciaQuant | null = null;
/** Versão do layout de `furo_retorno_vao_ext`. */
export const VERSAO_ABI_RETORNO_EXT = 1;
let extAtual = false;
/** Versão do layout de `furo_retorno_vao_curvo`. */
export const VERSAO_ABI_RETORNO_CURVO = 1;
let curvoAtual = false;

/** Compila e instancia o wasm que contém `furo_quant_*`. Versão errada ou exportações ausentes: `ErroKernelGrave(VERSAO)`. */
export async function carregarFuroQuant(bytes: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<void> {
  const modulo = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes as BufferSource);
  const instancia = new WebAssembly.Instance(modulo, {});
  const memory = instancia.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) throw new ErroKernelGrave(CODIGOS.VERSAO, 'o módulo não exporta "memory"');
  const exports = instancia.exports as unknown as ExportsQuant;
  let versao: number;
  try {
    if (typeof exports.abi2_alocar !== 'function' || typeof exports.abi2_liberar !== 'function' || typeof exports.furo_retorno_vao !== 'function' || typeof exports.furo_quant_vao !== 'function' || typeof exports.furo_quant_parede !== 'function') {
      throw new Error('exportações furo_quant_* ausentes');
    }
    versao = exports.furo_quant_abi_versao();
  } catch (e) {
    throw new ErroKernelGrave(CODIGOS.VERSAO, `exportações do quantitativo do furo ausentes ou com falha (${String(e)})`);
  }
  if (versao !== VERSAO_ABI_QUANT) throw new ErroKernelGrave(CODIGOS.VERSAO, `furo_quant_abi_versao=${versao}, esperado ${VERSAO_ABI_QUANT}`);
  atual = { exports, memory };
  try {
    extAtual = typeof exports.furo_retorno_vao_ext === 'function' && exports.furo_retorno_ext_abi_versao?.() === VERSAO_ABI_RETORNO_EXT;
  } catch {
    extAtual = false;
  }
  try {
    curvoAtual = typeof exports.furo_retorno_vao_curvo === 'function' && exports.furo_retorno_curvo_abi_versao?.() === VERSAO_ABI_RETORNO_CURVO;
  } catch {
    curvoAtual = false;
  }
}

/** O módulo carregado tem `furo_retorno_vao_curvo` (retorno em parede curva). */
export const furoRetornoCurvoCarregado = (): boolean => atual !== null && curvoAtual;

/** O módulo carregado tem `furo_retorno_vao_ext` (retorno sem soleira e recortado em planta). */
export const furoRetornoExtCarregado = (): boolean => atual !== null && extAtual;

/** Diz se `carregarFuroQuant` já rodou com sucesso. */
export const furoQuantCarregado = (): boolean => atual !== null;

function instanciaCarregada(): InstanciaQuant {
  if (atual === null) throw new Error('quantitativo do furo: wasm não carregado (chame carregarFuroQuant antes)');
  return atual;
}

const planos = (c: readonly PontoContorno[]): Float64Array => Float64Array.from(c.flatMap(([x, z]) => [x, z]));

/** Roda `chamar` com as reservas e devolve `lerResultado` (as reservas são liberadas sempre; as saídas, depois da leitura). */
function executar<T>(inst: InstanciaQuant, chamar: (reservas: Reserva[]) => number, ler: () => T): T {
  const reservas: Reserva[] = [];
  let codigo: number;
  try {
    codigo = chamar(reservas);
  } catch (err) {
    throw erroDeChamada(err);
  } finally {
    liberarTudo(inst, reservas);
  }
  if (codigo !== CODIGOS.OK) throw erroDoCodigo(codigo, lerErro(inst));
  try {
    return ler();
  } finally {
    inst.exports.furo_saida_liberar();
  }
}

/** Área e perímetro do contorno REAL do vão (contorno [x, z] anti-horário, aberto, relativo à origem). */
export function quantificarVao(contorno: readonly PontoContorno[]): QuantidadeVao {
  const inst = instanciaCarregada();
  const pts = planos(contorno);
  return executar(
    inst,
    (r) => inst.exports.furo_quant_vao(contorno.length, reservar(inst, pts, r)),
    () => {
      if (inst.exports.furo_saida_n() !== 1) throw falhaGrave('furo_quant_vao: número de saídas inesperado');
      const v = lerSaida(inst, 0, TIPO_F64, 'quant_vao') as Float64Array;
      if (v.length !== 5) throw falhaGrave('furo_quant_vao: tamanho de saída inesperado');
      return { largura: num(v, 0), altura: num(v, 1), area: num(v, 2), perimetro: num(v, 3), areaEnvelope: num(v, 4) };
    },
  );
}

/** Lê as três saídas do retorno (as mesmas em `furo_retorno_vao` e `furo_retorno_vao_ext`). */
function lerRetorno(inst: InstanciaQuant, nome: string): ResultadoRetornoContorno {
  if (inst.exports.furo_saida_n() !== 3) throw falhaGrave(`${nome}: número de saídas inesperado`);
  const m = lerSaida(inst, 0, TIPO_F64, 'meta') as Float64Array;
  const vertices = lerSaida(inst, 1, TIPO_F64, 'vertices') as Float64Array;
  const indices = lerSaida(inst, 2, TIPO_U32, 'indices') as Uint32Array;
  if (m.length !== 8 || vertices.length % 3 !== 0 || indices.length % 3 !== 0) throw falhaGrave(`${nome}: tamanhos de saída incoerentes`);
  return { espessura: num(m, 0), limitada: num(m, 1) !== 0, y0: num(m, 2), y1: num(m, 3), areaAnel: num(m, 4), areaLivre: num(m, 5), volume: num(m, 6), areaExposta: num(m, 7), vertices, indices };
}

/** Retorno do acabamento que segue o contorno (docs/estudo-esquadrias/22, 27 e 33). */
export function retornoDoContorno(e: EntradaRetornoContorno): ResultadoRetornoContorno {
  const inst = instanciaCarregada();
  const pts = planos(e.contorno);
  const recorte = e.recorte ?? [];
  const curvo = e.raio !== undefined;
  if (curvo && !curvoAtual) throw new Error('retorno do vão: parede curva exige furo_retorno_vao_curvo (módulo sem ela)');
  if (curvo || e.modo === 'contorno-sem-base' || recorte.length > 0) {
    if (!curvo && !extAtual) throw new Error('retorno do vão: base livre e recorte exigem furo_retorno_vao_ext (módulo sem ela)');
    const pontosRec: number[] = [];
    const aneis: number[] = [0];
    const poligonos: number[] = [0];
    for (const poly of recorte) {
      for (const anel of poly) {
        for (const [u, s] of anel) pontosRec.push(u, s);
        aneis.push(pontosRec.length / 2);
      }
      poligonos.push(aneis.length - 1);
    }
    const modo = e.modo === 'ombreiras' ? 1 : e.modo === 'contorno-sem-base' ? 2 : 0;
    const pr = Float64Array.from(pontosRec);
    const ar = Uint32Array.from(aneis);
    const po = Uint32Array.from(poligonos);
    return executar(
      inst,
      (r) => {
        const args = [e.contorno.length, reservar(inst, pts, r), e.x, e.soleira, e.espessura, e.espessuraAcabamento ?? e.espessura, e.recuo ?? 0, e.y0, e.y1, modo, recorte.length, aneis.length - 1, pontosRec.length / 2, reservar(inst, pr, r), reservar(inst, ar, r), reservar(inst, po, r)] as const;
        return curvo ? inst.exports.furo_retorno_vao_curvo!(...args, e.raio!) : inst.exports.furo_retorno_vao_ext!(...args);
      },
      () => lerRetorno(inst, curvo ? 'furo_retorno_vao_curvo' : 'furo_retorno_vao_ext'),
    );
  }
  return executar(
    inst,
    (r) => inst.exports.furo_retorno_vao(e.contorno.length, reservar(inst, pts, r), e.x, e.soleira, e.espessura, e.espessuraAcabamento ?? e.espessura, e.recuo ?? 0, e.y0, e.y1, e.modo === 'ombreiras' ? 1 : 0),
    () => lerRetorno(inst, 'furo_retorno_vao'),
  );
}

/** Fura a parede (camadas de espessura em y crescente) e mede volume líquido e área de face sobre a MALHA. */
export function quantificarParede(vaos: readonly VaoQuant[], espessuras: readonly number[], comprimento: number, altura: number): QuantidadeParede {
  const inst = instanciaCarregada();
  const nPontos = vaos.reduce((s, v) => s + v.contorno.length, 0);
  const pontos = new Float64Array(2 * nPontos);
  const idx = new Uint32Array(vaos.length + 1);
  const x = new Float64Array(vaos.length);
  const soleira = new Float64Array(vaos.length);
  let p = 0;
  vaos.forEach((v, i) => {
    for (const [px, pz] of v.contorno) {
      pontos[2 * p] = px;
      pontos[2 * p + 1] = pz;
      p++;
    }
    idx[i + 1] = p;
    x[i] = v.x;
    soleira[i] = v.soleira;
  });
  const esp = Float64Array.from(espessuras);
  return executar(
    inst,
    (r) => {
      const pP = reservar(inst, pontos, r);
      const pV = reservar(inst, idx, r);
      const pX = reservar(inst, x, r);
      const pS = reservar(inst, soleira, r);
      const pE = reservar(inst, esp, r);
      return inst.exports.furo_quant_parede(vaos.length, nPontos, pP, pV, pX, pS, espessuras.length, pE, comprimento, altura);
    },
    () => {
      if (inst.exports.furo_saida_n() !== 2) throw falhaGrave('furo_quant_parede: número de saídas inesperado');
      const m = lerSaida(inst, 0, TIPO_F64, 'meta') as Float64Array;
      const t = lerSaida(inst, 1, TIPO_F64, 'totais') as Float64Array;
      if (m.length !== 10 * espessuras.length || t.length !== 2) throw falhaGrave('furo_quant_parede: tamanhos de saída incoerentes');
      const camadas: QuantidadeCamadaFurada[] = [];
      for (let k = 0; k < espessuras.length; k++) {
        const o = 10 * k;
        camadas.push({ y0: num(m, o), y1: num(m, o + 1), espessura: num(m, o + 2), volumeLiquido: num(m, o + 3), volumeBruto: num(m, o + 4), volumeRemovido: num(m, o + 5), areaFaceBruta: num(m, o + 6), areaFaceLiquida: num(m, o + 7), areaFaceOposta: num(m, o + 8), areaFuroNaFace: num(m, o + 9) });
      }
      return { camadas, volumeLiquido: num(t, 0), volumeRemovido: num(t, 1) };
    },
  );
}
