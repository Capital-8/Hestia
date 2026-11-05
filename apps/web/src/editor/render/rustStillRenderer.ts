/**
 * Imagem final pelo renderizador Rust/WASM (T8).
 *
 * Renderiza a cena em blocos (128×128 por padrão), junta os blocos num RGBA8 único e devolve
 * `ImageData` + `Blob` PNG por canvas. A cena é carregada uma vez por quadro; o vídeo reaproveita
 * a mesma função com `recarregarCena: false`.
 *
 * O Rust já entrega RGBA8 **sRGB com tone mapping aplicado** (`wasmClient.lerBloco`): o canvas só
 * copia os bytes, sem nenhum ajuste de cor no JS.
 */
import type { SheetView3DCamera } from '@hestia/model';
import type { RenderSceneSnapshot } from '@hestia/render';
import {
  CODIGO_RENDER,
  ErroRenderWasm,
  clienteWasmCompartilhado,
  fatorExposicao,
  type CameraQuadro,
  type ClienteRenderWasm,
  type SolQuadro,
} from './wasmClient.ts';

/** Lado padrão de um bloco: bom equilíbrio entre progresso, cancelamento e overhead. */
export const TAMANHO_BLOCO_PADRAO = 128;

/** Campo de visão vertical do editor, o mesmo da `OrbitCamera` (38°). */
export const FOV_Y_RENDER = (38 * Math.PI) / 180;

/** Elevação máxima da câmera, como `POLE_ELEVATION` da órbita: evita `lookAt` degenerado. */
const POLO_ELEVACAO = Math.PI / 2 - 0.02;

type Vec3 = readonly [number, number, number];

const subtrair = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const produtoVetorial = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const produtoEscalar = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalizar = (a: Vec3): Vec3 => {
  const comprimento = Math.hypot(a[0], a[1], a[2]);
  return comprimento > 1e-9 ? [a[0] / comprimento, a[1] / comprimento, a[2] / comprimento] : [0, 1, 0];
};
const finito = (valor: number, padrao: number): number => (Number.isFinite(valor) ? valor : padrao);
const limitar = (valor: number, minimo: number, maximo: number, padrao: number): number =>
  Math.min(maximo, Math.max(minimo, finito(valor, padrao)));

/** View de `lookAt` em coluna maior, Z para cima (mesma convenção do three/`OrbitCamera`). */
function matrizVista(olho: Vec3, alvo: Vec3): Float32Array {
  const frente = normalizar(subtrair(alvo, olho));
  const direita = normalizar(produtoVetorial(frente, [0, 0, 1]));
  const cima = produtoVetorial(direita, frente);
  const tras: Vec3 = [-frente[0], -frente[1], -frente[2]];
  const m = new Float32Array(16);
  m[0] = direita[0];
  m[1] = cima[0];
  m[2] = tras[0];
  m[4] = direita[1];
  m[5] = cima[1];
  m[6] = tras[1];
  m[8] = direita[2];
  m[9] = cima[2];
  m[10] = tras[2];
  m[12] = -produtoEscalar(direita, olho);
  m[13] = -produtoEscalar(cima, olho);
  m[14] = -produtoEscalar(tras, olho);
  m[15] = 1;
  return m;
}

function matrizPerspectiva(aspecto: number, perto: number, longe: number): Float32Array {
  const f = 1 / Math.tan(FOV_Y_RENDER / 2);
  const inverso = 1 / (perto - longe);
  const m = new Float32Array(16);
  m[0] = f / Math.max(1e-3, aspecto);
  m[5] = f;
  m[10] = (longe + perto) * inverso;
  m[11] = -1;
  m[14] = 2 * longe * perto * inverso;
  return m;
}

function matrizOrtografica(aspecto: number, perto: number, longe: number, distancia: number): Float32Array {
  const metade = Math.max(1e-3, distancia * Math.tan(FOV_Y_RENDER / 2));
  const direita = metade * Math.max(1e-3, aspecto);
  const m = new Float32Array(16);
  m[0] = 1 / direita;
  m[5] = 1 / metade;
  m[10] = -2 / (longe - perto);
  m[14] = -(longe + perto) / (longe - perto);
  m[15] = 1;
  return m;
}

