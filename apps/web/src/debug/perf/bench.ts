/**
 * Bench de órbita (`?bench=orbit`) — WP-A0.
 *
 * Para quê: medir a vista 3D no desktop Linux (Tauri/WebKitGTK), onde não há barra de endereço
 * para digitar `?perf=1` e o overlay é difícil de ler por fora. O resultado sai em `document.title`,
 * legível de fora com `xprop -name ... WM_NAME` (ou AT-SPI) sem tocar na tela.
 *
 * Como roda (nada disto existe sem `?bench=orbit` na URL — o uso normal não paga nada):
 * 1. no boot, `instalarPerf` (index.ts) vê o parâmetro e liga os contadores SEM overlay, antes do
 *    contexto WebGL nascer — só assim o timer de GPU é instrumentado (`wrap` decide no `wrap`);
 * 2. quando a cena 3D monta por completo, o `ViewportCanvas` cria `iniciarBenchOrbita` e chama
 *    `passo()` uma vez por quadro desenhado: cada passo gira o azimute com o MESMO `orbit.orbit()`
 *    do arrasto (nenhum caminho novo de câmera) e pede o próximo quadro;
 * 3. no fim (padrão: 300 quadros ≈ 5 s a 60 fps, uma volta completa), o snapshot vira
 *    `HESTIA-BENCH fps=.. cpuMs=.. gpuMs=.. calls=.. tris=..` em `document.title`.
 *
 * Limites honestos: os contadores zeram no começo (`reset`); a janela móvel guarda ~180 quadros,
 * então `cpuMs`/`calls`/`tris` são a mediana da última parte do bench; `gpuMs` é `n/a` quando o
 * timer da GPU não está disponível (WebGL sem EXT_disjoint_timer_query, WebGPU, ou modo CPU).
 * Com mais de um painel 3D aberto cada um escreve o seu resumo no título (o último ganha) — o
 * bench é feito para tela cheia de um painel só.
 */
import { contadores, type OrbitCamera, type SnapshotPerf } from '@hestia/render';

/** Quadros do bench (~5 s a 60 fps). Uma volta completa de azimute neste tanto de passos. */
export const QUADROS_BENCH = 300;

export interface ControleBenchOrbita {
  /** Um quadro desenhado: gira a câmera e devolve true se ainda há quadros (para o chamador pedir o próximo). */
  passo(agora: number): boolean;
  /** Interrompe sem escrever título (vista 3D desmontou no meio). */
  cancelar(): void;
}

/** `n/a` marca o que este ambiente não mediu (ex.: timer de GPU indisponível). */
// units-ok: painel de diagnóstico (título do bench), mesma regra do overlay
const num = (x: number | null | undefined, casas: number): string => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : x.toFixed(casas));

/**
 * Monta a linha do título a partir do snapshot e do tempo real do bench. Puro (testável em Node):
 * o FPS vem de quadros/segundos decorridos (o do overlay diria "ocioso" fora do laço), os demais
 * campos são as medianas da janela dos contadores.
 */
export function resumoBench(s: SnapshotPerf, quadros: number, decorridoMs: number): string {
  const fps = decorridoMs > 0 && quadros > 0 ? (quadros * 1000) / decorridoMs : null;
  const gpuMs = s.gpu.timer === 'disponivel' ? s.gpu.ms : null;
  return [
    'HESTIA-BENCH',
    `fps=${num(fps, 1)}`,
    `cpuMs=${num(s.janela.frameMs?.mediana, 2)}`,
    `gpuMs=${num(gpuMs, 2)}`,
    `calls=${num(s.janela.drawCalls?.mediana, 0)}`,
    `tris=${num(s.janela.triangulos?.mediana, 0)}`,
  ].join(' ');
}

/**
 * Inicia o bench: liga os contadores (se alguém ainda não ligou), zera a medição e gira a câmera
 * uma volta completa em `quadros` passos. `aoConcluir` recebe a linha pronta — quem escreve no
 * `document.title` é o chamador, para este módulo continuar sem DOM.
 */
export function iniciarBenchOrbita(orbit: OrbitCamera, aoConcluir: (titulo: string) => void, quadros = QUADROS_BENCH): ControleBenchOrbita {
  const jaMedindo = contadores.ativo;
  contadores.ativar();
  contadores.reset();
  // `orbit.orbit` anda 0,006 rad por pixel de arrasto: o passo em "px" que fecha 2π em `quadros`.
  const passoPx = (Math.PI * 2) / Math.max(1, quadros) / 0.006;
  let feitos = 0;
  let t0: number | null = null;
  let encerrado = false;
  const desligarSeFoiEste = (): void => {
    if (!jaMedindo) contadores.desativar();
  };
  return {
    passo(agora: number): boolean {
      if (encerrado) return false;
      if (t0 === null) t0 = agora;
      feitos += 1;
      orbit.orbit(passoPx, 0);
      if (feitos < quadros) return true;
      encerrado = true;
      aoConcluir(resumoBench(contadores.snapshot(), quadros, agora - t0));
      desligarSeFoiEste();
      return false;
    },
    cancelar(): void {
      if (encerrado) return;
      encerrado = true;
      desligarSeFoiEste();
    },
  };
}
