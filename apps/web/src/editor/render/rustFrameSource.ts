/**
 * Backend final de vídeo: `VideoFrameSource` sobre o renderizador Rust/WASM (T8).
 *
 * Mesma interface do contrato §3 (`apps/web/src/editor/render/frameSource.ts`, dono T3). Enquanto
 * aquele arquivo não existe, os tipos vivem aqui com a mesma forma — quando ele entrar, basta
 * trocar o import local pelo import de `./frameSource.ts`.
 *
 * Regras:
 * - a cena é carregada **uma vez** no `prepare`; cada frame só troca câmera/sol (`atualizar_*`);
 * - a câmera e o sol chegam já amostrados (`sampleCamera`/`sampleSun`): o backend não decide nada;
 * - o quadro inteiro é montado em RGBA8 e vira `VideoFrame` por um canvas 2D (OffscreenCanvas
 *   quando disponível), com timestamp em microssegundos como no contrato do encoder.
 */
import type { SheetView3DCamera } from '@hestia/model';
import type { AnimationSequence, RenderSceneSnapshot, SunState } from '@hestia/render';
import { clienteWasmCompartilhado, type ClienteRenderWasm } from './wasmClient.ts';
import { renderizarQuadroRgba } from './rustStillRenderer.ts';

/** Requisição de um frame — espelha `RenderFrameRequest` do contrato. */
export interface RenderFrameRequest {
  index: number;
  time: number;
  camera: SheetView3DCamera;
  sun: SunState | null;
}

/** Interface do contrato §3 — espelha `VideoFrameSource`. */
export interface VideoFrameSource {
  readonly kind: 'draft' | 'final';
  prepare(sequence: AnimationSequence): Promise<void>;
  renderFrame(req: RenderFrameRequest, width: number, height: number): Promise<VideoFrame>;
  dispose(): Promise<void>;
}

export interface OpcoesRustFrameSource {
  /** Snapshot já exportado por `ModelScene.exportarCenaDeRender`. */
  cena: RenderSceneSnapshot;
  /** Amostras por pixel; padrão 1 (vídeo final rápido). */
  spp?: number;
  seed?: number;
  /** Intensidade do sol quando `RenderFrameRequest.sun` existe; padrão 3. */
  intensidadeSol?: number;
  /** Lado do bloco; padrão 128. */
  bloco?: number;
  /** Cliente já carregado (teste/reuso); sem ele, usa a instância compartilhada. */
  cliente?: ClienteRenderWasm;
}

type Contexto2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Cria um canvas 2D fora do documento (preferência) ou no documento (fallback). */
function criarCanvas(largura: number, altura: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  contexto: Contexto2D;
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(largura, altura);
    const contexto = canvas.getContext('2d');
    if (contexto) return { canvas, contexto };
  }
  if (typeof document === 'undefined') {
    throw new Error('Sem canvas 2D para montar o quadro do vídeo final.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext('2d');
  if (!contexto) throw new Error('Este navegador não oferece canvas 2D para o vídeo final.');
  return { canvas, contexto };
}

export class RustFrameSource implements VideoFrameSource {
  readonly kind = 'final' as const;

  private readonly cena: RenderSceneSnapshot;
  private readonly spp: number;
  private readonly seed: number;
  private readonly intensidadeSol: number;
  private readonly bloco: number;
  private readonly clienteInformado: ClienteRenderWasm | null;

  private cliente: ClienteRenderWasm | null = null;
  private sequencia: AnimationSequence | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private contexto: Contexto2D | null = null;
  private imagem: ImageData | null = null;
  private pixels: Uint8ClampedArray<ArrayBuffer> | null = null;
  private largura = 0;
  private altura = 0;
  private sinal: AbortSignal | null = null;

  constructor(opcoes: OpcoesRustFrameSource) {
    this.cena = opcoes.cena;
    this.spp = opcoes.spp ?? 1;
    this.seed = opcoes.seed ?? 1;
    this.intensidadeSol = opcoes.intensidadeSol ?? 3;
    this.bloco = opcoes.bloco ?? 128;
    this.clienteInformado = opcoes.cliente ?? null;
  }

  /** Permite ao orquestrador cancelar entre frames (a chamada em andamento não para). */
  definirSinal(sinal: AbortSignal | null): void {
    this.sinal = sinal;
  }

  /** Liga a flag imediatamente; o próximo bloco/frame devolve o código 4. */
  cancelar(): void {
    this.cliente?.cancelar();
  }

  async prepare(sequence: AnimationSequence): Promise<void> {
    this.sequencia = sequence;
    this.cliente = this.clienteInformado ?? (await clienteWasmCompartilhado());
    this.cliente.limparCancelamento();
    // Uma vez por job: a BVH e a cena ficam no wasm; os frames seguintes só atualizam câmera/sol.
    this.cliente.carregarCena(this.cena);
  }

  async renderFrame(req: RenderFrameRequest, width: number, height: number): Promise<VideoFrame> {
    const sequencia = this.sequencia;
    const cliente = this.cliente;
    if (!sequencia || !cliente) {
      throw new Error('RustFrameSource: chame prepare() antes de renderFrame().');
    }
    const largura = Math.max(1, Math.round(width));
    const altura = Math.max(1, Math.round(height));
    this.prepararCanvas(largura, altura);

    const pixels = await renderizarQuadroRgba({
      cena: this.cena,
      largura,
      altura,
      // `exposure` da sequência é em paradas (EV), como no inspetor (-2..2).
      exposicao: sequencia.exposure,
      spp: this.spp,
      bloco: this.bloco,
      seed: this.seed,
      camera: req.camera,
      sol: req.sun
        ? { azimuth: req.sun.azimuth, elevation: req.sun.elevation, intensity: this.intensidadeSol }
        : undefined,
      sinal: this.sinal ?? undefined,
      cliente,
      // Cena já carregada no prepare; a flag de cancelamento é do job inteiro.
      recarregarCena: false,
      limparCancelamento: false,
      pixels: this.pixels ?? undefined,
    });

    this.pixels = pixels;
    const imagem = this.imagem ?? new ImageData(pixels, largura, altura);
    this.imagem = imagem;
    this.contexto?.putImageData(imagem, 0, 0);

    if (typeof VideoFrame === 'undefined') {
      throw new Error('Este navegador não oferece VideoFrame (WebCodecs) para o render final.');
    }
    const fps = sequencia.fps > 0 ? sequencia.fps : 30;
    const microsPorFrame = Math.round(1_000_000 / fps);
    // Timestamp do contrato: index · 1e6 / fps.
    return new VideoFrame(this.canvas as HTMLCanvasElement | OffscreenCanvas, {
      timestamp: Math.round((req.index * 1_000_000) / fps),
      duration: microsPorFrame,
    });
  }

  async dispose(): Promise<void> {
    this.descartarCanvas();
    this.sequencia = null;
    this.sinal = null;
    // O cliente compartilhado é da sessão; quem injetou um cliente é dono dele.
    this.cliente = null;
  }

  private prepararCanvas(largura: number, altura: number): void {
    if (this.canvas && this.largura === largura && this.altura === altura) return;
    this.descartarCanvas();
    const { canvas, contexto } = criarCanvas(largura, altura);
    this.canvas = canvas;
    this.contexto = contexto;
    this.largura = largura;
    this.altura = altura;
  }

  private descartarCanvas(): void {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.contexto = null;
    this.imagem = null;
    this.pixels = null;
    this.largura = 0;
    this.altura = 0;
  }
}
