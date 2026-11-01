import { useSyncExternalStore } from 'react';

/** Progresso da montagem da vista 3D: pavimentos já na cena e total. `null` quando não há montagem em curso. */
export interface Progresso3d {
  montados: number;
  total: number;
}

let atual: Progresso3d | null = null;
const ouvintes = new Set<() => void>();

/** Publica o progresso (a montagem chama a cada fatia). Concluída (`montados >= total`) ou vazia, a barra some. */
export function publicarProgresso3d(montados: number, total: number): void {
  const proximo = total > 0 && montados < total ? { montados, total } : null;
  if (atual === proximo || (atual && proximo && atual.montados === proximo.montados && atual.total === proximo.total)) return;
  atual = proximo;
  for (const o of ouvintes) o();
}

/** Progresso corrente (para teste e depuração). */
export const progresso3dAtual = (): Progresso3d | null => atual;

/** Assina o progresso da montagem 3D. */
export function useProgresso3d(): Progresso3d | null {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => atual,
  );
}
