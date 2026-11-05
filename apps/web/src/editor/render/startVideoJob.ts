import type { AnimationSequence, RenderSceneSnapshot } from '@hestia/render';
import { ModelScene, frameCount, sampleCamera, sampleSun } from '@hestia/render';
import { resolveLevel } from '@hestia/engine';
import { view3dOf } from '@hestia/model';
import { useAnimationStore } from '../animationStore.ts';
import { editor } from '../controller.ts';
import { saveRender } from '../renderGallery.ts';
import { useRenderJob } from '../renderProgress.ts';
import { useUi } from '../state.ts';
import { safeFilename } from '../nomeArquivo.ts';
import { saveBytes } from '../saveBytes.ts';
import { RustFrameSource } from './rustFrameSource.ts';
import { quadroDaCamera } from './rustStillRenderer.ts';
import { codificarCena, codificarCamera } from './wasmClient.ts';
import { comTexturasCarregadas } from './texturasCena.ts';
import { criarCenaNativa, removerCenaNativa, renderizarFrameNativo } from './nativeClient.ts';
import { encodeVideoWebCodecs } from './videoEncoderWebCodecs.ts';

export interface VideoJobOptions {
  /** Canvas da prévia, na resolução de rascunho. */
  canvas: HTMLCanvasElement;
}

const TIPOS = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

function tipoSuportado(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return TIPOS.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  }) ?? null;
}