/**
 * Matrizes de um quadro a partir do retrato orbital (`SheetView3DCamera`), com o mesmo fov e
 * enquadramento da prévia. O render não decide a câmera: só converte.
 */
export function quadroDaCamera(camera: SheetView3DCamera, aspecto: number): CameraQuadro {
  const azimute = finito(camera.azimuth, 0);
  const elevacao = limitar(camera.elevation, -POLO_ELEVACAO, POLO_ELEVACAO, 0.5);
  const distancia = limitar(camera.distance, 0.01, 100000, 10);
  const alvo: Vec3 = [
    finito(camera.target.x, 0),
    finito(camera.target.y, 0),
    finito(camera.target.z, 0),
  ];
  const olho: Vec3 = [
    alvo[0] + distancia * Math.cos(elevacao) * Math.cos(azimute),
    alvo[1] + distancia * Math.cos(elevacao) * Math.sin(azimute),
    alvo[2] + distancia * Math.sin(elevacao),
  ];
  const perto = Math.min(0.5, Math.max(0.01, distancia * 0.005));
  const longe = Math.max(2000, distancia * 2);
  return {
    view: matrizVista(olho, alvo),
    projection: camera.ortho
      ? matrizOrtografica(aspecto, perto, longe, distancia)
      : matrizPerspectiva(aspecto, perto, longe),
    position: [olho[0], olho[1], olho[2]],
    near: perto,
    far: longe,
  };
}

export interface ProgressoRender {
  /** Blocos concluídos (1-based). */
  bloco: number;
  blocos: number;
  /** 0..1 */
  fracao: number;
}

export interface OpcoesQuadroRust {
  cena: RenderSceneSnapshot;
  largura: number;
  altura: number;
  /** Exposição em paradas (EV), como `AnimationSequence.exposure`. */
  exposicao?: number;
  /** Amostras por pixel; padrão 1. */
  spp?: number;
  /** Lado do bloco em pixels; padrão 128. */
  bloco?: number;
  seed?: number;
  /** Substitui a câmera do snapshot (recalculada com o aspecto final). */
  camera?: SheetView3DCamera;
  /** Atualiza o sol sem recarregar a cena (vídeo/solar). */
  sol?: SolQuadro;
  sinal?: AbortSignal;
  cliente?: ClienteRenderWasm;
  /**
   * `false` quando o cliente já carregou a cena (vídeo): evita reconstruir a BVH por frame.
   * Padrão `true`.
   */
  recarregarCena?: boolean;
  /** Padrão `true`; o vídeo limpa a flag uma vez no `prepare`, não a cada frame. */
  limparCancelamento?: boolean;
  /** Buffer reaproveitado entre frames; precisa ter `largura * altura * 4` bytes. */
  pixels?: Uint8ClampedArray<ArrayBuffer>;
  aoProgredir?: (progresso: ProgressoRender) => void;
}

function ceder(): Promise<void> {
  return new Promise<void>((resolver) => {
    setTimeout(resolver, 0);
  });
}

function inteiro(valor: number, padrao: number, minimo: number, maximo: number): number {
  const n = Number.isFinite(valor) ? Math.round(valor) : padrao;
  return Math.min(maximo, Math.max(minimo, n));
}

/**
 * Renderiza o quadro em blocos e devolve o RGBA8 completo.
 *
 * O laço cede o event loop entre blocos (a interface continua respondendo) e confere o
 * `AbortSignal` antes de cada bloco. Cancelar no meio de um bloco só tem efeito no próximo,
 * porque o wasm é síncrono.
 */
