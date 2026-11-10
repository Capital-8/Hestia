/**
 * Contadores de desempenho do quadro (Fase 0.2, agente S1). Sem DOM, sem three: a matemática é pura e testável em Node.
 * Quem mede (o laço de desenho, a interceção do WebGL2, o PlanFrame) chama os métodos; o painel só lê `snapshot()`.
 *
 * Unidades: tempos em ms, triângulos por quadro, uploads em chamadas (e bytes quando o tamanho é conhecido).
 */

/** Camadas da planta que o `PlanFrame` pode refazer (ver `planFrame.ts`). */
export type CamadaRebuild = 'geometria' | 'sobreposicao' | 'grade' | 'guardaCorpo';

/** Estado do timer de GPU: mede, não mede, ou não há GPU (modo CPU). */
export type EstadoTimerGpu = 'disponivel' | 'indisponivel' | 'sem-gpu';

/** Resumo de uma amostra: mediana e p95 usam a mesma convenção do `perf-browser` (ordem ceil(q·n)). */
export interface Estatisticas {
  n: number;
  min: number;
  mediana: number;
  p95: number;
  media: number;
  max: number;
}

/** Um quadro concluído, como entra na janela móvel. */
export interface QuadroContadores {
  /** Índice do quadro desde o último `reset()` (1 no primeiro). */
  indice: number;
  /** Tempo de CPU gasto dentro do quadro (do `iniciarQuadro` ao `encerrarQuadro`). */
  ms: number;
  /** Tempo desde o início do quadro anterior; `null` no primeiro quadro. Serve de base para o FPS. */
  intervaloMs: number | null;
  drawCalls: number;
  triangulos: number;
  uploads: number;
  uploadBytes: number;
  rebuilds: number;
}

/** Fotografia serializável (JSON) do que foi medido até agora. */
export interface SnapshotPerf {
  ativo: boolean;
  backend: string | null;
  /** Relógio de parede da leitura (para ordenar arquivos de medição). */
  ts: number;
  fps: number | null;
  /** Nenhum quadro nos últimos `limiteOciosoMs` (o app só desenha quando algo muda). */
  ocioso: boolean;
  quadro: QuadroContadores | null;
  janela: {
    n: number;
    frameMs: Estatisticas | null;
    intervaloMs: Estatisticas | null;
    drawCalls: Estatisticas | null;
    triangulos: Estatisticas | null;
    uploads: Estatisticas | null;
    rebuilds: Estatisticas | null;
  };
  total: {
    quadros: number;
    drawCalls: number;
    triangulos: number;
    uploads: number;
    uploadBytes: number;
    rebuilds: number;
    commitsReact: number;
  };
  camadas: Record<CamadaRebuild, number>;
  gpu: { timer: EstadoTimerGpu; ms: number | null; nota?: string };
  /** Métricas que este ambiente não conseguiu medir, com o motivo. */
  indisponiveis: string[];
}

export interface OpcoesContadores {
  /** Quantos quadros a janela móvel guarda (padrão 180: ~3 s a 60 fps). */
  janela?: number;
  /** Acima deste intervalo desde o último quadro, a vista está ociosa e o FPS não é reportado (padrão 500 ms). */
  limiteOciosoMs?: number;
}

const JANELA_PADRAO = 180;
const OCIOSO_PADRAO_MS = 500;

/** Modos de desenho do WebGL (constantes fixas da API, não dependem do contexto). */
export const MODO_TRIANGLES = 4;
export const MODO_TRIANGLE_STRIP = 5;
export const MODO_TRIANGLE_FAN = 6;

const zero = (): QuadroContadores => ({ indice: 0, ms: 0, intervaloMs: null, drawCalls: 0, triangulos: 0, uploads: 0, uploadBytes: 0, rebuilds: 0 });

