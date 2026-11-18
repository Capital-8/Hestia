import type { Project } from '@hestia/model';

/**
 * Caches do desenho da prancha (desempenho 0.2.5). O projeto é imutável (immer: o que não muda mantém a mesma
 * referência), então "a versão do modelo" é o conjunto das referências dos campos do projeto, menos `sheets`: mover,
 * redimensionar ou inserir uma vista só troca `sheets`, e o desenho das OUTRAS vistas continua valendo. Editar qualquer
 * campo do modelo (paredes, níveis, tipos, cortes...) troca uma referência e invalida tudo que dependia dele.
 */
export type Sig = readonly unknown[];

/** Assinatura do modelo: pares campo/referência de todos os campos do projeto exceto `sheets`. */
export function modelSig(p: Project): Sig {
  const out: unknown[] = [];
  for (const k of Object.keys(p)) {
    if (k === 'sheets') continue;
    out.push(k, (p as unknown as Record<string, unknown>)[k]);
  }
  return out;
}

export function sameSig(a: Sig, b: Sig): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Cache LRU por chave de texto; cada entrada só vale para a assinatura do modelo com que foi calculada. */
export class SigCache<V> {
  private readonly items = new Map<string, { sig: Sig; value: V }>();
  hits = 0;
  misses = 0;

  constructor(private readonly max: number) {}

  get size(): number {
    return this.items.size;
  }

  get(key: string, sig: Sig): V | undefined {
    const e = this.items.get(key);
    if (!e || !sameSig(e.sig, sig)) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    // LRU: a mais recente vai para o fim.
    this.items.delete(key);
    this.items.set(key, e);
    return e.value;
  }

  set(key: string, sig: Sig, value: V): void {
    this.items.delete(key);
    this.items.set(key, { sig, value });
    while (this.items.size > this.max) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }

  clear(): void {
    this.items.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/** Devolve o valor do cache ou calcula, guarda e devolve. */
export function memo<V>(cache: SigCache<V>, key: string, sig: Sig, compute: () => V): V {
  const hit = cache.get(key, sig);
  if (hit !== undefined) return hit;
  const value = compute();
  cache.set(key, sig, value);
  return value;
}
