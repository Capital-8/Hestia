/**
 * Lembrança da pasta raiz escolhida, no navegador.
 *
 * O handle de pasta (`FileSystemDirectoryHandle`) é "clonável": guardado no IndexedDB, sobrevive ao recarregar a página e
 * o navegador reabre a MESMA pasta sem pedir de novo (a permissão de escrita, essa sim, pode exigir um clique). No
 * `localStorage` ele não cabe — daí o IndexedDB, com uma loja de uma chave só e tudo dentro de `try/catch` (modo
 * privado e navegadores antigos simplesmente não têm a memória; a biblioteca volta a pedir a pasta).
 */

const BANCO = 'hestia-biblioteca';
const LOJA = 'raizes';
const CHAVE = 'raiz';

function comBanco<T>(acao: (db: IDBDatabase) => Promise<T>): Promise<T | null> {
  const indice = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!indice) return Promise.resolve(null);
  return new Promise<T | null>((resolver) => {
    let pedido: IDBOpenDBRequest;
    try {
      pedido = indice.open(BANCO, 1);
    } catch {
      resolver(null);
      return;
    }
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) pedido.result.createObjectStore(LOJA);
    };
    pedido.onerror = () => resolver(null);
    pedido.onsuccess = () => {
      const db = pedido.result;
      acao(db).then(
        (r) => {
          db.close();
          resolver(r);
        },
        () => {
          db.close();
          resolver(null);
        },
      );
    };
  });
}

function transacao<T>(db: IDBDatabase, modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return new Promise<T | null>((resolver) => {
    const tx = db.transaction(LOJA, modo);
    const pedido = acao(tx.objectStore(LOJA));
    pedido.onsuccess = () => resolver((pedido.result as T) ?? null);
    pedido.onerror = () => resolver(null);
  });
}

/** Guarda o handle da raiz (falha silenciosa: sem memória, a pasta é pedida de novo na próxima vez). */
export async function guardarRaizLembrada(handle: unknown): Promise<void> {
  await comBanco((db) => transacao(db, 'readwrite', (loja) => loja.put(handle, CHAVE)));
}

/** Handle da raiz guardado, ou `null`. */
export async function lerRaizLembrada<T>(): Promise<T | null> {
  return comBanco((db) => transacao<T>(db, 'readonly', (loja) => loja.get(CHAVE)));
}

/** Apaga a raiz lembrada. */
export async function apagarRaizLembrada(): Promise<void> {
  await comBanco((db) => transacao(db, 'readwrite', (loja) => loja.delete(CHAVE)));
}
