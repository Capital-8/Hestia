import { describe, expect, it } from 'vitest';
import { applyAverageTextureColors, averageColor, type ImageDecoder, type SmallImage } from './imageColor';
import type { ImportedModel } from './types';

const solid = (r: number, g: number, b: number, a = 255, n = 4): SmallImage => ({
  width: n,
  height: 1,
  data: new Uint8ClampedArray(Array.from({ length: n }, () => [r, g, b, a]).flat()),
});

const model = (): ImportedModel =>
  ({
    name: 'x',
    sourceFileName: 'x.skp',
    sourceFormat: 'skp',
    defs: [],
    instances: [],
    materials: [
      { name: 'quadro', color: [1, 0.33, 0.33], opacity: 1, textureIndex: 0 },
      { name: 'liso', color: [0.2, 0.2, 0.2], opacity: 1 },
      { name: 'repete', color: [1, 0, 0], opacity: 1, textureIndex: 0 },
    ],
    textures: [{ fileName: 'a.jpg', mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) }],
    warnings: [],
    stats: { vertices: 0, triangles: 0, definitions: 0, instances: 0, textures: 1, sourceBytes: 0, ms: 0 },
  }) as ImportedModel;

describe('cor media da textura', () => {
  it('imagem lisa devolve a propria cor', () => {
    const c = averageColor(solid(128, 64, 200))!;
    expect(c[0]).toBeCloseTo(128 / 255, 2);
    expect(c[1]).toBeCloseTo(64 / 255, 2);
    expect(c[2]).toBeCloseTo(200 / 255, 2);
  });
  it('media e feita em espaco linear (preto e branco dao cinza claro, nao 0,5)', () => {
    const img: SmallImage = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) };
    const c = averageColor(img)!;
    expect(c[0]).toBeGreaterThan(0.7);
    expect(c[0]).toBeLessThan(0.75);
  });
  it('pixels transparentes nao entram; tudo transparente devolve null', () => {
    const img: SmallImage = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255]) };
    const c = averageColor(img)!;
    expect(c[2]).toBeCloseTo(1, 2);
    expect(c[0]).toBeCloseTo(0, 2);
    expect(averageColor(solid(9, 9, 9, 0))).toBeNull();
  });
  it('troca a cor de reserva vermelha do quadro pela media da imagem e decodifica cada textura uma vez', async () => {
    let chamadas = 0;
    const dec: ImageDecoder = async () => {
      chamadas++;
      return solid(240, 225, 221);
    };
    const m = model();
    const n = await applyAverageTextureColors(m, dec);
    expect(n).toBe(2);
    expect(chamadas).toBe(1);
    expect(m.materials[0]!.color[0]).toBeCloseTo(240 / 255, 2);
    expect(m.materials[1]!.color).toEqual([0.2, 0.2, 0.2]);
    expect(m.warnings).toHaveLength(0);
  });
  it('sem decodificador mantem a cor do arquivo e avisa', async () => {
    const m = model();
    const n = await applyAverageTextureColors(m, async () => null);
    expect(n).toBe(0);
    expect(m.materials[0]!.color).toEqual([1, 0.33, 0.33]);
    expect(m.warnings[0]).toMatch(/cor media/);
  });
});
