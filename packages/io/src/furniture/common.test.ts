import { describe, expect, it } from 'vitest';
import { finalizeModel, guessCategory, imageSize, sniffMime, type ModelDraft } from './common';
import { IMPORT_LIMITS } from './types';

function draft(nVerts = 3): ModelDraft {
  const positions = new Float32Array(nVerts * 3);
  const normals = new Float32Array(nVerts * 3);
  const indices = new Uint32Array([0, 1, 2]);
  return {
    name: 'x',
    sourceFileName: 'x.skp',
    sourceFormat: 'skp',
    defs: [{ id: 'd', name: 'd', positions, normals, uvs: new Float32Array(0), indices, groups: [{ start: 0, count: 3, materialIndex: 0 }] }],
    instances: [{ defId: 'd', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    materials: [{ name: 'm', color: [1, 1, 1], opacity: 1 }],
    textures: [],
    warnings: [],
    stats: { sourceBytes: 10, ms: 5 },
  };
}

describe('guessCategory', () => {
  const cases: Array<[string, string]> = [
    ['Madeira clara', 'wood'], ['oak_01', 'wood'], ['Walnut veneer', 'wood'], ['carvalho', 'wood'],
    ['Aço escovado', 'metal'], ['Inox', 'metal'], ['chrome', 'metal'], ['Alumínio', 'metal'], ['metal_dark', 'metal'],
    ['Vidro fosco', 'glass'], ['[Translucent_Glass_Safety]', 'glass'], ['Espelho', 'glass'], ['mirror', 'glass'],
    ['Tecido cinza', 'fabric'], ['FABRIC 1C', 'fabric'], ['Linho', 'fabric'], ['cloth', 'fabric'],
    ['Couro marrom', 'leather'], ['leather black', 'leather'],
    ['Cerâmica', 'ceramic'], ['white tile', 'ceramic'], ['Porcelana', 'ceramic'],
    ['Mármore carrara', 'stone'], ['Granito preto', 'stone'], ['stone', 'stone'], ['Pedra', 'stone'],
    ['Plástico branco', 'plastic'], ['plastic', 'plastic'],
    ['Concreto aparente', 'concrete'], ['Telha colonial', 'roof_tile'],
    ['Material__15', 'other'], ['', 'other'], ['*5', 'other'],
  ];
  for (const [name, cat] of cases) {
    it(`"${name}" -> ${cat}`, () => {
      expect(guessCategory(name, [0.5, 0.5, 0.5], false)).toBe(cat);
    });
  }
  it('nao confunde pedaco de palavra', () => {
    expect(guessCategory('pipe')).toBe('other');
    expect(guessCategory('tabs')).toBe('other');
  });
});

describe('finalizeModel', () => {
  it('calcula estatisticas', () => {
    const m = finalizeModel(draft());
    expect(m.stats).toMatchObject({ vertices: 3, triangles: 1, definitions: 1, instances: 1, textures: 0, sourceBytes: 10, ms: 5 });
    expect(m.warnings).toEqual([]);
  });
  it('avisa acima de 300 mil vertices e recusa acima de 600 mil com "modo leve"', () => {
    const w = finalizeModel(draft(IMPORT_LIMITS.warnVerticesPerBlock + 1));
    expect(w.warnings.join(' ')).toMatch(/modo leve/);
    expect(() => finalizeModel(draft(IMPORT_LIMITS.refuseVerticesPerBlock + 1))).toThrow(/modo leve/);
  });
  it('rejeita indice fora do intervalo, grupo invalido e instancia orfa', () => {
    const a = draft();
    a.defs[0]!.indices = new Uint32Array([0, 1, 9]);
    expect(() => finalizeModel(a)).toThrow(/indice/);
    const b = draft();
    b.defs[0]!.groups = [{ start: 0, count: 6, materialIndex: 0 }];
    expect(() => finalizeModel(b)).toThrow(/grupo/);
    const c = draft();
    c.instances[0]!.defId = 'nao';
    expect(() => finalizeModel(c)).toThrow(/definicao inexistente/);
  });
});

describe('imagem', () => {
  it('le tipo e tamanho de PNG', () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(sniffMime(png)).toBe('image/png');
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
  });
  it('rejeita formato desconhecido', () => {
    expect(sniffMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});
