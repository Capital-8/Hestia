import { ACKED_TYPES, decode, encode, type ErrorMsg, type Message, type ProtocolError } from './protocol.ts';

/**
 * Transporte de mensagens de texto, ordenado e confiável (WebSocket em loopback, ou o par em memória dos testes).
 * Contrato mínimo para o protocolo não depender de WebSocket.
 */
export interface Transport {
  send(frame: string): void;
  close(reason?: string): void;
  onMessage(cb: (frame: unknown) => void): void;
  onClose(cb: (reason: string) => void): void;
  readonly isOpen: boolean;
}

/** Par de transportes ligados em memória (um fala, o outro recebe), assíncrono como um socket de verdade. */
export function createMemoryPair(): [Transport, Transport] {
  interface End { peer: End | null; open: boolean; msg: ((f: unknown) => void) | null; backlog: unknown[]; closeCb: ((r: string) => void) | null; mute: boolean }
  const make = (): End => {
    const t: End = {
      peer: null,
      backlog: [],
      open: true,
      msg: null as null | ((f: unknown) => void),
      closeCb: null as null | ((r: string) => void),
      /** Quando true, descarta o que sai (simula rede travada, para testar heartbeat e ack). */
      mute: false,
    };
    return t;
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  const wrap = (self: End): Transport & { mute: boolean } => ({
    send(frame) {
      if (!self.open) throw new Error('transporte fechado');
      if (self.mute) return;
      const p = self.peer!;
      queueMicrotask(() => { if (!p.open) return; if (p.msg) p.msg(frame); else p.backlog.push(frame); });
    },
    close(reason = 'closed') {
      if (!self.open) return;
      self.open = false;
      const p = self.peer!;
      queueMicrotask(() => {
        self.closeCb?.(reason);
        if (p.open) { p.open = false; p.closeCb?.(reason); }
      });
    },
    onMessage(cb) { self.msg = cb; for (const f of self.backlog.splice(0)) queueMicrotask(() => cb(f)); },
    onClose(cb) { self.closeCb = cb; },
    get isOpen() { return self.open; },
    get mute() { return self.mute; },
    set mute(v: boolean) { self.mute = v; },
  });
  return [wrap(a), wrap(b)];
}

export interface PeerOptions {
  heartbeatMs: number;
  /** Tempo máximo sem `ack` de uma mensagem enviada. */
  ackTimeoutMs: number;
  onMessage(m: Message): void;
  /** Falha de protocolo/transporte; depois dela o peer fecha o transporte. */
  onFatal(e: ProtocolError): void;
  onClose(reason: string): void;
  /** Quadro recusado na decodificação (não fatal): devolvido ao outro lado como `error`. */
  onBadFrame?(e: ProtocolError): void;
}

/**
 * Lado do protocolo comum ao host e ao plugin: numeração, confirmação (`ack`), duplicatas, heartbeat e expiração.
 * Implementação de referência; um plugin em outra linguagem reimplementa as mesmas regras (docs/plugins/02-protocolo.md).
 */
export class Peer {
  private nextSeq = 1;
  private lastRx = 0;
  private readonly pending = new Map<number, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private pingN = 0;
  private closed = false;

  constructor(private readonly tr: Transport, private readonly o: PeerOptions) {
    tr.onMessage((f) => this.receive(f));
    tr.onClose((r) => this.finish(r));
    this.lastSeen = Date.now();
  }

  get isOpen(): boolean {
    return !this.closed && this.tr.isOpen;
  }

  /** Último `seq` recebido e confirmado do outro lado. */
  get received(): number {
    return this.lastRx;
  }

  startHeartbeat(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.o.heartbeatMs);
  }

  setHeartbeat(ms: number): void {
    (this.o as { heartbeatMs: number }).heartbeatMs = ms;
    if (this.timer) { clearInterval(this.timer); this.timer = null; this.startHeartbeat(); }
  }

  /** Envia; mensagens com confirmação ganham `seq`. Devolve o `seq` (ou 0 se não numerada). */
  send(m: Message): number {
    if (!this.isOpen) return 0;
    let seq = 0;
    if (ACKED_TYPES.has(m.t)) {
      seq = this.nextSeq++;
      m = { ...m, seq } as Message;
      this.pending.set(seq, Date.now());
    }
    this.tr.send(encode(m));
    return seq;
  }

  sendError(error: ProtocolError, re?: string): void {
    const m: ErrorMsg = { t: 'error', error, ...(re ? { re } : {}) };
    this.send(m);
  }

  get pendingAcks(): number {
    return this.pending.size;
  }

  close(reason = 'closed'): void {
    if (this.closed) return;
    this.tr.close(reason);
    this.finish(reason);
  }

  private fatal(e: ProtocolError): void {
    this.o.onFatal(e);
    this.sendError(e);
    this.close(e.code);
  }

  private receive(frame: unknown): void {
    if (this.closed) return;
    this.lastSeen = Date.now();
    const r = decode(frame);
    if (!r.ok) {
      if (r.error.fatal) { this.fatal(r.error); return; }
      this.o.onBadFrame?.(r.error);
      this.sendError(r.error);
      return;
    }
    const m = r.message;
    switch (m.t) {
      case 'ack': this.pending.delete(m.ack); return;
      case 'ping': this.send({ t: 'pong', n: m.n }); return;
      case 'pong': return;
      default: break;
    }
    if (ACKED_TYPES.has(m.t)) {
      const seq = m.seq;
      if (seq === undefined) { this.o.onBadFrame?.({ code: 'bad_frame', message: `"${m.t}" sem seq.`, fatal: false }); return; }
      if (seq <= this.lastRx) { this.send({ t: 'ack', ack: seq }); return; } // duplicata: reconfirma, não reprocessa
      if (seq !== this.lastRx + 1) { this.fatal({ code: 'out_of_order', message: `seq ${seq} depois de ${this.lastRx}`, fatal: true }); return; }
      this.lastRx = seq;
      this.send({ t: 'ack', ack: seq });
    }
    this.o.onMessage(m);
  }

  private tick(): void {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.lastSeen > this.o.heartbeatMs * 2.5) { this.fatal({ code: 'heartbeat_timeout', message: 'Sem sinal do outro lado.', fatal: true }); return; }
    for (const at of this.pending.values()) {
      if (now - at > this.o.ackTimeoutMs) { this.fatal({ code: 'ack_timeout', message: 'Mensagem sem confirmação.', fatal: true }); return; }
    }
    this.send({ t: 'ping', n: ++this.pingN });
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pending.clear();
    this.o.onClose(reason);
  }
}
