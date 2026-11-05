import type { Id, Project, ValidationIssue, ViewRange } from '@hestia/model';
import { viewRangeWarnings, type ViewRangeWarning } from '@hestia/engine';
import { contextoDaVista } from '@hestia/render';
import { avisosDoProjeto } from './avisosCalculo.ts';
import { useI18n, type Lang } from './i18n.ts';

/**
 * Cálculos de aviso fora da thread principal. Na abertura de um projeto grande, `avisosDoProjeto` (cerca de 2 s) e os
 * avisos do intervalo de vista (cerca de 3 s, por resolver as lajes de todos os níveis) travavam a tela logo depois do
 * primeiro quadro. Os dois são funções puras do projeto: rodam num Worker dedicado, com o mesmo resultado, e a interface
 * recebe a resposta quando chega. Sem Worker (testes, navegador sem suporte) o cliente avisa que não há (`disponivel`) e
 * quem chama calcula como antes, na thread principal.
 *
 * Este arquivo serve aos dois lados, como `resolveWorker.ts`: dentro do worker o bloco do fim instala o servidor.
 */

/** Pedido ao worker. `projeto` ausente: é o mesmo `chave` do pedido anterior que o trouxe. */
export type PedidoAviso =
  | { id: number; tipo: 'avisos'; chave: number; projeto?: Project; lang?: Lang }
  | { id: number; tipo: 'vista'; chave: number; projeto?: Project; nivel: Id; faixa: ViewRange; lang?: Lang };

export interface RespostaAviso {
  id: number;
  resultado: unknown;
  erro: string | null;
}

/** Calcula um pedido. É a mesma função no worker e na thread principal. */
export function executarAviso(p: Project, pedido: { tipo: 'avisos' } | { tipo: 'vista'; nivel: Id; faixa: ViewRange }, lang: Lang = useI18n.getState().lang): ValidationIssue[] | ViewRangeWarning[] {
  // Contexto só do nível pedido (o mesmo que a planta usa): resolver lajes de todos os níveis custava ~2–3 s.
  return pedido.tipo === 'avisos' ? avisosDoProjeto(p, lang) : viewRangeWarnings(p, pedido.nivel, pedido.faixa, contextoDaVista(p, pedido.nivel), lang);
}

/** Forma mínima de um `Worker` (ou de um substituto nos testes). */
export interface WorkerAvisoLike {
  postMessage(mensagem: unknown): void;
  terminate(): void;
  onmessage: ((evento: { data: unknown }) => void) | null;
  onerror: ((evento: unknown) => void) | null;
}

/** Cliente de um worker de avisos. Um worker atende um pedido por vez; o pedido novo de um tipo substitui o antigo. */
export class ClienteAvisos {
  private worker: WorkerAvisoLike | null = null;
  private proximoId = 1;
  private readonly pendentes = new Map<number, { resolver: (v: unknown) => void; rejeitar: (e: unknown) => void; tipo: string }>();
  /** Projeto já enviado ao worker, com a chave que o identifica lá. */
  private enviado: { projeto: Project; chave: number } | null = null;
  private chaves = 0;

