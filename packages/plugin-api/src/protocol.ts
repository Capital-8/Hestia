import { isNonce } from './auth.ts';
import type { Capability } from './permissions.ts';
import type { PluginManifest } from './manifest.ts';
import type { CameraMode, MaterialId, SceneCamera, SceneDelta, SceneSnapshot, ViewMaterialOverride } from './scene.ts';
import { lightIssue, materialIssue, meshIssue, siteIssue } from './sceneValidate.ts';

/**
 * Protocolo de conexão (docs/plugins/02-protocolo.md). Independente de linguagem: quadros JSON (texto) sobre um
 * transporte bidirecional de mensagens (hoje: WebSocket em loopback). Um quadro é um envelope:
 *   { "t": "<tipo>", "seq": n, "id"?: "<correlação>", "re"?: "<id respondido>", ...campos }
 *
 * - `seq`: contador crescente de quem envia; o outro lado confirma com `ack`. `ack`, `ping`, `pong`, `bye` e `error` não consomem `seq`.
 * - `id`: opcional; identifica um pedido que pode ser cancelado (`cancel`) e respondido (`re`).
 * - Proibido: imagem como meio de sincronizar a cena (nenhum tipo carrega PNG/pixels; ver `findImagePayload`).
 */
export interface Envelope { t: string; seq?: number; id?: string; re?: string }

export type ErrorCode =
  | 'bad_frame' | 'unknown_type' | 'unsupported_version' | 'bad_manifest' | 'not_handshaken'
  | 'permission_denied' | 'bad_request' | 'out_of_order' | 'cancelled' | 'ack_timeout' | 'heartbeat_timeout'
  | 'image_payload_forbidden' | 'internal' | 'auth_required' | 'auth_failed' | 'not_authenticated';

export interface ProtocolError { code: ErrorCode; message: string; fatal: boolean; detail?: Record<string, unknown> }

// ---- plugin → host ----
export interface HelloMsg extends Envelope { t: 'hello'; protocol: { min: string; max: string }; manifest: PluginManifest; resume?: { sessionId: string; lastRevision: number }; auth?: { nonce: string } }
export interface AuthOkMsg extends Envelope { t: 'auth.ok'; proof: string }
export interface ResyncMsg extends Envelope { t: 'scene.resync' }
export interface CameraModeSetMsg extends Envelope { t: 'camera.mode.set'; mode: CameraMode }
export interface CameraSetMsg extends Envelope { t: 'camera.set'; camera: SceneCamera; cameraRev: number }
export interface OverridesSetMsg extends Envelope { t: 'overrides.set'; materialId: MaterialId; override: ViewMaterialOverride }
export interface OverridesClearMsg extends Envelope { t: 'overrides.clear'; materialId: MaterialId }
export interface CancelMsg extends Envelope { t: 'cancel'; target: string }

// ---- host → plugin ----
export interface WelcomeMsg extends Envelope {
  t: 'welcome';
  protocol: string;
  api: string;
  sessionId: string;
  granted: Capability[];
  denied: Capability[];
  heartbeatMs: number;
  cameraMode: CameraMode;
  resumed: boolean;
  /** true quando o pareamento por token foi concluído nesta conexão (protocolo 1.1). */
  authenticated?: boolean;
}
export interface AuthMsg extends Envelope { t: 'auth'; nonce: string; proof: string }
export interface SnapshotMsg extends Envelope { t: 'scene.snapshot'; snapshot: SceneSnapshot }
/** Snapshot em partes (protocolo 1.2): cabeçalho sem as listas, depois `parts` partes numeradas, depois o fim. */
export type SnapshotHeader = Omit<SceneSnapshot, 'entities' | 'materials' | 'textures'>;
export interface SnapshotBeginMsg extends Envelope { t: 'scene.snapshot.begin'; snapshot: SnapshotHeader; parts: number; counts: { entities: number; materials: number; textures: number } }
export interface SnapshotPartMsg extends Envelope { t: 'scene.snapshot.part'; index: number; entities?: SceneSnapshot['entities']; materials?: SceneSnapshot['materials']; textures?: SceneSnapshot['textures'] }
export interface SnapshotEndMsg extends Envelope { t: 'scene.snapshot.end'; revision: number }
export interface DeltaMsg extends Envelope { t: 'scene.delta'; delta: SceneDelta }
export interface ConnectionEventMsg extends Envelope { t: 'event.connection'; state: 'connected' | 'closing'; reason?: string }

