import { ALL_CAPABILITIES, isCapability, type Capability } from './permissions.ts';
import { apiSupports, parseVersion } from './version.ts';

/** Tipo de integração. `renderer` é um processo separado que desenha a cena (o primeiro caso de uso). */
export type IntegrationKind = 'renderer' | 'exporter' | 'analysis';
export const INTEGRATION_KINDS: readonly IntegrationKind[] = ['renderer', 'exporter', 'analysis'];

/**
 * Manifesto de um plugin. O plugin o envia na mensagem `hello`; o host valida ANTES de qualquer outra coisa.
 * Todos os campos são dados: nada de caminho de executável nem de código a rodar.
 */
export interface PluginManifest {
  /** ID estável, reverso-DNS em minúsculas: `com.exemplo.renderizador`. */
  id: string;
  name: string;
  /** Versão do plugin (livre, mostrada ao usuário). */
  version: string;
  /** Versão da API do Hestia para a qual o plugin foi escrito (`major.minor`). */
  hestiaApi: string;
  kind: IntegrationKind;
  /** O que o plugin pede. O usuário concede um subconjunto. */
  capabilities: Capability[];
  description?: string;
}

export type ManifestIssue =
  | { code: 'not_object' }
  | { code: 'bad_field'; field: string }
  | { code: 'unknown_capability'; capability: string }
  | { code: 'bad_api_version'; got: string }
  | { code: 'api_incompatible'; got: string };

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/** Valida o manifesto recebido (dado não confiável). Devolve o manifesto normalizado ou a lista de problemas. */
export function validateManifest(raw: unknown): { ok: true; manifest: PluginManifest } | { ok: false; issues: ManifestIssue[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, issues: [{ code: 'not_object' }] };
  const m = raw as Record<string, unknown>;
  const issues: ManifestIssue[] = [];
  const str = (f: string, max: number): string | null => {
    const v = m[f];
    if (typeof v !== 'string' || v.trim() === '' || v.length > max) { issues.push({ code: 'bad_field', field: f }); return null; }
    return v;
  };
  const id = str('id', 100);
  if (id !== null && !ID_RE.test(id)) issues.push({ code: 'bad_field', field: 'id' });
  const name = str('name', 80);
  const version = str('version', 40);
  const api = str('hestiaApi', 10);
  if (api !== null) {
    const v = parseVersion(api);
    if (!v) issues.push({ code: 'bad_api_version', got: api });
    else if (!apiSupports(v)) issues.push({ code: 'api_incompatible', got: api });
  }
  const kind = m.kind;
  if (!INTEGRATION_KINDS.includes(kind as IntegrationKind)) issues.push({ code: 'bad_field', field: 'kind' });
  const caps: Capability[] = [];
  if (!Array.isArray(m.capabilities)) issues.push({ code: 'bad_field', field: 'capabilities' });
  else {
    for (const c of m.capabilities) {
      if (isCapability(c)) { if (!caps.includes(c)) caps.push(c); }
      else issues.push({ code: 'unknown_capability', capability: String(c).slice(0, 60) });
    }
  }
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 400)) issues.push({ code: 'bad_field', field: 'description' });
  if (issues.length || id === null || name === null || version === null || api === null) return { ok: false, issues };
  return {
    ok: true,
    manifest: { id, name, version, hestiaApi: api, kind: kind as IntegrationKind, capabilities: ALL_CAPABILITIES.filter((c) => caps.includes(c)), ...(typeof m.description === 'string' ? { description: m.description } : {}) },
  };
}
