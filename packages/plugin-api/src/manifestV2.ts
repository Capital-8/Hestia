import { validateContributes, isPlainObject, type ContributesIssue, type I18nTable } from './contributes.ts';
import { CONTRIBUTES_LIMITS, type Contributes } from './contributesTypes.ts';
import { validateManifest, INTEGRATION_KINDS, type IntegrationKind, type ManifestIssue, type PluginManifest } from './manifest.ts';
import { ALL_CAPABILITIES_V2, CAPABILITY_REQUIRES_V2, isCapabilityV2, type CapabilityV2 } from './permissions.ts';
import { validateEndpoint, type PluginEndpoint } from './pluginHost.ts';
import { apiSupports, parseVersion } from './version.ts';

/**
 * Manifesto 2.0 de suplementos (ADR 0057, spec docs/plugins/08 §2). É DADO NÃO CONFIÁVEL: aqui só se valida e normaliza
 * (campos desconhecidos são descartados); nada é executado, carregado nem instalado.
 */
export type SuplementoRuntime = 'declarative' | 'script' | 'external';
export const SUPLEMENTO_RUNTIMES: readonly SuplementoRuntime[] = ['declarative', 'script', 'external'];

export interface ScriptLimits { timeoutMs: number; memoryMiB: number; maxCommandsPerAction: number }
/** Padrão e teto dos limites do runtime de script (o host limita ao teto, nunca amplia). */
export const SCRIPT_LIMITS_DEFAULT: Readonly<ScriptLimits> = { timeoutMs: 2000, memoryMiB: 64, maxCommandsPerAction: 5000 };
export const SCRIPT_LIMITS_MAX: Readonly<ScriptLimits> = { timeoutMs: 30000, memoryMiB: 256, maxCommandsPerAction: 50000 };

export interface PluginManifestV2 {
  /** 2 = manifesto 2.0; 1 = manifesto 1.x convertido (runtime `external`, sem contribuições). */
  manifestVersion: 1 | 2;
  id: string;
  name: string;
  version: string;
  hestiaApi: string;
  runtime: SuplementoRuntime;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  capabilities: CapabilityV2[];
  /** Só `script`: caminho relativo do código dentro do pacote. */
  entry?: string;
  /** Só `script`. */
  limits?: ScriptLimits;
  /** Só `external`. */
  external?: { kind: IntegrationKind; endpoint?: PluginEndpoint };
  /** Versão do formato do espaço de dados do suplemento (1 a 9999). */
  dataSchema: number;
  contributes: Contributes;
  i18n?: I18nTable;
}

export type ManifestV2Issue =
  | ManifestIssue
  | ContributesIssue
  | { code: 'manifest_too_large' }
  | { code: 'bad_manifest_version'; got: string }
  | { code: 'capability_not_allowed'; capability: string }
  | { code: 'missing_dependency'; capability: string; requires: string };

export type ManifestAnyResult =
  | { ok: true; manifest: PluginManifestV2; /** Verdadeiro quando veio de um manifesto 1.x (`validateManifest` atual). */ legacy: boolean; v1?: PluginManifest }
  | { ok: false; issues: ManifestV2Issue[] };

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SEMVER_RE = /^\d{1,6}\.\d{1,6}\.\d{1,6}(-[0-9A-Za-z.-]{1,20})?$/;
const LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;

/** Permissões que cada runtime NÃO pode pedir (spec 08 §3). `net.fetch` é reservada: nenhum runtime a aceita. */
const FORBIDDEN: Record<SuplementoRuntime, readonly string[]> = {
  declarative: ['scene.read', 'camera.read', 'camera.write', 'overrides.write', 'model.write', 'ui.tools', 'io.import', 'net.fetch'],
  script: ['scene.read', 'camera.read', 'camera.write', 'overrides.write', 'net.fetch'],
  external: ['net.fetch'],
};

