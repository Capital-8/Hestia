import * as THREE from 'three';
import { contadores } from '../perf/registro.ts';
import {
  decidirEscalonamento,
  definirRestauracaoGpu,
  estadoGpu,
  GuardaDeRecuperacao,
  ordemDeFallback,
  preferenciaDaAcao,
  registrarTentativaGpu,
  type PreferenciaGpu,
} from './backend.ts';
import {
  mensagem,
  registrarBackendCpu,
  simularPerdaDeContexto,
  simularPerdaDeDispositivo,
  tryWebGpu,
  wrap,
  type GpuContext,
} from './contexto.ts';
import { t, type Lang } from '../i18n.ts';

export interface GpuResult {
  gpu: GpuContext;
  canvas: HTMLCanvasElement;
}

function concluir(gpu: GpuContext, canvas: HTMLCanvasElement): GpuResult {
  // Depois de uma perda, um boot bem-sucedido é a própria recuperação: registra como voltou.
  if (estadoGpu().perdas > 0) definirRestauracaoGpu(gpu.backend === 'webgpu' ? 'dispositivo' : 'fallback');
  return { gpu, canvas };
}

/**
 * GPU na ordem da preferência: `auto` = WebGPU → WebGL2 → CPU, `webgl2` = WebGL2 → CPU (default do app), `cpu` = CPU.
 * Cada tentativa usa um canvas novo (um canvas aceita um único tipo de contexto) e cada dispositivo WebGPU pede
 * adapter novo. Devolve `null` quando só resta a CPU: quem chama desenha a planta em Canvas2D.
 */
export async function createGpu(newCanvas: () => HTMLCanvasElement, prefer: PreferenciaGpu = 'auto', lang: Lang = 'pt'): Promise<GpuResult | null> {
  for (const camada of ordemDeFallback(prefer)) {
    if (camada === 'cpu') break;
    const inicio = performance.now();
    const registrar = (ok: boolean, motivo: string | null): void =>
      registrarTentativaGpu({ camada, ok, motivo, ms: Math.round((performance.now() - inicio) * 10) / 10 });
    if (camada === 'webgpu') {
      const canvas = newCanvas();
      const { gpu, motivo } = await tryWebGpu(canvas, lang);
      registrar(gpu !== null, motivo);
      if (gpu) return concluir(gpu, canvas);
      continue;
    }
    try {
      const canvas = newCanvas();
      const contexto = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!contexto || contexto.isContextLost()) {
        registrar(false, 'sem contexto WebGL2');
        continue;
      }
      const r = new THREE.WebGLRenderer({ canvas, context: contexto, antialias: true, alpha: false, powerPreference: 'high-performance' });
      registrar(true, null);
      return concluir(wrap(r, 'webgl2', lang), canvas);
    } catch (e) {
      registrar(false, mensagem(e));
    }
  }
  return null;
}

/** Plano de recuperação pronto para o app: para onde bootar e o que mostrar na barra de status. */
export interface PlanoDeRecuperacao {
  prefer: PreferenciaGpu;
  status: string;
}

export function planejarRecuperacao(camada: 'webgpu' | 'webgl2', motivo: string, guarda: GuardaDeRecuperacao, lang: Lang = 'pt'): PlanoDeRecuperacao {
  guarda.registrarPerda();
  const acao = decidirEscalonamento(camada, guarda);
  const aviso =
    acao === 'recriar-webgpu' ? t(lang, 'rn_gpu_recreating_webgpu', { n: guarda.resumo.recriacoesWebgpu })
    : acao === 'cair-webgl2' ? t(lang, 'rn_gpu_switch_webgl2')
    : acao === 'reiniciar-webgl2' ? t(lang, 'rn_gpu_restart_webgl2')
    : t(lang, 'rn_gpu_switch_cpu');
  return { prefer: preferenciaDaAcao(acao), status: t(lang, 'rn_gpu_restarted', { reason: motivo, note: aviso }) };
}

/** `?perf=1`: estado do backend + gatilhos de perda para o teste de recuperação. Fora do perf, não existe. */
export function publicarDepuracaoGpu(gpu: GpuContext | null): void {
  if (!contadores.ativo || typeof window === 'undefined') return;
  const backend = (gpu?.renderer as unknown as { backend?: { trackTimestamp?: boolean; device?: { features?: { has(n: string): boolean } } } } | undefined)?.backend;
  (window as unknown as { __hestiaGpu?: unknown }).__hestiaGpu = {
    snapshot: estadoGpu,
    diagnostico: () => ({
      ativo: contadores.ativo,
      backend: gpu?.backend ?? null,
      trackTimestamp: backend?.trackTimestamp ?? null,
      timestampQuery: backend?.device?.features?.has('timestamp-query') ?? null,
    }),
    perderContexto: () => (gpu ? simularPerdaDeContexto(gpu) : false),
    perderDispositivo: () => (gpu ? simularPerdaDeDispositivo(gpu) : false),
  };
}

