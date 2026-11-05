import { ArrayBufferTarget, Muxer } from 'webm-muxer';

/**
 * Encoder de vídeo do render final: recebe `VideoFrame`s prontos (Rust/WASM) e grava WebM por
 * WebCodecs. A codificação usa o hardware/software do navegador; o path tracer continua no Rust.
 */

export interface VideoEncodeOptions {
  width: number;
  height: number;
  fps: number;
  frames: number;
  bitrate?: number;
  signal?: AbortSignal;
  onProgress?: (frame: number, total: number) => void;
  renderFrame: (index: number) => Promise<VideoFrame>;
}

export interface EncodedVideo {
  blob: Blob;
  mime: string;
  extension: 'webm';
  width: number;
  height: number;
  fps: number;
  frames: number;
}

interface Codec {
  /** Codec do WebCodecs. */
  codec: string;
  /** Codec no contêiner WebM. */
  webm: string;
}

const CODECS: Codec[] = [
  { codec: 'vp09.00.10.08', webm: 'V_VP9' },
  { codec: 'vp8', webm: 'V_VP8' },
];

async function escolherCodec(width: number, height: number, fps: number, bitrate: number): Promise<Codec> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('Este navegador não oferece WebCodecs (VideoEncoder) para o render final.');
  }
  for (const c of CODECS) {
    try {
      const suporte = await VideoEncoder.isConfigSupported({
        codec: c.codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (suporte.supported) return c;
    } catch {
      // tenta o próximo
    }
  }
  throw new Error('Nenhum codec de vídeo (VP9/VP8) está disponível neste navegador.');
}

/**
 * Codifica `frames` quadros produzidos por `renderFrame`. O timestamp vem do próprio `VideoFrame`
 * (o `RustFrameSource` já usa `index * 1e6 / fps`).
 */
export async function encodeVideoWebCodecs(opts: VideoEncodeOptions): Promise<EncodedVideo> {
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));
  const fps = Number.isFinite(opts.fps) && opts.fps > 0 ? opts.fps : 30;
  const total = Math.max(1, Math.round(opts.frames));
  const bitrate = opts.bitrate ?? Math.max(2_000_000, Math.round(width * height * fps * 0.08));
  const codec = await escolherCodec(width, height, fps, bitrate);
  if (opts.signal?.aborted) throw new Error('Render cancelado.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: codec.webm, width, height, frameRate: fps },
  });

  let erro: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try { muxer.addVideoChunk(chunk, meta); } catch (e) { erro = e instanceof Error ? e : new Error(String(e)); }
    },
    error: (e) => { erro = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure({
    codec: codec.codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  });

  try {
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new Error('Render cancelado.');
      if (erro) throw erro;
      const frame = await opts.renderFrame(i);
      if (opts.signal?.aborted) {
        frame.close();
        throw new Error('Render cancelado.');
      }
      encoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 });
      frame.close();
      opts.onProgress?.(i + 1, total);
      // Deixa o encoder respirar e mantém a fila curta em vídeos longos.
      if (encoder.encodeQueueSize > 8) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 0);
          encoder.addEventListener('dequeue', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
    }
    await encoder.flush();
    if (erro) throw erro;
    muxer.finalize();
  } finally {
    try { encoder.close(); } catch { /* já fechado */ }
  }

  return {
    blob: new Blob([target.buffer], { type: 'video/webm' }),
    mime: 'video/webm',
    extension: 'webm',
    width,
    height,
    fps,
    frames: total,
  };
}
