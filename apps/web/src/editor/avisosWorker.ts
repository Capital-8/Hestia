import type { Project, ValidationIssue } from '@hestia/model';
import { calcularAvisos } from './avisosCalculo.ts';

/**
 * Worker dos avisos do projeto: calcula `calcularAvisos` fora da thread principal (1 a 4 s num projeto grande), para a
 * órbita e a edição nunca esperarem por ele. Um pedido por vez; trocar de projeto durante o cálculo encerra o worker
 * (o resultado velho não interessa) e o próximo pedido sobe um novo.
 *
 * Este arquivo serve aos dois lados, como `resolveWorker.ts`: na thread principal, `criarCalculoAvisos` devolve o cliente;
 * dentro do worker (aberto por este mesmo módulo), o bloco do fim responde aos pedidos.
 */

/** Pedido ao worker: o projeto inteiro (estrutura clonável) e o id para casar a resposta. */
interface PedidoAvisos {
  id: number;
  projeto: Project;
}
/** Resposta do worker: os avisos, ou a mensagem do erro. */
interface RespostaAvisos {
  id: number;
  avisos?: ValidationIssue[];
  erro?: string;
}

/** Um cálculo em curso: a promessa dos avisos e o cancelamento. */
export interface CalculoEmCurso {
  promessa: Promise<ValidationIssue[]>;
  cancelar(): void;
}

/** Cliente dos avisos no worker. */
export interface CalculoAvisos {
  calcular(p: Project): CalculoEmCurso;
  encerrar(): void;
}

const ehEscopoDeWorker = (): boolean => {
  const g = globalThis as { WorkerGlobalScope?: new () => unknown; window?: unknown };
  return g.window === undefined && typeof g.WorkerGlobalScope === 'function' && (globalThis as unknown) instanceof g.WorkerGlobalScope;
};

/** Cria o cliente do worker de avisos, ou `null` quando o ambiente não tem `Worker` (testes, SSR). */
export function criarCalculoAvisos(criar?: () => Worker): CalculoAvisos | null {
  const fabrica = criar ?? (typeof Worker === 'function' ? () => new Worker(new URL('./avisosWorker.ts', import.meta.url), { type: 'module' }) : null);
  if (!fabrica) return null;
  let worker: Worker | null = null;
  let proximo = 1;
  const pendentes = new Map<number, { ok: (a: ValidationIssue[]) => void; falha: (e: Error) => void }>();
  const descartar = (): void => {
    worker?.terminate();
    worker = null;
    for (const p of pendentes.values()) p.falha(new Error('avisos-cancelados'));
    pendentes.clear();
  };
  const garantir = (): Worker => {
    if (worker) return worker;
    const w = fabrica();
    w.onmessage = (ev: MessageEvent<RespostaAvisos>) => {
      const r = ev.data;
      const p = pendentes.get(r.id);
      if (!p) return;
      pendentes.delete(r.id);
      if (r.avisos) p.ok(r.avisos);
      else p.falha(new Error(r.erro ?? 'avisos-falhou'));
    };
    w.onerror = () => descartar();
    worker = w;
    return w;
  };
  return {
    calcular(projeto: Project): CalculoEmCurso {
      // Um pedido em curso é do projeto anterior: o worker é refeito em vez de esperar 1-4 s por um resultado velho.
      if (pendentes.size > 0) descartar();
      const id = proximo++;
      const promessa = new Promise<ValidationIssue[]>((ok, falha) => {
        pendentes.set(id, { ok, falha });
        try {
          garantir().postMessage({ id, projeto } satisfies PedidoAvisos);
        } catch (e) {
          pendentes.delete(id);
          falha(e instanceof Error ? e : new Error(String(e)));
        }
      });
      return {
        promessa,
        cancelar: () => {
          if (pendentes.has(id)) descartar();
        },
      };
    },
    encerrar: descartar,
  };
}

if (ehEscopoDeWorker()) {
  const escopo = globalThis as unknown as { onmessage: ((ev: MessageEvent<PedidoAvisos>) => void) | null; postMessage(m: RespostaAvisos): void };
  escopo.onmessage = (ev) => {
    const { id, projeto } = ev.data;
    try {
      escopo.postMessage({ id, avisos: calcularAvisos(projeto) });
    } catch (e) {
      escopo.postMessage({ id, erro: e instanceof Error ? e.message : String(e) });
    }
  };
}
