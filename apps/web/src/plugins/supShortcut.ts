/**
 * Atalho global do gerenciador de suplementos (fase J): Alt+Shift+P. Usa `code` (posição da tecla) e não `key`, porque
 * Option+Shift+P no macOS produz outro caractere. Ctrl e Meta precisam estar soltos para não colidir com os do navegador.
 */
export const MANAGER_SHORTCUT_LABEL = 'Alt+Shift+P';

export interface ShortcutEventLike {
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

export function isManagerShortcut(e: ShortcutEventLike): boolean {
  return e.code === 'KeyP' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat;
}
