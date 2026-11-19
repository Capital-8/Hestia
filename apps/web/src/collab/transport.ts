import type { CollabWireMessage } from '@hestia/model';

/** Transport abstraction for exchanging real-time collaboration wire messages in a room. */
export interface CollabTransport {
  kind: string;
  send(msg: CollabWireMessage): void;
  onMessage(cb: (msg: CollabWireMessage) => void): () => void;
  close(): void;
}

/** Status events emitted by network transports such as WebSocketTransport. */
export interface TransportStatus {
  state: 'connecting' | 'open' | 'closed' | 'error';
  error?: string;
}

type MessageListener = (msg: CollabWireMessage) => void;

interface BroadcastEnvelope {
  __hestiaBc: true;
  senderId: string;
  payload: CollabWireMessage;
}

let transportSeq = 0;
function nextTransportId(prefix: string): string {
  transportSeq += 1;
  return `${prefix}_${transportSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

function isWireMessage(value: unknown): value is CollabWireMessage {
  return typeof value === 'object' && value !== null && typeof (value as { op?: unknown }).op === 'string';
}

function cloneWireMessage(msg: CollabWireMessage): CollabWireMessage {
  try {
    return structuredClone(msg);
  } catch {
    return JSON.parse(JSON.stringify(msg)) as CollabWireMessage;
  }
}

function isBroadcastEnvelope(value: unknown): value is BroadcastEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __hestiaBc?: unknown }).__hestiaBc === true &&
    typeof (value as { senderId?: unknown }).senderId === 'string' &&
    isWireMessage((value as { payload?: unknown }).payload)
  );
}

/**
 * Synchronous in-process room hub keyed by `roomId`.
 * Used for multi-client tests in Vitest and same-tab multi-instance communication.
 */
export class InMemoryTransport implements CollabTransport {
  readonly kind = 'memory';
  readonly roomId: string;
  readonly clientId: string;
  private listeners = new Set<MessageListener>();
  private closed = false;

  private static rooms = new Map<string, Set<InMemoryTransport>>();

  constructor(roomId: string, clientId = nextTransportId('mem')) {
    this.roomId = roomId;
    this.clientId = clientId;
    let peers = InMemoryTransport.rooms.get(roomId);
    if (!peers) {
      peers = new Set();
      InMemoryTransport.rooms.set(roomId, peers);
    }
    peers.add(this);
  }

  /** Returns true when another active InMemoryTransport with `clientId` exists in the same JS realm. */
  static hasActivePeer(roomId: string, clientId: string): boolean {
    const peers = InMemoryTransport.rooms.get(roomId);
    if (!peers) return false;
    for (const peer of peers) {
      if (!peer.closed && peer.clientId === clientId) return true;
    }
    return false;
  }

  send(msg: CollabWireMessage): void {
    if (this.closed) return;
    const peers = InMemoryTransport.rooms.get(this.roomId);
    if (!peers) return;
    for (const peer of [...peers]) {
      if (peer === this || peer.closed) continue;
      const cloned = cloneWireMessage(msg);
      for (const cb of [...peer.listeners]) cb(cloned);
    }
  }

  onMessage(cb: MessageListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    const peers = InMemoryTransport.rooms.get(this.roomId);
    if (peers) {
      peers.delete(this);
      if (peers.size === 0) InMemoryTransport.rooms.delete(this.roomId);
    }
  }
}

/**
 * Cross-tab browser transport wrapping `globalThis.BroadcastChannel('hestia-collab:' + roomId)`.
 * Falls back cleanly to a no-op transport when `BroadcastChannel` is unavailable (e.g. Node/Vitest).
 */
export class BroadcastChannelTransport implements CollabTransport {
  readonly kind = 'broadcast';
  readonly roomId: string;
  readonly clientId: string;
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<MessageListener>();
  private closed = false;
  private skipLocalMemoryPeers: boolean;

  constructor(roomId: string, clientId = nextTransportId('bc'), opts?: { skipLocalMemoryPeers?: boolean }) {
    this.roomId = roomId;
    this.clientId = clientId;
    this.skipLocalMemoryPeers = opts?.skipLocalMemoryPeers ?? false;

    if (typeof globalThis.BroadcastChannel === 'function') {
      try {
        this.channel = new globalThis.BroadcastChannel(`hestia-collab:${roomId}`);
        this.channel.onmessage = (ev: MessageEvent) => {
          if (this.closed) return;
          const data: unknown = ev.data;
          if (isBroadcastEnvelope(data)) {
            if (data.senderId === this.clientId) return;
            if (this.skipLocalMemoryPeers && InMemoryTransport.hasActivePeer(this.roomId, data.senderId)) return;
            for (const cb of [...this.listeners]) cb(data.payload);
            return;
          }
          if (isWireMessage(data)) {
            for (const cb of [...this.listeners]) cb(data);
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  send(msg: CollabWireMessage): void {
    if (this.closed || !this.channel) return;
    const envelope: BroadcastEnvelope = { __hestiaBc: true, senderId: this.clientId, payload: msg };
    try {
      this.channel.postMessage(envelope);
    } catch {
      try {
        this.channel.postMessage(JSON.parse(JSON.stringify(envelope)));
      } catch {
        // Ignore serialization or closed-channel errors gracefully.
      }
    }
  }

  onMessage(cb: MessageListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignore close errors.
      }
      this.channel = null;
    }
  }
}

function buildRoomWsUrl(wsUrl: string, roomId: string): string {
  try {
    const url = new URL(wsUrl);
    if (!url.searchParams.has('room')) url.searchParams.set('room', roomId);
    return url.toString();
  } catch {
    return wsUrl;
  }
}

/**
 * Network transport over `ws://` or `wss://` relay endpoints.
 * Queues outgoing messages while connecting and reports status/error events gracefully.
 */
export class WebSocketTransport implements CollabTransport {
  readonly kind = 'websocket';
  private socket: WebSocket | null = null;
  private queue: string[] = [];
  private listeners = new Set<MessageListener>();
  private closed = false;
  private onStatus?: (status: TransportStatus) => void;

  constructor(roomId: string, wsUrl: string, opts?: { onStatus?: (status: TransportStatus) => void }) {
    this.onStatus = opts?.onStatus;
    const trimmed = wsUrl.trim();
    if (!trimmed || typeof globalThis.WebSocket !== 'function') {
      if (trimmed) this.onStatus?.({ state: 'error', error: 'WebSocket unavailable' });
      return;
    }

    try {
      const targetUrl = buildRoomWsUrl(trimmed, roomId);
      const ws = new globalThis.WebSocket(targetUrl);
      this.socket = ws;
      this.onStatus?.({ state: 'connecting' });

      ws.onopen = () => {
        if (this.closed) return;
        this.onStatus?.({ state: 'open' });
        const pending = this.queue.splice(0, this.queue.length);
        for (const raw of pending) {
          try {
            ws.send(raw);
          } catch {
            // Stop flushing if socket fails mid-flush.
            break;
          }
        }
      };

      ws.onmessage = (ev: MessageEvent) => {
        if (this.closed || typeof ev.data !== 'string') return;
        try {
          const parsed: unknown = JSON.parse(ev.data);
          if (isWireMessage(parsed)) {
            for (const cb of [...this.listeners]) cb(parsed);
          }
        } catch {
          // Ignore malformed JSON frames.
        }
      };

      ws.onerror = () => {
        if (this.closed) return;
        this.onStatus?.({ state: 'error', error: 'WebSocket connection error' });
      };

      ws.onclose = () => {
        if (this.closed) return;
        this.onStatus?.({ state: 'closed' });
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WebSocket failed to initialize';
      this.onStatus?.({ state: 'error', error: message });
      this.socket = null;
    }
  }

  send(msg: CollabWireMessage): void {
    if (this.closed || !this.socket) return;
    let raw: string;
    try {
      raw = JSON.stringify(msg);
    } catch {
      return;
    }
    // WebSocket.CONNECTING === 0, WebSocket.OPEN === 1
    if (this.socket.readyState === 0) {
      this.queue.push(raw);
    } else if (this.socket.readyState === 1) {
      try {
        this.socket.send(raw);
      } catch {
        this.onStatus?.({ state: 'error', error: 'WebSocket send failed' });
      }
    }
  }

  onMessage(cb: MessageListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    this.listeners.clear();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors.
      }
      this.socket = null;
    }
  }
}

