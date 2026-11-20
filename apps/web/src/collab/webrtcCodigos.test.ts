import { afterEach, describe, expect, it } from 'vitest';
import { ANSWER_PREFIX, OFFER_PREFIX, decodeSignalCode, encodeSignalCode } from './webrtcCodigos.ts';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('webrtcCodigos: falha do descompressor', () => {
  const naoTratadas: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    naoTratadas.push(reason);
  };
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    naoTratadas.length = 0;
  });

  it('código truncado rejeita no chamador e não vaza rejeição não tratada', async () => {
    process.on('unhandledRejection', onUnhandled);
    const code = await encodeSignalCode(OFFER_PREFIX, {
      v: 1,
      type: 'offer',
      sdp: 'v=0\r\n' + 'a=candidate:1 1 udp 2122260223 192.168.0.10 54321 typ host\r\n'.repeat(40),
      roomId: 'r',
      token: 't',
    });
    const [head, body] = [code.slice(0, OFFER_PREFIX.length + 2), code.slice(OFFER_PREFIX.length + 2)];
    expect(head.endsWith('z.')).toBe(true);

    const resultados: PromiseSettledResult<unknown>[] = [];
    for (let i = 0; i < 20; i += 1) {
      const corte = Math.max(4, Math.floor((body.length * (i + 1)) / 25));
      resultados.push(...(await Promise.allSettled([decodeSignalCode(head + body.slice(0, corte), OFFER_PREFIX, 'offer')])));
    }
    for (let i = 0; i < 10; i += 1) await tick();

    expect(resultados.every((r) => r.status === 'rejected')).toBe(true);
    expect(resultados).toHaveLength(20);
    expect(naoTratadas).toEqual([]);
  });

  it('ida e volta de oferta e resposta continua válida', async () => {
    const code = await encodeSignalCode(ANSWER_PREFIX, { v: 1, type: 'answer', sdp: 'v=0', inviteId: 'i' });
    const out = await decodeSignalCode(code, ANSWER_PREFIX, 'answer');
    expect(out.sdp).toBe('v=0');
    expect(out.inviteId).toBe('i');
  });
});
