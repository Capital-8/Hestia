/**
 * Marshalling do ABI binário do kernel geométrico experimental.
 *
 * O layout está congelado em `crates/geom-wasm/src/lib.rs` e é reproduzido aqui sem opinião:
 *
 * ```text
 *   base + 0                                                   vértices f64 (x,y intercalados)
 *   base + 16*n_vertices                                       anéis u32 (n_aneis+1, último = n_vertices)
 *   base + 16*n_vertices + 4*(n_aneis+1)                       polígonos u32 (n_poligonos+1, último = n_aneis)
 *   base + 16*n_vertices + 4*(n_aneis+1) + 4*(n_poligonos+1)   args u32 (n_args+1, último = n_poligonos)
 * ```
 *
 * Nada aqui guarda `memory.buffer` entre chamadas: `preparar_entrada` e `executar` podem crescer a
 * memória, e um `ArrayBuffer` antigo fica destacado (`byteLength === 0`). Quem chama o wasm pega a
 * `memory.buffer` de novo logo antes de criar as views — é o que `escreverEntrada` e `lerSaida` fazem.
 *
 * A saída usa a mesma codificação da entrada, sem a seção `args`. Os ponteiros valem até a próxima
 * chamada a `executar`; por isso `lerSaida` copia tudo para objetos `{x, y}` antes de voltar.
 */
import type { MultiPolygon, Polygon, Ring } from '../polygon.ts';
import type { Vec2 } from '../vec.ts';

/** Teto de vértices aceito numa única chamada; acima disso a operação volta para o TypeScript. */
export const TAMANHO_MAXIMO_ENTRADA = 2_000_000;

/** Quantos vértices/aneis/polígonos/argumentos a entrada ocupa. */
export interface ContagemEntrada {
  readonly vertices: number;
  readonly aneis: number;
  readonly poligonos: number;
  readonly args: number;
}

/** Exportações do módulo wasm, na forma que o ABI do `lib.rs` promete. */
export interface ExportsKernel {
  readonly memory: WebAssembly.Memory;
  versao_abi(): number;
  preparar_entrada(nVertices: number, nAneis: number, nPoligonos: number, nArgs: number): number;
  executar(op: number, nArgs: number, param: number): number;
  saida_vertices_ptr(): number;
  saida_vertices_len(): number;
  saida_aneis_ptr(): number;
  saida_aneis_len(): number;
  saida_poligonos_ptr(): number;
  saida_poligonos_len(): number;
  saida_area(): number;
}

/** Subconjunto de exportações necessário para decodificar a saída. */
export type SaidaAbi = Pick<
  ExportsKernel,
  | 'saida_vertices_ptr'
  | 'saida_vertices_len'
  | 'saida_aneis_ptr'
  | 'saida_aneis_len'
  | 'saida_poligonos_ptr'
  | 'saida_poligonos_len'
>;

/** Detecta entrada absurda antes de reservar memória no wasm. */
function validarTamanho(contagem: ContagemEntrada): void {
  if (contagem.vertices > TAMANHO_MAXIMO_ENTRADA) {
    throw new Error(
      `kernel wasm: entrada grande demais (${contagem.vertices} vértices, máximo ${TAMANHO_MAXIMO_ENTRADA})`,
    );
  }
  if (contagem.args > TAMANHO_MAXIMO_ENTRADA) {
    throw new Error(`kernel wasm: argumentos demais (${contagem.args}, máximo ${TAMANHO_MAXIMO_ENTRADA})`);
  }
}

/** Conta vértices, anéis, polígonos e argumentos de `MultiPolygon[]`. */
export function contarEntrada(args: MultiPolygon[]): ContagemEntrada {
  let vertices = 0;
  let aneis = 0;
  let poligonos = 0;
  for (const multi of args) {
    for (const poli of multi) {
      poligonos++;
      for (const anel of poli) {
        aneis++;
        vertices += anel.length;
      }
    }
  }
  const contagem: ContagemEntrada = { vertices, aneis, poligonos, args: args.length };
  validarTamanho(contagem);
  return contagem;
}

/** Lança se `[ptr, ptr + bytes)` não cabe no buffer atual. */
function exigirEspaco(buffer: ArrayBufferLike, ptr: number, bytes: number, secao: string): void {
  if (ptr < 0 || bytes < 0 || ptr + bytes > buffer.byteLength) {
    throw new Error(`kernel wasm: seção ${secao} fora da memória (ptr ${ptr}, ${bytes} bytes)`);
  }
}

/**
 * Escreve a entrada na arena devolvida por `preparar_entrada`.
 *
 * Deve ser chamada DEPOIS de `preparar_entrada` (a memória pode ter crescido) e ANTES de `executar`.
 * `contagem` é opcional para quem já a calculou e não quer varrer os argumentos duas vezes.
 */
