import { describe, expect, it, vi } from 'vitest';
import {
  capturarCanvas,
  capturarVista,
  desenharCaptura,
  nomeArquivoPng,
  resolverDimensoes,
  validarDimensoes,
} from '../../editor/render/captureView.ts';

/** Canvas falso mínimo: só o que a captura usa (dimensões, contexto 2D e toBlob). */
function fonteFalsa(largura = 320, altura = 180): HTMLCanvasElement {
  return { width: largura, height: altura } as HTMLCanvasElement;
}

interface ContextoFalso {
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
}

function destinoFalso(png: Uint8Array): { canvas: HTMLCanvasElement; ctx: ContextoFalso } {
  const ctx: ContextoFalso = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (tipo: string) => (tipo === '2d' ? ctx : null),
    toBlob: (cb: BlobCallback, tipo?: string) => {
      cb(new Blob([png.buffer as ArrayBuffer], { type: tipo ?? 'image/png' }));
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

describe('captureView — resolução', () => {
  it('resolve 1x, 2x e largura/altura personalizada', () => {
    const base = { largura: 320, altura: 180 };
    expect(resolverDimensoes(base, '1x')).toEqual({ largura: 320, altura: 180 });
    expect(resolverDimensoes(base, '2x')).toEqual({ largura: 640, altura: 360 });
    expect(resolverDimensoes(base, 'personalizado', { largura: 1920, altura: 1080 })).toEqual({
      largura: 1920,
      altura: 1080,
    });
  });

  it('recusa dimensões vazias, lado grande demais e pixels demais', () => {
    expect(validarDimensoes({ largura: 0, altura: 180 })).toMatch(/maiores que zero/);
    expect(validarDimensoes({ largura: 9000, altura: 900 })).toMatch(/lado máximo/);
    expect(validarDimensoes({ largura: 8000, altura: 5000 })).toMatch(/grande demais/);
    expect(validarDimensoes({ largura: 1920, altura: 1080 })).toBeNull();
  });
});

describe('captureView — nome do arquivo', () => {
  it('normaliza o nome e garante uma única extensão .png', () => {
    expect(nomeArquivoPng('Fachada Principal')).toBe('Fachada-Principal.png');
    expect(nomeArquivoPng('foto.JPG')).toBe('foto.png');
    expect(nomeArquivoPng('já tem.png')).toBe('ja-tem.png');
    expect(nomeArquivoPng('   ')).toBe('vista.png');
  });
});

describe('captureView — desenho e PNG', () => {
  it('desenha no tamanho pedido, com fundo e suavização', () => {
    const fonte = fonteFalsa();
    const { canvas, ctx } = destinoFalso(new Uint8Array());
    desenharCaptura(canvas, fonte, 640, 360, '#ffffff');
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 360);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(ctx.drawImage).toHaveBeenCalledWith(fonte, 0, 0, 320, 180, 0, 0, 640, 360);
  });

  it('não tenta desenhar uma fonte ainda vazia', () => {
    const { canvas } = destinoFalso(new Uint8Array());
    expect(() => desenharCaptura(canvas, fonteFalsa(0, 0), 100, 100)).toThrow(/ainda não foi desenhada/);
  });

  it('devolve um Blob PNG com a assinatura correta', async () => {
    const assinatura = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { canvas } = destinoFalso(assinatura);
    const blob = await capturarCanvas(fonteFalsa(), {
      largura: 640,
      altura: 360,
      criarCanvas: () => canvas,
    });
    expect(blob.type).toBe('image/png');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([...assinatura]);
  });

  it('avisa quando não há vista ativa', async () => {
    await expect(capturarVista({ largura: 100, altura: 100 })).rejects.toThrow(/Nenhuma vista ativa/);
  });
});
