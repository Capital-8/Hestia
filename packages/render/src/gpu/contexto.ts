import * as THREE from 'three';
import { contadores } from '../perf/registro.ts';
import { instrumentarWebGl2, type InstrumentacaoGl } from '../perf/webgl.ts';
import { instrumentarWebGpu, type InstrumentacaoWebGpu } from '../perf/webgpu.ts';
import {
  definirBackendGpu,
  definirRestauracaoGpu,
  definirTimerGpu,
  GuardaDeRecuperacao,
  registrarPerdaGpu,
  registrarTentativaRestauracao,
  restaurarContexto,
} from './backend.ts';
import { t, type Lang } from '../i18n.ts';

export type Backend = 'webgpu' | 'webgl2' | 'none';

export interface GpuContext {
  backend: Backend;
  renderer: THREE.WebGLRenderer;
  setSize(w: number, h: number, dpr: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Chamado se o dispositivo de GPU for perdido (driver reiniciou, aba em segundo plano, etc.). */
  onLost(cb: (reason: string) => void): void;
  /** Chamado quando o **mesmo** contexto WebGL2 voltou: a cena precisa ser reenviada (recursos de GPU sumiram). */
  onRestored(cb: () => void): void;
  dispose(): void;
}

interface DeviceGpu {
  lost?: Promise<{ message?: string; reason?: string }>;
  destroy?: () => void;
  queue?: unknown;
}

interface AdapterGpu {
  features?: { has(nome: string): boolean };
  requestDevice(descricao?: { requiredFeatures?: string[] }): Promise<DeviceGpu>;
}

interface NavigatorGpu {
  gpu?: { requestAdapter(opcoes?: { powerPreference?: string }): Promise<AdapterGpu | null> };
}

interface RendererWebGpu extends THREE.WebGLRenderer {
  init(): Promise<void>;
  backend?: { isWebGPUBackend?: boolean };
  onDeviceLost?: (info: { message?: string; reason?: string }) => void;
  resolveTimestampsAsync?: (tipo?: string) => Promise<number | undefined>;
}

type WebGpuCtor = new (o: { canvas: HTMLCanvasElement; antialias: boolean; device?: DeviceGpu; trackTimestamp?: boolean }) => RendererWebGpu;

/** O contexto criado e o que ele precisa para recuperar/simular perda. */
interface RecursosContexto {
  gl?: WebGL2RenderingContext;
  /** `WEBGL_lose_context`: `restoreContext()` mora na extensão, não no contexto. */
  lose?: { loseContext(): void; restoreContext(): void } | null;
  device?: DeviceGpu;
}

const lostCbs = new WeakMap<GpuContext, (reason: string) => void>();
const restoredCbs = new WeakMap<GpuContext, () => void>();
const wgpuInstr = new WeakMap<GpuContext, InstrumentacaoWebGpu>();
const recursos = new WeakMap<GpuContext, RecursosContexto>();
const amostradores = new WeakMap<GpuContext, () => void>();
const perdaPendente = new WeakMap<GpuContext, string>();
/** Só a primeira perda não recuperada de um contexto vira boot novo; as seguintes já estão a caminho da queda. */
const perdaNotificada = new WeakSet<GpuContext>();

export function mensagem(e: unknown): string {
  const texto = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return (texto || 'falha desconhecida').slice(0, 160);
}

/** Um quadro de verdade: a sonda S0 mostrou que o `restoreContext()` só pega depois de um rAF. */
function notificarPerda(ctx: GpuContext, motivo: string): void {
  if (perdaNotificada.has(ctx)) return;
  perdaNotificada.add(ctx);
  const cb = lostCbs.get(ctx);
  if (cb) cb(motivo);
  else perdaPendente.set(ctx, motivo);
}

/**
 * Pede **um adapter novo por dispositivo**: no Chrome o `GPUAdapter` fica "consumed" depois do primeiro
 * `requestDevice()`, então recriar o dispositivo com o mesmo adapter falha (achado S0).
 */
async function criarDispositivo(): Promise<{ device: DeviceGpu; timer: boolean } | null> {
  const nav = navigator as Navigator & NavigatorGpu;
  if (!nav.gpu) return null;
  const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const timer = contadores.ativo && adapter.features?.has('timestamp-query') === true;
  const device = await adapter.requestDevice(timer ? { requiredFeatures: ['timestamp-query'] } : undefined);
  return { device, timer };
}

/**
 * Timer de GPU do WebGPU: o three expõe `resolveTimestampsAsync` (query pool `timestamp-query`). Amostra a cada
 * 15 quadros, sem bloquear o desenho; o resultado entra nos contadores do S1 como qualquer timer de GPU.
 */
function amostrarTimestamps(ctx: GpuContext, r: RendererWebGpu): void {
  if (!contadores.ativo) return;
  let acumulados = 0;
  let pendente = false;
  let resolvido = false;
  amostradores.set(ctx, () => {
    // Amostra cedo (o app desenha sob demanda e pode não chegar a 15 quadros numa medição curta).
    acumulados += 1;
    if (pendente || acumulados < 5) return;
    const promessa = r.resolveTimestampsAsync?.('render');
    if (!promessa) return;
    const janela = acumulados;
    acumulados = 0;
    pendente = true;
    void promessa
      .then((ms) => {
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return;
        // O query pool soma os quadros acumulados desde a última amostra: divide para virar ms por quadro.
        contadores.registrarGpuMs(ms / janela);
        definirTimerGpu('disponivel');
        if (!resolvido) {
          resolvido = true;
          contadores.marcarTimerGpu('disponivel');
        }
      })
      .catch(() => contadores.marcarTimerGpu('indisponivel', 'WebGPU: timestamp query falhou'))
      .finally(() => {
        pendente = false;
      });
  });
}

export interface TentativaWebGpu {
  gpu: GpuContext | null;
  motivo: string | null;
}

export async function tryWebGpu(canvas: HTMLCanvasElement, lang: Lang = 'pt'): Promise<TentativaWebGpu> {
  const nav = navigator as Navigator & NavigatorGpu;
  if (!nav.gpu) return { gpu: null, motivo: 'navigator.gpu ausente' };
  let criado: Awaited<ReturnType<typeof criarDispositivo>>;
  try {
    criado = await criarDispositivo();
  } catch (e) {
    return { gpu: null, motivo: `requestDevice falhou: ${mensagem(e)}` };
  }
  if (!criado) return { gpu: null, motivo: 'sem GPUAdapter (hardware ou software)' };
  const { device, timer } = criado;
  let r: RendererWebGpu;
  try {
    const mod = await import('three/webgpu');
    const Ctor = mod.WebGPURenderer as unknown as WebGpuCtor;
    r = new Ctor({ canvas, antialias: true, device, trackTimestamp: timer });
    await r.init();
  } catch (e) {
    device.destroy?.();
    return { gpu: null, motivo: t(lang, 'rn_gpu_webgpu_unavailable', { message: mensagem(e) }) };
  }
  if (!r.backend?.isWebGPUBackend) {
    try {
      r.dispose();
    } catch {
      // backend em estado parcial
    }
    device.destroy?.();
    return { gpu: null, motivo: 'three caiu para WebGL dentro do WebGPURenderer' };
  }
  const ctx = wrap(r, 'webgpu');
  recursos.set(ctx, { device });
  if (contadores.ativo && !timer) contadores.marcarTimerGpu('indisponivel', t(lang, 'rn_gpu_timestamp_unavailable'));
  // Substitui o handler padrão do three (que grita no console) pelo caminho de recuperação do app.
  r.onDeviceLost = (info) => {
    const motivo = info?.message ? `dispositivo WebGPU perdido: ${info.message}` : 'dispositivo WebGPU perdido';
    registrarPerdaGpu(motivo);
    notificarPerda(ctx, motivo);
  };
  if (contadores.ativo) {
    const instr = instrumentarWebGpu(device, contadores, lang);
    if (instr) wgpuInstr.set(ctx, instr);
    if (timer) {
      // Timer configurado: fica indisponível só até a primeira amostra, sem inventar motivo (não há nota falsa).
      definirTimerGpu('indisponivel');
      contadores.marcarTimerGpu('indisponivel');
      amostrarTimestamps(ctx, r);
    }
  }
  return { gpu: ctx, motivo: null };
}

/** Instrumentação do contexto WebGL2 do three: draw calls, triângulos, uploads e timer de GPU (se ativa). */
function instrumentarContextoGl(r: THREE.WebGLRenderer, lang: Lang): InstrumentacaoGl | null {
  try {
    const gl = r.getContext() as WebGL2RenderingContext | null;
    return gl ? instrumentarWebGl2(gl, contadores, lang) : null;
  } catch {
    return null;
  }
}

/** Fallback quando não há interceção do contexto (WebGPU) ou ela não viu desenho: o renderer informa o último render. */
function contarInfoDoRenderer(r: THREE.WebGLRenderer): void {
  if (!contadores.ativo) return;
  const info = (r as unknown as { info?: { render?: { drawCalls?: number; calls?: number; triangles?: number } } }).info?.render;
  if (!info) return;
  // `drawCalls`/`triangles` são do quadro; `calls` é o acumulado da sessão (não serve para orçamento).
  const chamadas = Number(info.drawCalls ?? info.calls);
  if (!Number.isFinite(chamadas) || chamadas <= 0) return;
  contadores.contarDesenho(chamadas, Number(info.triangles) || 0);
}

/**
 * Espera o evento `webglcontextrestored` (ou um prazo). Chamar `restoreContext()` a cada quadro reiniciava a
 * restauração; com o evento, cada tentativa tem tempo de terminar.
 */
function esperarContextoDeVolta(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, prazoMs: number): Promise<boolean> {
  if (!gl.isContextLost()) return Promise.resolve(true);
  return new Promise((resolver) => {
    let encerrado = false;
    const encerrar = (): void => {
      if (encerrado) return;
      encerrado = true;
      canvas.removeEventListener('webglcontextrestored', encerrar);
      resolver(!gl.isContextLost());
    };
    canvas.addEventListener('webglcontextrestored', encerrar, { once: true });
    setTimeout(encerrar, prazoMs);
  });
}

/**
 * Perda de contexto WebGL2: `preventDefault` (o three já faz), retry de `restoreContext()` um por quadro e limite.
 * Deu certo → o mesmo renderer volta e a cena é reenviada (`onRestored`). Esgotou → o app escala a matriz.
 */
function instalarRestauracao(ctx: GpuContext, r: THREE.WebGLRenderer): void {
  const guarda = new GuardaDeRecuperacao();
  let recuperando = false;
  r.domElement.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      if (recuperando) return;
      recuperando = true;
      const motivo = 'contexto WebGL2 perdido';
      registrarPerdaGpu(motivo);
      guarda.registrarPerda();
      const ext = recursos.get(ctx)?.lose;
      const gl = recursos.get(ctx)?.gl;
      if (!gl || !ext || !guarda.podeRestaurarNoLugar()) {
        recuperando = false;
        notificarPerda(ctx, motivo);
        return;
      }
      void restaurarContexto({
        tentar: () => ext.restoreContext(),
        esperarVoltar: (prazo) => esperarContextoDeVolta(gl, r.domElement, prazo),
        aoTentar: (n) => registrarTentativaRestauracao(n),
      }).then((res) => {
        recuperando = false;
        if (res.estado === 'restaurado') {
          definirRestauracaoGpu('contexto');
          restoredCbs.get(ctx)?.();
          return;
        }
        notificarPerda(ctx, motivo);
      });
    },
    false,
  );
}

