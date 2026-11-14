import { importIfc, type IfcImportProgress, type ImportReport } from '@hestia/io';
import type { Lang } from './i18n.ts';
import { empacotarProjetoIfc, type ProjetoIfcEmpacotado } from './ifcMalha.ts';

/**
 * Importador IFC fora da thread principal (ver `importIfcText` em `ifcImport.ts`): um arquivo de 25 MB leva
 * segundos no `importIfc`, e na janela isso congela a interface. Aqui o mesmo importador roda no worker e o
 * resultado volta por `postMessage` (o projeto é dado simples — Record, array e número —, então sobrevive ao
 * structured clone). Erros viram `{ error }` para a janela mostrar a mensagem em vez de morrer sem resposta.
 *
 * As malhas saem como buffers transferíveis (`ifcMalha.ts`): clonar milhões de coordenadas custava mais que a
 * própria importação.
 */

/** O que a janela manda: o `File` (lido aqui dentro, sem copiar os bytes pela janela) ou, em último caso, o texto. */
interface Pedido {
  file?: File;
  text?: string;
  lang?: Lang;
}

/** Andamento da importação: a janela usa para a barra, sem esperar o fim. */
export interface ProgressoWorker {
  progress: IfcImportProgress;
}

/** Projeto empacotado com o relatório: o que a janela recebe no fim. */
export interface ResultadoWorker extends ProjetoIfcEmpacotado {
  report: ImportReport;
}

/** O que o worker devolve: progresso, o resultado empacotado ou a mensagem do erro. */
type Resposta = ProgressoWorker | { result: ResultadoWorker } | { error: string };

/** Só as duas operações que o worker usa; o cast evita trazer a lib `webworker` (que conflita com a `DOM`). */
const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null;
  postMessage: (mensagem: Resposta, transferir?: Transferable[]) => void;
};

escopo.onmessage = async (evento) => {
  try {
    let text: string | undefined = evento.data.file ? await evento.data.file.text() : (evento.data.text ?? '');
    // A barra não precisa de um aviso por parede: manda no máximo ~20 por segundo, mas nunca perde a troca de fase.
    let ultimoEnvio = 0;
    let ultimaFase = '';
    const progresso = (progress: IfcImportProgress): void => {
      const agora = performance.now();
      if (progress.stage !== ultimaFase || agora - ultimoEnvio >= 50) {
        ultimaFase = progress.stage;
        ultimoEnvio = agora;
        escopo.postMessage({ progress });
      }
    };
    const { project, report } = importIfc(text, undefined, progresso, evento.data.lang ?? 'pt');
    // O parse preguiçoso lia o texto até aqui; solta-o antes de empacotar o resultado.
    text = undefined;
    const empacotado = empacotarProjetoIfc(project);
    escopo.postMessage({ result: { ...empacotado, report } }, [empacotado.posicoes.buffer, empacotado.indices.buffer]);
  } catch (erro) {
    escopo.postMessage({ error: erro instanceof Error ? erro.message : String(erro) });
  }
};
