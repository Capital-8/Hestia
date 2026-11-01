import { type Project, type ValidationIssue } from '@hestia/model';
import { avisosDoProjeto } from './avisosCalculo.ts';
import { clienteAvisosCompartilhado } from './avisosCliente.ts';
import { quandoLivre } from './interacaoAtiva.ts';

export { avisosDoProjeto };

/** Avisos no worker compartilhado; `null` quando o ambiente não tem worker. */
const avisosNoWorker = (p: Project): Promise<ValidationIssue[]> | null => {
  const c = clienteAvisosCompartilhado('avisos');
  return c.disponivel ? c.avisos(p) : null;
};

/** Tempo de silêncio, em ms, antes de calcular os avisos de um projeto. Vale para qualquer tamanho de modelo. */
export const SETTLE_MS = 300;

/**
 * Agenda o cálculo dos avisos de `p` para depois de `ms` (padrão SETTLE_MS). O resultado é o mesmo de `avisosDoProjeto(p)`,
 * só chega depois do primeiro quadro. Devolve a função que cancela a agenda (troca de projeto ou desmontagem).
 * `calcular` (padrão: o worker de avisos, ver `avisosWorker.ts`) devolve uma promessa do resultado, ou `null` quando não há
 * como calcular fora da thread principal; aí o cálculo é o de sempre, direto no timer.
 */
export function agendarAvisos(p: Project, receber: (avisos: ValidationIssue[]) => void, ms: number = SETTLE_MS, calcular: (p: Project) => Promise<ValidationIssue[]> | null = avisosNoWorker): () => void {
  let cancelado = false;
  let soltarGesto: (() => void) | null = null;
  const timer = setTimeout(() => {
    // Não calcula (nem na thread principal, no caso sem worker) durante um gesto de câmera: espera o fim dele.
    soltarGesto = quandoLivre(() => {
      if (cancelado) return;
      const promessa = calcular(p);
      if (!promessa) return receber(avisosDoProjeto(p));
      promessa.then((a) => !cancelado && receber(a)).catch(() => !cancelado && receber(avisosDoProjeto(p)));
    });
  }, ms);
  return () => {
    cancelado = true;
    clearTimeout(timer);
    soltarGesto?.();
  };
}
