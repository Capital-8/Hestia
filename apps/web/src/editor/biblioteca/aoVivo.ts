import { useSyncExternalStore } from 'react';
import { bibliotecaDoAmbiente, type EstadoBiblioteca } from './biblioteca.ts';

/**
 * Estado da biblioteca compartilhado pela interface.
 *
 * A tela inicial e o menu Arquivo mostram a MESMA lista de projetos; guardar cada um a sua cópia faria o menu mostrar
 * um projeto recém-salvo só depois de reabrir a Home. Aqui há uma cópia só, publicada por quem fala com a pasta
 * (tela inicial, salvamento) e lida por quem desenha (Home, menu).
 */

let estado: EstadoBiblioteca | null = null;
let carregando: Promise<EstadoBiblioteca | null> | null = null;
const ouvintes = new Set<() => void>();

function notificar(): void {
  for (const o of ouvintes) o();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Estado atual (fora do React), ou `null` antes da primeira leitura. */
export function estadoDaBiblioteca(): EstadoBiblioteca | null {
  return estado;
}

/** Publica um estado novo (a tela inicial depois de listar, o salvamento depois de gravar). */
export function publicarBiblioteca(novo: EstadoBiblioteca | null): void {
  estado = novo;
  notificar();
}

/** Hook da biblioteca para os componentes. */
export function useBiblioteca(): EstadoBiblioteca | null {
  return useSyncExternalStore(assinar, estadoDaBiblioteca, estadoDaBiblioteca);
}

/** Lê a pasta (uma vez por vez) e publica. Sem biblioteca no ambiente, devolve `null`. */
export function carregarBiblioteca(): Promise<EstadoBiblioteca | null> {
  if (carregando) return carregando;
  const biblioteca = bibliotecaDoAmbiente();
  if (!biblioteca) {
    publicarBiblioteca(null);
    return Promise.resolve(null);
  }
  carregando = biblioteca
    .abrir()
    .then((e) => {
      publicarBiblioteca(e);
      return e;
    })
    .catch(() => estado)
    .finally(() => {
      carregando = null;
    });
  return carregando;
}

/** Relê a pasta ignorando o cache (voltar para a tela inicial, gravar um projeto). */
export async function atualizarBiblioteca(): Promise<EstadoBiblioteca | null> {
  const biblioteca = bibliotecaDoAmbiente();
  if (!biblioteca) {
    publicarBiblioteca(null);
    return null;
  }
  const e = await biblioteca.atualizar();
  publicarBiblioteca(e);
  return e;
}