export async function renderizarQuadroRgba(
  opcoes: OpcoesQuadroRust,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  if (opcoes.sinal?.aborted) throw new ErroRenderWasm(CODIGO_RENDER.cancelado);

  const largura = inteiro(opcoes.largura, 1, 1, 16384);
  const altura = inteiro(opcoes.altura, 1, 1, 16384);
  const spp = inteiro(opcoes.spp ?? 1, 1, 1, 4096);
  const bloco = inteiro(opcoes.bloco ?? TAMANHO_BLOCO_PADRAO, TAMANHO_BLOCO_PADRAO, 16, 1024);
  const seed = (opcoes.seed ?? 1) >>> 0;

  const cliente = opcoes.cliente ?? (await clienteWasmCompartilhado());
  if (opcoes.limparCancelamento !== false) cliente.limparCancelamento();
  if (opcoes.recarregarCena !== false) cliente.carregarCena(opcoes.cena);
  if (opcoes.camera) cliente.atualizarCamera(quadroDaCamera(opcoes.camera, largura / altura));
  if (opcoes.sol) cliente.atualizarSol(opcoes.sol);
  cliente.prepararTrabalho({
    largura,
    altura,
    exposicao: fatorExposicao(opcoes.exposicao ?? 0),
  });

  const totalBytes = largura * altura * 4;
  const pixels =
    opcoes.pixels && opcoes.pixels.length === totalBytes
      ? opcoes.pixels
      : new Uint8ClampedArray(totalBytes);

  const colunas = Math.ceil(largura / bloco);
  const linhas = Math.ceil(altura / bloco);
  const blocos = colunas * linhas;
  let feitos = 0;

  for (let y = 0; y < altura; y += bloco) {
    const alturaBloco = Math.min(bloco, altura - y);
    for (let x = 0; x < largura; x += bloco) {
      if (opcoes.sinal?.aborted) {
        cliente.cancelar();
        throw new ErroRenderWasm(CODIGO_RENDER.cancelado);
      }
      const larguraBloco = Math.min(bloco, largura - x);
      const pedaco = cliente.renderizarBloco(x, y, larguraBloco, alturaBloco, spp, seed);
      // Copia linha a linha porque a saída do bloco é compacta (sem a largura do quadro inteiro).
      for (let linha = 0; linha < alturaBloco; linha++) {
        const origem = linha * larguraBloco * 4;
        const destino = ((y + linha) * largura + x) * 4;
        pixels.set(pedaco.subarray(origem, origem + larguraBloco * 4), destino);
      }
      feitos++;
      opcoes.aoProgredir?.({ bloco: feitos, blocos, fracao: feitos / blocos });
      await ceder();
    }
  }
  return pixels;
}

export interface ImagemRenderRust {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  imagem: ImageData;
  png: Blob;
  largura: number;
  altura: number;
}

function criarImagem(pixels: Uint8ClampedArray<ArrayBuffer>, largura: number, altura: number): ImageData {
  if (typeof ImageData === 'undefined') {
    throw new Error('Este navegador não oferece ImageData para montar a imagem final.');
  }
  return new ImageData(pixels, largura, altura);
}

/** Converte o RGBA do Rust em PNG por canvas 2D (nenhum filtro adicional). */
function canvasParaPng(imagem: ImageData): Promise<Blob> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Sem documento para gerar o PNG do render final.'));
  }
  const canvas = document.createElement('canvas');
  canvas.width = imagem.width;
  canvas.height = imagem.height;
  const contexto = canvas.getContext('2d');
  if (!contexto) {
    canvas.width = 0;
    canvas.height = 0;
    return Promise.reject(new Error('Este navegador não oferece canvas 2D para o render final.'));
  }
  contexto.putImageData(imagem, 0, 0);
  return new Promise<Blob>((resolver, rejeitar) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolver(blob);
      else rejeitar(new Error('O navegador não conseguiu gerar o PNG do render final.'));
    }, 'image/png');
  });
}

/** Imagem final de apresentação: pixels, `ImageData` e PNG prontos para o download. */
export async function renderizarImagemRust(opcoes: OpcoesQuadroRust): Promise<ImagemRenderRust> {
  const largura = inteiro(opcoes.largura, 1, 1, 16384);
  const altura = inteiro(opcoes.altura, 1, 1, 16384);
  const pixels = await renderizarQuadroRgba({ ...opcoes, largura, altura });
  const imagem = criarImagem(pixels, largura, altura);
  const png = await canvasParaPng(imagem);
  return { pixels, imagem, png, largura, altura };
}