export function wrap(r: THREE.WebGLRenderer, backend: Backend, lang: Lang = 'pt'): GpuContext {
  contadores.definirBackend(backend);
  definirBackendGpu(backend);
  const glInstr = backend === 'webgl2' && contadores.ativo ? instrumentarContextoGl(r, lang) : null;
  if (glInstr) definirTimerGpu(glInstr.timer);
  const ctx: GpuContext = {
    backend,
    renderer: r,
    setSize(w, h, dpr) {
      r.setPixelRatio(dpr);
      r.setSize(w, h, false);
    },
    render(scene, camera) {
      glInstr?.iniciar();
      try {
        r.render(scene, camera);
      } finally {
        glInstr?.encerrar();
        amostradores.get(ctx)?.();
        if (!glInstr || !glInstr.desenhouNoQuadro()) contarInfoDoRenderer(r);
      }
    },
    onLost(cb) {
      lostCbs.set(ctx, cb);
      const pendente = perdaPendente.get(ctx);
      if (pendente) {
        perdaPendente.delete(ctx);
        cb(pendente);
        return;
      }
      if (backend === 'webgl2') instalarRestauracao(ctx, r);
    },
    onRestored(cb) {
      restoredCbs.set(ctx, cb);
    },
    dispose() {
      glInstr?.remover();
      wgpuInstr.get(ctx)?.remover();
      try {
        r.dispose();
      } catch {
        // contexto já perdido: nada a liberar pelo three
      }
      const device = recursos.get(ctx)?.device;
      try {
        device?.destroy?.();
      } catch {
        // dispositivo já destruído
      }
    },
  };
  recursos.set(ctx, {
    gl: backend === 'webgl2' ? (safeGetContext(r) ?? undefined) : undefined,
    lose: backend === 'webgl2' ? (safeGetLoseContext(safeGetContext(r)) ?? null) : null,
  });
  return ctx;
}