export function escreverEntrada(
  memory: WebAssembly.Memory,
  basePtr: number,
  args: MultiPolygon[],
  contagem: ContagemEntrada = contarEntrada(args),
): void {
  if (basePtr === 0) throw new Error('kernel wasm: preparar_entrada devolveu o ponteiro 0');
  if (basePtr % 8 !== 0) throw new Error(`kernel wasm: ponteiro base desalinhado (${basePtr})`);

  const deslocVertices = basePtr;
  const deslocAneis = deslocVertices + 16 * contagem.vertices;
  const deslocPoligonos = deslocAneis + 4 * (contagem.aneis + 1);
  const deslocArgs = deslocPoligonos + 4 * (contagem.poligonos + 1);
  const bytesNecessarios = deslocArgs + 4 * (contagem.args + 1) - basePtr;

  // Buffer novo: `preparar_entrada` pode ter crescido a memória e destacado o anterior.
  const buffer = memory.buffer;
  exigirEspaco(buffer, basePtr, bytesNecessarios, 'entrada');

  const vertices = new Float64Array(buffer, deslocVertices, 2 * contagem.vertices);
  const aneis = new Uint32Array(buffer, deslocAneis, contagem.aneis + 1);
  const poligonos = new Uint32Array(buffer, deslocPoligonos, contagem.poligonos + 1);
  const argumentos = new Uint32Array(buffer, deslocArgs, contagem.args + 1);

  let iv = 0;
  let ir = 0;
  let ip = 0;
  let iarg = 0;
  for (const multi of args) {
    argumentos[iarg++] = ip;
    for (const poli of multi) {
      poligonos[ip++] = ir;
      for (const anel of poli) {
        aneis[ir++] = iv;
        for (const ponto of anel) {
          vertices[2 * iv] = ponto.x;
          vertices[2 * iv + 1] = ponto.y;
          iv++;
        }
      }
    }
  }
  // Terminadores: é por eles que o `ler_entrada` do Rust confere a consistência dos índices.
  argumentos[contagem.args] = ip;
  poligonos[contagem.poligonos] = ir;
  aneis[contagem.aneis] = iv;
}

/**
 * Decodifica a saída do último `executar` a partir dos pares `saida_*_ptr` / `saida_*_len`.
 *
 * Lê tudo para objetos novos, então o resultado não depende dos ponteiros continuarem válidos.
 */
export function lerSaida(memory: WebAssembly.Memory, saida: SaidaAbi): MultiPolygon {
  const verticesPtr = saida.saida_vertices_ptr();
  const verticesLen = saida.saida_vertices_len();
  const aneisPtr = saida.saida_aneis_ptr();
  const aneisLen = saida.saida_aneis_len();
  const poligonosPtr = saida.saida_poligonos_ptr();
  const poligonosLen = saida.saida_poligonos_len();

  if (verticesLen % 2 !== 0) throw new Error(`kernel wasm: saída de vértices ímpar (${verticesLen} f64)`);
  const nVertices = verticesLen / 2;

  if (aneisLen === 0 || poligonosLen === 0) {
    if (nVertices === 0) return [];
    throw new Error('kernel wasm: saída sem índices de anéis/polígonos');
  }

  // Buffer novo: `executar` pode ter crescido a memória. Nenhuma chamada ao wasm daqui em diante.
  const buffer = memory.buffer;
  if (verticesPtr % 8 !== 0) throw new Error(`kernel wasm: ponteiro de vértices desalinhado (${verticesPtr})`);
  if (aneisPtr % 4 !== 0) throw new Error(`kernel wasm: ponteiro de anéis desalinhado (${aneisPtr})`);
  if (poligonosPtr % 4 !== 0) throw new Error(`kernel wasm: ponteiro de polígonos desalinhado (${poligonosPtr})`);
  exigirEspaco(buffer, verticesPtr, verticesLen * 8, 'saída de vértices');
  exigirEspaco(buffer, aneisPtr, aneisLen * 4, 'saída de anéis');
  exigirEspaco(buffer, poligonosPtr, poligonosLen * 4, 'saída de polígonos');

  const vertices = new Float64Array(buffer, verticesPtr, verticesLen);
  const aneis = new Uint32Array(buffer, aneisPtr, aneisLen);
  const poligonos = new Uint32Array(buffer, poligonosPtr, poligonosLen);

  // Espelha a validação do `ler_entrada` do Rust: os terminadores têm de fechar as contagens.
  if (aneis[aneisLen - 1] !== nVertices) {
    throw new Error(`kernel wasm: terminador de anéis inconsistente (${aneis[aneisLen - 1]} != ${nVertices})`);
  }
  const nAneis = aneisLen - 1;
  if (poligonos[poligonosLen - 1] !== nAneis) {
    throw new Error(`kernel wasm: terminador de polígonos inconsistente (${poligonos[poligonosLen - 1]} != ${nAneis})`);
  }

  const resultado: MultiPolygon = [];
  for (let p = 0; p < poligonosLen - 1; p++) {
    const inicioAneis = poligonos[p]!;
    const fimAneis = poligonos[p + 1]!;
    if (inicioAneis > fimAneis || fimAneis > nAneis) {
      throw new Error(`kernel wasm: índices de anéis inválidos no polígono ${p} (${inicioAneis}..${fimAneis})`);
    }
    const poli: Polygon = [];
    for (let r = inicioAneis; r < fimAneis; r++) {
      const de = aneis[r]!;
      const ate = aneis[r + 1]!;
      if (de > ate || ate > nVertices) {
        throw new Error(`kernel wasm: índices de vértices inválidos no anel ${r} (${de}..${ate})`);
      }
      const anel: Ring = [];
      for (let i = de; i < ate; i++) {
        const ponto: Vec2 = { x: vertices[2 * i]!, y: vertices[2 * i + 1]! };
        anel.push(ponto);
      }
      poli.push(anel);
    }
    resultado.push(poli);
  }
  return resultado;
}
