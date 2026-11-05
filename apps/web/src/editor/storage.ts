/** Leitura e escrita no localStorage que nunca lançam: navegador sem armazenamento segue funcionando. */
export function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* armazenamento indisponível: o app segue funcionando sem autosave */
  }
}

/** Chave do autosave (projeto em andamento, restaurado ao abrir o app). */
export const AUTOSAVE_KEY = 'hestia.autosave.v1';
/**
 * Cópia do último documento que foi SALVO (pasta da biblioteca ou arquivo entregue). Comparar com o autosave é o que
 * diz se há trabalho não salvo de verdade: depois de um Ctrl+S os dois são idênticos e a tela inicial não oferece
 * "recuperar".
 */
export const AUTOSAVE_SALVO_KEY = 'hestia.autosave.salvo.v1';
const TUTORIAL_KEY = 'hestia.tutorial.v1';

/** Existe um autosave guardado neste navegador. */
export const hasAutosave = (): boolean => safeGet(AUTOSAVE_KEY) !== null;

/** O tutorial já foi fechado uma vez neste navegador. */
export const tutorialSeen = (): boolean => safeGet(TUTORIAL_KEY) === '1';

export const markTutorialSeen = (): void => safeSet(TUTORIAL_KEY, '1');
