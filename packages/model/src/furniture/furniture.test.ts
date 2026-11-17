import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  applyMat4,
  assetParts,
  assetUsage,
  furniturePartWorldTransform,
  mat4Det3,
  base64ToBytes,
  buildFurnitureAsset,
  bytesToBase64,
  createEmptyProject,
  furnitureAssetIssue,
  furnitureAssetWarnings,
  furnitureBounds,
  furnitureDefArrays,
  furniturePersistReport,
  furnitureTextureBytes,
  furnitureWorldTransform,
  labelOf,
  migrateProject,
  sha256Hex,
  SCHEMA_VERSION,
  type Furniture,
  type FurnitureImportInput,
  type Project,
} from '../index.ts';

function input(): FurnitureImportInput {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 0.5, 0.1234567, -3.5, 1e-7]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 140.25, -139.5, 0, 1, 0.5, 0.5]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  return {
    name: 'Poltrona',
    sourceFileName: 'C:\\Users\\fulano\\Downloads\\poltrona.glb',
    sourceFormat: 'glb',
    defs: [{ id: 'd1', name: 'Corpo', positions, normals, uvs, indices, groups: [{ start: 0, count: 6, materialIndex: 0 }, { start: 6, count: 3, materialIndex: 1 }] }],
    materials: [
      { name: 'Madeira', color: [0.5, 0.25, 0.1], opacity: 1, category: 'wood', textureIndex: 0, sizeM: [0.5, 0.5], roughness: 0.6 },
      { name: 'Tecido', color: [1, 1, 1], opacity: 1, category: 'fabric' },
    ],
    textures: [{ fileName: '/tmp/x/madeira.png', mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 0, 255, 1, 2, 3]), width: 2, height: 2 }],
    stats: { sourceBytes: 1234 },
  };
}

function fresh(): { store: ProjectStore; levelId: string } {
  const p = createEmptyProject();
  return { store: new ProjectStore(p), levelId: p.levels[0]!.id };
}

const inst = (id: string, assetId: string, levelId: string, extra: Partial<Furniture> = {}): Omit<Furniture, 'order'> => ({
  id, kind: 'furniture', assetId, levelId, x: 1, y: 2, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Poltrona', ...extra,
});

describe('base64 e sha256', () => {
  it('ida e volta de bytes de todos os tamanhos de resto', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    }
  });
  it('base64 igual ao do Node', () => {
    const b = Uint8Array.from({ length: 100000 }, (_, i) => (i * 31) & 255);
    expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
  });
  it('sha256 conhecido', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('asset', () => {
  it('constroi sem caminho, com bbox, hash e estatisticas', () => {
    const a = buildFurnitureAsset(input(), 'fa1');
    expect(a.sourceFileName).toBe('poltrona.glb');
    expect(a.textures[0]!.fileName).toBe('madeira.png');
    // recentrado: centro da base na origem (a caixa do arquivo era x 0..1, y -3.5..2)
    expect(a.bbox.min[0]).toBeCloseTo(-0.5);
    expect(a.bbox.min[1]).toBeCloseTo(-2.75);
    expect(a.bbox.min[2]).toBe(0);
    expect(a.bbox.max[1]).toBeCloseTo(2.75);
    expect(buildFurnitureAsset(input(), 'fa1b', ).bbox).toEqual(a.bbox);
    expect(buildFurnitureAsset({ ...input(), recenter: false }, 'fa1c').bbox.min[1]).toBeCloseTo(-3.5);
    expect(a.materials[0]!.color).toBe('#80401a');
    expect(a.materials[0]!.useEmbeddedTexture).toBe(true);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.stats).toMatchObject({ vertices: 5, triangles: 3, definitions: 1, textures: 1, sourceBytes: 1234 });
    expect(furnitureAssetIssue(a)).toBeNull();
    expect(buildFurnitureAsset(input(), 'outro').contentHash).toBe(a.contentHash);
  });
  it('arrays tipados voltam exatos', () => {
    const src = input();
    const a = buildFurnitureAsset(src, 'fa1');
    const arr = furnitureDefArrays(a.defs[0]!);
    expect(Array.from(arr.positions)).toEqual(Array.from(src.defs[0]!.positions));
    expect(Array.from(arr.uvs)).toEqual(Array.from(src.defs[0]!.uvs));
    expect(Array.from(arr.indices)).toEqual(Array.from(src.defs[0]!.indices));
    expect(Array.from(furnitureTextureBytes(a.textures[0]!))).toEqual(Array.from(src.textures[0]!.bytes));
  });
  it('recusa dados incoerentes', () => {
    const a = buildFurnitureAsset(input(), 'fa1');
    expect(furnitureAssetIssue({ ...a, sourceFileName: 'a/b.glb' })).toMatch(/caminho/);
    expect(furnitureAssetIssue({ ...a, defs: [{ ...a.defs[0]!, groups: [{ start: 0, count: 3, materialIndex: 9 }] }] })).toMatch(/material/);
    expect(furnitureAssetIssue({ ...a, defs: [{ ...a.defs[0]!, vertexCount: 99 }] })).toMatch(/vertexCount/);
  });
  it('aviso acima de 40 MB e sem aviso abaixo', () => {
    const a = buildFurnitureAsset(input(), 'fa1');
    expect(furnitureAssetWarnings(a)).toEqual([]);
    const big = { ...a, textures: [{ ...a.textures[0]!, byteLength: 41 * 1024 * 1024 }] };
    expect(furnitureAssetWarnings(big)[0]).toMatch(/Asset grande/);
  });
});

