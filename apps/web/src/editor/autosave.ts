import { estimarTamanhoSerializado, serializeProject, type Project } from '@hestia/model';
import { AUTOSAVE_KEY, safeRemove, safeSet } from './storage.ts';

/** Acima disto (caracteres estimados) o autosave não é gerado: o localStorage (~5 MB) recusaria o texto e o trabalho seria jogado fora. */
export const AUTOSAVE_TETO = 4_000_000;
/** Acima disto (e abaixo do teto) a serialização espera um momento ocioso do navegador, sem mudar o resultado. */
export const AUTOSAVE_OCIOSO = 400_000;

export type ResultadoAutosave = 'gravado' | 'pulado' | 'adiado';

export interface DepsAutosave {
  serializar: (p: Project) => string;
  gravar: (chave: string, valor: string) => void;
  remover: (chave: string) => void;
  /** Agenda `f` para um momento ocioso. */
  ocioso: (f: () => void) => void;
}

const depsPadrao: DepsAutosave = {
  serializar: (p) => serializeProject(p, 1),
  gravar: safeSet,
  remover: safeRemove,
  ocioso: (f) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(f, { timeout: 2000 });
    else setTimeout(f, 50);
  },
};

/** O projeto é grande demais para o autosave (estimativa barata, sem serializar)? */
export const projetoGrandeParaAutosave = (p: Project): boolean => estimarTamanhoSerializado(p) > AUTOSAVE_TETO;

/**
 * Grava o autosave. Projeto pequeno: serializa e grava na hora (idêntico ao de sempre). Médio: serializa em momento ocioso
 * (`vigente` diz se o projeto ainda é o mesmo quando o momento chega). Grande: NÃO serializa, apaga o autosave antigo (outro
 * projeto) para que o F5 não restaure o errado, e devolve 'pulado'.
 */
export function gravarAutosave(p: Project, vigente: () => boolean = () => true, deps: DepsAutosave = depsPadrao): ResultadoAutosave {
  const est = estimarTamanhoSerializado(p);
  if (est > AUTOSAVE_TETO) {
    deps.remover(AUTOSAVE_KEY);
    return 'pulado';
  }
  if (est > AUTOSAVE_OCIOSO) {
    deps.ocioso(() => {
      if (vigente()) deps.gravar(AUTOSAVE_KEY, deps.serializar(p));
    });
    return 'adiado';
  }
  deps.gravar(AUTOSAVE_KEY, deps.serializar(p));
  return 'gravado';
}
