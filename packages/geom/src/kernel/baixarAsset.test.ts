import { afterEach, describe, expect, it, vi } from 'vitest';
import { baixarAsset } from './carregador.ts';

afterEach(() => vi.unstubAllGlobals());

describe('baixarAsset', () => {
  it('usa a URL absoluta recebida (worker de desenvolvimento não deduz o asset do próprio endereço)', async () => {
    const buscar = vi.fn(async () => new Response(new Uint8Array([0, 0x61, 0x73, 0x6d]), { headers: { 'content-type': 'application/wasm' } }));
    vi.stubGlobal('fetch', buscar);
    const bytes = await baixarAsset('http://localhost:5175/geom_wasm.wasm');
    expect(bytes.length).toBe(4);
    expect((buscar.mock.calls[0] as unknown[])[0]).toEqual(new URL('http://localhost:5175/geom_wasm.wasm'));
  });

  it('HTML com status 200 (fallback de SPA) é erro com a causa, não "magic word" no compile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })));
    await expect(baixarAsset('http://localhost:5175/src/editor/geom_wasm.wasm')).rejects.toThrow(/devolveu HTML/);
  });
});
