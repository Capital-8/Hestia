import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollabWireMessage } from '@hestia/model';
import {
  createRtcGuest,
  createRtcHost,
  isRtcAnswerCode,
  isRtcOfferCode,
  type RtcFactory,
  type RtcGuest,
  type RtcHost,
} from './webrtc.ts';

type Role = 'host' | 'guest';

/** Canal de dados falso: `send` entrega de forma síncrona ao lado pareado. */
class FakeChannel {
  readyState = 'connecting';
  bufferedAmount = 0;
  peer: FakeChannel | null = null;
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(readonly role: Role) {}

  send(data: string): void {
    if (this.readyState !== 'open') throw new Error('canal fechado');
    this.sent.push(data);
    this.peer?.onmessage?.({ data } as MessageEvent);
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.({} as Event);
  }

  close(): void {
    this.readyState = 'closed';
  }
}

/** RTCPeerConnection falso com só o que webrtc.ts usa. */
class FakePc {
  connectionState = 'new';
  iceConnectionState = 'new';
  iceGatheringState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  closed = false;
  channels: FakeChannel[] = [];
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((ev: { channel: FakeChannel }) => void) | null = null;

  constructor(
    readonly id: string,
    readonly role: Role,
    private readonly net: FakeNet,
    private readonly stallIce: boolean,
  ) {}

  createDataChannel(): FakeChannel {
    const ch = new FakeChannel(this.role);
    this.channels.push(ch);
    return ch;
  }

  async createOffer() {
    return { type: 'offer', sdp: `fake-offer:${this.id}` };
  }

  async createAnswer() {
    return { type: 'answer', sdp: `fake-answer:${this.id}` };
  }

  async setLocalDescription(desc: { type: string; sdp: string }) {
    this.localDescription = desc;
    if (!this.stallIce) this.iceGatheringState = 'complete';
  }

