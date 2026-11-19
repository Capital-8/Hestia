import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  COLLAB_PEER_COLORS,
  newId,
  type CollabActivityItem,
  type CollabLinkRole,
  type CollabPeer,
  type CollabPendingRequest,
  type CollabPresence,
  type CollabRole,
  type Command,
  type Project,
  type ShareLinkConfig,
} from '@hestia/model';
import { createShareToken, verifyShareToken } from './tokens.ts';

export type { CollabPendingRequest } from '@hestia/model';

export const MAX_ACTIVITY = 200;

/** Callbacks supplied by the editor shell to integrate collaboration with UI/viewport state. */
export interface CollabCallbacks {
  getProjectName?: () => string;
  onLoadProject?: (p: Project) => void;
  onStatus?: (msg: string) => void;
  onFollowView?: (presence: CollabPresence) => void;
}

/** Reactive collaboration state exposed via `useCollab` / `CollabManager.store`. */
export interface CollabState {
  mode: 'off' | 'host' | 'guest';
  roomId: string | null;
  myPeerId: string;
  myName: string;
  myColor: string;
  myRole: CollabRole;
  hostName: string;
  links: ShareLinkConfig[];
  peers: CollabPeer[];
  pendingRequests: CollabPendingRequest[];
  activity: CollabActivityItem[];
  followingPeerId: string | null;
  wsEndpoint: string;
  approvalStatus: 'idle' | 'waiting' | 'approved' | 'denied';
  syncStatus: 'idle' | 'synced' | 'syncing' | 'reconnecting' | 'error';
  lastError: string | null;
  lastConflict: { author: string; ids: string[]; message: string } | null;
}

const initialState = (): CollabState => ({
  mode: 'off',
  roomId: null,
  myPeerId: newId('peer'),
  myName: 'Anfitrião',
  myColor: COLLAB_PEER_COLORS[0],
  myRole: 'host',
  hostName: '',
  links: [],
  peers: [],
  pendingRequests: [],
  activity: [],
  followingPeerId: null,
  wsEndpoint: '',
  approvalStatus: 'idle',
  syncStatus: 'idle',
  lastError: null,
  lastConflict: null,
});

/** Creates an isolated reactive Zustand store for a `CollabManager` instance. */
export const createCollabStore = (): UseBoundStore<StoreApi<CollabState>> =>
  create<CollabState>(() => initialState());

/** Extrai todos os IDs de elementos afetados por um lote de comandos para validação de soft-lock. */
export function collectCommandTargetIds(cmds: Command[], out = new Set<string>()): string[] {
  for (const cmd of cmds) {
    if (cmd.type === 'batch') {
      collectCommandTargetIds(cmd.commands, out);
      continue;
    }
    const raw = cmd as Record<string, unknown>;
    if (Array.isArray(raw.ids)) for (const id of raw.ids) if (typeof id === 'string') out.add(id);
    for (const k of ['id', 'wallId', 'hostId', 'elementId', 'terrenoId']) {
      if (typeof raw[k] === 'string') out.add(raw[k]);
    }
    if (cmd.type === 'addOpening') out.add(cmd.opening.hostId);
    if (cmd.type === 'setJoin') for (const e of cmd.ends) out.add(e.wallId);
    if (cmd.type === 'alignTiltOfChain') for (const item of cmd.items) out.add(item.id);
  }
  return [...out];
}

export const pickPeerColor = (peers: CollabPeer[]): string =>
  COLLAB_PEER_COLORS.find((c) => !peers.some((p) => p.color === c))
  ?? COLLAB_PEER_COLORS[peers.length % COLLAB_PEER_COLORS.length]
  ?? COLLAB_PEER_COLORS[0];

export const appendActivity = (list: CollabActivityItem[], item: CollabActivityItem): CollabActivityItem[] =>
  list.length >= MAX_ACTIVITY ? [...list.slice(list.length - MAX_ACTIVITY + 1), item] : [...list, item];

export const defaultLabel = (role: CollabLinkRole): string =>
  (role === 'editor' ? 'Link Leitura e Edição' : 'Link Somente Leitura');

export const makeSecret = (): string => `${newId('sec')}_${Math.random().toString(36).slice(2, 10)}`;

export const toJsonSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const upsertPendingRequest = (list: CollabPendingRequest[], req: CollabPendingRequest): CollabPendingRequest[] =>
  [...list.filter((item) => item.peerId !== req.peerId), req];

export const removePendingRequest = (list: CollabPendingRequest[], peerId: string): CollabPendingRequest[] =>
  list.filter((item) => item.peerId !== peerId);

export const findLockingPeer = (peers: CollabPeer[], excludePeerId: string, ids: string[]): { peer: CollabPeer; elementId: string } | null => {
  for (const id of ids) {
    const peer = peers.find((p) => p.id !== excludePeerId && p.presence?.selection.includes(id));
    if (peer) return { peer, elementId: id };
  }
  return null;
};

