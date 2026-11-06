/**
 * Leitura dos pixels das texturas no worker (`workerRender.lerPixelsNoWorker`, usada por `carregarTexturaRgba`).
 *
 * O ambiente é `node`, sem `createImageBitmap`, `OffscreenCanvas` nem `Worker`. Por isso o teste simula os três:
 * - a imagem é um arquivo sintético (4 bytes de largura/altura + RGBA8), decodificado pelo `createImageBitmap` simulado;
 * - o `OffscreenCanvas` simulado faz a redução por vizinho mais próximo, a mesma conta no caminho direto e no worker;
 * - o worker simulado roda `tratarPedidoRender` (a lógica do worker real). O bitmap não passa pelo `structuredClone` do
 *   Node (não é clonável), então o pedido de pixels segue por referência; a transferência não é simulada aqui.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderSceneSnapshot } from '@hestia/render';
import { carregarTexturaRgba } from './texturaRender.ts';
import { carregarTexturasDoSnapshot, limparCacheDeTexturas } from './texturasCena.ts';
import { tratarPedidoRender, type PedidoRender, type RespostaRender } from './renderWorker.ts';
import { encerrarWorkerCompartilhado } from './workerRender.ts';

/** Imagem sintética 37×19 (lado ímpar: o vizinho mais próximo cai em pixels diferentes em cada redução). */
const LARGURA_IMAGEM = 37;
const ALTURA_IMAGEM = 19;
const bytesDaImagem = (): Uint8Array<ArrayBuffer> => {
  const arquivo = new Uint8Array(4 + LARGURA_IMAGEM * ALTURA_IMAGEM * 4);
  arquivo[0] = LARGURA_IMAGEM & 0xff;
  arquivo[1] = LARGURA_IMAGEM >> 8;
  arquivo[2] = ALTURA_IMAGEM & 0xff;
  arquivo[3] = ALTURA_IMAGEM >> 8;
  for (let i = 4; i < arquivo.length; i++) arquivo[i] = (i * 37 + 11) & 0xff;
  return arquivo;
};

class BitmapSimulado {
  fechado = false;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly pixels: Uint8Array,
  ) {}
  close(): void {
    this.fechado = true;
  }
}

class ContextoSimulado {
  imageSmoothingQuality = 'low';
  constructor(private readonly canvas: CanvasSimulado) {}
  /** Vizinho mais próximo: determinístico, igual para o caminho direto e para o worker. */
  drawImage(origem: BitmapSimulado, dx: number, dy: number, dw: number, dh: number): void {
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(origem.height - 1, Math.floor(((y + 0.5) * origem.height) / dh));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(origem.width - 1, Math.floor(((x + 0.5) * origem.width) / dw));
        const o = (sy * origem.width + sx) * 4;
        const d = ((dy + y) * this.canvas.width + dx + x) * 4;
        for (let c = 0; c < 4; c++) this.canvas.pixels[d + c] = origem.pixels[o + c]!;
      }
    }
  }
  getImageData(_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray } {
    return { data: this.canvas.pixels.subarray(0, w * h * 4) };
  }
}

class CanvasSimulado {
  readonly pixels: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  getContext(tipo: string): ContextoSimulado | null {
    return tipo === '2d' ? new ContextoSimulado(this) : null;
  }
}

let falharLeitura = false;
/** Worker sem `OffscreenCanvas` (a janela tem): a leitura volta para a thread principal. */
let workerSemOffscreen = false;
const instancias: WorkerLeituraSimulado[] = [];