  async setRemoteDescription(desc: { type: string; sdp: string }) {
    if (desc.type === 'offer') {
      // Convidado: a oferta aponta para o anfitrião; cria o canal pareado e avisa via ondatachannel.
      const hostCh = this.net.pcById(desc.sdp.slice('fake-offer:'.length)).channels[0]!;
      const guestCh = new FakeChannel('guest');
      hostCh.peer = guestCh;
      guestCh.peer = hostCh;
      this.channels.push(guestCh);
      this.ondatachannel?.({ channel: guestCh });
      return;
    }
    // Anfitrião: a resposta abre o canal nos dois lados.
    const ch = this.channels[0]!;
    ch.open();
    ch.peer!.open();
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

/** Rede falsa: fábricas de pares para anfitrião e convidado, com registro por id. */
class FakeNet {
  pcs: FakePc[] = [];
  private seq = 0;

  constructor(private readonly opts: { stallIce?: boolean } = {}) {}

  private make(role: Role): RTCPeerConnection {
    this.seq += 1;
    const pc = new FakePc(`pc${this.seq}`, role, this, this.opts.stallIce ?? false);
    this.pcs.push(pc);
    return pc as unknown as RTCPeerConnection;
  }

  hostFactory(): RtcFactory {
    return () => this.make('host');
  }

  guestFactory(): RtcFactory {
    return () => this.make('guest');
  }

  pcById(id: string): FakePc {
    const pc = this.pcs.find((p) => p.id === id);
    if (!pc) throw new Error(`pc desconhecido: ${id}`);
    return pc;
  }
}

const SALA = { roomId: 'sala-teste', token: 'token-teste' };

function novoPar(net: FakeNet): { host: RtcHost; guest: RtcGuest } {
  return {
    host: createRtcHost({ factory: net.hostFactory() }),
    guest: createRtcGuest({ factory: net.guestFactory() }),
  };
}

/** Faz o convite, aceita no convidado e fecha a resposta no anfitrião. */
async function conecta(host: RtcHost, guest: RtcGuest, meta = SALA): Promise<string> {
  const invite = await host.createInvite(meta);
  const { answerCode } = await guest.acceptInvite(invite.code);
  await host.acceptAnswer(invite.inviteId, answerCode);
  return invite.code;
}

/** Primeiro canal de dados criado pelo papel indicado. */
function canal(net: FakeNet, role: Role): FakeChannel {
  const pc = net.pcs.find((p) => p.role === role);
  if (!pc) throw new Error(`sem par do papel ${role}`);
  return pc.channels[0]!;
}

describe('códigos de convite', () => {
  it('reconhece o prefixo de oferta e de resposta', () => {
    expect(isRtcOfferCode('hestia-p2p-offer:abc')).toBe(true);
    expect(isRtcAnswerCode('hestia-p2p-offer:abc')).toBe(false);
    expect(isRtcAnswerCode('hestia-p2p-answer:abc')).toBe(true);
    expect(isRtcOfferCode('hestia-p2p-answer:abc')).toBe(false);
  });

  it('rejeita vazio, texto qualquer e valor que não é texto', () => {
    expect(isRtcOfferCode('')).toBe(false);
    expect(isRtcAnswerCode('')).toBe(false);
    expect(isRtcOfferCode('texto qualquer')).toBe(false);
    expect(isRtcAnswerCode('texto qualquer')).toBe(false);
    expect(isRtcOfferCode(undefined as unknown as string)).toBe(false);
  });

  it('tolera espaços e quebras de linha nas pontas e no meio', () => {
    expect(isRtcOfferCode('  hestia-p2p-offer:abc\n')).toBe(true);
    expect(isRtcAnswerCode('\thestia-p2p-answer:abc\r\n')).toBe(true);
    expect(isRtcOfferCode('hestia-p2p-\noffer: ab c')).toBe(true);
  });

  it('convite do anfitrião volta ao convidado com os mesmos dados e gera resposta', async () => {
    const net = new FakeNet();
    const host = createRtcHost({ factory: net.hostFactory() });
    const guest = createRtcGuest({ factory: net.guestFactory() });

    const convite = await host.createInvite({ roomId: 'sala-teste', token: 'token-teste', hostName: 'Ana' });
    expect(convite.code).toMatch(/^hestia-p2p-offer:/);

    const aceite = await guest.acceptInvite(convite.code);
    expect(aceite.roomId).toBe('sala-teste');
    expect(aceite.token).toBe('token-teste');
    expect(aceite.hostName).toBe('Ana');
    expect(aceite.answerCode).toMatch(/^hestia-p2p-answer:/);
  });

  it('código com caractere inválido no meio rejeita a promessa sem lançar antes', async () => {
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    const { code } = await host.createInvite(SALA);

    const meio = Math.floor(code.length / 2);
    const corrompido = code.slice(0, meio) + '!' + code.slice(meio + 1);
    const pendente = guest.acceptInvite(corrompido);
    expect(pendente).toBeInstanceOf(Promise);
    await expect(pendente).rejects.toThrow('Invalid offer code: malformed base64url payload');
  });

  it('código sem compressão (formato j) truncado é rejeitado pela promessa', async () => {
    const net = new FakeNet();
    const guest = createRtcGuest({ factory: net.guestFactory() });
    const json = JSON.stringify({ v: 1, type: 'offer', sdp: 'v=0 fake', roomId: 'sala-teste', token: 'token-teste' });
    const base64 = btoa(json.slice(0, -5)).replace(/=+$/g, '');

    const truncado = `hestia-p2p-offer:j.${base64}`;
    const pendente = guest.acceptInvite(truncado);
    expect(pendente).toBeInstanceOf(Promise);
    await expect(pendente).rejects.toThrow('Invalid offer code: malformed JSON');
  });

});

describe('canal de dados', () => {
  it('mensagem pequena vai em um quadro e chega igual', async () => {
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    await conecta(host, guest);

    const recebidas: CollabWireMessage[] = [];
    guest.onMessage((m) => recebidas.push(m));
    const pequena: CollabWireMessage = { op: 'resync', peerId: 'p1' };
    host.send(pequena);

    expect(canal(net, 'host').sent).toHaveLength(1);
    expect(recebidas).toEqual([{ op: 'resync', peerId: 'p1' }]);
  });

  it('mensagem grande é dividida em quadros de até 15.800 caracteres e remontada igual', async () => {
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    await conecta(host, guest);

    const recebidas: CollabWireMessage[] = [];
    guest.onMessage((m) => recebidas.push(m));
    // 'a😀' tem pares substitutos: o corte precisa respeitá-los.
    const grande: CollabWireMessage = { op: 'ended', reason: 'a😀'.repeat(14_000) };
    host.send(grande);

    const quadros = canal(net, 'host').sent;
    expect(quadros.length).toBeGreaterThan(1);
    for (const quadro of quadros) {
      expect(quadro.length).toBeLessThanOrEqual(16_000);
      const carga = (JSON.parse(quadro) as { d: string }).d;
      expect(carga.length).toBeLessThanOrEqual(15_800);
    }
    expect(recebidas).toEqual([grande]);
  });

  it('anfitrião envia a dois convidados, convidado envia ao anfitrião, guestCount vale 2', async () => {
    const net = new FakeNet();
    const host = createRtcHost({ factory: net.hostFactory() });
    const g1 = createRtcGuest({ factory: net.guestFactory() });
    const g2 = createRtcGuest({ factory: net.guestFactory() });
    await conecta(host, g1);
    await conecta(host, g2);
    expect(host.guestCount()).toBe(2);

    const r1: CollabWireMessage[] = [];
    const r2: CollabWireMessage[] = [];
    const rHost: CollabWireMessage[] = [];
    g1.onMessage((m) => r1.push(m));
    g2.onMessage((m) => r2.push(m));
    host.onMessage((m) => rHost.push(m));

    host.send({ op: 'resync', peerId: 'p1' });
    expect(r1).toEqual([{ op: 'resync', peerId: 'p1' }]);
    expect(r2).toEqual([{ op: 'resync', peerId: 'p1' }]);

    g2.send({ op: 'resync', peerId: 'p2' });
    expect(rHost).toEqual([{ op: 'resync', peerId: 'p2' }]);
  });

  it('mensagens que não são CollabWireMessage são descartadas sem erro', async () => {
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    await conecta(host, guest);

    const recebidas: CollabWireMessage[] = [];
    host.onMessage((m) => recebidas.push(m));
    const canalGuest = canal(net, 'guest');

    expect(() => {
      canalGuest.send('não é JSON');
      canalGuest.send('{"foo":1}'); // JSON sem formato de quadro
      canalGuest.send('{"c":"x","i":0,"n":1,"d":"{\\"foo\\":1}"}'); // quadro cuja carga não tem op
      canalGuest.send('{"c":"x","i":0,"n":1,"d":"{\\"op\\":7}"}'); // op não é texto
      canalGuest.send('{"c":"x","i":0,"n":1,"d":"não é JSON"}');
    }).not.toThrow();
    expect(recebidas).toEqual([]);

    guest.send({ op: 'resync', peerId: 'p9' });
    expect(recebidas).toEqual([{ op: 'resync', peerId: 'p9' }]);
  });

  it('close() fecha todos os pares do anfitrião e send depois não lança', async () => {
    const net = new FakeNet();
    const host = createRtcHost({ factory: net.hostFactory() });
    const g1 = createRtcGuest({ factory: net.guestFactory() });
    const g2 = createRtcGuest({ factory: net.guestFactory() });
    await conecta(host, g1);
    await conecta(host, g2);

    host.close();

    const paresHost = net.pcs.filter((p) => p.role === 'host');
    expect(paresHost).toHaveLength(2);
    for (const pc of paresHost) {
      expect(pc.closed).toBe(true);
      expect(pc.channels[0]!.readyState).toBe('closed');
    }
    expect(() => host.send({ op: 'resync', peerId: 'p1' })).not.toThrow();
    expect(host.guestCount()).toBe(0);

    expect(() => g1.close()).not.toThrow();
    expect(() => g1.send({ op: 'resync', peerId: 'p1' })).not.toThrow();
  });
});

describe('temporizadores', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coleta de ICE travada: o convite sai só após 4 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const net = new FakeNet({ stallIce: true });
    const host = createRtcHost({ factory: net.hostFactory() });

    let saiu = false;
    const pendente = host.createInvite(SALA).then((convite) => {
      saiu = true;
      return convite;
    });

    await vi.advanceTimersByTimeAsync(3_999);
    expect(saiu).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pendente).resolves.toMatchObject({ code: expect.stringMatching(/^hestia-p2p-offer:/) });
    expect(saiu).toBe(true);
  });

  it('desconexão curta (menos de 10 s) não derruba o convidado', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    await conecta(host, guest);

    const motivos: string[] = [];
    guest.onClose((m) => motivos.push(m));
    const pc = net.pcs.find((p) => p.role === 'guest')!;

    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    vi.advanceTimersByTime(9_999);
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    vi.advanceTimersByTime(10_000);
    expect(motivos).toEqual([]);
  });

  it('desconexão sustentada derruba o convidado após 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const net = new FakeNet();
    const { host, guest } = novoPar(net);
    await conecta(host, guest);

    const motivos: string[] = [];
    guest.onClose((m) => motivos.push(m));
    const pc = net.pcs.find((p) => p.role === 'guest')!;

    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    vi.advanceTimersByTime(9_999);
    expect(motivos).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(motivos).toEqual(['Peer connection disconnected']);
  });
});
