/**
 * Cliente do renderizador Rust/WASM (T8).
 *
 * Layout binário congelado em `crates/render-wasm/src/lib.rs` (cena `HSTR` v2, ou v3 com texturas) e em
 * `crates/render-core/src/trabalho.rs` (trabalho `HSWK` v1). Este arquivo é o único do TypeScript
 * que conhece esses bytes e os códigos da ABI (0 ok · 1 cena · 2 trabalho · 3 interno · 4 cancelado).
 *
 * Memória: qualquer chamada ao wasm pode crescer `memory.buffer` e invalidar views antigas; por
 * isso toda leitura/escrita relê o buffer DEPOIS de `alocar`/renderizar. Nada é carregado no
 * import: o `.wasm` só é baixado quando alguém pede o cliente (modo final).
 */
import type { RenderMaterial, RenderSceneSnapshot } from '@hestia/render';
import { CODIGO_RENDER, ErroRenderWasm, MENSAGENS } from './erroRender.ts';
import { indicesDeTextura, tamanhoDasTexturas } from './texturasCena.ts';

export { CODIGO_RENDER, ErroRenderWasm, ehCancelamento } from './erroRender.ts';

/** Versão do ABI aceita (`VERSAO_ABI` em `crates/render-wasm/src/lib.rs`). */
export const VERSAO_ABI_RENDER = 1;

/** Versão escrita da cena sem texturas: 2 acrescenta tipo procedural e escala a cada material (52 bytes). */
const VERSAO_CENA = 2;
/** Versão escrita quando a cena tem texturas: material ganha 4 índices u32 e há a seção de texturas (ver `codificarCena`). */
const VERSAO_CENA_TEXTURAS = 3;
const VERSAO_TRABALHO = 1;
const FORMATO_RGBA8_SRGB = 0;
const CABECALHO_CENA = 32;
/** Material na v2: 11 f32 (44 bytes) + tipo u32 + escala f32. */
const TAMANHO_MATERIAL_CENA = 52;
/** Material na v3: os 52 bytes da v2 + 4 u32 (albedo, normal, rugosidade, metálico). */
const TAMANHO_MATERIAL_TEXTURAS = 68;
const TIPO_MATERIAL_MAXIMO = 7;
const MAX_VERTICES = 4_000_000;
const MAX_INDICES = 12_000_000;
const MAX_MATERIAIS = 100_000;
const MAX_BATCHES = 1_000_000;

/** Câmera de `atualizar_camera`: view/projeção em coluna maior + posição e planos. */
export interface CameraQuadro {
  view: Float32Array; projection: Float32Array; position: [number, number, number]; near: number; far: number;
}

export interface TrabalhoRender {
  largura: number; altura: number;
  /** Multiplicador antes do tone mapping do Rust (use `fatorExposicao`). */
  exposicao: number;
}
export interface SolQuadro {
  /** Graus, 0 = leste, anti-horário. */
  azimuth: number;
  /** Graus acima do horizonte. */
  elevation: number;
  intensity: number;
}
/** Exportações `extern "C"` da crate `render-wasm`. */
export interface ExportsRenderWasm {
  readonly memory: WebAssembly.Memory;
  versao_abi(): number;
  alocar(bytes: number): number;
  carregar_cena(ptr: number, len: number): number;
  preparar_trabalho(ptr: number, len: number): number;
  renderizar_bloco(x: number, y: number, w: number, h: number, spp: number, seed: number): number;
  saida_ptr(): number; saida_len(): number;
  atualizar_camera(ptr: number, len: number): number;
  atualizar_sol(ptr: number, len: number): number;
  cancelar(): number; limpar_cancelamento(): number;
}
/** Escritor little-endian de tamanho exato. */
class Escritor {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;
  constructor(tamanho: number) {
    this.bytes = new Uint8Array(tamanho);
    this.view = new DataView(this.bytes.buffer);
  }
  magia(texto: string): void {
    for (let i = 0; i < texto.length; i++) this.bytes[this.offset++] = texto.charCodeAt(i);
  }
  u32(valor: number): void {
    this.view.setUint32(this.offset, valor, true);
    this.offset += 4;
  }
  f32(valor: number): void {
    this.view.setFloat32(this.offset, valor, true);
    this.offset += 4;
  }
  copiar(valor: Uint8Array): void {
    this.bytes.set(valor, this.offset);
    this.offset += valor.length;
  }
  concluir(): Uint8Array {
    if (this.offset !== this.bytes.length) {
      throw new Error(`render wasm: buffer de ${this.bytes.length} bytes com ${this.offset} escritos`);
    }
    return this.bytes;
  }
}
const MATERIAL_PADRAO: RenderMaterial = {
  baseColor: [0.55, 0.55, 0.55], roughness: 0.8, metallic: 0, opacity: 1,
  transmission: 0, ior: 1.5, emissive: [0, 0, 0],
};
const finito = (valor: number, padrao: number): number => (Number.isFinite(valor) ? valor : padrao);
const limitar = (valor: number, minimo: number, maximo: number, padrao: number): number =>
  Math.min(maximo, Math.max(minimo, finito(valor, padrao)));