function naoNegativo(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Mediana, p95, média, mínimo e máximo de uma amostra; `null` sem valores finitos. */
export function estatisticas(valores: readonly number[]): Estatisticas | null {
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const ordem = (q: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  const meio = Math.floor(s.length / 2);
  const mediana = s.length % 2 === 1 ? s[meio]! : (s[meio - 1]! + s[meio]!) / 2;
  return { n: s.length, min: s[0]!, mediana, p95: ordem(0.95), media: s.reduce((a, b) => a + b, 0) / s.length, max: s[s.length - 1]! };
}

/**
 * Triângulos de uma chamada de desenho. Pontos e linhas contam 0 (não são triângulos); `TRIANGLE_STRIP` e
 * `TRIANGLE_FAN` contam `n - 2`; `TRIANGLES` conta `n / 3`. `instancias` multiplica (desenho instanciado é uma draw call).
 */
export function triangulosDeDesenho(modo: number, contagem: number, instancias = 1): number {
  if (!Number.isFinite(contagem) || contagem <= 0) return 0;
  const porInstancia = modo === MODO_TRIANGLES ? Math.floor(contagem / 3) : modo === MODO_TRIANGLE_STRIP || modo === MODO_TRIANGLE_FAN ? Math.max(0, Math.floor(contagem) - 2) : 0;
  const n = Number.isFinite(instancias) && instancias > 0 ? Math.trunc(instancias) : 1;
  return porInstancia * n;
}

/**
 * Acumulador de um quadro e da janela móvel. Quando inativo, todos os métodos são no-op e `snapshot()` devolve zeros:
 * o app com `?perf=0` não paga medição nenhuma.
 */
export class ContadoresPerf {
  private _ativo = false;
  private _backend: string | null = null;
  private readonly janelaMax: number;
  private readonly limiteOciosoMs: number;
  private anel: Array<QuadroContadores | null>;
  private prox = 0;
  private preenchidos = 0;
  private inicioQuadro: number | null = null;
  private inicioAnterior: number | null = null;
  private ultimoFim: number | null = null;
  private bucket: QuadroContadores = zero();
  private ultimo: QuadroContadores | null = null;
  private totalQuadros = 0;
  private totalDrawCalls = 0;
  private totalTriangulos = 0;
  private totalUploads = 0;
  private totalUploadBytes = 0;
  private totalRebuilds = 0;
  private totalCommitsReact = 0;
  private camadas: Record<CamadaRebuild, number> = { geometria: 0, sobreposicao: 0, grade: 0, guardaCorpo: 0 };
  private gpuTimer: EstadoTimerGpu = 'sem-gpu';
  private gpuMs: number | null = null;
  private gpuNota: string | null = null;
  private indisponiveis: string[] = [];

  constructor(opcoes: OpcoesContadores = {}) {
    this.janelaMax = Math.max(1, Math.trunc(opcoes.janela ?? JANELA_PADRAO));
    this.limiteOciosoMs = Math.max(1, opcoes.limiteOciosoMs ?? OCIOSO_PADRAO_MS);
    this.anel = new Array<QuadroContadores | null>(this.janelaMax).fill(null);
  }

  get ativo(): boolean {
    return this._ativo;
  }

  get backend(): string | null {
    return this._backend;
  }

  ativar(): void {
    this._ativo = true;
  }

  /** Para de medir (os números já colhidos continuam legíveis até `reset()`). */
  desativar(): void {
    this._ativo = false;
  }

  /**
   * Abre um quadro. Deve ser chamado no início do laço de desenho (rAF); `agora` é `performance.now()`.
   * Um quadro aberto e não fechado é descartado pelo próximo `iniciarQuadro`.
   */
  iniciarQuadro(agora: number): void {
    if (!this._ativo) return;
    this.inicioQuadro = agora;
    this.bucket = { indice: 0, ms: 0, intervaloMs: null, drawCalls: 0, triangulos: 0, uploads: 0, uploadBytes: 0, rebuilds: 0 };
  }

  /** Fecha o quadro aberto e o coloca na janela móvel. Sem quadro aberto, não faz nada. */
  encerrarQuadro(agora: number): void {
    if (!this._ativo || this.inicioQuadro === null) return;
    const inicio = this.inicioQuadro;
    const intervaloMs = this.inicioAnterior === null ? null : Math.max(0, inicio - this.inicioAnterior);
    this.inicioAnterior = inicio;
    this.inicioQuadro = null;
    this.ultimoFim = agora;
    const q: QuadroContadores = { ...this.bucket, indice: ++this.totalQuadros, ms: Math.max(0, agora - inicio), intervaloMs };
    this.ultimo = q;
    this.anel[this.prox] = q;
    this.prox = (this.prox + 1) % this.janelaMax;
    this.preenchidos = Math.min(this.janelaMax, this.preenchidos + 1);
  }

  /** Uma draw call (e os triângulos que ela desenha). Chamado pela interceção do contexto ou pelo fallback do renderer. */
  contarDesenho(drawCalls = 1, triangulos = 0): void {
    if (!this._ativo) return;
    const dc = Math.trunc(naoNegativo(drawCalls));
    const tri = Math.trunc(naoNegativo(triangulos));
    this.bucket.drawCalls += dc;
    this.bucket.triangulos += tri;
    this.totalDrawCalls += dc;
    this.totalTriangulos += tri;
  }

  /** Um upload de buffer (`bufferData`/`bufferSubData`/`writeBuffer`); `bytes` quando o tamanho é conhecido. */
  contarUpload(bytes = 0): void {
    if (!this._ativo) return;
    this.bucket.uploads += 1;
    this.bucket.uploadBytes += Math.trunc(naoNegativo(bytes));
    this.totalUploads += 1;
    this.totalUploadBytes += Math.trunc(naoNegativo(bytes));
  }

  /** Uma camada da planta refeita (`PlanFrame.update`). */
  contarRebuild(camada: CamadaRebuild): void {
    if (!this._ativo) return;
    this.bucket.rebuilds += 1;
    this.totalRebuilds += 1;
    this.camadas[camada] += 1;
  }

  /** Um commit do React no ponto central instrumentado (`ViewportCanvas`). */
  contarCommitReact(): void {
    if (!this._ativo) return;
    this.totalCommitsReact += 1;
  }

  definirBackend(backend: string): void {
    this._backend = backend;
  }

  /** Resultado do timer de GPU que ficou pronto (pode chegar alguns quadros depois da medição). */
  registrarGpuMs(ms: number): void {
    if (!this._ativo || !Number.isFinite(ms) || ms < 0) return;
    this.gpuMs = ms;
  }

  /** Estado do timer da GPU; um motivo entra na lista de indisponíveis. */
  marcarTimerGpu(estado: EstadoTimerGpu, motivo?: string): void {
    this.gpuTimer = estado;
    if (motivo && estado !== 'disponivel') {
      this.gpuNota = motivo;
      this.registrarIndisponivel(motivo);
    }
  }

  registrarIndisponivel(motivo: string): void {
    if (!this.indisponiveis.includes(motivo)) this.indisponiveis.push(motivo);
  }

  /** Volta os contadores a zero; mantém backend, estado do timer e a lista de indisponíveis. */
  reset(): void {
    this.anel = new Array<QuadroContadores | null>(this.janelaMax).fill(null);
    this.prox = 0;
    this.preenchidos = 0;
    this.inicioQuadro = null;
    this.inicioAnterior = null;
    this.ultimoFim = null;
    this.bucket = zero();
    this.ultimo = null;
    this.totalQuadros = 0;
    this.totalDrawCalls = 0;
    this.totalTriangulos = 0;
    this.totalUploads = 0;
    this.totalUploadBytes = 0;
    this.totalRebuilds = 0;
    this.totalCommitsReact = 0;
    this.camadas = { geometria: 0, sobreposicao: 0, grade: 0, guardaCorpo: 0 };
    this.gpuMs = null;
  }

  /** Quadros da janela em ordem cronológica (do mais antigo ao mais recente). */
  private quadrosDaJanela(): QuadroContadores[] {
    const out: QuadroContadores[] = [];
    for (let k = 0; k < this.preenchidos; k++) {
      const i = (this.prox - this.preenchidos + k + this.janelaMax) % this.janelaMax;
      const q = this.anel[i];
      if (q) out.push(q);
    }
    return out;
  }

  snapshot(): SnapshotPerf {
    const janela = this.quadrosDaJanela();
    const intervalos = janela.map((q) => q.intervaloMs).filter((x): x is number => x !== null && x > 0 && x <= this.limiteOciosoMs);
    const statsIntervalo = estatisticas(intervalos);
    const agora = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const ocioso = this.ultimoFim === null || agora - this.ultimoFim > this.limiteOciosoMs;
    // Sem quadro recente, o FPS não é reportado: a janela guardaria um número de um momento que já passou.
    const fps = ocioso || !statsIntervalo || statsIntervalo.mediana <= 0 ? null : Math.round((1000 / statsIntervalo.mediana) * 10) / 10;
    return {
      ativo: this._ativo,
      backend: this._backend,
      ts: Date.now(),
      fps,
      ocioso,
      quadro: this.ultimo ? { ...this.ultimo } : null,
      janela: {
        n: janela.length,
        frameMs: estatisticas(janela.map((q) => q.ms)),
        intervaloMs: statsIntervalo,
        drawCalls: estatisticas(janela.map((q) => q.drawCalls)),
        triangulos: estatisticas(janela.map((q) => q.triangulos)),
        uploads: estatisticas(janela.map((q) => q.uploads)),
        rebuilds: estatisticas(janela.map((q) => q.rebuilds)),
      },
      total: {
        quadros: this.totalQuadros,
        drawCalls: this.totalDrawCalls,
        triangulos: this.totalTriangulos,
        uploads: this.totalUploads,
        uploadBytes: this.totalUploadBytes,
        rebuilds: this.totalRebuilds,
        commitsReact: this.totalCommitsReact,
      },
      camadas: { ...this.camadas },
      gpu: this.gpuNota === null ? { timer: this.gpuTimer, ms: this.gpuMs } : { timer: this.gpuTimer, ms: this.gpuMs, nota: this.gpuNota },
      indisponiveis: [...this.indisponiveis],
    };
  }
}