export const collectLockedElements = (peers: CollabPeer[], myPeerId: string): Array<{ elementId: string; peer: CollabPeer }> => {
  const out: Array<{ elementId: string; peer: CollabPeer }> = [];
  for (const peer of peers) {
    if (peer.id !== myPeerId && peer.presence) {
      for (const elementId of peer.presence.selection) out.push({ elementId, peer });
    }
  }
  return out;
};

export const buildLinkConfig = (
  roomId: string,
  role: CollabLinkRole,
  label: string,
  secret: string,
  createdAt: number,
): ShareLinkConfig => ({
  id: newId('lnk'),
  roomId,
  role,
  label,
  token: createShareToken(roomId, role, secret),
  revoked: false,
  createdAt,
});

export const makeDefaultLinkConfigs = (roomId: string, secret: string, now: number): ShareLinkConfig[] => [
  buildLinkConfig(roomId, 'viewer', defaultLabel('viewer'), secret, now),
  buildLinkConfig(roomId, 'editor', defaultLabel('editor'), secret, now),
];

export function applyLinkRoleUpdate(
  state: Pick<CollabState, 'links' | 'peers' | 'pendingRequests'>,
  roomId: string,
  secret: string,
  linkId: string,
  role: CollabLinkRole,
): { links: ShareLinkConfig[]; peers: CollabPeer[]; pendingRequests: CollabPendingRequest[]; affectedIds: string[] } | null {
  let changed = false;
  const links = state.links.map((lnk) => {
    if (lnk.id !== linkId) return lnk;
    changed = true;
    const keepLabel = lnk.label !== defaultLabel(lnk.role);
    return { ...lnk, role, label: keepLabel ? lnk.label : defaultLabel(role), token: createShareToken(roomId, role, secret) };
  });
  if (!changed) return null;
  const affectedIds: string[] = [];
  const peers = state.peers.map((p) => (p.linkId === linkId && p.role !== 'host' ? (affectedIds.push(p.id), { ...p, role }) : p));
  const pendingRequests = state.pendingRequests.map((r) => (r.linkId === linkId ? { ...r, requestedRole: role } : r));
  return { links, peers, pendingRequests, affectedIds };
}

export const makeActivityItem = (
  seq: number,
  authorId: string,
  authorName: string,
  authorColor: string,
  label: string,
  touchedIds: string[],
): CollabActivityItem => ({ id: newId('act'), seq, authorId, authorName, authorColor, label, touchedIds, timestamp: Date.now() });

export const makeHostStartState = (
  myPeerId: string,
  hostName: string,
  roomId: string,
  wsEndpoint: string,
  secret: string,
  now: number,
): Partial<CollabState> => ({
  mode: 'host',
  roomId,
  myName: hostName,
  myColor: COLLAB_PEER_COLORS[0],
  myRole: 'host',
  hostName,
  links: makeDefaultLinkConfigs(roomId, secret, now),
  peers: [{ id: myPeerId, name: hostName, color: COLLAB_PEER_COLORS[0], role: 'host', joinedAt: now, presence: null }],
  pendingRequests: [],
  activity: [],
  followingPeerId: null,
  wsEndpoint,
  approvalStatus: 'idle',
  syncStatus: 'synced',
  lastError: null,
  lastConflict: null,
});

export const makeGuestJoinState = (roomId: string, myName: string, wsEndpoint: string): Partial<CollabState> => ({
  mode: 'guest',
  roomId,
  myName,
  myRole: 'viewer',
  wsEndpoint,
  peers: [],
  pendingRequests: [],
  activity: [],
  followingPeerId: null,
  approvalStatus: 'waiting',
  syncStatus: 'syncing',
  lastError: null,
  lastConflict: null,
});

export const makeResetState = (preserveError: boolean, cur: CollabState): Partial<CollabState> => ({
  mode: 'off',
  roomId: null,
  myColor: COLLAB_PEER_COLORS[0],
  myRole: 'host',
  hostName: '',
  links: [],
  peers: [],
  pendingRequests: [],
  activity: [],
  followingPeerId: null,
  approvalStatus: preserveError ? cur.approvalStatus : 'idle',
  syncStatus: preserveError ? 'error' : 'idle',
  lastError: preserveError ? cur.lastError : null,
  lastConflict: null,
});

export function validateHelloLink(
  roomId: string,
  secret: string,
  links: ShareLinkConfig[],
  msgRoomId: string,
  token: string,
): { ok: true; link: ShareLinkConfig } | { ok: false; reason: 'invalid_token' | 'revoked' } | null {
  if (!roomId || msgRoomId !== roomId) return null;
  const verified = verifyShareToken(token, roomId, secret);
  const link = links.find((l) => l.token === token);
  if (!verified.valid || !link) return { ok: false, reason: 'invalid_token' };
  if (link.revoked || (link.expiresAt && link.expiresAt < Date.now())) return { ok: false, reason: 'revoked' };
  return { ok: true, link };
}
