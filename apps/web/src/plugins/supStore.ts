/**
 * Persistência real dos suplementos instalados (spec 08 §7): pacote, estado "ativado" e permissões CONCEDIDAS.
 * No navegador e no app desktop (webview) o armazenamento é o IndexedDB; a lógica fica em `KvPackageStore`, sobre um
 * `KvBackend` mínimo, para testar a persistência sem navegador. Sem IndexedDB (janela privativa, dados bloqueados) o
 * app cai para a memória e avisa pelo registro: nada disto jamais impede o app de abrir.
 */
import { MemoryPackageStore, type InstalledPackage, type PackageStore } from './installer.ts';

/** Banco chave-valor mínimo (o IndexedDB guarda `Uint8Array` por clonagem estruturada, sem conversão). */
export interface KvBackend {
  get(key: string): Promise<InstalledPackage | undefined>;
  put(key: string, value: InstalledPackage): Promise<void>;
  remove(key: string): Promise<void>;
  all(): Promise<InstalledPackage[]>;
}

/** Armazenamento de pacotes sobre qualquer `KvBackend`. */
export class KvPackageStore implements PackageStore {
  constructor(private readonly kv: KvBackend) {}
  get(id: string): Promise<InstalledPackage | undefined> {
    return this.kv.get(id);
  }
  put(id: string, pkg: InstalledPackage): Promise<void> {
    return this.kv.put(id, pkg);
  }
  remove(id: string): Promise<void> {
    return this.kv.remove(id);
  }
  list(): Promise<InstalledPackage[]> {
    return this.kv.all();
  }
}

/** Backend em memória (testes: sobrevive a "reiniciar o app" quando a mesma instância é reaproveitada). */
export class MemoryKv implements KvBackend {
  readonly map = new Map<string, InstalledPackage>();
  async get(key: string): Promise<InstalledPackage | undefined> {
    const v = this.map.get(key);
    return v ? structuredClone(v) : undefined;
  }
  async put(key: string, value: InstalledPackage): Promise<void> {
    this.map.set(key, structuredClone(value));
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async all(): Promise<InstalledPackage[]> {
    return [...this.map.values()].map((v) => structuredClone(v));
  }
}

const DB_NAME = 'hestia-suplementos';
const DB_VERSION = 1;
const STORE = 'pacotes';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB falhou'));
  });
}

/** Backend IndexedDB: um registro por suplemento, chave = id do manifesto. */
export class IdbKv implements KvBackend {
  private db: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB não abriu'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    });
    this.db.catch(() => {
      this.db = null; // permite tentar de novo depois de uma falha
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string): Promise<InstalledPackage | undefined> {
    return (await request((await this.store('readonly')).get(key))) as InstalledPackage | undefined;
  }
  async put(key: string, value: InstalledPackage): Promise<void> {
    await request((await this.store('readwrite')).put(value, key));
  }
  async remove(key: string): Promise<void> {
    await request((await this.store('readwrite')).delete(key));
  }
  async all(): Promise<InstalledPackage[]> {
    return (await request((await this.store('readonly')).getAll())) as InstalledPackage[];
  }
}

/** Armazenamento do app: IndexedDB quando existe; senão memória (o chamador é avisado por `onFallback`). */
export function createAppPackageStore(onFallback?: (reason: string) => void): PackageStore {
  try {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (factory) return new KvPackageStore(new IdbKv(factory));
    onFallback?.('IndexedDB indisponível: suplementos só valem nesta sessão');
  } catch (e) {
    onFallback?.(`IndexedDB recusado: ${e instanceof Error ? e.message : String(e)}`);
  }
  return new MemoryPackageStore();
}