/** Tipo procedural inteiro em 0..7 (ausente ou inválido = liso, 0). */
const tipoDoMaterial = (tipo: number | undefined): number =>
  Math.round(limitar(tipo ?? 0, 0, TIPO_MATERIAL_MAXIMO, 0));
/** Escala finita e positiva (ausente, zero, negativa ou não finita = 1.0); teto de 1e6 m por repetição. */
const escalaDoMaterial = (escala: number | undefined): number =>
  escala !== undefined && Number.isFinite(escala) && escala > 0 ? Math.min(escala, 1_000_000) : 1;
/** Expoente de exposição em paradas (EV) para o multiplicador do Rust. */
export function fatorExposicao(paradas: number): number {
  return Math.pow(2, limitar(paradas, -10, 10, 0));
}
function exigirFinitos(valores: ArrayLike<number>, nome: string): void {
  for (let i = 0; i < valores.length; i++) {
    if (!Number.isFinite(valores[i] as number)) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `${nome} tem valor não finito no índice ${i}`);
    }
  }
}
/** Valida o snapshot antes de reservar memória no wasm (falha cedo, com mensagem clara). */
function validarCena(cena: RenderSceneSnapshot): void {
  if (cena.version !== 1) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `snapshot de cena versão ${cena.version}; esperado 1`);
  }
  const posicoes = cena.positions;
  const indices = cena.indices;
  if (!posicoes || posicoes.length === 0 || posicoes.length % 3 !== 0) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'posições da cena precisam ser múltiplas de 3');
  }
  if (!indices || indices.length === 0 || indices.length % 3 !== 0) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'índices da cena precisam ser múltiplos de 3');
  }
  const nVertices = posicoes.length / 3;
  if (nVertices > MAX_VERTICES || indices.length > MAX_INDICES) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'cena grande demais para o renderizador Rust');
  }
  exigirFinitos(posicoes, 'posições');
  for (let i = 0; i < indices.length; i++) {
    const indice = indices[i] as number;
    if (!Number.isInteger(indice) || indice < 0 || indice >= nVertices) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `índice fora da cena na posição ${i}`);
    }
  }
  if (cena.normals && cena.normals.length > 0) {
    if (cena.normals.length !== posicoes.length) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'normais precisam ter um vetor por vértice');
    }
    exigirFinitos(cena.normals, 'normais');
  }
  if (cena.materials.length > MAX_MATERIAIS || cena.batches.length > MAX_BATCHES) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'materiais ou lotes demais na cena');
  }
  const nMateriais = Math.max(1, cena.materials.length);
  for (const lote of cena.batches) {
    if (
      !Number.isInteger(lote.indexStart) || !Number.isInteger(lote.indexCount) ||
      lote.indexStart % 3 !== 0 || lote.indexCount % 3 !== 0 || lote.indexCount <= 0 ||
      lote.indexStart + lote.indexCount > indices.length ||
      !Number.isInteger(lote.material) || lote.material < 0 || lote.material >= nMateriais
    ) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'lote de triângulos inválido na cena');
    }
  }
  const camera = cena.camera;
  if (!camera || camera.view.length !== 16 || camera.projection.length !== 16) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'câmera da cena precisa de matrizes 4x4');
  }
  exigirFinitos(camera.view, 'view da câmera');
  exigirFinitos(camera.projection, 'projeção da câmera');
  exigirFinitos(camera.position, 'posição da câmera');
  if (!(camera.near > 0) || !(camera.far > camera.near)) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'planos de recorte da câmera inválidos');
  }
  if (cena.background && (cena.background.length !== 3 || !cena.background.every(Number.isFinite))) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'cor de fundo da cena inválida');
  }
}
/**
 * Serializa `RenderSceneSnapshot` no formato `HSTR`. Sem texturas: v2 (material de 52 bytes: 11 f32, tipo u32,
 * escala f32), exatamente como antes. Com texturas: v3, com material de 68 bytes (os 52 da v2 + 4 u32 de índice de
 * textura: albedo, normal, rugosidade, metálico; `0xFFFFFFFF` = sem textura) e a seção de texturas logo após os
 * materiais e antes dos lotes (u32 quantidade; por textura: u32 largura, u32 altura, u32 níveis N, e os N níveis
 * RGBA8 em sequência, nível 0 primeiro).
 *
 * Materiais/sol/fundo são limitados à faixa aceita pelo Rust: o exportador já deveria mandar tudo
 * certo, mas um arredondamento não pode reprovar a cena inteira. Tipo fora de 0..7 ou não inteiro
 * vira o limite/arredondado; escala ausente, não finita ou não positiva vira 1.0. Índice de textura
 * fora da lista, ou textura fora dos limites, é erro (não há o que arredondar).
 */