const asI18n = (raw: unknown, issues: ManifestV2Issue[]): I18nTable | undefined => {
  if (raw === undefined) return undefined;
  const bad = (): undefined => { issues.push({ code: 'bad_field', path: 'i18n' }); return undefined; };
  if (!isPlainObject(raw)) return bad();
  const langs = Object.keys(raw);
  if (langs.length > 4 || !langs.includes('pt') || !langs.includes('en')) return bad();
  const out: I18nTable = {};
  for (const l of langs) {
    const tbl = raw[l];
    if (!LANG_RE.test(l) || !isPlainObject(tbl)) return bad();
    const keys = Object.keys(tbl);
    if (keys.length > 200) return bad();
    out[l] = {};
    for (const k of keys) {
      const v = tbl[k];
      if (!KEY_RE.test(k) || typeof v !== 'string' || v.length > 200) return bad();
      out[l]![k] = v;
    }
  }
  return out;
};

/** Valida um manifesto 2.0 (`manifestVersion: 2`). Para aceitar também o 1.x, use `validateManifestAny`. */
export function validateManifestV2(raw: unknown): ManifestAnyResult {
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: 'not_object' }] };
  const m = raw;
  const issues: ManifestV2Issue[] = [];
  const bad = (field: string): undefined => { issues.push({ code: 'bad_field', field }); return undefined; };
  const str = (f: string, max: number): string | undefined => (typeof m[f] === 'string' && (m[f] as string).trim() !== '' && (m[f] as string).length <= max ? (m[f] as string) : bad(f));
  const optStr = (f: string, max: number): string | undefined => (m[f] === undefined ? undefined : str(f, max));
  if (m.manifestVersion !== 2) issues.push({ code: 'bad_manifest_version', got: String(m.manifestVersion).slice(0, 20) });
  const id = str('id', 100);
  if (id !== undefined && !ID_RE.test(id)) bad('id');
  const name = str('name', 80);
  const version = str('version', 40);
  if (version !== undefined && !SEMVER_RE.test(version)) bad('version');
  const api = str('hestiaApi', 10);
  if (api !== undefined) {
    const v = parseVersion(api);
    if (!v) issues.push({ code: 'bad_api_version', got: api });
    else if (!apiSupports(v)) issues.push({ code: 'api_incompatible', got: api });
  }
  const runtime = (SUPLEMENTO_RUNTIMES as readonly unknown[]).includes(m.runtime) ? (m.runtime as SuplementoRuntime) : bad('runtime');
  const description = optStr('description', 400), author = optStr('author', 120), license = optStr('license', 40);
  const homepage = optStr('homepage', 200);
  if (homepage !== undefined && !/^https:\/\/[^\s]+$/.test(homepage)) bad('homepage');

  const caps: CapabilityV2[] = [];
  if (!Array.isArray(m.capabilities) || m.capabilities.length > 40) bad('capabilities');
  else {
    for (const c of m.capabilities) {
      if (!isCapabilityV2(c)) issues.push({ code: 'unknown_capability', capability: String(c).slice(0, 60) });
      else if (caps.includes(c)) bad('capabilities'); // sem repetição
      else caps.push(c);
    }
  }
  const dataSchema = m.dataSchema === undefined ? 1 : Number.isInteger(m.dataSchema) && (m.dataSchema as number) >= 1 && (m.dataSchema as number) <= 9999 ? (m.dataSchema as number) : bad('dataSchema');
  const i18n = asI18n(m.i18n, issues);

  // Campos por runtime: `entry` só em script, `limits` só em script, `external` só em external.
  let entry: string | undefined, limits: ScriptLimits | undefined, external: PluginManifestV2['external'];
  if (m.entry !== undefined) {
    const e = m.entry;
    const ok = typeof e === 'string' && e.length > 0 && e.length <= 200 && /\.(m?js)$/.test(e) && !e.startsWith('/') && !e.includes('\\') && !e.includes(':') && !e.split('/').some((s) => s === '..' || s === '.' || s === '');
    if (ok) entry = e as string; else bad('entry');
  }
  if (m.limits !== undefined) {
    if (!isPlainObject(m.limits)) bad('limits');
    else {
      const out = { ...SCRIPT_LIMITS_DEFAULT };
      for (const k of Object.keys(SCRIPT_LIMITS_DEFAULT) as Array<keyof ScriptLimits>) {
        const v = m.limits[k];
        if (v === undefined) continue;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) bad(`limits.${k}`);
        else out[k] = Math.min(v, SCRIPT_LIMITS_MAX[k]); // o host limita ao teto, nunca amplia
      }
      limits = out;
    }
  }
  if (m.external !== undefined) {
    const x = m.external;
    if (!isPlainObject(x) || !INTEGRATION_KINDS.includes(x.kind as IntegrationKind)) bad('external');
    else {
      const ep = x.endpoint === undefined ? undefined : validateEndpoint(x.endpoint);
      if (x.endpoint !== undefined && !ep) bad('external.endpoint');
      else external = { kind: x.kind as IntegrationKind, ...(ep ? { endpoint: ep } : {}) };
    }
  }
  if (runtime) {
    const conflict = (path: string): void => { issues.push({ code: 'runtime_conflict', path }); };
    if (runtime === 'script' && m.entry === undefined) bad('entry');
    if (runtime !== 'script' && m.entry !== undefined) conflict('entry');
    if (runtime !== 'script' && m.limits !== undefined) conflict('limits');
    if (runtime === 'external' && m.external === undefined) bad('external');
    if (runtime !== 'external' && m.external !== undefined) conflict('external');
    for (const c of caps) if (FORBIDDEN[runtime].includes(c)) issues.push({ code: 'capability_not_allowed', capability: c });
  }
  for (const c of caps) {
    for (const need of CAPABILITY_REQUIRES_V2[c] ?? []) if (!caps.includes(need)) issues.push({ code: 'missing_dependency', capability: c, requires: need });
  }

  let contributes: Contributes = {};
  if (runtime) {
    const r = validateContributes(m.contributes, { runtime, capabilities: caps, i18n: i18n ?? {} });
    contributes = r.value;
    issues.push(...r.issues);
  }
  if (issues.length || id === undefined || name === undefined || version === undefined || api === undefined || !runtime || dataSchema === undefined) return { ok: false, issues };
  return {
    ok: true, legacy: false,
    manifest: {
      manifestVersion: 2, id, name, version, hestiaApi: api, runtime,
      ...(description !== undefined ? { description } : {}), ...(author !== undefined ? { author } : {}),
      ...(homepage !== undefined ? { homepage } : {}), ...(license !== undefined ? { license } : {}),
      capabilities: ALL_CAPABILITIES_V2.filter((c) => caps.includes(c)),
      ...(entry !== undefined ? { entry } : {}), ...(runtime === 'script' ? { limits: limits ?? { ...SCRIPT_LIMITS_DEFAULT } } : {}),
      ...(external ? { external } : {}), dataSchema, contributes, ...(i18n ? { i18n } : {}),
    },
  };
}

