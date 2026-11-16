/**
 * Pacote de suplemento `.hestiapkg` (docs/plugins/08 §8): zip com `manifest.json` na raiz.
 *
 * Aqui só se VALIDA e se organiza o conteúdo; nada é executado. O manifesto é dado não confiável. Esta leitura é o mínimo
 * que o carregador precisa (identidade, runtime, entrada, limites, permissões pedidas); a validação completa do manifesto
 * 2.0 e das contribuições é da Fase B e deve ser chamada pelo carregador em seguida (o objeto `raw` é repassado para isso).
 * Tamanhos em bytes, tempos em milissegundos (ms), memória em mebibytes (MiB).
 */
import { PKG_ZIP_LIMITS, readZip, safeEntryPath, ZipReadError, type ZipEntryData, type ZipReadLimits } from './zipRead.ts';

/** Tamanho máximo do pacote inteiro: 16 MiB. */
export const PKG_MAX_BYTES = 16 * 1024 * 1024;
/** Tamanho máximo do manifesto: 256 KiB. */
export const MANIFEST_MAX_BYTES = 256 * 1024;
/** Extensões aceitas dentro do pacote. `.wasm` fica de fora nesta fase (decisão do dono). */
export const PKG_ALLOWED_EXT: readonly string[] = ['json', 'js', 'mjs', 'svg', 'png', 'md', 'txt'];
/** Extensões de executável recusadas com mensagem própria. */
const EXECUTABLE_EXT = ['exe', 'dll', 'so', 'dylib', 'wasm', 'bat', 'cmd', 'sh', 'msi', 'app'];

export type PkgRuntime = 'declarative' | 'script' | 'external';

/** Limites pedidos pelo suplemento de script (ainda sem o teto do host; ver `resolveLimits` em plugin-api). */
export interface PkgLimits {
  timeoutMs?: number;
  memoryMiB?: number;
  maxCommandsPerAction?: number;
}

/** Leitura mínima do manifesto. `raw` é o objeto completo, para a validação 2.0 da Fase B. */
export interface PkgManifest {
  id: string;
  name: string;
  version: string;
  runtime: PkgRuntime;
  entry?: string;
  capabilities: string[];
  limits?: PkgLimits;
  dataSchema: number;
  raw: Record<string, unknown>;
}

export type PkgErrorCode =
  | ZipReadError['code']
  | 'too_big_pkg'
  | 'no_manifest'
  | 'manifest_big'
  | 'manifest_json'
  | 'manifest_field'
  | 'file_type'
  | 'wasm'
  | 'entry_missing';

/** Erro de validação do pacote, com código estável. */
export class PkgError extends Error {
  readonly code: PkgErrorCode;
  constructor(code: PkgErrorCode, message: string) {
    super(message);
    this.name = 'PkgError';
    this.code = code;
  }
}

/** Pacote validado. Os arquivos ficam em memória (limite de 16 MiB). */
export interface OpenedPackage {
  manifest: PkgManifest;
  /** Caminho → bytes, sem o `manifest.json`. */
  files: ReadonlyMap<string, Uint8Array>;
  /** Avisos para a tela de instalação (ex.: pacote sem assinatura). */
  warnings: string[];
  /** Texto do `README.md`, se houver, para mostrar ao instalar. */
  readme?: string;
}

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
const CAP_RE = /^[a-z][a-z.]*$/;

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

function str(o: Record<string, unknown>, k: string, max: number, required = true): string | undefined {
  const v = o[k];
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new PkgError('manifest_field', `campo "${k}" ausente ou inválido`);
  return v;
}

function posInt(v: unknown, k: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new PkgError('manifest_field', `"limits.${k}" deve ser inteiro positivo`);
  return v;
}

