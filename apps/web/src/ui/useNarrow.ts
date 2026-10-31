import { useSyncExternalStore } from 'react';

/**
 * Largura de tela observada por media query, reativa a rotação e redimensionamento.
 * `useSyncExternalStore` evita estado duplicado e o primeiro quadro já vem com o valor certo.
 */
function useMedia(query: string, serverValue = false): boolean {
  const subscribe = (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  };
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Até 900 px os painéis laterais viram gavetas e os menus precisam de alvos maiores. */
export const useNarrow = (): boolean => useMedia('(max-width: 900px)');

/** Ao abrir uma vista em tela estreita, as gavetas fecham para devolver a área de desenho. */
export const telaEstreita = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