function safeGetContext(r: THREE.WebGLRenderer): WebGL2RenderingContext | null {
  try {
    return r.getContext() as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

function safeGetLoseContext(gl: WebGL2RenderingContext | null): { loseContext(): void; restoreContext(): void } | null {
  try {
    return gl?.getExtension('WEBGL_lose_context') as { loseContext(): void; restoreContext(): void } | null;
  } catch {
    return null;
  }
}

/** Simula a perda do contexto WebGL2 (só para o teste de recuperação em `?perf=1`). */
export function simularPerdaDeContexto(gpu: GpuContext): boolean {
  const ext = recursos.get(gpu)?.lose;
  if (!ext) return false;
  ext.loseContext();
  return true;
}

/** Simula a perda do dispositivo WebGPU (só para o teste de recuperação em `?perf=1`). */
export function simularPerdaDeDispositivo(gpu: GpuContext): boolean {
  const device = recursos.get(gpu)?.device;
  if (!device?.destroy) return false;
  device.destroy();
  return true;
}

/** Modo CPU: sem GPU, sem timer. Centraliza o que o `ViewportCanvas` precisa registrar. */
export function registrarBackendCpu(): void {
  definirBackendGpu('cpu');
  definirTimerGpu('sem-gpu');
  contadores.definirBackend('cpu');
  contadores.marcarTimerGpu('sem-gpu');
}
