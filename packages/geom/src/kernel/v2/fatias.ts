/**
 * Chaves de liberação por fatia do kernel v2 (decisão 0046 §2.6). Cada fatia (A..E) tem chave própria:
 * `?kernelFatias=A,B` na URL ou `hestia:kernel:fatias` no `localStorage` (mesmo formato). `?kernel=rust` e a
 * preferência de aplicação `hestia:kernel = rust` ligam TODAS as fatias existentes; `?kernel=ts` desliga todas.
 * Ordem de precedência: URL (`kernelFatias`, depois `kernel`) > `localStorage` (fatias, depois `kernel`).
 *
 * Sem efeito colateral no import e tolerante a ambiente sem `location`/`localStorage` (worker, Node): tudo
 * desligado, exatamente como hoje. O `ambiente` injetável serve aos testes.
 */

export const FATIAS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Fatia = (typeof FATIAS)[number];

/** Chaves do `localStorage`. `hestia:kernel` é a mesma de `apps/web/src/editor/preferenciasKernel.ts`. */
export const CHAVE_FATIAS = 'hestia:kernel:fatias';
export const CHAVE_KERNEL_GERAL = 'hestia:kernel';

export interface AmbienteFatias {
  /** `location.search` (com ou sem `?`). */
  busca?: string | null;
  /** Leitura do armazenamento do navegador. */
  ler?: (chave: string) => string | null;
}

function ambientePadrao(): AmbienteFatias {
  let busca: string | null = null;
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    busca = loc?.search ?? null;
  } catch {
    busca = null;
  }
  return {
    busca,
    ler: (chave) => {
      try {
        return (globalThis as { localStorage?: Storage }).localStorage?.getItem(chave) ?? null;
      } catch {
        return null;
      }
    },
  };
}

/** Interpreta `A,B` (ignora o que não é fatia conhecida); `null` quando o texto está vazio/ausente. */
export function interpretarLista(texto: string | null | undefined): Set<Fatia> | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const saida = new Set<Fatia>();
  for (const parte of texto.split(',')) {
    const f = parte.trim().toUpperCase();
    if ((FATIAS as readonly string[]).includes(f)) saida.add(f as Fatia);
  }
  return saida;
}

/** Fatias ligadas no ambiente dado. */
export function fatiasLigadas(ambiente: AmbienteFatias = ambientePadrao()): Set<Fatia> {
  let params: URLSearchParams | null = null;
  try {
    params = ambiente.busca ? new URLSearchParams(ambiente.busca) : null;
  } catch {
    params = null;
  }
  const todas = (): Set<Fatia> => new Set(FATIAS);

  const urlLista = interpretarLista(params?.get('kernelFatias'));
  if (urlLista) return urlLista;
  const urlGeral = params?.get('kernel');
  if (urlGeral === 'rust') return todas();
  if (urlGeral === 'ts') return new Set();

  const ler = ambiente.ler ?? (() => null);
  const salvaLista = interpretarLista(ler(CHAVE_FATIAS));
  if (salvaLista) return salvaLista;
  return ler(CHAVE_KERNEL_GERAL) === 'rust' ? todas() : new Set();
}

/** A fatia está liberada para esta sessão? */
export function kernelFatiaLigada(fatia: Fatia, ambiente?: AmbienteFatias): boolean {
  return fatiasLigadas(ambiente).has(fatia);
}
