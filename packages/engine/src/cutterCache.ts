import type { LevelCutters } from './junctionNet.ts';

/**
 * Teto do cache de cortadores por nível (`levelCutterContentCache` e `levelCutterSet` em `junctionNet.ts`). Antes, esses
 * caches guardavam referências a snapshots antigos do projeto sem limite em bytes (só um número de entradas). Agora cabem
 * dentro de um teto explícito em bytes estimados, com expulsão LRU: o item expulso é recalculado sob demanda, com o mesmo
 * resultado (os cortadores são puros para um snapshot).
 */

/** Teto padrão do cache de cortadores (web): 64 MB de bytes estimados. Configurável por `definirTetoCacheCortadores`. */
export const TETO_CACHE_CORTADORES_PADRAO = 64 * 1024 * 1024;

/** Bytes estimados de um vértice (dois números de ponto flutuante de 8 bytes). */
const BYTES_POR_VERTICE = 16;
/** Bytes estimados de uma peça (objeto da peça, faixa de cota e metadados): estimativa conservadora. */
const BYTES_POR_PECA = 128;
/** Bytes estimados de uma referência guardada na lista de fontes do cache. */
const BYTES_POR_REFERENCIA = 8;

/** Entrada do cache: os cortadores de um nível e as fontes (referências) que os validam. */
export interface EntradaCortadores {
  sources: readonly unknown[];
  value: LevelCutters;
}

/** Bytes estimados dos cortadores: vértices das formas mais uma base por peça. Peças compartilhadas contam em dobro (teto conservador). */
export function bytesDeCortadores(c: LevelCutters): number {
  let bytes = 0;
  for (const solidos of [c.floors, c.slabs, c.walls]) {
    for (const solido of solidos) {
      for (const sp of solido.pieces) {
        bytes += BYTES_POR_PECA;
        for (const poly of sp.poly) for (const ring of poly) bytes += ring.length * BYTES_POR_VERTICE;
      }
    }
  }
  return bytes;
}

/** Bytes estimados de uma entrada do cache: os cortadores mais a lista de fontes. */
export const bytesDeEntrada = (e: EntradaCortadores): number => bytesDeCortadores(e.value) + e.sources.length * BYTES_POR_REFERENCIA;

/**
 * Cache com teto em bytes estimados e expulsão LRU (o menos usado recentemente sai primeiro). Um item maior que o teto
 * não entra: quem consulta recalcula. `expulsoes` conta os itens tirados para caber no teto (medição e testes).
 */
export class CacheLRUPorBytes<V> {
  private readonly itens = new Map<string, { valor: V; bytes: number }>();
  private total = 0;
  /** Quantos itens saíram por falta de espaço desde a criação. */
  expulsoes = 0;

  constructor(
    private limite: number,
    private readonly medir: (valor: V) => number,
  ) {}

  /** Valor guardado, marcando o item como usado agora. */
  get(chave: string): V | undefined {
    const hit = this.itens.get(chave);
    if (!hit) return undefined;
    this.itens.delete(chave);
    this.itens.set(chave, hit);
    return hit.valor;
  }

  set(chave: string, valor: V): void {
    this.delete(chave);
    const bytes = this.medir(valor);
    if (bytes > this.limite) return;
    this.itens.set(chave, { valor, bytes });
    this.total += bytes;
    this.enquadrar();
  }

  delete(chave: string): void {
    const antes = this.itens.get(chave);
    if (!antes) return;
    this.itens.delete(chave);
    this.total -= antes.bytes;
  }

  /** Esvazia o cache (sem contar expulsões). */
  esvaziar(): void {
    this.itens.clear();
    this.total = 0;
  }

  /** Muda o teto (bytes) e expulsa o que não cabe mais. */
  definirLimite(bytes: number): void {
    this.limite = bytes;
    this.enquadrar();
  }

  /** Bytes estimados ocupados agora. Nunca passa do teto. */
  get bytes(): number {
    return this.total;
  }

  get limit(): number {
    return this.limite;
  }

  get size(): number {
    return this.itens.size;
  }

  private enquadrar(): void {
    while (this.total > this.limite) {
      const maisAntigo = this.itens.keys().next().value as string;
      this.delete(maisAntigo);
      this.expulsoes++;
    }
  }
}

/** Cache de cortadores por nível (chaves `conteudo:<nível>` e `conjunto:<nível>`), com um só teto em bytes. */
export const cacheDeCortadores = new CacheLRUPorBytes<EntradaCortadores>(TETO_CACHE_CORTADORES_PADRAO, bytesDeEntrada);

/** Muda o teto do cache de cortadores (bytes estimados). Valor não positivo é recusado. */
export function definirTetoCacheCortadores(bytes: number): void {
  if (!(bytes > 0)) throw new Error(`Teto do cache de cortadores deve ser positivo, recebi ${bytes}`);
  cacheDeCortadores.definirLimite(bytes);
}

/** Estado do cache de cortadores: bytes estimados, teto, itens e expulsões (medição e testes). */
export function estadoCacheCortadores(): { bytes: number; limit: number; size: number; expulsoes: number } {
  return { bytes: cacheDeCortadores.bytes, limit: cacheDeCortadores.limit, size: cacheDeCortadores.size, expulsoes: cacheDeCortadores.expulsoes };
}