// ---- ambos ----
export interface CameraUpdateMsg extends Envelope { t: 'camera.update'; camera: SceneCamera; cameraRev: number; origin: 'hestia' | 'plugin' }
export interface CameraModeMsg extends Envelope { t: 'camera.mode'; mode: CameraMode }
export interface OverridesStateMsg extends Envelope { t: 'overrides.state'; overrides: Record<MaterialId, ViewMaterialOverride> }
export interface AckMsg extends Envelope { t: 'ack'; ack: number }
export interface PingMsg extends Envelope { t: 'ping'; n: number }
export interface PongMsg extends Envelope { t: 'pong'; n: number }
export interface ByeMsg extends Envelope { t: 'bye'; reason?: string }
export interface ErrorMsg extends Envelope { t: 'error'; error: ProtocolError }

export type PluginToHost = HelloMsg | AuthOkMsg | ResyncMsg | CameraModeSetMsg | CameraSetMsg | OverridesSetMsg | OverridesClearMsg | CancelMsg | CameraUpdateMsg | AckMsg | PingMsg | PongMsg | ByeMsg | ErrorMsg;
export type HostToPlugin = WelcomeMsg | AuthMsg | SnapshotMsg | SnapshotBeginMsg | SnapshotPartMsg | SnapshotEndMsg | DeltaMsg | ConnectionEventMsg | CameraUpdateMsg | CameraModeMsg | OverridesStateMsg | AckMsg | PingMsg | PongMsg | ByeMsg | ErrorMsg;
export type Message = PluginToHost | HostToPlugin;

/** Tipos que consomem `seq` e exigem `ack`. */
export const ACKED_TYPES: ReadonlySet<string> = new Set([
  'hello', 'auth', 'auth.ok', 'scene.resync', 'camera.mode.set', 'camera.set', 'overrides.set', 'overrides.clear', 'cancel',
  'welcome', 'scene.snapshot', 'scene.snapshot.begin', 'scene.snapshot.part', 'scene.snapshot.end', 'scene.delta', 'event.connection', 'camera.update', 'camera.mode', 'overrides.state',
]);

export const KNOWN_TYPES: ReadonlySet<string> = new Set([...ACKED_TYPES, 'bye', 'ack', 'ping', 'pong', 'error']);

/** Capacidade exigida por mensagem do plugin → host (o host confere a CONCESSÃO, não o pedido do manifesto). */
export const REQUIRED_CAPABILITY: Readonly<Record<string, Capability | undefined>> = {
  'scene.resync': 'scene.read',
  'camera.set': 'camera.write',
  'camera.mode.set': 'camera.write',
  'overrides.set': 'overrides.write',
  'overrides.clear': 'overrides.write',
};

export function encode(m: Message): string {
  return JSON.stringify(m);
}

/**
 * Em caso de falha, `seq` e `id` aparecem quando o quadro era uma mensagem numerada bem formada no envelope mas com
 * campos inválidos: o receptor ainda precisa CONSUMIR esse `seq` (ack), senão a próxima mensagem parece um salto.
 */
export type DecodeResult = { ok: true; message: Message } | { ok: false; error: ProtocolError; seq?: number; id?: string };

const MAX_FRAME_CHARS = 64 * 1024 * 1024;

/** Decodifica um quadro de texto. Quadros binários ou grandes demais são recusados: a cena viaja como JSON. */
export function decode(frame: unknown): DecodeResult {
  if (typeof frame !== 'string') return { ok: false, error: { code: 'bad_frame', message: 'Quadro não textual (binário não faz parte da versão 1).', fatal: false } };
  if (frame.length > MAX_FRAME_CHARS) return { ok: false, error: { code: 'bad_frame', message: 'Quadro grande demais.', fatal: true } };
  let v: unknown;
  try { v = JSON.parse(frame); } catch { return { ok: false, error: { code: 'bad_frame', message: 'JSON inválido.', fatal: false } }; }
  if (typeof v !== 'object' || v === null || typeof (v as Envelope).t !== 'string') return { ok: false, error: { code: 'bad_frame', message: 'Envelope sem "t".', fatal: false } };
  const m = v as Message;
  if (!KNOWN_TYPES.has(m.t)) return { ok: false, error: { code: 'unknown_type', message: `Tipo desconhecido: ${String(m.t).slice(0, 40)}`, fatal: false } };
  if (m.seq !== undefined && !Number.isInteger(m.seq)) return { ok: false, error: { code: 'bad_frame', message: '"seq" inválido.', fatal: false } };
  const bad = validateMessage(m);
  if (bad) {
    return {
      ok: false,
      error: { code: 'bad_request', message: `${m.t}: ${bad}`, fatal: false, detail: { type: m.t } },
      ...(ACKED_TYPES.has(m.t) && m.seq !== undefined ? { seq: m.seq } : {}),
      ...(typeof m.id === 'string' && m.id.length <= 64 ? { id: m.id } : {}),
    };
  }
  const img = findImagePayload(v);
  if (img) return { ok: false, error: { code: 'image_payload_forbidden', message: `Imagem não é meio de sincronização (${img}).`, fatal: false } };
  return { ok: true, message: m };
}

