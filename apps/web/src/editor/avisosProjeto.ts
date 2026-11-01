import type { Project, ValidationIssue } from '@hestia/model';
import { calcularAvisos, VERIFICADORES_DE_AVISOS } from './avisosCalculo.ts';
import { criarCalculoAvisos, type CalculoAvisos } from './avisosWorker.ts';
import { quandoLivre } from './interacaoAtiva.ts';

/** Avisos do projeto: os de validação, os de parede que ultrapassa ou fica fora do telhado (C2), os degraus da superfície, os de beiral sobre parede ou abertura, os do croqui e de norma das escadas e das rampas, os de ambiente, os do contorno associativo de piso e laje e os de abertura/parede do projeto. */
export const avisosDoProjeto = (p: Project): ValidationIssue[] => calcularAvisos(p);

/** Tempo de silêncio, em ms, antes de calcular os avisos de um projeto. Vale para qualquer tamanho de modelo. */
export const SETTLE_MS = 300;

/** Como o cálculo roda e cede a thread; tudo injetável para os testes. */
export interface OpcoesAgendaAvisos {
  /** Worker dos avisos. `null`: sem worker, calcula em fatias na thread principal. Padrão: o worker do navegador (se houver). */
  worker?: CalculoAvisos | null;
  /** Cede a thread entre um verificador e o seguinte. Padrão: `setTimeout(0)`. */
  ceder?: (tarefa: () => void) => void;
  /** Espera o fim do gesto de câmera antes de começar e entre as fatias (ver `quandoLivre`). Padrão: o sinal global. */
  quandoLivre?: (acao: () => void) => () => void;
}

let workerPadrao: CalculoAvisos | null | undefined;
/** O worker compartilhado dos avisos; criado na primeira necessidade. Falha ao subir: `null` e o cálculo cai em fatias. */
function workerDosAvisos(): CalculoAvisos | null {
  if (workerPadrao === undefined) {
    try {
      workerPadrao = criarCalculoAvisos();
    } catch {
      workerPadrao = null;
    }
  }
  return workerPadrao;
}

/**
 * Agenda o cálculo dos avisos de `p` para depois de `ms` (padrão SETTLE_MS) e de qualquer gesto de câmera. O resultado é o
 * mesmo de `avisosDoProjeto(p)`, só chega depois do primeiro quadro, e a thread principal não fica presa por ele: com
 * `Worker` o cálculo corre fora dela; sem, cada verificador roda numa tarefa, cedendo a thread entre eles e esperando o
 * fim de um gesto de órbita/zoom. Devolve a função que cancela a agenda (nova edição, troca de projeto ou desmontagem):
 * cancelar descarta o cálculo em curso.
 */
export function agendarAvisos(p: Project, receber: (avisos: ValidationIssue[]) => void, ms: number = SETTLE_MS, op: OpcoesAgendaAvisos = {}): () => void {
  const livre = op.quandoLivre ?? quandoLivre;
  const ceder = op.ceder ?? ((t: () => void) => void setTimeout(t, 0));
  let cancelado = false;
  let cancelarEspera: (() => void) | null = null;
  let cancelarWorker: (() => void) | null = null;

  /** Sem worker: um verificador por tarefa, e cada tarefa espera o gesto acabar. */
  const emFatias = (): void => {
    const todos: ValidationIssue[][] = [];
    const passo = (i: number): void => {
      if (cancelado) return;
      if (i >= VERIFICADORES_DE_AVISOS.length) return receber(todos.flat());
      cancelarEspera = livre(() => {
        if (cancelado) return;
        todos.push(VERIFICADORES_DE_AVISOS[i]!(p));
        ceder(() => passo(i + 1));
      });
    };
    passo(0);
  };

  const iniciar = (): void => {
    const worker = op.worker === undefined ? workerDosAvisos() : op.worker;
    if (!worker) return emFatias();
    let calculo;
    try {
      calculo = worker.calcular(p);
    } catch {
      return emFatias();
    }
    cancelarWorker = calculo.cancelar;
    calculo.promessa.then(
      (avisos) => {
        if (!cancelado) receber(avisos);
      },
      () => {
        // Cancelado por mim (nova edição) não faz nada; falha do worker cai nas fatias da thread principal.
        if (!cancelado) emFatias();
      },
    );
  };

  const timer = setTimeout(() => {
    cancelarEspera = livre(iniciar);
  }, ms);
  return () => {
    cancelado = true;
    clearTimeout(timer);
    cancelarEspera?.();
    cancelarWorker?.();
  };
}