  constructor(criar?: () => WorkerAvisoLike) {
    if (!criar) return;
    try {
      const w = criar();
      w.onmessage = (ev) => this.receber(ev.data as RespostaAviso);
      w.onerror = () => this.quebrou();
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  /** Há worker: os pedidos vão para ele. Sem worker, `pedir*` rejeita e quem chama calcula na thread principal. */
  get disponivel(): boolean {
    return this.worker !== null;
  }

  avisos(p: Project, lang: Lang = useI18n.getState().lang): Promise<ValidationIssue[]> {
    return this.pedir('avisos', p, {}, lang) as Promise<ValidationIssue[]>;
  }

  vista(p: Project, nivel: Id, faixa: ViewRange, lang: Lang = useI18n.getState().lang): Promise<ViewRangeWarning[]> {
    return this.pedir('vista', p, { nivel, faixa }, lang) as Promise<ViewRangeWarning[]>;
  }

  /** Descarta os pedidos em curso (a resposta, se vier, é ignorada) e desliga o worker. */
  encerrar(): void {
    this.rejeitarTodos(new Error('encerrado'));
    try {
      this.worker?.terminate();
    } catch {
      /* já encerrado */
    }
    this.worker = null;
  }

  private pedir(tipo: 'avisos' | 'vista', p: Project, extra: { nivel?: Id; faixa?: ViewRange }, lang: Lang): Promise<unknown> {
    const w = this.worker;
    if (!w) return Promise.reject(new Error('sem worker'));
    const id = this.proximoId++;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver, rejeitar, tipo });
      const repetido = this.enviado?.projeto === p;
      const chave = repetido ? this.enviado!.chave : ++this.chaves;
      const base = { id, chave, lang, ...(repetido ? {} : { projeto: p }) };
      const msg = tipo === 'avisos' ? { ...base, tipo } : { ...base, tipo, nivel: extra.nivel!, faixa: extra.faixa! };
      try {
        w.postMessage(msg);
        if (!repetido) this.enviado = { projeto: p, chave };
      } catch (e) {
        this.pendentes.delete(id);
        rejeitar(e);
      }
    });
  }

  private receber(r: RespostaAviso): void {
    const p = this.pendentes.get(r.id);
    if (!p) return;
    this.pendentes.delete(r.id);
    if (r.erro === 'projeto-ausente') {
      // O worker não tem o projeto desta chave (foi reiniciado): quem chama pede de novo.
      this.enviado = null;
      p.rejeitar(new Error(r.erro));
    } else if (r.erro !== null) p.rejeitar(new Error(r.erro));
    else p.resolver(r.resultado);
  }

  private rejeitarTodos(erro: Error): void {
    for (const p of this.pendentes.values()) p.rejeitar(erro);
    this.pendentes.clear();
  }

  private quebrou(): void {
    this.rejeitarTodos(new Error('worker falhou'));
    try {
      this.worker?.terminate();
    } catch {
      /* já encerrado */
    }
    this.worker = null;
    this.enviado = null;
  }
}

/** Instala o servidor no escopo do worker: processa um pedido por vez, na ordem de chegada. */
export function instalarServidorAvisos(escopo: { postMessage(m: unknown): void; onmessage: ((ev: { data: unknown }) => void) | null }): void {
  let ultimo: { chave: number; projeto: Project } | null = null;
  escopo.onmessage = (ev) => {
    const pedido = ev.data as PedidoAviso;
    try {
      if (pedido.projeto) ultimo = { chave: pedido.chave, projeto: pedido.projeto };
      if (!ultimo || ultimo.chave !== pedido.chave) {
        escopo.postMessage({ id: pedido.id, resultado: null, erro: 'projeto-ausente' } satisfies RespostaAviso);
        return;
      }
      const resultado = executarAviso(ultimo.projeto, pedido.tipo === 'avisos' ? { tipo: 'avisos' } : { tipo: 'vista', nivel: pedido.nivel, faixa: pedido.faixa }, pedido.lang ?? 'pt');
      escopo.postMessage({ id: pedido.id, resultado, erro: null } satisfies RespostaAviso);
    } catch (e) {
      escopo.postMessage({ id: pedido.id, resultado: null, erro: e instanceof Error ? e.message : String(e) } satisfies RespostaAviso);
    }
  };
}

const ehEscopoDeWorker = (): boolean => {
  const g = globalThis as { WorkerGlobalScope?: new () => unknown; window?: unknown };
  return g.window === undefined && typeof g.WorkerGlobalScope === 'function' && (globalThis as unknown) instanceof g.WorkerGlobalScope;
};

/** Cria um cliente com Worker real quando o navegador tem; senão um cliente sem worker (`disponivel` falso). */
export function criarClienteAvisos(): ClienteAvisos {
  if (typeof Worker === 'undefined') return new ClienteAvisos();
  return new ClienteAvisos(() => new Worker(new URL('./avisosWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerAvisoLike);
}

if (ehEscopoDeWorker()) instalarServidorAvisos(globalThis as unknown as Parameters<typeof instalarServidorAvisos>[0]);