describe('grupos de dois lados', () => {
  it('doubleSided do grupo vai para o asset (so quando verdadeiro), entra no hash e sobrevive ao JSON', () => {
    const a = input();
    const normal = buildFurnitureAsset(a, 'fa_a');
    const b = input();
    b.defs[0]!.groups = [{ start: 0, count: 6, materialIndex: 0, doubleSided: true }, { start: 6, count: 3, materialIndex: 1, doubleSided: false }];
    const dois = buildFurnitureAsset(b, 'fa_b');
    expect(dois.defs[0]!.groups[0]).toEqual({ start: 0, count: 6, materialIndex: 0, doubleSided: true });
    expect('doubleSided' in dois.defs[0]!.groups[1]!).toBe(false);
    expect(dois.contentHash).not.toBe(normal.contentHash);
    const volta = JSON.parse(JSON.stringify(dois)) as typeof dois;
    expect(volta.defs[0]!.groups[0]!.doubleSided).toBe(true);
  });
});

describe('comandos e historico', () => {
  it('addFurnitureAsset cria materiais com categoria; desfazer e refazer', () => {
    const { store } = fresh();
    const a = buildFurnitureAsset(input(), 'fa1');
    const nMat = Object.keys(store.project.materials).length;
    store.exec({ type: 'addFurnitureAsset', asset: a });
    expect(store.project.furniture!.assets['fa1']).toBeDefined();
    expect(Object.keys(store.project.materials).length).toBe(nMat + 2);
    expect(store.project.materials[a.materials[0]!.id]!.category).toBe('wood');
    expect(store.undoLabel).toBe('Importar móvel');
    store.undo();
    expect(Object.keys(store.project.materials).length).toBe(nMat);
    expect(store.project.furniture?.assets['fa1']).toBeUndefined();
    store.redo();
    expect(store.project.furniture!.assets['fa1']).toBeDefined();
    expect(Object.keys(store.project.materials).length).toBe(nMat + 2);
  });

  it('N instancias compartilham o asset (nao copiam malha)', () => {
    const { store, levelId } = fresh();
    store.exec({ type: 'addFurnitureAsset', asset: buildFurnitureAsset(input(), 'fa1') });
    const before = JSON.stringify(store.project.furniture).length;
    for (let i = 0; i < 25; i++) store.exec({ type: 'addFurniture', furniture: inst(`f${i}`, 'fa1', levelId, { x: i }) });
    expect(JSON.stringify(store.project.furniture).length).toBe(before);
    expect(Object.keys(store.project.furniture!.assets)).toEqual(['fa1']);
    expect(assetUsage(store.project, 'fa1').count).toBe(25);
    const e = store.project.elements['f3'] as Furniture;
    expect(e.kind).toBe('furniture');
    expect(e.order).toBeGreaterThan(0);
    // a malha e a mesma referencia para todas as instancias
    expect(furnitureDefArrays(store.project.furniture!.assets['fa1']!.defs[0]!)).toBe(furnitureDefArrays(store.project.furniture!.assets['fa1']!.defs[0]!));
  });

  it('updateFurniture, deleteFurniture e desfazer', () => {
    const { store, levelId } = fresh();
    store.exec({ type: 'addFurnitureAsset', asset: buildFurnitureAsset(input(), 'fa1') });
    store.exec({ type: 'addFurniture', furniture: inst('f1', 'fa1', levelId) });
    store.exec({ type: 'updateFurniture', id: 'f1', patch: { x: 5, rotation: Math.PI / 2, scale: 2, mirrored: true, name: 'Sofa', quality: 'completo' } });
    expect(store.project.elements['f1']).toMatchObject({ x: 5, scale: 2, mirrored: true, name: 'Sofa', quality: 'completo' });
    expect(store.undoLabel).toBe('Editar móvel');
    store.undo();
    expect(store.project.elements['f1']).toMatchObject({ x: 1, scale: 1, mirrored: false, name: 'Poltrona' });
    store.redo();
    store.exec({ type: 'deleteFurniture', id: 'f1' });
    expect(store.project.elements['f1']).toBeUndefined();
    store.undo();
    expect(store.project.elements['f1']).toBeDefined();
    expect(() => store.exec({ type: 'updateFurniture', id: 'f1', patch: { scale: 0 } })).toThrow();
    expect(() => store.exec({ type: 'addFurniture', furniture: inst('f9', 'nao-existe', levelId) })).toThrow();
    expect(() => store.exec({ type: 'addFurniture', furniture: inst('f9', 'fa1', 'nivel-x') })).toThrow();
  });

  it('deleteFurnitureAsset so sem instancias; remove os materiais; desfaz', () => {
    const { store, levelId } = fresh();
    const a = buildFurnitureAsset(input(), 'fa1');
    store.exec({ type: 'addFurnitureAsset', asset: a });
    store.exec({ type: 'addFurniture', furniture: inst('f1', 'fa1', levelId) });
    expect(() => store.exec({ type: 'deleteFurnitureAsset', id: 'fa1' })).toThrow(/1 inst/);
    store.exec({ type: 'deleteFurniture', id: 'f1' });
    store.exec({ type: 'deleteFurnitureAsset', id: 'fa1' });
    expect(store.project.furniture!.assets['fa1']).toBeUndefined();
    expect(store.project.materials[a.materials[0]!.id]).toBeUndefined();
    store.undo();
    expect(store.project.furniture!.assets['fa1']).toBeDefined();
    expect(store.project.materials[a.materials[0]!.id]).toBeDefined();
  });

  it('setFurnitureMaterial altera categoria, cor e textura embutida (asset e Material)', () => {
    const { store } = fresh();
    const a = buildFurnitureAsset(input(), 'fa1');
    store.exec({ type: 'addFurnitureAsset', asset: a });
    const mid = a.materials[0]!.id;
    store.exec({ type: 'setFurnitureMaterial', assetId: 'fa1', materialId: mid, patch: { category: 'metal', color: '#112233', useEmbeddedTexture: false } });
    const m = store.project.furniture!.assets['fa1']!.materials[0]!;
    expect(m).toMatchObject({ category: 'metal', color: '#112233', useEmbeddedTexture: false });
    expect(store.project.materials[mid]).toMatchObject({ category: 'metal', color: '#112233' });
    expect(() => store.exec({ type: 'setFurnitureMaterial', assetId: 'fa1', materialId: mid, patch: { color: 'vermelho' } })).toThrow();
    store.undo();
    expect(store.project.furniture!.assets['fa1']!.materials[0]).toMatchObject({ category: 'wood', useEmbeddedTexture: true });
  });

  it('rotulos em PT e EN', () => {
    expect(labelOf({ type: 'deleteFurniture', id: 'x' })).toBe('Excluir móvel');
    expect(labelOf({ type: 'deleteFurniture', id: 'x' }, 'en')).toBe('Delete furniture');
  });
});