/**
 * Creates a room transport combining `InMemoryTransport`, `BroadcastChannelTransport`,
 * and an optional `WebSocketTransport` when `wsUrl` is provided.
 * Messages sent by a client are never echoed back to the same transport instance.
 */
export function createRoomTransport(
  roomId: string,
  wsUrl?: string,
  opts?: { onStatus?: (status: TransportStatus) => void },
): CollabTransport {
  const clientId = nextTransportId('peer');
  const transports: CollabTransport[] = [
    new InMemoryTransport(roomId, clientId),
    new BroadcastChannelTransport(roomId, clientId, { skipLocalMemoryPeers: true }),
  ];
  const trimmedWs = wsUrl?.trim();
  if (trimmedWs) {
    transports.push(new WebSocketTransport(roomId, trimmedWs, { onStatus: opts?.onStatus }));
  }

  const listeners = new Set<MessageListener>();
  const unsubs = transports.map((t) =>
    t.onMessage((msg) => {
      for (const cb of [...listeners]) cb(msg);
    }),
  );
  let closed = false;

  return {
    kind: trimmedWs ? 'composite+ws' : 'composite',
    send(msg: CollabWireMessage): void {
      if (closed) return;
      for (const t of transports) t.send(msg);
    },
    onMessage(cb: MessageListener): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    close(): void {
      if (closed) return;
      closed = true;
      for (const u of unsubs) u();
      for (const t of transports) t.close();
      listeners.clear();
    },
  };
}
