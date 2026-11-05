import { describe, expect, it } from 'vitest';
import { dimensoesReduzidas, gerarMips, LADO_MAXIMO_TEXTURA, urlDaTextura } from './texturaRender.ts';

/** Xadrez preto (0) e branco (255) em RGB, alfa 255. Cada célula é um pixel. */
function xadrez(largura: number, altura: number): Uint8Array {
  const rgba = new Uint8Array(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const valor = (x + y) % 2 === 0 ? 0 : 255;
      const o = (y * largura + x) * 4;
      rgba[o] = valor;
      rgba[o + 1] = valor;
      rgba[o + 2] = valor;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

describe('gerarMips', () => {
  it('xadrez 2×2: o nível 1 (1×1) é a média dos quatro pixels, arredondada para cima na metade', () => {
    // (0 + 255 + 255 + 0) / 4 = 127,5 → 128 (arredondamento para cima na metade).
    const mips = gerarMips(xadrez(2, 2), 2, 2);
    expect(mips.length).toBe(2);
    expect(mips[0]).toEqual(xadrez(2, 2));
    expect(Array.from(mips[1]!)).toEqual([128, 128, 128, 255]);
  });

  it('xadrez 4×4: cada bloco 2×2 vira 128 e o nível 2 (1×1) também', () => {
    const mips = gerarMips(xadrez(4, 4), 4, 4);
    expect(mips.length).toBe(3);
    expect(mips[1]!.length).toBe(2 * 2 * 4);
    expect(Array.from(mips[1]!.subarray(0, 4))).toEqual([128, 128, 128, 255]);
    expect(Array.from(mips[2]!)).toEqual([128, 128, 128, 255]);
  });

  it('níveis com metade da largura e da altura, mínimo 1 (retângulo 8×2 → 4×1, 2×1, 1×1)', () => {
    const mips = gerarMips(new Uint8Array(8 * 2 * 4).fill(10), 8, 2);
    expect(mips.map((m) => m.length)).toEqual([8 * 2 * 4, 4 * 1 * 4, 2 * 1 * 4, 1 * 1 * 4]);
  });

  it('média 2×2 usa a faixa certa: um pixel claro em 2×2 sobe a 64 no nível 1', () => {
    const rgba = new Uint8Array(2 * 2 * 4).fill(0);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    rgba[0] = 255; // só o pixel (0,0) tem vermelho 255
    const mips = gerarMips(rgba, 2, 2);
    expect(mips[1]![0]).toBe(64); // (255 + 0 + 0 + 0 + 2) >> 2
    expect(mips[1]![1]).toBe(0);
  });

  it('recusa pixels com tamanho diferente de largura × altura × 4', () => {
    expect(() => gerarMips(new Uint8Array(15), 2, 2)).toThrow(/esperado 16/);
  });
});

describe('dimensoesReduzidas', () => {
  it('mantém imagens até 1024 px no lado maior', () => {
    expect(dimensoesReduzidas(1024, 1024)).toEqual([1024, 1024]);
    expect(dimensoesReduzidas(100, 50)).toEqual([100, 50]);
    expect(LADO_MAXIMO_TEXTURA).toBe(1024);
  });

  it('reduz o lado maior a 1024 px e mantém a proporção', () => {
    expect(dimensoesReduzidas(2048, 1024)).toEqual([1024, 512]);
    expect(dimensoesReduzidas(2000, 4000)).toEqual([512, 1024]);
  });

  it('nunca zera um lado (mínimo 1 px)', () => {
    expect(dimensoesReduzidas(1, 4000)).toEqual([1, 1024]);
  });
});

describe('urlDaTextura', () => {
  it('aponta para a pasta publicada da biblioteca', () => {
    expect(urlDaTextura('tijolo_vermelho_albedo.jpg')).toBe('/texturas-render/tijolo_vermelho_albedo.jpg');
  });
});