class WorkerLeituraSimulado {
  onmessage: ((evento: { data: RespostaRender }) => void) | null = null;
  onerror: ((evento: { message: string }) => void) | null = null;
  encerrado = false;
  readonly tipos: string[] = [];
  constructor() {
    instancias.push(this);
  }
  postMessage(pedido: PedidoRender): void {
    this.tipos.push(pedido.tipo);
    setTimeout(() => {
      if (this.encerrado) return;
      if (falharLeitura && pedido.tipo === 'pixels') {
        setTimeout(() => this.onmessage?.({ data: { id: pedido.id, ok: false, mensagem: 'imagem corrompida simulada' } }), 0);
        return;
      }
      // O worker simulado decide pelo mesmo global que o worker real (`typeof OffscreenCanvas`).
      const guardado = globalThis.OffscreenCanvas;
      if (workerSemOffscreen) vi.stubGlobal('OffscreenCanvas', undefined);
      try {
        void tratarPedidoRender(pedido, (resposta) => {
          setTimeout(() => {
            if (!this.encerrado) this.onmessage?.({ data: resposta });
          }, 0);
        });
      } finally {
        if (workerSemOffscreen) vi.stubGlobal('OffscreenCanvas', guardado);
      }
    }, 0);
  }
  terminate(): void {
    this.encerrado = true;
  }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Cena mínima: só a lista de texturas pendentes importa para o carregamento. */
const cenaComTextura = (caminho: string): RenderSceneSnapshot =>
  ({ texturas: [{ caminho, largura: 0, altura: 0, mips: [] }] }) as unknown as RenderSceneSnapshot;

beforeEach(() => {
  falharLeitura = false;
  workerSemOffscreen = false;
  instancias.length = 0;
  limparCacheDeTexturas();
  encerrarWorkerCompartilhado();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(bytesDaImagem(), { status: 200 })));
  vi.stubGlobal(
    'createImageBitmap',
    async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const largura = bytes[0]! | (bytes[1]! << 8);
      const altura = bytes[2]! | (bytes[3]! << 8);
      return new BitmapSimulado(largura, altura, bytes.subarray(4));
    },
  );
  vi.stubGlobal('OffscreenCanvas', CanvasSimulado);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  encerrarWorkerCompartilhado();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('leitura de pixels no worker', () => {
  it('mesmo RGBA que o caminho direto, e a leitura sai pelo worker', async () => {
    const direto = await carregarTexturaRgba('/texturas-render/madeira.jpg', 16);
    expect(instancias).toHaveLength(0);
    vi.stubGlobal('Worker', WorkerLeituraSimulado);
    const viaWorker = await carregarTexturaRgba('/texturas-render/madeira.jpg', 16);
    expect(viaWorker.largura).toBe(direto.largura);
    expect(viaWorker.altura).toBe(direto.altura);
    expect(viaWorker.rgba.byteLength).toBe(16 * 8 * 4);
    expect(sha256(viaWorker.rgba)).toBe(sha256(direto.rgba));
    expect(instancias.some((w) => w.tipos.includes('pixels'))).toBe(true);
  });

  it('worker sem OffscreenCanvas: a leitura volta para a thread principal, mesmo RGBA, com um aviso só', async () => {
    const referencia = await carregarTexturaRgba('/texturas-render/madeira.jpg', 16);
    vi.stubGlobal('Worker', WorkerLeituraSimulado);
    workerSemOffscreen = true;
    const viaWorker = await carregarTexturaRgba('/texturas-render/madeira.jpg', 16);
    await carregarTexturaRgba('/texturas-render/madeira.jpg', 16);
    expect(sha256(viaWorker.rgba)).toBe(sha256(referencia.rgba));
    expect(instancias.some((w) => w.tipos.includes('pixels'))).toBe(true);
    const avisos = vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('OffscreenCanvas'));
    expect(avisos).toHaveLength(1);
  });

  it('sem OffscreenCanvas em lugar nenhum: erro explícito com o caminho do arquivo, nada de mensagem genérica', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const erro = await carregarTexturasDoSnapshot(cenaComTextura('madeira/carvalho.jpg'), { lado: 16 }).catch((e: unknown) => e);
    expect((erro as Error).message).toMatch(/madeira\/carvalho\.jpg/);
    expect((erro as Error).message).toMatch(/OffscreenCanvas indisponível/);
  });
});

describe('erro de textura mantém a mensagem com o caminho', () => {
  it('falha da leitura no worker: a mensagem traz o caminho do arquivo e o motivo', async () => {
    vi.stubGlobal('Worker', WorkerLeituraSimulado);
    falharLeitura = true;
    const erro = await carregarTexturasDoSnapshot(cenaComTextura('madeira/carvalho.jpg'), { lado: 16 }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/madeira\/carvalho\.jpg/);
    expect((erro as Error).message).toMatch(/imagem corrompida simulada/);
  });

  it('HTTP de erro ao buscar a imagem: a mensagem traz o caminho do arquivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('não existe', { status: 404 })));
    const erro = await carregarTexturasDoSnapshot(cenaComTextura('pedra/granito.png'), { lado: 16 }).catch((e: unknown) => e);
    expect((erro as Error).message).toMatch(/pedra\/granito\.png/);
    expect((erro as Error).message).toMatch(/404/);
  });
});