describe('persistencia', () => {
  it('ida e volta exata pelo JSON e migrateProject', () => {
    const { store, levelId } = fresh();
    store.exec({ type: 'addFurnitureAsset', asset: buildFurnitureAsset(input(), 'fa1') });
    store.exec({ type: 'addFurniture', furniture: inst('f1', 'fa1', levelId, { rotation: 0.3, mirrored: true }) });
    const text = JSON.stringify(store.project);
    expect(text).not.toMatch(/Users|\\\\|\/tmp/);
    const back = migrateProject(JSON.parse(text)) as Project;
    expect(back.furniture).toEqual(store.project.furniture);
    expect(back.elements['f1']).toEqual(store.project.elements['f1']);
    expect(JSON.stringify(back)).toBe(text);
    const src = input();
    const arr = furnitureDefArrays(back.furniture!.assets['fa1']!.defs[0]!);
    expect(Array.from(arr.positions)).toEqual(Array.from(src.defs[0]!.positions));
    expect(Array.from(arr.indices)).toEqual(Array.from(src.defs[0]!.indices));
    expect(furniturePersistReport(back).absolutePaths).toEqual([]);
  });

  it('projeto antigo sem furniture abre igual', () => {
    const p = createEmptyProject();
    const raw = JSON.parse(JSON.stringify(p));
    expect('furniture' in raw).toBe(false);
    const back = migrateProject(raw);
    expect(back.furniture).toBeUndefined();
    expect(back.schemaVersion).toBe(SCHEMA_VERSION);
    expect(back).toEqual(p);
  });

  it('o importador nao muda o esquema: continua v28 e um projeto v28 literal abre sem mudar de versao', () => {
    expect(SCHEMA_VERSION).toBe(28);
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 28;
    const back = migrateProject(raw);
    expect(back.schemaVersion).toBe(28);
    expect(back.furniture).toBeUndefined();
  });
});

