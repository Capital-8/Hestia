import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAM, desenharAzulejo, desenharTijolo, obterTexturaProcedural } from './texturasProcedurais3d.ts';

function criarCanvasPixelMock() {
  const pixels = new Array<string>(TAM * TAM).fill('');
  let fillStyle = '';
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(TAM, Math.floor(x + w));
      const y1 = Math.min(TAM, Math.floor(y + h));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          pixels[py * TAM + px] = fillStyle;
        }
      }
    },
  } as unknown as CanvasRenderingContext2D;
  const corEm = (x: number, y: number): string => pixels[y * TAM + x]!;
  return { ctx, corEm };
}

describe('texturasProcedurais3d', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('desenharTijolo encaixa perfeitamente nas bordas sem emenda vertical e com juntas de 6 px', () => {
    const { ctx, corEm } = criarCanvasPixelMock();
    const corTijolo = '#a84e38';
    const corJunta = '#d6cfc4';
    desenharTijolo(ctx, corTijolo, corJunta);

    // Fileira par (r=0, y=10): 3 px de junta em cada borda horizontal (3+3=6 px) e 6 px no meio (125..130)
    expect(corEm(0, 10)).toBe(corJunta);
    expect(corEm(2, 10)).toBe(corJunta);
    expect(corEm(3, 10)).toBe(corTijolo);
    expect(corEm(124, 10)).toBe(corTijolo);
    expect(corEm(125, 10)).toBe(corJunta);
    expect(corEm(130, 10)).toBe(corJunta);
    expect(corEm(131, 10)).toBe(corTijolo);
    expect(corEm(252, 10)).toBe(corTijolo);
    expect(corEm(253, 10)).toBe(corJunta);
    expect(corEm(255, 10)).toBe(corJunta);

    // Fileira ímpar (r=1, y=80): metades encostadas em x=0 e x=256 (61+61=122 px contínuos)
    expect(corEm(0, 80)).toBe(corTijolo);
    expect(corEm(60, 80)).toBe(corTijolo);
    expect(corEm(61, 80)).toBe(corJunta);
    expect(corEm(66, 80)).toBe(corJunta);
    expect(corEm(67, 80)).toBe(corTijolo);
    expect(corEm(188, 80)).toBe(corTijolo);
    expect(corEm(189, 80)).toBe(corJunta);
    expect(corEm(194, 80)).toBe(corJunta);
    expect(corEm(195, 80)).toBe(corTijolo);
    expect(corEm(255, 80)).toBe(corTijolo);

    // Junta vertical contínua no encontro y=256 -> y=0 (3 px + 3 px = 6 px)
    expect(corEm(10, 0)).toBe(corJunta);
    expect(corEm(10, 2)).toBe(corJunta);
    expect(corEm(10, 3)).toBe(corTijolo);
    expect(corEm(10, 252)).toBe(corTijolo);
    expect(corEm(10, 253)).toBe(corJunta);
    expect(corEm(10, 255)).toBe(corJunta);
  });

  it('desenharAzulejo preenche grade 2x2 limpa com juntas exatas de 6 px', () => {
    const { ctx, corEm } = criarCanvasPixelMock();
    const corPeca = '#f2f1ed';
    const corJunta = '#d4d2cc';
    desenharAzulejo(ctx, corPeca, corJunta);

    expect(corEm(2, 10)).toBe(corJunta);
    expect(corEm(3, 10)).toBe(corPeca);
    expect(corEm(124, 10)).toBe(corPeca);
    expect(corEm(125, 10)).toBe(corJunta);
    expect(corEm(130, 10)).toBe(corJunta);
    expect(corEm(131, 10)).toBe(corPeca);
    expect(corEm(252, 252)).toBe(corPeca);
    expect(corEm(253, 253)).toBe(corJunta);
  });

  it('obterTexturaProcedural retorna undefined para tipos removidos e gera apenas brick e tile', () => {
    const { ctx } = criarCanvasPixelMock();
    const fakeCanvas = { width: 0, height: 0, getContext: () => ctx };
    vi.stubGlobal('document', { createElement: () => fakeCanvas });

    expect(obterTexturaProcedural('proc:wood:#b68452:#8c5f32')).toBeUndefined();
    expect(obterTexturaProcedural('proc:marble:#ebe9e4:#a8adb3')).toBeUndefined();
    expect(obterTexturaProcedural('proc:concrete:#b8b8b2:#999993')).toBeUndefined();
    expect(obterTexturaProcedural('catalogo:A1')).toBeUndefined();

    const brick = obterTexturaProcedural('proc:brick:#a84e38:#d6cfc4');
    expect(brick?.cor).toBeDefined();
    expect(obterTexturaProcedural('proc:brick:#a84e38:#d6cfc4')).toBe(brick);
    expect(fakeCanvas.width).toBe(TAM);
    expect(fakeCanvas.height).toBe(TAM);

    const tile = obterTexturaProcedural('proc:tile:#f2f1ed:#d4d2cc');
    expect(tile?.cor).toBeDefined();
  });
});
