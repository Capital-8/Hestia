import type { FurnitureImportedModel } from '@hestia/io';

/** Caixa 0,8 x 0,4 x 0,5 m (8 vértices, 12 triângulos) com dois materiais (um com textura), para os testes. */
export function boxModel(over: Partial<FurnitureImportedModel> = {}): FurnitureImportedModel {
  const w = 0.8;
  const d = 0.4;
  const h = 0.5;
  const positions = new Float32Array([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h]);
  const normals = new Float32Array(24);
  for (let i = 0; i < 8; i++) normals[i * 3 + 2] = 1;
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return {
    name: 'Caixa',
    sourceFileName: 'caixa.glb',
    sourceFormat: 'glb',
    defs: [
      {
        id: 'd1',
        name: 'caixa',
        positions,
        normals,
        uvs: new Float32Array(16),
        indices,
        groups: [
          { start: 0, count: 18, materialIndex: 0 },
          { start: 18, count: 18, materialIndex: 1 },
        ],
      },
    ],
    instances: [{ defId: 'd1', name: 'peca', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 0, 1] }],
    materials: [
      { name: 'madeira', color: [0.5, 0.3, 0.1], opacity: 1, category: 'wood', textureIndex: 0, sizeM: [1, 1] },
      { name: 'metal', color: [0.7, 0.7, 0.7], opacity: 1, category: 'metal' },
    ],
    textures: [{ fileName: 'madeira.png', mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), width: 2, height: 2 }],
    warnings: ['Textura .webp ignorada.'],
    stats: { vertices: 8, triangles: 12, definitions: 1, instances: 1, textures: 1, sourceBytes: 1234, ms: 3 },
    ...over,
  };
}