export function limparDepuracaoGpu(): void {
  if (typeof window !== 'undefined') delete (window as unknown as { __hestiaGpu?: unknown }).__hestiaGpu;
}

export interface ResultadoMontagemGpu {
  gpu: GpuResult | null;
  canvas: HTMLCanvasElement;
}

export interface OpcoesControladorGpu {
  host: HTMLElement;
  preferencia: PreferenciaGpu;
  /** Antes de cada tentativa: o app solta referências ao backend anterior e invalida as cenas. */
  aoLimpar(): void;
  /** Depois do boot: o app guarda o resultado, liga sombras e redesenha. */
  aoMontar(resultado: ResultadoMontagemGpu): void;
  aoStatus(status: string): void;
  /** Idioma das mensagens de status e do `aria-label` do canvas (padrão `'pt'`). */
  lang?: Lang;
  novoCanvas?(): HTMLCanvasElement;
  guarda?: GuardaDeRecuperacao;
}

export interface ControladorGpu {
  iniciar(): Promise<void>;
  /** O desenho lançou: WebGPU desce para WebGL2 (com limite); em outro backend, não muda nada. */
  falhouRender(): void;
  dispose(): void;
}

/**
 * Ciclo de vida do backend: boot pela matriz de fallback, perda/recuperação e troca de canvas. Fica fora do React
 * para o `ViewportCanvas` só ligar/desligar e para a política ser a mesma em qualquer tela que use GPU.
 */
export function criarControladorGpu(opcoes: OpcoesControladorGpu): ControladorGpu {
  const novoCanvas = opcoes.novoCanvas ?? (() => document.createElement('canvas'));
  const guarda = opcoes.guarda ?? new GuardaDeRecuperacao();
  const lang = opcoes.lang ?? 'pt';
  let seq = 0;
  let ativo = true;
  let atual: GpuResult | null = null;
  let canvasCpu: HTMLCanvasElement | null = null;
  let falhas = 0;

  const limpar = (): void => {
    try {
      atual?.gpu.dispose();
    } catch {
      // backend já perdido
    }
    atual?.canvas.remove();
    canvasCpu?.remove();
    atual = null;
    canvasCpu = null;
    opcoes.aoLimpar();
  };

  const boot = async (prefer: PreferenciaGpu): Promise<void> => {
    const meu = ++seq;
    limpar();
    const res = prefer === 'cpu' ? null : await createGpu(novoCanvas, prefer, lang);
    if (!ativo || meu !== seq) {
      res?.gpu.dispose();
      res?.canvas.remove();
      return;
    }
    falhas = 0;
    if (res) {
      res.canvas.setAttribute('aria-label', t(lang, 'rn_canvas_aria'));
      opcoes.host.prepend(res.canvas);
      atual = res;
      res.gpu.onLost((motivo) => {
        if (!ativo || meu !== seq) return;
        const plano = planejarRecuperacao(res.gpu.backend === 'webgpu' ? 'webgpu' : 'webgl2', motivo, guarda, lang);
        opcoes.aoStatus(plano.status);
        void boot(plano.prefer);
      });
      res.gpu.onRestored(() => {
        if (!ativo || meu !== seq) return;
        opcoes.aoLimpar();
        opcoes.aoMontar({ gpu: res, canvas: res.canvas });
        opcoes.aoStatus(t(lang, 'rn_gpu_context_restored'));
      });
    } else {
      const c = novoCanvas();
      c.setAttribute('aria-label', t(lang, 'rn_canvas_aria'));
      opcoes.host.prepend(c);
      canvasCpu = c;
      registrarBackendCpu();
    }
    const canvas = res?.canvas ?? canvasCpu!;
    opcoes.aoMontar({ gpu: res, canvas });
    publicarDepuracaoGpu(res?.gpu ?? null);
  };

  return {
    iniciar: () => boot(opcoes.preferencia),
    falhouRender() {
      if (atual?.gpu.backend !== 'webgpu' || ++falhas > 3) return;
      opcoes.aoStatus(t(lang, 'rn_gpu_draw_failed'));
      void boot('webgl2');
    },
    dispose() {
      ativo = false;
      seq += 1;
      limparDepuracaoGpu();
      limpar();
    },
  };
}
