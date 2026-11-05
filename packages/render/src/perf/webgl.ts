import type { ContadoresPerf, EstadoTimerGpu } from './contadores.ts';
import { triangulosDeDesenho } from './contadores.ts';
import { t, type Lang } from '../i18n.ts';

/** Extensão `EXT_disjoint_timer_query_webgl2` (as constantes são as únicas que faltam no lib.dom). */
interface ExtTimerWebgl2 {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export interface InstrumentacaoGl {
  timer: EstadoTimerGpu;
  /** Marca o início do trabalho de GPU do quadro (timer query) e colhe o resultado de quadros anteriores. */
  iniciar(): void;
  /** Fecha o timer do quadro; a resposta chega assíncrona nas próximas chamadas de `iniciar`. */
  encerrar(): void;
  /** Se a interceção viu alguma draw call desde o último `iniciar()` (senão o renderer serve de fallback). */
  desenhouNoQuadro(): boolean;
  /** Devolve os métodos originais e descarta a query em voo. */
  remover(): void;
}

type Original = (...args: unknown[]) => unknown;

/**
 * Intercepta as chamadas de desenho e de upload do contexto WebGL2. A contagem fica no acumulador do quadro corrente;
 * `iniciarQuadro`/`encerrarQuadro` (no laço de desenho) é que fecham a janela. Importante: métodos são sombreados na
 * própria instância do contexto (não no protótipo), então dois canvases não se contaminam.
 */
export function instrumentarWebGl2(gl: WebGL2RenderingContext, contadores: ContadoresPerf, lang: Lang = 'pt'): InstrumentacaoGl {
  const alvo = gl as unknown as Record<string, unknown>;
  const desfazer: Array<() => void> = [];
  let desenhou = false;

  const trocar = (nome: string, aoChamar: (args: unknown[]) => void): void => {
    const original = alvo[nome];
    if (typeof original !== 'function') return;
    const substituto = function (this: unknown, ...args: unknown[]): unknown {
      try {
        aoChamar(args);
      } catch {
        // Medição nunca derruba o desenho.
      }
      return (original as Original).apply(this, args);
    };
    try {
      alvo[nome] = substituto;
      desfazer.push(() => {
        try {
          alvo[nome] = original;
        } catch {
          // contexto já perdido
        }
      });
    } catch {
      // contexto exótico: fica sem esta métrica
    }
  };

  const desenho = (args: unknown[], iModo: number, iContagem: number, iInstancias?: number): void => {
    desenhou = true;
    contadores.contarDesenho(1, triangulosDeDesenho(Number(args[iModo]), Number(args[iContagem]), iInstancias === undefined ? 1 : Number(args[iInstancias])));
  };

  trocar('drawArrays', (a) => desenho(a, 0, 2));
  trocar('drawArraysInstanced', (a) => desenho(a, 0, 2, 3));
  trocar('drawElements', (a) => desenho(a, 0, 1));
  trocar('drawElementsInstanced', (a) => desenho(a, 0, 1, 4));
  trocar('drawRangeElements', (a) => desenho(a, 0, 3));

  const upload = (valor: unknown, deslocamento = 0, comprimento?: unknown): number => {
    if (typeof valor === 'number') return Math.max(0, valor);
    if (!valor || typeof valor !== 'object') return 0;
    const v = valor as { byteLength?: unknown; BYTES_PER_ELEMENT?: unknown };
    if (typeof v.byteLength !== 'number') return 0;
    if (typeof comprimento === 'number' && Number.isFinite(comprimento)) {
      const porElemento = typeof v.BYTES_PER_ELEMENT === 'number' ? v.BYTES_PER_ELEMENT : 1;
      return Math.max(0, comprimento * porElemento);
    }
    return Math.max(0, v.byteLength - deslocamento);
  };

  trocar('bufferData', (a) => contadores.contarUpload(upload(a[1])));
  // bufferSubData(alvo, deslocamentoEmBytes, dados, deslocamentoEmElementos?, comprimentoEmElementos?)
  trocar('bufferSubData', (a) => contadores.contarUpload(upload(a[2], 0, a[4])));

  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as unknown as ExtTimerWebgl2 | null;

  return new InstrumentacaoGlWebgl2(gl, contadores, ext, desfazer, () => desenhou, () => {
    desenhou = false;
  }, lang);
}

/** Timer de GPU com `EXT_disjoint_timer_query_webgl2` (uma query em voo, resultado lido alguns quadros depois). */
class InstrumentacaoGlWebgl2 implements InstrumentacaoGl {
  readonly timer: EstadoTimerGpu;
  private emVoo: WebGLQuery | null = null;
  private consulta: WebGLQuery | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly contadores: ContadoresPerf,
    private readonly ext: ExtTimerWebgl2 | null,
    private readonly desfazer: Array<() => void>,
    private readonly desenhou: () => boolean,
    private readonly zerarDesenho: () => void,
    lang: Lang = 'pt',
  ) {
    if (this.ext) {
      this.timer = 'disponivel';
      this.contadores.marcarTimerGpu('disponivel');
    } else {
      this.timer = 'indisponivel';
      this.contadores.marcarTimerGpu('indisponivel', t(lang, 'rn_gpu_ext_unavailable'));
    }
  }

  iniciar(): void {
    this.zerarDesenho();
    this.colher();
    if (!this.ext || this.emVoo) return;
    try {
      const q = this.gl.createQuery();
      if (!q) return;
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
      this.emVoo = q;
    } catch {
      this.emVoo = null;
    }
  }

  encerrar(): void {
    if (!this.ext) return;
    if (this.emVoo) {
      try {
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
        this.consulta = this.emVoo;
      } catch {
        this.apagar(this.emVoo);
      }
      this.emVoo = null;
    }
    this.colher();
  }

  /** Lê a query pronta; se a GPU ficou "disjoint" no intervalo, descarta a amostra. */
  private colher(): void {
    if (!this.ext || !this.consulta) return;
    try {
      if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) === true) {
        this.apagar(this.consulta);
        return;
      }
      if (this.gl.getQueryParameter(this.consulta, this.gl.QUERY_RESULT_AVAILABLE) !== true) return;
      const ns = Number(this.gl.getQueryParameter(this.consulta, this.gl.QUERY_RESULT));
      this.contadores.registrarGpuMs(ns / 1_000_000);
      this.apagar(this.consulta);
    } catch {
      this.apagar(this.consulta);
    }
  }

  private apagar(q: WebGLQuery | null): void {
    if (q) {
      try {
        this.gl.deleteQuery(q);
      } catch {
        // contexto perdido
      }
    }
    this.consulta = null;
    this.emVoo = null;
  }

  desenhouNoQuadro(): boolean {
    return this.desenhou();
  }

  remover(): void {
    this.apagar(this.consulta ?? this.emVoo);
    for (const f of this.desfazer) f();
    this.desfazer.length = 0;
  }
}
