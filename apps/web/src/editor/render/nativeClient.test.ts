import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderizarNativo,
  saudeRenderNativo,
  statusJobNativo,
  tileNativo,
  urlRenderNativo,
} from './nativeClient.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente do render nativo', () => {
  it('monta a URL padrão do serviço local', () => {
    expect(urlRenderNativo()).toContain('127.0.0.1');
  });

  it('envia HSTR como corpo binário e recebe PNG', async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const cena = new Uint8Array([9, 8, 7]);
    const blob = await renderizarNativo(cena, { largura: 1280, altura: 720, exposicao: 0.5 });
    expect(await blob.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/render?');
    expect(url).toContain('largura=1280');
    expect(url).toContain('altura=720');
    expect(url).not.toContain('spp=');
    expect(url).not.toContain('denoise=');
    expect(url).toContain('exposicao=0.5');
    expect(init.method).toBe('POST');
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(cena);
  });

  it('falha com mensagem clara quando o serviço responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sem GPU', { status: 503 })));
    await expect(renderizarNativo(new Uint8Array([1]), { largura: 10, altura: 10 }))
      .rejects.toThrow(/503/);
  });

  it('health devolve null quando o serviço não está rodando', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await saudeRenderNativo()).toBeNull();
  });

  it('T1: status com tiles devolve os tiles tipados', async () => {
    const corpo = {
      fase: 'Renderizando',
      fracao: 0.5,
      pronto: false,
      cancelado: false,
      erro: null,
      tiles: { total: 4, concluidos: [{ i: 0, x: 0, y: 0, w: 64, h: 64 }] },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    const status = await statusJobNativo('job1');
    expect(status?.tiles).toEqual({ total: 4, concluidos: [{ i: 0, x: 0, y: 0, w: 64, h: 64 }] });
    expect(status?.fracao).toBe(0.5);
  });

  it('T2: status sem tiles (serviço antigo) devolve tiles undefined', async () => {
    const corpo = { fase: 'Renderizando', fracao: 0.2, pronto: false, cancelado: false, erro: null };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    const status = await statusJobNativo('job1');
    expect(status).not.toBeNull();
    expect(status?.tiles).toBeUndefined();
  });

  it('T3: fracao inválida (NaN ou 2) lança erro', async () => {
    // JSON não representa NaN; o serviço poderia mandar null/string, então usamos 2 e uma string.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ fase: 'x', fracao: 2, pronto: false, cancelado: false, erro: null }),
      { status: 200 },
    )));
    await expect(statusJobNativo('job1')).rejects.toThrow(/fracao/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ fase: 'x', fracao: 'NaN', pronto: false, cancelado: false, erro: null }),
      { status: 200 },
    )));
    await expect(statusJobNativo('job1')).rejects.toThrow(/fracao/);
  });

  it('T3b: tiles.concluidos que não é array lança erro', async () => {
    const corpo = { fase: 'x', fracao: 0.1, pronto: false, cancelado: false, erro: null, tiles: { total: 4, concluidos: 'x' } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    await expect(statusJobNativo('job1')).rejects.toThrow(/concluidos/);
  });

  it('T4: tileNativo faz GET na URL certa e devolve Blob', async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([5, 6]), { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const blob = await tileNativo('job 1', 3);
    expect(blob).toBeInstanceOf(Blob);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([5, 6]));
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${urlRenderNativo()}/jobs/job%201/tile/3`);
    expect(init.method).toBeUndefined();
  });

  it('T5: tileNativo com HTTP 404 lança erro com o status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('não existe', { status: 404 })));
    await expect(tileNativo('job1', 9)).rejects.toThrow(/404/);
  });
});