describe('transformacao e limites', () => {
  const f = (extra: Partial<Furniture>): Furniture => ({ ...inst('f', 'fa1', 'L', extra), order: 1 });
  it('identidade e translacao', () => {
    expect(furnitureWorldTransform(f({ x: 0, y: 0, z: 0 }))).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const m = furnitureWorldTransform(f({ x: 1, y: 2, z: 3 }), undefined, 2.8);
    expect(m.slice(12)).toEqual([1, 2, 5.8, 1]);
  });
  it('rotacao 90 graus em Z, escala e espelho', () => {
    const m = furnitureWorldTransform(f({ x: 0, y: 0, z: 0, rotation: Math.PI / 2, scale: 2 }));
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(2); // X local vira +Y
    expect(m[4]).toBeCloseTo(-2); // Y local vira -X
    expect(m[10]).toBe(2);
    const mm = furnitureWorldTransform(f({ x: 0, y: 0, z: 0, mirrored: true }));
    expect(mm[0]).toBe(-1);
    expect(mm[5]).toBe(1);
  });
  it('bounds do asset girado', () => {
    const a = buildFurnitureAsset(input(), 'fa1');
    const b = furnitureBounds(f({ x: 10, y: 10, z: 0, rotation: Math.PI / 2 }), a);
    // bbox local recentrada x -0.5..0.5, y -2.75..2.75 -> girado 90: x = -y local, y = x local
    expect(b.min[0]).toBeCloseTo(10 - 2.75);
    expect(b.max[0]).toBeCloseTo(10 + 2.75);
    expect(b.min[1]).toBeCloseTo(10 - 0.5);
    expect(b.max[1]).toBeCloseTo(10 + 0.5);
  });
});

describe('pecas do bloco (instancias de dentro do arquivo)', () => {
  const quad = (): FurnitureImportInput['defs'][number] => ({
    id: 'q',
    name: 'Placa',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    groups: [{ start: 0, count: 6, materialIndex: 0 }],
  });
  const T = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  it('guarda a composicao e calcula a caixa com as transformacoes', () => {
    const base = input();
    const a = buildFurnitureAsset(
      { ...base, defs: [quad()], materials: [base.materials[1]!], textures: [], instances: [{ defId: 'q', transform: T(0, 0, 0) }, { defId: 'q', transform: T(2, 0, 0.5) }, { defId: 'q', name: 'espelhada', transform: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] }] },
      'fa2',
    );
    expect(a.parts).toHaveLength(3);
    expect(a.bbox.min).toEqual([-2.5, -0.5, 0]);
    expect(a.bbox.max).toEqual([2.5, 0.5, 0.5]);
    expect(buildFurnitureAsset({ ...base, defs: [quad()], materials: [base.materials[1]!], textures: [], recenter: false, instances: [{ defId: 'q', transform: T(0, 0, 0) }, { defId: 'q', transform: T(2, 0, 0.5) }] }, 'fa2b').bbox.min).toEqual([0, 0, 0]);
    expect(furnitureAssetIssue(a)).toBeNull();
    expect(assetParts(a)[2]!.name).toBe('espelhada');
    expect(mat4Det3(assetParts(a)[2]!.transform)).toBeLessThan(0);
  });
  it('sem instancias, cada definicao fica na origem; assets antigos sem parts funcionam', () => {
    const base = input();
    const a = buildFurnitureAsset({ ...base, defs: [quad()], materials: [base.materials[1]!], textures: [] }, 'fa3');
    expect(a.parts).toHaveLength(1);
    expect(assetParts({ ...a, parts: undefined })).toHaveLength(1);
    expect(a.bbox.min).toEqual([-0.5, -0.5, 0]);
    expect(a.bbox.max).toEqual([0.5, 0.5, 0]);
  });
  it('transformacao do mundo compoe instancia e peca', () => {
    const base = input();
    const a = buildFurnitureAsset({ ...base, defs: [quad()], materials: [base.materials[1]!], textures: [], instances: [{ defId: 'q', transform: T(2, 0, 0) }] }, 'fa4');
    const inst = { id: 'f1', kind: 'furniture', assetId: 'fa4', levelId: 'l', x: 10, y: 0, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'n', order: 0 } as Furniture;
    const m = furniturePartWorldTransform(inst, assetParts(a)[0]!, a);
    expect(applyMat4(m, [0, 0, 0])).toEqual([9.5, -0.5, 0]);
  });
  it('recusa peca que aponta para definicao inexistente', () => {
    const base = input();
    const a = buildFurnitureAsset({ ...base, defs: [quad()], materials: [base.materials[1]!], textures: [] }, 'fa5');
    expect(furnitureAssetIssue({ ...a, parts: [{ defId: 'x', transform: T(0, 0, 0) }] })).toMatch(/inexistente/);
  });
});