function thumbnail(canvas: HTMLCanvasElement): string {
  try {
    const w = 320;
    const h = Math.max(1, Math.round((canvas.height / Math.max(1, canvas.width)) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')?.drawImage(canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}

/** Snapshot da cena para o path tracer (mesma montagem realista do 3D). */
function snapshotDaSequencia(seq: AnimationSequence): RenderSceneSnapshot {
  const p = editor.project;
  const camera = sampleCamera(seq, 0);
  const cena = new ModelScene();
  try {
    const projeto = { ...p, view3d: { ...view3dOf(p), style: 'realistic' as const, shadows: true, edges: true } };
    cena.update(projeto, p.levels.map((l) => resolveLevel(projeto, l.id)), { dark: false, edges: true, shadows: true });
    return cena.exportarCenaDeRender({ camera, aspect: seq.resolution.w / seq.resolution.h });
  } finally {
    cena.dispose();
  }
}

/** Render final: Rust/WASM nos quadros e WebCodecs no contêiner. */
async function startFinalVideo(seq: AnimationSequence, opts: VideoJobOptions): Promise<void> {
  const total = frameCount(seq);
  const job = useRenderJob.getState();
  const controlador = new AbortController();
  job.iniciar({ kind: 'video', phase: 'preparing', frame: 0, total, etaMs: null, message: 'Preparando o render final' });
  job.definirCancelar(() => controlador.abort());
  let fonte: RustFrameSource | null = null;
  try {
    const cena = await comTexturasCarregadas(snapshotDaSequencia(seq));
    fonte = new RustFrameSource({ cena, spp: 1, seed: Date.now() >>> 0 });
    fonte.definirSinal(controlador.signal);
    await fonte.prepare(seq);
    useRenderJob.getState().atualizar({ phase: 'rendering', message: 'Renderizando frames no Rust' });
    const codificado = await encodeVideoWebCodecs({
      width: seq.resolution.w,
      height: seq.resolution.h,
      fps: seq.fps,
      frames: total,
      signal: controlador.signal,
      onProgress: (frame, totalFrames) => {
        const t = frame / Math.max(1, seq.fps);
        useRenderJob.getState().atualizar({
          frame,
          total: totalFrames,
          etaMs: t > 0 ? Math.max(0, (seq.duration - t) * 1000) : null,
          message: 'Renderizando e codificando',
        });
      },
      renderFrame: (index) => {
        const t = index / Math.max(1, seq.fps);
        const source = fonte;
        if (!source) throw new Error('Render final sem fonte.');
        return source.renderFrame({ index, time: t, camera: sampleCamera(seq, t), sun: sampleSun(seq, t) }, seq.resolution.w, seq.resolution.h);
      },
    });
    useRenderJob.getState().atualizar({ phase: 'saving', frame: total, total, message: 'Salvando o vídeo' });
    const nome = safeFilename(`${seq.name || 'animacao'}.${codificado.extension}`);
    await saveRender({
      id: `render_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectName: editor.project.name,
      kind: 'video',
      name: nome,
      createdAt: Date.now(),
      width: codificado.width,
      height: codificado.height,
      fps: codificado.fps,
      duration: seq.duration,
      mime: codificado.mime,
      sequence: seq,
      thumbnail: thumbnail(opts.canvas),
    }, codificado.blob);
    await saveBytes(nome, new Uint8Array(await codificado.blob.arrayBuffer()));
    useUi.setState({ status: `Vídeo final renderizado: ${nome}.` });
  } catch (e) {
    if (controlador.signal.aborted) useUi.setState({ status: 'Render final cancelado.' });
    else useUi.setState({ status: `Não foi possível renderizar o vídeo final: ${e instanceof Error ? e.message : 'falha desconhecida'}` });
  } finally {
    await fonte?.dispose();
    useRenderJob.getState().definirCancelar(null);
    useRenderJob.getState().finalizar();
  }
}

/** Render final em GPU nativa: uma cena carregada no serviço e um frame por câmera. */
async function startGpuVideo(seq: AnimationSequence, opts: VideoJobOptions): Promise<void> {
  const total = frameCount(seq);
  const job = useRenderJob.getState();
  const controlador = new AbortController();
  job.iniciar({ kind: 'video', phase: 'preparing', frame: 0, total, etaMs: null, message: 'Preparando o render GPU nativo' });
  job.definirCancelar(() => controlador.abort());
  let cenaId: string | null = null;
  try {
    const hstr = codificarCena(await comTexturasCarregadas(snapshotDaSequencia(seq)));
    cenaId = await criarCenaNativa(hstr);
    const largura = seq.resolution.w;
    const altura = seq.resolution.h;
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Sem canvas 2D para montar os frames.');
    const aspecto = largura / altura;

    useRenderJob.getState().atualizar({ phase: 'rendering', message: 'Renderizando frames na GPU' });
    const codificado = await encodeVideoWebCodecs({
      width: largura,
      height: altura,
      fps: seq.fps,
      frames: total,
      signal: controlador.signal,
      onProgress: (frame, totalFrames) => {
        const t = frame / Math.max(1, seq.fps);
        useRenderJob.getState().atualizar({
          frame,
          total: totalFrames,
          etaMs: t > 0 ? Math.max(0, (seq.duration - t) * 1000) : null,
          message: 'Renderizando na GPU e codificando',
        });
      },
      renderFrame: async (index) => {
        const t = index / Math.max(1, seq.fps);
        const camera = sampleCamera(seq, t);
        const payload = codificarCamera(quadroDaCamera(camera, aspecto));
        const png = await renderizarFrameNativo(cenaId!, payload, {
          largura,
          altura,
          exposicao: seq.exposure,
          sinal: controlador.signal,
        });
        const bitmap = await createImageBitmap(png);
        contexto.clearRect(0, 0, largura, altura);
        contexto.drawImage(bitmap, 0, 0, largura, altura);
        bitmap.close();
        return new VideoFrame(canvas, {
          timestamp: Math.round((index * 1_000_000) / Math.max(1, seq.fps)),
          duration: Math.round(1_000_000 / Math.max(1, seq.fps)),
        });
      },
    });
    useRenderJob.getState().atualizar({ phase: 'saving', frame: total, total, message: 'Salvando o vídeo' });
    const nome = safeFilename(`${seq.name || 'animacao'}.${codificado.extension}`);
    await saveRender({
      id: `render_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      projectName: editor.project.name,
      kind: 'video',
      name: nome,
      createdAt: Date.now(),
      width: codificado.width,
      height: codificado.height,
      fps: codificado.fps,
      duration: seq.duration,
      mime: codificado.mime,
      sequence: seq,
      thumbnail: thumbnail(opts.canvas),
    }, codificado.blob);
    await saveBytes(nome, new Uint8Array(await codificado.blob.arrayBuffer()));
    useUi.setState({ status: `Vídeo final renderizado na GPU: ${nome}.` });
  } catch (e) {
    if (controlador.signal.aborted) useUi.setState({ status: 'Render GPU cancelado.' });
    else useUi.setState({ status: `Não foi possível renderizar na GPU: ${e instanceof Error ? e.message : 'falha desconhecida'}` });
  } finally {
    if (cenaId) await removerCenaNativa(cenaId);
    useRenderJob.getState().definirCancelar(null);
    useRenderJob.getState().finalizar();
  }
}

/**
 * Render de vídeo: rascunho grava a própria prévia 3D (MediaRecorder); final usa Rust/WASM +
 * WebCodecs; GPU usa o render-service nativo. A sequência é a mesma.
 */
export async function startVideoJob(seq: AnimationSequence, opts: VideoJobOptions): Promise<void> {
  if (seq.quality === 'gpu') {
    await startGpuVideo(seq, opts);
    return;
  }
  if (seq.quality === 'final') {
    await startFinalVideo(seq, opts);
    return;
  }
  const mime = tipoSuportado();
  if (!mime || typeof MediaRecorder === 'undefined') {
    useUi.setState({ status: 'Este navegador não suporta gravação de vídeo (MediaRecorder).' });
    return;
  }

  const store = useAnimationStore.getState();
  const total = frameCount(seq);
  const job = useRenderJob.getState();
  let cancelado = false;
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  store.setPlaying(false);
  store.setPlayhead(0);
  job.iniciar({ kind: 'video', phase: 'preparing', frame: 0, total, etaMs: null, message: 'Preparando a gravação' });

  const stream = opts.canvas.captureStream(Math.max(1, Math.min(60, seq.fps)));
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.max(2_000_000, Math.round(seq.resolution.w * seq.resolution.h * seq.fps * 0.09)),
  });
  const pedacos: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) pedacos.push(e.data); };

  const finalizar = (): void => {
    if (intervalo) clearInterval(intervalo);
    if (timeout) clearTimeout(timeout);
    intervalo = null;
    timeout = null;
    stream.getTracks().forEach((t) => t.stop());
    useAnimationStore.getState().setPlaying(false);
    useRenderJob.getState().definirCancelar(null);
    useRenderJob.getState().finalizar();
  };

  const parar = (): void => {
    if (rec.state !== 'inactive') rec.stop();
  };
  job.definirCancelar(() => {
    cancelado = true;
    parar();
  });

  const parada = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    rec.onerror = () => resolve();
  });

  rec.start(100);
  useRenderJob.getState().atualizar({ phase: 'rendering', message: 'Gravando a prévia' });
  store.setPlaying(true);

  intervalo = setInterval(() => {
    const s = useAnimationStore.getState();
    const ativa = s.activeId ? s.sequences[s.activeId] : undefined;
    const t = s.playhead;
    const frame = Math.min(total, Math.max(0, Math.round(t * seq.fps)));
    const eta = t > 0.2 ? Math.max(0, (seq.duration - t) * 1000) : null;
    useRenderJob.getState().atualizar({ frame, total, etaMs: eta, message: 'Gravando a prévia' });
    if (!ativa || (!s.playing && t >= ativa.duration - 0.05)) parar();
  }, 100);

  // Segurança: se a prévia travar, não deixa a barra presa para sempre.
  timeout = setTimeout(parar, (seq.duration + 15) * 1000);

  await parada;
  if (intervalo) clearInterval(intervalo);
  if (timeout) clearTimeout(timeout);

  if (cancelado) {
    finalizar();
    useUi.setState({ status: 'Gravação de vídeo cancelada.' });
    return;
  }

  useRenderJob.getState().atualizar({ phase: 'saving', frame: total, total, message: 'Salvando o vídeo' });
  const blob = new Blob(pedacos, { type: mime });
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const nome = safeFilename(`${seq.name || 'animacao'}.${ext}`);
  const assetId = `render_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    await saveRender({
      id: assetId,
      projectName: editor.project.name,
      kind: 'video',
      name: nome,
      createdAt: Date.now(),
      width: opts.canvas.width,
      height: opts.canvas.height,
      fps: seq.fps,
      duration: seq.duration,
      mime,
      sequence: seq,
      thumbnail: thumbnail(opts.canvas),
    }, blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const msg = await saveBytes(nome, bytes);
    useUi.setState({ status: `Vídeo renderizado: ${msg}` });
  } catch (e) {
    useUi.setState({ status: `Vídeo gerado, mas não foi possível salvar: ${e instanceof Error ? e.message : 'falha desconhecida'}` });
  } finally {
    finalizar();
  }
}