export function codificarCena(cena: RenderSceneSnapshot): Uint8Array {
  validarCena(cena);
  const posicoes = cena.positions;
  const indices = cena.indices;
  const normais = cena.normals && cena.normals.length > 0 ? cena.normals : null;
  const materiais = cena.materials.length > 0 ? cena.materials : [MATERIAL_PADRAO];
  const fundo = cena.background;
  const texturas = cena.texturas && cena.texturas.length > 0 ? cena.texturas : null;
  const tamanhoSecaoTexturas = texturas ? tamanhoDasTexturas(texturas) : 0;
  const mapas = materiais.map((material, i) => indicesDeTextura(material.mapas, texturas?.length ?? 0, i));
  const nVertices = posicoes.length / 3;
  const nNormais = normais ? nVertices : 0;
  const tamanhoMaterial = texturas ? TAMANHO_MATERIAL_TEXTURAS : TAMANHO_MATERIAL_CENA;
  const tamanho = CABECALHO_CENA + posicoes.length * 4 + indices.length * 4 + nNormais * 12
    + materiais.length * tamanhoMaterial + tamanhoSecaoTexturas + cena.batches.length * 12 + 12 + (fundo ? 12 : 0) + 148;
  const escritor = new Escritor(tamanho);
  escritor.magia('HSTR');
  escritor.u32(texturas ? VERSAO_CENA_TEXTURAS : VERSAO_CENA);
  escritor.u32(nVertices);
  escritor.u32(indices.length);
  escritor.u32(nNormais);
  escritor.u32(materiais.length);
  escritor.u32(cena.batches.length);
  escritor.u32((normais ? 1 : 0) | (fundo ? 2 : 0));
  for (let i = 0; i < posicoes.length; i++) escritor.f32(posicoes[i] as number);
  for (let i = 0; i < indices.length; i++) escritor.u32(indices[i] as number);
  if (normais) for (let i = 0; i < normais.length; i++) escritor.f32(normais[i] as number);
  materiais.forEach((material, indiceMaterial) => {
    for (let i = 0; i < 3; i++) escritor.f32(limitar(material.baseColor[i] as number, 0, 1, 0.55));
    escritor.f32(limitar(material.roughness, 0, 1, 0.8));
    escritor.f32(limitar(material.metallic, 0, 1, 0));
    escritor.f32(limitar(material.opacity, 0, 1, 1));
    escritor.f32(limitar(material.transmission, 0, 1, 0));
    escritor.f32(limitar(material.ior, 0.1, 10, 1.5));
    for (let i = 0; i < 3; i++) escritor.f32(limitar(material.emissive[i] as number, 0, 100, 0));
    escritor.u32(tipoDoMaterial(material.tipo));
    escritor.f32(escalaDoMaterial(material.escala));
    if (texturas) for (const indice of mapas[indiceMaterial] as number[]) escritor.u32(indice);
  });
  if (texturas) {
    escritor.u32(texturas.length);
    for (const textura of texturas) {
      escritor.u32(textura.largura);
      escritor.u32(textura.altura);
      escritor.u32(textura.mips.length);
      for (const nivel of textura.mips) escritor.copiar(nivel);
    }
  }
  for (const lote of cena.batches) {
    escritor.u32(lote.indexStart);
    escritor.u32(lote.indexCount);
    escritor.u32(lote.material);
  }
  escritor.f32(finito(cena.sun.azimuth, 135));
  escritor.f32(limitar(cena.sun.elevation, -90, 90, 45));
  escritor.f32(limitar(cena.sun.intensity, 0, 1000, 3));
  if (fundo) for (let i = 0; i < 3; i++) escritor.f32(limitar(fundo[i] as number, 0, 100, 0));
  for (let i = 0; i < 16; i++) escritor.f32(cena.camera.view[i] as number);
  for (let i = 0; i < 16; i++) escritor.f32(cena.camera.projection[i] as number);
  for (let i = 0; i < 3; i++) escritor.f32(cena.camera.position[i] as number);
  escritor.f32(cena.camera.near);
  escritor.f32(cena.camera.far);
  return escritor.concluir();
}
/** Trabalho `HSWK` v1 (24 bytes). */
export function codificarTrabalho(trabalho: TrabalhoRender): Uint8Array {
  const largura = Math.round(trabalho.largura);
  const altura = Math.round(trabalho.altura);
  if (!(largura >= 1 && largura <= 16384) || !(altura >= 1 && altura <= 16384)) {
    throw new ErroRenderWasm(CODIGO_RENDER.trabalhoInvalido, 'resolução do render fora de 1..16384');
  }
  const escritor = new Escritor(24);
  escritor.magia('HSWK');
  escritor.u32(VERSAO_TRABALHO);
  escritor.u32(largura);
  escritor.u32(altura);
  escritor.f32(limitar(trabalho.exposicao, 0, 1000, 1));
  escritor.u32(FORMATO_RGBA8_SRGB);
  return escritor.concluir();
}
/** Câmera de um quadro (`atualizar_camera`, 37 `f32`). */
export function codificarCamera(camera: CameraQuadro): Uint8Array {
  if (camera.view.length !== 16 || camera.projection.length !== 16) {
    throw new ErroRenderWasm(CODIGO_RENDER.trabalhoInvalido, 'câmera do quadro precisa de matrizes 4x4');
  }
  exigirFinitos(camera.view, 'view do quadro');
  exigirFinitos(camera.projection, 'projeção do quadro');
  exigirFinitos(camera.position, 'posição do quadro');
  const escritor = new Escritor(148);
  for (let i = 0; i < 16; i++) escritor.f32(camera.view[i] as number);
  for (let i = 0; i < 16; i++) escritor.f32(camera.projection[i] as number);
  for (let i = 0; i < 3; i++) escritor.f32(camera.position[i] as number);
  escritor.f32(camera.near);
  escritor.f32(camera.far);
  return escritor.concluir();
}
/** Sol de um quadro (`atualizar_sol`, 3 `f32`). */
export function codificarSol(sol: SolQuadro): Uint8Array {
  const escritor = new Escritor(12);
  escritor.f32(finito(sol.azimuth, 135));
  escritor.f32(limitar(sol.elevation, -90, 90, 45));
  escritor.f32(limitar(sol.intensity, 0, 1000, 3));
  return escritor.concluir();
}
/** Cliente conectado: uma instância de wasm guarda uma cena e um trabalho por vez. */
export class ClienteRenderWasm {
  readonly versaoAbi: number;
  private exports: ExportsRenderWasm | null;
  constructor(exports: ExportsRenderWasm) {
    if (typeof exports.versao_abi !== 'function') {
      throw new Error('render wasm: módulo sem `versao_abi` — o asset não é do renderizador do Hestia');
    }
    const versao = exports.versao_abi();
    if (versao !== VERSAO_ABI_RENDER) {
      throw new Error(`render wasm: ABI ${versao} incompatível (esperado ${VERSAO_ABI_RENDER})`);
    }
    this.versaoAbi = versao;
    this.exports = exports;
  }
  get descartado(): boolean {
    return this.exports === null;
  }
  private vivo(): ExportsRenderWasm {
    if (!this.exports) throw new Error('render wasm: cliente já foi descartado');
    return this.exports;
  }
  /** Reserva a arena, relê o buffer (pode ter crescido) e copia os bytes. */
  private escrever(bytes: Uint8Array): number {
    const wasm = this.vivo();
    const ptr = wasm.alocar(bytes.length);
    if (!ptr) throw new ErroRenderWasm(CODIGO_RENDER.interno, 'o wasm não reservou memória para a entrada');
    const buffer = wasm.memory.buffer;
    if (ptr + bytes.length > buffer.byteLength) {
      throw new ErroRenderWasm(CODIGO_RENDER.interno, 'arena do wasm menor que a entrada');
    }
    new Uint8Array(buffer, ptr, bytes.length).set(bytes);
    return ptr;
  }
  private conferir(codigo: number, contexto: string): void {
    if (codigo !== CODIGO_RENDER.ok) {
      throw new ErroRenderWasm(codigo, `${MENSAGENS[codigo] ?? `erro ${codigo}`} (${contexto})`);
    }
  }
  carregarCena(cena: RenderSceneSnapshot): void {
    const bytes = codificarCena(cena);
    this.conferir(this.vivo().carregar_cena(this.escrever(bytes), bytes.length), 'carregar cena');
  }
  prepararTrabalho(trabalho: TrabalhoRender): void {
    const bytes = codificarTrabalho(trabalho);
    this.conferir(this.vivo().preparar_trabalho(this.escrever(bytes), bytes.length), 'preparar trabalho');
  }
  /** Renderiza um bloco e devolve uma cópia RGBA8 sRGB (alfa opaco). */
  renderizarBloco(x: number, y: number, w: number, h: number, spp: number, seed: number): Uint8ClampedArray<ArrayBuffer> {
    const wasm = this.vivo();
    this.conferir(wasm.renderizar_bloco(x, y, w, h, spp, seed), 'renderizar bloco');
    const ptr = wasm.saida_ptr();
    const len = wasm.saida_len();
    const esperado = w * h * 4;
    if (len !== esperado) {
      throw new ErroRenderWasm(CODIGO_RENDER.interno, `saída do bloco com ${len} bytes; esperado ${esperado}`);
    }
    if (!ptr) throw new ErroRenderWasm(CODIGO_RENDER.interno, 'saída do bloco sem ponteiro');
    // `renderizar_bloco` pode ter crescido a memória: relê o buffer antes de copiar.
    const buffer = wasm.memory.buffer;
    if (ptr + len > buffer.byteLength) {
      throw new ErroRenderWasm(CODIGO_RENDER.interno, 'saída do bloco fora da memória do wasm');
    }
    return new Uint8ClampedArray(buffer.slice(ptr, ptr + len));
  }
  atualizarCamera(camera: CameraQuadro): void {
    const bytes = codificarCamera(camera);
    this.conferir(this.vivo().atualizar_camera(this.escrever(bytes), bytes.length), 'atualizar câmera');
  }
  atualizarSol(sol: SolQuadro): void {
    const bytes = codificarSol(sol);
    this.conferir(this.vivo().atualizar_sol(this.escrever(bytes), bytes.length), 'atualizar sol');
  }
  /** Liga a flag; vale para o próximo bloco (a chamada em andamento não é interrompida). */
  cancelar(): void {
    this.vivo().cancelar();
  }
  limparCancelamento(): void {
    this.vivo().limpar_cancelamento();
  }
  /** Solta a instância (o wasm não expõe `free`; o GC do navegador recolhe a memória). */
  dispose(): void {
    this.exports = null;
  }
}
export interface OpcoesCarregarWasm {
  url?: string; // padrão `/render_wasm.wasm`
  bytes?: ArrayBuffer | Uint8Array; // testes/offline: evita o `fetch`
  fetcher?: typeof fetch;
}
async function baixarWasm(opcoes: OpcoesCarregarWasm): Promise<Uint8Array> {
  const url = opcoes.url ?? '/render_wasm.wasm';
  const buscar = opcoes.fetcher ?? (typeof fetch === 'function' ? fetch : null);
  if (!buscar) throw new Error('render wasm: fetch indisponível neste ambiente');
  const resposta = await buscar(url);
  if (!resposta.ok) throw new Error(`render wasm: HTTP ${resposta.status} ao buscar ${url}`);
  return new Uint8Array(await resposta.arrayBuffer());
}
/** Carrega e instancia o wasm, validando o cabeçalho lógico (`versao_abi`). */
export async function criarClienteWasm(opcoes: OpcoesCarregarWasm = {}): Promise<ClienteRenderWasm> {
  const fonte = opcoes.bytes ?? (await baixarWasm(opcoes));
  const modulo = await WebAssembly.compile(new Uint8Array(fonte));
  const instancia = await WebAssembly.instantiate(modulo, {});
  return new ClienteRenderWasm(instancia.exports as unknown as ExportsRenderWasm);
}
let compartilhado: Promise<ClienteRenderWasm> | null = null;
/**
 * Instância única por sessão. Um render por vez: o wasm guarda cena/trabalho em estáticos.
 * Uma falha limpa o cache para a próxima tentativa poder baixar o asset de novo.
 */
export function clienteWasmCompartilhado(opcoes?: OpcoesCarregarWasm): Promise<ClienteRenderWasm> {
  if (!compartilhado) {
    compartilhado = criarClienteWasm(opcoes).catch((erro: unknown) => {
      compartilhado = null;
      throw erro;
    });
  }
  return compartilhado;
}