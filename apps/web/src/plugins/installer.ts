/**
 * Instalação de suplementos (docs/plugins/08 §7.1 e §7.7): lê e valida o `.hestiapkg` (ou a pasta de desenvolvimento) e
 * guarda o pacote. Instalar NÃO executa nada e NÃO concede permissão. Falha de validação mostra o motivo e não instala.
 */
import { openPackage, openPackageFolder, PkgError, ZipReadError, type OpenedPackage, type PkgManifest, type ZipEntryData } from '@hestia/io';

/** Pacote guardado (persistência real, IndexedDB ou pasta do app, é plugável via `PackageStore`). */
export interface InstalledPackage {
  manifest: PkgManifest;
  files: Record<string, Uint8Array>;
  installedAt: number;
  /** Ativado pelo usuário (sobrevive ao reinício). */
  enabled: boolean;
  /** Permissões concedidas pelo usuário. */
  grants: string[];
  /** Origem: pacote `.hestiapkg` ou pasta de desenvolvimento. */
  source: 'package' | 'folder';
}

/** Armazenamento dos pacotes. Implementações reais (Tauri/IndexedDB) entram por esta interface. */
export interface PackageStore {
  get(id: string): Promise<InstalledPackage | undefined>;
  put(id: string, pkg: InstalledPackage): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<InstalledPackage[]>;
}

/** Armazenamento em memória (testes e padrão até a persistência ser ligada). */
export class MemoryPackageStore implements PackageStore {
  private readonly map = new Map<string, InstalledPackage>();
  async get(id: string): Promise<InstalledPackage | undefined> {
    return this.map.get(id);
  }
  async put(id: string, pkg: InstalledPackage): Promise<void> {
    this.map.set(id, pkg);
  }
  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
  async list(): Promise<InstalledPackage[]> {
    return [...this.map.values()];
  }
}

export type InstallResult =
  | {
      ok: true;
      id: string;
      /** Permissões pedidas pelo manifesto (para a tela de concessão). */
      requested: string[];
      /** Pedidas que ainda não estão concedidas (numa atualização, só as NOVAS). */
      needsGrant: string[];
      warnings: string[];
      readme?: string;
      /** `true` quando substituiu uma versão já instalada. */
      replaced: boolean;
    }
  | { ok: false; code: string; message: string };

/** Valida o manifesto completo 2.0 (Fase B). Devolve o motivo da recusa ou `null`. Stub: aceita tudo. */
export type ManifestValidator = (raw: Record<string, unknown>) => string | null;

export interface InstallerOptions {
  store: PackageStore;
  /** Validação completa do manifesto (Fase B, `validateManifestAny`). */
  validateManifest?: ManifestValidator;
  now?: () => number;
}

export class Installer {
  constructor(private readonly o: InstallerOptions) {}

  /** Instala a partir dos bytes de um `.hestiapkg`. */
  async installBytes(bytes: Uint8Array): Promise<InstallResult> {
    try {
      return await this.finish(await openPackage(bytes), 'package');
    } catch (e) {
      return this.refuse(e);
    }
  }

  /** Instala a partir de uma pasta de desenvolvimento já lida (caminho relativo → bytes). */
  async installFolder(files: readonly ZipEntryData[]): Promise<InstallResult> {
    try {
      return await this.finish(openPackageFolder(files), 'folder');
    } catch (e) {
      return this.refuse(e);
    }
  }

  private async finish(pkg: OpenedPackage, source: 'package' | 'folder'): Promise<InstallResult> {
    const reason = this.o.validateManifest?.(pkg.manifest.raw) ?? null;
    if (reason) return { ok: false, code: 'manifest_invalid', message: reason };
    const id = pkg.manifest.id;
    const previous = await this.o.store.get(id);
    const granted = new Set(previous?.grants ?? []);
    const requested = pkg.manifest.capabilities;
    // Atualização: as permissões já concedidas continuam; as que o pacote novo não pede mais saem.
    const keep = requested.filter((c) => granted.has(c));
    const files: Record<string, Uint8Array> = {};
    for (const [p, d] of pkg.files) files[p] = d;
    await this.o.store.put(id, {
      manifest: pkg.manifest,
      files,
      installedAt: (this.o.now ?? Date.now)(),
      enabled: previous?.enabled ?? false,
      grants: keep,
      source,
    });
    const res: InstallResult = {
      ok: true,
      id,
      requested,
      needsGrant: requested.filter((c) => !granted.has(c)),
      warnings: pkg.warnings,
      replaced: previous !== undefined,
    };
    if (pkg.readme !== undefined) res.readme = pkg.readme;
    return res;
  }

  private refuse(e: unknown): InstallResult {
    if (e instanceof PkgError || e instanceof ZipReadError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: 'unexpected', message: e instanceof Error ? e.message : String(e) };
  }
}