/** Manifesto 1.x já validado vira o formato 2.0 (runtime `external`, sem contribuições). Sem perda: `v1` guarda o original. */
export function upgradeManifestV1(m: PluginManifest): PluginManifestV2 {
  return {
    manifestVersion: 1, id: m.id, name: m.name, version: m.version, hestiaApi: m.hestiaApi, runtime: 'external',
    ...(m.description !== undefined ? { description: m.description } : {}),
    capabilities: [...m.capabilities], external: { kind: m.kind }, dataSchema: 1, contributes: {},
  };
}

/**
 * Valida qualquer manifesto: sem `manifestVersion` segue o `validateManifest` atual (1.x, sem mudança); com
 * `manifestVersion: 2`, `validateManifestV2`. O manifesto não pode passar de 256 KiB.
 */
export function validateManifestAny(raw: unknown): ManifestAnyResult {
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: 'not_object' }] };
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return { ok: false, issues: [{ code: 'not_object' }] }; }
  if (size > CONTRIBUTES_LIMITS.manifestBytes) return { ok: false, issues: [{ code: 'manifest_too_large' }] };
  if (raw.manifestVersion === undefined) {
    const r = validateManifest(raw);
    return r.ok ? { ok: true, legacy: true, manifest: upgradeManifestV1(r.manifest), v1: r.manifest } : { ok: false, issues: r.issues };
  }
  return validateManifestV2(raw);
}