/** Valida o texto do manifesto (mínimo do carregador). Campos desconhecidos não são repassados fora de `raw`. */
export function parseManifestText(text: string): PkgManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PkgError('manifest_json', 'manifest.json não é JSON válido');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new PkgError('manifest_json', 'manifest.json deve ser um objeto');
  const o = parsed as Record<string, unknown>;
  const id = str(o, 'id', 100)!;
  if (!ID_RE.test(id)) throw new PkgError('manifest_field', 'id fora do padrão reverso-DNS minúsculo');
  const name = str(o, 'name', 80)!;
  const version = str(o, 'version', 40)!;
  if (!SEMVER_RE.test(version)) throw new PkgError('manifest_field', 'version deve ser semver x.y.z');
  const runtime = o.runtime;
  if (runtime !== 'declarative' && runtime !== 'script' && runtime !== 'external') throw new PkgError('manifest_field', 'runtime deve ser declarative, script ou external');
  const caps = o.capabilities ?? [];
  if (!Array.isArray(caps) || caps.length > 40 || caps.some((c) => typeof c !== 'string' || !CAP_RE.test(c)) || new Set(caps).size !== caps.length) {
    throw new PkgError('manifest_field', 'capabilities inválido (lista de até 40 textos sem repetição)');
  }
  let entry: string | undefined;
  if (runtime === 'script') {
    entry = str(o, 'entry', 200)!;
    if (safeEntryPath(entry) === null || entry.endsWith('/') || !['js', 'mjs'].includes(extOf(entry))) throw new PkgError('manifest_field', 'entry deve ser .js ou .mjs dentro do pacote');
  } else if (o.entry !== undefined) {
    throw new PkgError('manifest_field', 'entry só vale para runtime script');
  }
  if (runtime === 'declarative' && (o.external !== undefined || (caps as string[]).includes('model.write'))) {
    throw new PkgError('manifest_field', 'suplemento declarativo não pode pedir model.write nem external');
  }
  let limits: PkgLimits | undefined;
  if (o.limits !== undefined) {
    if (runtime !== 'script') throw new PkgError('manifest_field', 'limits só vale para runtime script');
    const l = o.limits;
    if (typeof l !== 'object' || l === null || Array.isArray(l)) throw new PkgError('manifest_field', 'limits deve ser objeto');
    const lo = l as Record<string, unknown>;
    limits = {};
    const t = posInt(lo.timeoutMs, 'timeoutMs');
    const m = posInt(lo.memoryMiB, 'memoryMiB');
    const c = posInt(lo.maxCommandsPerAction, 'maxCommandsPerAction');
    if (t !== undefined) limits.timeoutMs = t;
    if (m !== undefined) limits.memoryMiB = m;
    if (c !== undefined) limits.maxCommandsPerAction = c;
  }
  const ds = o.dataSchema ?? 1;
  if (typeof ds !== 'number' || !Number.isInteger(ds) || ds < 1 || ds > 9999) throw new PkgError('manifest_field', 'dataSchema deve ser inteiro de 1 a 9999');
  const manifest: PkgManifest = { id, name, version, runtime, capabilities: caps as string[], dataSchema: ds, raw: o };
  if (entry !== undefined) manifest.entry = entry;
  if (limits) manifest.limits = limits;
  return manifest;
}

/** Confere cada arquivo (tipo, caminho) e monta o pacote. Comum ao zip e à pasta de desenvolvimento. */
function assemble(entries: readonly ZipEntryData[]): OpenedPackage {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let manifestBytes: Uint8Array | undefined;
  const files = new Map<string, Uint8Array>();
  for (const e of entries) {
    const path = safeEntryPath(e.path);
    if (path === null) throw new PkgError('bad_path', `caminho inválido: ${e.path.slice(0, 80)}`);
    const ext = extOf(path);
    if (ext === 'wasm') throw new PkgError('wasm', `.wasm não é aceito nesta versão: ${path}`);
    if (EXECUTABLE_EXT.includes(ext)) throw new PkgError('file_type', `executável não permitido: ${path}`);
    if (!PKG_ALLOWED_EXT.includes(ext)) throw new PkgError('file_type', `tipo de arquivo não permitido: ${path}`);
    if (path === 'manifest.json') manifestBytes = e.data;
    else files.set(path, e.data);
  }
  if (!manifestBytes) throw new PkgError('no_manifest', 'manifest.json ausente na raiz do pacote');
  if (manifestBytes.length > MANIFEST_MAX_BYTES) throw new PkgError('manifest_big', 'manifest.json acima de 256 KiB');
  let text: string;
  try {
    text = decoder.decode(manifestBytes);
  } catch {
    throw new PkgError('manifest_json', 'manifest.json não está em UTF-8');
  }
  const manifest = parseManifestText(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (manifest.entry !== undefined && !files.has(manifest.entry)) throw new PkgError('entry_missing', `arquivo de entrada ausente: ${manifest.entry}`);
  const pkg: OpenedPackage = { manifest, files, warnings: ['Pacote sem assinatura: instale só de quem você confia.'] };
  const readme = files.get('README.md');
  if (readme) pkg.readme = new TextDecoder().decode(readme).slice(0, 20000);
  return pkg;
}

/** Abre e valida um `.hestiapkg` (bytes do zip). Nada é executado. Lança `PkgError` ou `ZipReadError`. */
export async function openPackage(bytes: Uint8Array, limits: ZipReadLimits = PKG_ZIP_LIMITS): Promise<OpenedPackage> {
  if (bytes.length > PKG_MAX_BYTES) throw new PkgError('too_big_pkg', 'pacote acima de 16 MiB');
  return assemble(await readZip(bytes, limits));
}

/** Pasta de desenvolvimento já lida (caminho relativo → bytes): mesmas regras do zip, mesmos limites. */
export function openPackageFolder(files: readonly ZipEntryData[], limits: ZipReadLimits = PKG_ZIP_LIMITS): OpenedPackage {
  if (files.length > limits.maxFiles) throw new PkgError('too_many_files', `mais de ${limits.maxFiles} arquivos`);
  let total = 0;
  for (const f of files) {
    if (f.data.length > limits.maxFileBytes) throw new PkgError('too_big_file', `arquivo grande demais: ${f.path}`);
    total += f.data.length;
  }
  if (total > limits.maxTotalBytes) throw new PkgError('too_big_total', 'conteúdo grande demais');
  const pkg = assemble(files);
  pkg.warnings.push('Pasta de desenvolvimento (não é um pacote .hestiapkg).');
  return pkg;
}
