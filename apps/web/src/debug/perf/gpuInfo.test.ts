import { describe, expect, it } from 'vitest';
import { contadores } from '@hestia/render';
import { infoRender, rendererWebglPara, versaoDoWebKit } from './gpuInfo.ts';

describe('versaoDoWebKit (parser puro de UA)', () => {
  it('lê WebKitGTK primeiro (Tauri/MiniBrowser no Linux)', () => {
    expect(versaoDoWebKit('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) WebKitGTK/2.44.5 Safari/605.1.15')).toBe('2.44.5');
  });

  it('cai no Version/ do Safari-style', () => {
    expect(versaoDoWebKit('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15')).toBe('17.2.1');
  });

  it('sem os dois, usa o build AppleWebKit', () => {
    expect(versaoDoWebKit('Mozilla/5.0 (X11) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/120 Safari/537.36')).toBe('605.1.15');
  });

  it('UA sem nada reconhecível → null', () => {
    expect(versaoDoWebKit('curl/8.5.0')).toBeNull();
    expect(versaoDoWebKit('')).toBeNull();
  });
});

interface ContextoFalso {
  getExtension(nome: string): unknown;
  getParameter(p: number): unknown;
  RENDERER: number;
}

const documentoCom = (gl: ContextoFalso | null): Pick<Document, 'createElement'> => ({
  createElement: () => ({ getContext: () => gl }) as unknown as HTMLCanvasElement & { getContext(): unknown },
});

describe('rendererWebglPara', () => {
  const RENDERER = 0x1f01;
  const UNMASKED = 0x9245;

  it('prefere o UNMASKED_RENDERER_WEBGL (nome real da GPU)', () => {
    const gl: ContextoFalso = {
      RENDERER,
      getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null),
      getParameter: (p) => (p === UNMASKED ? 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)' : 'WebKit WebGL'),
    };
    expect(rendererWebglPara(documentoCom(gl))).toBe('Mesa Intel(R) UHD Graphics 620 (KBL GT2)');
  });

  it('sem a extensão (ou sem valor), usa o RENDERER mascarado', () => {
    const gl: ContextoFalso = { RENDERER, getExtension: () => null, getParameter: (p) => (p === RENDERER ? 'WebKit WebGL' : null) };
    expect(rendererWebglPara(documentoCom(gl))).toBe('WebKit WebGL');
  });

  it('sem WebGL nenhum ou com falha → null (fallback do diálogo)', () => {
    expect(rendererWebglPara(documentoCom(null))).toBeNull();
    expect(rendererWebglPara({ createElement: () => { throw new Error('no dom'); } } as unknown as Pick<Document, 'createElement'>)).toBeNull();
  });
});

describe('infoRender', () => {
  it('expõe o backend que o renderer definiu no wrap (sem DOM, o resto cai em null)', () => {
    contadores.definirBackend('webgl2');
    const info = infoRender();
    expect(info.backend).toBe('webgl2');
    expect(info.webkit === null || typeof info.webkit === 'string').toBe(true);
    expect(info.renderer === null || typeof info.renderer === 'string').toBe(true);
  });
});