const IMAGE_KEYS = /^(png|jpe?g|webp|image|frame|pixels|screenshot|bitmap)$/i;

/** Procura chave/valor que pareça imagem (data URI, chave png/frame/pixels). Devolve o caminho achado ou null. */
export function findImagePayload(v: unknown, path = '$', depth = 0): string | null {
  if (depth > 12) return null;
  if (typeof v === 'string') return /^data:image\//i.test(v) ? path : null;
  if (Array.isArray(v)) {
    // Vetores numéricos longos (geometria) não têm o que procurar; evita varrer milhões de elementos.
    if (v.length > 0 && typeof v[0] === 'number') return null;
    for (let i = 0; i < v.length; i++) {
      const r = findImagePayload(v[i], `${path}[${i}]`, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      if (IMAGE_KEYS.test(k)) return `${path}.${k}`;
      const r = findImagePayload(x, `${path}.${k}`, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// ---- validação de campos por mensagem ----
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max = 100): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const isInt = (x: unknown, min = 0): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= min;
const isUnit = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const isProof = (x: unknown): boolean => typeof x === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(x);
const CAMERA_MODES = ['follow-hestia', 'plugin-drives'];

/** Campos do protocolo 1.3 num trecho de cena (snapshot, cabeçalho ou parte): materiais, malhas, luzes e localização. */
function sceneFieldsProblem(x: Record<string, unknown>): string | null {
  if (Array.isArray(x.materials)) for (const m of x.materials) { const p = materialIssue(m); if (p) return `material: ${p}`; }
  if (Array.isArray(x.entities)) {
    for (const e of x.entities) {
      if (isObj(e) && isObj(e.mesh)) { const p = meshIssue(e.mesh); if (p) return `malha: ${p}`; }
    }
  }
  if (x.lights !== undefined) {
    if (!Array.isArray(x.lights)) return '"lights" precisa ser lista';
    for (const l of x.lights) { const p = lightIssue(l); if (p) return `luz: ${p}`; }
  }
  if (x.site !== undefined) { const p = siteIssue(x.site); if (p) return `site: ${p}`; }
  return null;
}

/** Op de delta com campos de 1.3 (luz e material) ou malha de entidade: problema ou null. Ops antigas passam. */
function opFieldsProblem(op: unknown): string | null {
  if (!isObj(op)) return 'op inválida';
  switch (op.op) {
    case 'entity.add': case 'entity.update': return isObj(op.entity) && isObj(op.entity.mesh) ? meshIssue(op.entity.mesh) : null;
    case 'material.add': case 'material.update': return materialIssue(op.material);
    case 'light.add': case 'light.update': return lightIssue(op.light);
    case 'light.remove': return isStr(op.id, 100) ? null : 'light.remove sem id';
    default: return null;
  }
}

export function isValidCamera(c: unknown): boolean {
  if (!isObj(c)) return false;
  const vec = (v: unknown): boolean => isObj(v) && ['x', 'y', 'z'].every((a) => Number.isFinite(v[a]));
  return (c.projection === 'perspective' || c.projection === 'orthographic') && vec(c.target) && vec(c.position) && vec(c.up)
    && ['fovY', 'orthoHeight', 'near', 'far'].every((k) => Number.isFinite(c[k])) && (c.near as number) > 0 && (c.far as number) > (c.near as number);
}

/** Problema de uma substituição de visualização (texto) ou null. */
export function overrideIssue(o: unknown): string | null {
  if (!isObj(o)) return 'override precisa ser objeto';
  if (o.color !== undefined && !(typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color))) return 'color inválida (#rrggbb)';
  if (o.opacity !== undefined && !isUnit(o.opacity)) return 'opacity fora de 0..1';
  if (o.gloss !== undefined && !isUnit(o.gloss)) return 'gloss fora de 0..1';
  if (o.params !== undefined) {
    if (!isObj(o.params)) return 'params precisa ser objeto';
    const e = Object.entries(o.params);
    if (e.length > 32) return 'params: máximo 32';
    for (const [k, v] of e) {
      if (k.length > 40 || !(typeof v === 'boolean' || (typeof v === 'string' && v.length <= 200) || (typeof v === 'number' && Number.isFinite(v)))) return `params.${k} inválido`;
    }
  }
  const extra = Object.keys(o).filter((k) => !['color', 'opacity', 'gloss', 'params'].includes(k));
  return extra.length ? `campo desconhecido: ${extra[0]}` : null;
}

/** Valida os campos da mensagem (já com `t` conhecido). Devolve o problema ou null. */
export function validateMessage(m: Message): string | null {
  const r = m as unknown as Record<string, unknown>;
  if (r.id !== undefined && !isStr(r.id, 64)) return '"id" inválido';
  if (r.re !== undefined && !isStr(r.re, 64)) return '"re" inválido';
  switch (m.t) {
    case 'hello': {
      if (!isObj(r.protocol) || !isStr(r.protocol.min, 10) || !isStr(r.protocol.max, 10)) return '"protocol" precisa de min e max';
      if (!isObj(r.manifest)) return '"manifest" ausente';
      if (r.auth !== undefined && !(isObj(r.auth) && isNonce(r.auth.nonce))) return '"auth" inválido';
      if (r.resume !== undefined && !(isObj(r.resume) && isStr(r.resume.sessionId, 64) && isInt(r.resume.lastRevision))) return '"resume" inválido';
      return null;
    }
    case 'auth':
      return isNonce(r.nonce) && isProof(r.proof) ? null : 'auth inválido';
    case 'auth.ok':
      return isProof(r.proof) ? null : 'auth.ok inválido';
    case 'welcome':
      if (!isStr(r.sessionId, 64) || !CAMERA_MODES.includes(r.cameraMode as string) || !isInt(r.heartbeatMs, 1) || !Array.isArray(r.granted) || !Array.isArray(r.denied)) return 'campos inválidos';
      return null;
    case 'scene.snapshot':
      if (!(isObj(r.snapshot) && isInt(r.snapshot.revision) && isStr(r.snapshot.projectId, 100) && Array.isArray(r.snapshot.entities) && Array.isArray(r.snapshot.materials))) return 'snapshot inválido';
      return sceneFieldsProblem(r.snapshot);
    case 'scene.snapshot.begin':
      if (!(isObj(r.snapshot) && isInt(r.snapshot.revision) && isStr(r.snapshot.projectId, 100) && isInt(r.parts, 1) && isObj(r.counts) && isInt(r.counts.entities) && isInt(r.counts.materials) && isInt(r.counts.textures))) return 'snapshot.begin inválido';
      return sceneFieldsProblem(r.snapshot);
    case 'scene.snapshot.part':
      if (!(isInt(r.index) && (r.entities === undefined || Array.isArray(r.entities)) && (r.materials === undefined || Array.isArray(r.materials)) && (r.textures === undefined || Array.isArray(r.textures)))) return 'snapshot.part inválido';
      return sceneFieldsProblem(r);
    case 'scene.snapshot.end':
      return isInt(r.revision) ? null : 'snapshot.end inválido';
    case 'scene.delta': {
      if (!(isObj(r.delta) && isInt(r.delta.baseRevision) && isInt(r.delta.revision) && (r.delta.revision as number) > (r.delta.baseRevision as number) && Array.isArray(r.delta.ops))) return 'delta inválido';
      for (const op of r.delta.ops as unknown[]) {
        const p = opFieldsProblem(op);
        if (p) return p;
      }
      return null;
    }
    case 'camera.mode.set': case 'camera.mode':
      return CAMERA_MODES.includes(r.mode as string) ? null : '"mode" precisa ser follow-hestia ou plugin-drives';
    case 'camera.set':
      if (!isValidCamera(r.camera)) return 'câmera inválida';
      return isInt(r.cameraRev) ? null : '"cameraRev" precisa ser inteiro >= 0';
    case 'camera.update':
      if (!isValidCamera(r.camera)) return 'câmera inválida';
      if (!isInt(r.cameraRev)) return '"cameraRev" precisa ser inteiro >= 0';
      return r.origin === 'hestia' || r.origin === 'plugin' ? null : '"origin" inválido';
    case 'overrides.set':
      if (!isStr(r.materialId)) return '"materialId" inválido';
      return overrideIssue(r.override);
    case 'overrides.clear':
      return isStr(r.materialId) ? null : '"materialId" inválido';
    case 'overrides.state':
      return isObj(r.overrides) ? null : '"overrides" precisa ser objeto';
    case 'cancel':
      return isStr(r.target, 64) ? null : '"target" inválido';
    case 'ack':
      return isInt(r.ack, 1) ? null : '"ack" inválido';
    case 'ping': case 'pong':
      return isInt(r.n) ? null : '"n" inválido';
    case 'bye':
      return r.reason === undefined || (typeof r.reason === 'string' && r.reason.length <= 200) ? null : '"reason" inválido';
    case 'error':
      return isObj(r.error) && isStr(r.error.code, 40) && typeof r.error.message === 'string' && typeof r.error.fatal === 'boolean' ? null : '"error" inválido';
    case 'event.connection':
      return r.state === 'connected' || r.state === 'closing' ? null : '"state" inválido';
    default:
      return null;
  }
}
