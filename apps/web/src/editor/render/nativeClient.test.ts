import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderizarNativo, saudeRenderNativo, urlRenderNativo } from './nativeClient.ts';

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
    const blob = await renderizarNativo(cena, { largura: 1280, altura: 720, spp: 16, exposicao: 0.5 });
    expect(await blob.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/render?');
    expect(url).toContain('largura=1280');
    expect(url).toContain('altura=720');
    expect(url).toContain('spp=16');
    expect(url).toContain('exposicao=0.5');
    expect(init.method).toBe('POST');
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(cena);
  });

  it('falha com mensagem clara quando o serviço responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sem GPU', { status: 503 })));
    await expect(renderizarNativo(new Uint8Array([1]), { largura: 10, altura: 10, spp: 1 }))
      .rejects.toThrow(/503/);
  });

  it('health devolve null quando o serviço não está rodando', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await saudeRenderNativo()).toBeNull();
  });
});
