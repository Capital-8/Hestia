import type { Patch } from 'immer';
import type { Command } from './commands.ts';
import type { Discipline } from './planView.ts';
import type { Project } from './types.ts';

/** Papel de um participante na sessão colaborativa. */
export type CollabRole = 'host' | 'editor' | 'viewer';

/** Perfil de permissão atribuído a um link de convite. */
export type CollabLinkRole = 'editor' | 'viewer';

/** Paleta de cores distintas atribuída aos colaboradores em ordem de entrada. */
export const COLLAB_PEER_COLORS = [
  '#2563eb', // Azul
  '#d97706', // Âmbar
  '#059669', // Esmeralda
  '#dc2626', // Carmesim
  '#7c3aed', // Violeta
  '#0891b2', // Ciano
  '#db2777', // Magenta
  '#65a30d', // Lima
] as const;

/** Configuração de um link compartilhável criado pelo anfitrião. */
export interface ShareLinkConfig {
  id: string;
  roomId: string;
  role: CollabLinkRole;
  label: string;
  token: string;
  revoked: boolean;
  createdAt: number;
  expiresAt?: number | null;
}

/** Estado de presença ao vivo (vista ativa, cursor, seleção e câmera 3D) de um participante. */
export interface CollabPresence {
  view: 'plan' | '3d' | 'section' | 'sheet' | 'face';
  levelId: string;
  sectionId?: string | null;
  sheetId?: string | null;
  cursor?: { x: number; y: number } | null;
  /** Disciplina de trabalho de quem publica (adendo 3 da 0060); ausente = disciplina automática da vista. */
  discipline?: Discipline;
  selection: string[];
  camera3d?: {
    azimuth: number;
    elevation: number;
    distance: number;
    target: { x: number; y: number; z: number };
    ortho: boolean;
  } | null;
  updatedAt: number;
}

/** Participante conectado à sessão colaborativa. */
export interface CollabPeer {
  id: string;
  name: string;
  color: string;
  role: CollabRole;
  linkId?: string;
  joinedAt: number;
  presence: CollabPresence | null;
}

/** Registro cronológico exibido no histórico da sessão colaborativa. */
export interface CollabActivityItem {
  id: string;
  seq: number;
  authorId: string;
  authorName: string;
  authorColor: string;
  label: string;
  touchedIds: string[];
  timestamp: number;
}

/** Metadados de delta gerados pelo ProjectStore ao confirmar uma alteração. */
export interface CollabDeltaMeta {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  authorId: string;
  authorName: string;
  touchedIds: string[];
  seq?: number;
}

/** Resultado de desfazer/refazer por autor no histórico colaborativo. */
export type CollabUndoResult =
  | {
      ok: true;
      label: string;
      patches: Patch[];
      inverse: Patch[];
      touchedIds: string[];
    }
  | {
      ok: false;
      reason: 'empty' | 'conflict' | 'invalid';
      conflictAuthor?: string;
      conflictIds?: string[];
    };

/** Solicitação pendente de entrada aguardando aprovação do anfitrião. */
export interface CollabPendingRequest {
  peerId: string;
  name: string;
  linkId: string;
  requestedRole: CollabLinkRole;
  requestedAt: number;
}

/** Mensagens do protocolo em tempo real entre Host e Convidados. */
export type CollabWireMessage =
  | { op: 'hello'; peerId: string; name: string; token: string; roomId: string }
  | { op: 'join_pending'; peerId: string; hostName: string; requestedRole: CollabLinkRole }
  | { op: 'join_denied'; peerId: string; reason?: string }
  | {
      op: 'welcome';
      peerId: string;
      role: CollabLinkRole;
      color: string;
      project: Project;
      seq: number;
      peers: CollabPeer[];
      activity: CollabActivityItem[];
      hostId: string;
      hostName: string;
    }
  | {
      op: 'rejected';
      targetPeerId?: string;
      reason: 'invalid_token' | 'revoked' | 'room_closed' | 'read_only' | 'locked_element';
      detail?: string;
    }
  | { op: 'exec'; reqId: string; peerId: string; label: string; commands: Command[] }
  | { op: 'undo'; reqId: string; peerId: string }
  | { op: 'redo'; reqId: string; peerId: string }
  | {
      op: 'ack';
      reqId: string;
      peerId: string;
      ok: boolean;
      error?: string;
      conflictAuthor?: string;
      conflictIds?: string[];
    }
  | {
      op: 'delta';
      seq: number;
      authorId: string;
      authorName: string;
      authorColor: string;
      label: string;
      patches: Patch[];
      inverse: Patch[];
      touchedIds: string[];
    }
  | { op: 'resync'; peerId: string }
  | { op: 'snapshot'; seq: number; project: Project }
  | { op: 'presence'; peerId: string; presence: CollabPresence }
  | { op: 'peers'; peers: CollabPeer[] }
  | { op: 'role_changed'; peerId: string; role: CollabLinkRole }
  | { op: 'kicked'; peerId: string; reason?: string }
  | { op: 'handover'; newHostId: string; newHostName: string; roomId: string; token: string }
  | { op: 'ended'; reason: string };
