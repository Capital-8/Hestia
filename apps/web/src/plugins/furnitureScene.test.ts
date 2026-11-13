import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectStore, buildFurnitureAsset, createEmptyProject, mat4Det3, furnitureWorldTransform,
  type FurnitureAsset, type FurnitureImportInput, type Project,
} from '@hestia/model';
import {
  NORMALS_MAX_FLOATS, PluginHost, TestPlugin, UVS_MAX_FLOATS, contentForProtocol, createMemoryPair, diffScene, findImagePayload, validateMessage,
  type Capability, type HostPorts, type Message, type PluginEntry, type SceneContent, type SceneEntity,
} from '@hestia/plugin-api';
import { buildSceneContent } from './sceneExport.ts';
import {
  FURNITURE_ENTITY_JSON_BUDGET, TRIANGULOS_AVISO, TRIANGULOS_CRITICO, furnitureBudget, furnitureEntities, furnitureTexturesFor,
} from './furnitureScene.ts';

/** Móveis importados no renderizador: malha do modelo, divisão, deltas, orçamento. Docs: docs/plugins/09-extensao-render.md. */

const CATEGORIAS = new Set(['wood', 'metal', 'glass', 'ceramic', 'concrete', 'plaster', 'paint', 'brick', 'stone', 'roof_tile', 'fabric', 'leather', 'grass', 'soil', 'asphalt', 'plastic', 'other']);

// ---- ativos de teste ----
/** Cubo unitário [0,1]^3, triângulos anti-horários vistos de fora, dois materiais (madeira com sizeM, tecido sem). */
function cuboInput(): FurnitureImportInput {
  const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  // faces: [normal, 4 cantos anti-horários vistos de fora]
  const F: Array<[number[], number[]]> = [
    [[0, 0, -1], [0, 3, 2, 1]], [[0, 0, 1], [4, 5, 6, 7]], [[0, -1, 0], [0, 1, 5, 4]],
    [[1, 0, 0], [1, 2, 6, 5]], [[0, 1, 0], [2, 3, 7, 6]], [[-1, 0, 0], [3, 0, 4, 7]],
  ];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  F.forEach(([n, c], f) => {
    c.forEach((ci, k) => { pos.push(...P[ci]!); nor.push(...n); uv.push(k === 1 || k === 2 ? 2 : 0, k >= 2 ? 3 : 0); });
    const b = f * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return {
    name: 'Cubo', sourceFileName: 'C:\\x\\cubo.skp', sourceFormat: 'skp',
    defs: [{
      id: 'd1', name: 'cubo', positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), indices: new Uint32Array(idx),
      // faces 0..2 = madeira (18 índices), 3..5 = tecido
      groups: [{ start: 0, count: 18, materialIndex: 0 }, { start: 18, count: 18, materialIndex: 1 }],
    }],
    materials: [
      { name: 'Madeira', color: [0.5, 0.3, 0.1], opacity: 1, category: 'wood', sizeM: [0.5, 0.25] },
      { name: 'Tecido', color: [0.8, 0.8, 0.9], opacity: 1, category: 'fabric' },
    ],
    textures: [],
  };
}

/** Grade W x W vértices (plano z=0, normais +Z, UVs em repetições), um material: bloco "pesado". */
function grade(w: number): FurnitureImportInput {
  const pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), uv = new Float32Array(w * w * 2);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const v = j * w + i;
    pos.set([i * 0.001234567, j * 0.001234567, Math.sin(i * 0.1) * 0.01], v * 3);
    nor.set([0, 0, 1], v * 3);
    uv.set([i / 10, j / 10], v * 2);
  }
  const idx = new Uint32Array((w - 1) * (w - 1) * 6);
  let k = 0;
  for (let j = 0; j < w - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    idx.set([a, b, d, a, d, c], k);
    k += 6;
  }
  return {
    name: 'Grade', sourceFileName: 'grade.skp', sourceFormat: 'skp',
    defs: [{ id: 'g', name: 'grade', positions: pos, normals: nor, uvs: uv, indices: idx, groups: [{ start: 0, count: idx.length, materialIndex: 0 }] }],
    materials: [{ name: 'Pano', color: [1, 0, 0], opacity: 1, category: 'fabric', sizeM: [1, 1] }],
    textures: [],
  };
}

function projetoCom(inputs: FurnitureImportInput[]): { store: ProjectStore; assets: FurnitureAsset[]; levelId: string } {
  const p = createEmptyProject();
  const store = new ProjectStore(p);
  // transformacao testada com o bloco na origem do arquivo; o recentramento tem teste proprio no modelo
  const assets = inputs.map((i) => buildFurnitureAsset({ ...i, recenter: false }));
  for (const a of assets) store.exec({ type: 'addFurnitureAsset', asset: a });
  return { store, assets, levelId: p.levels[0]!.id };
}

const colocar = (store: ProjectStore, id: string, assetId: string, levelId: string, extra: Partial<{ x: number; y: number; z: number; rotation: number; scale: number; mirrored: boolean }> = {}): void => {
  store.exec({ type: 'addFurniture', furniture: { id, kind: 'furniture', assetId, levelId, x: 0, y: 0, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Móvel', ...extra } });
};

/** Normal geométrica de cada triângulo concorda com a normal do vértice (ordem de triângulos coerente com as normais). */
function winding(e: SceneEntity): { total: number; bons: number } {
  const m = e.mesh!;
  let total = 0, bons = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]! * 3, m.indices[t + 1]! * 3, m.indices[t + 2]! * 3];
    const u = [0, 1, 2].map((k) => m.positions[b + k]! - m.positions[a + k]!);
    const v = [0, 1, 2].map((k) => m.positions[c + k]! - m.positions[a + k]!);
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const d = n[0]! * m.normals![a]! + n[1]! * m.normals![a + 1]! + n[2]! * m.normals![a + 2]!;
    total += 1;
    if (d > 0) bons += 1;
  }
  return { total, bons };
}

describe('móveis: malha do modelo', () => {
  const { store, assets, levelId } = projetoCom([cuboInput()]);
  colocar(store, 'f1', assets[0]!.id, levelId, { x: 2, y: 3, rotation: Math.PI / 2, scale: 2 });
  colocar(store, 'f2', assets[0]!.id, levelId, { x: -4, y: 1, mirrored: true, rotation: 0.3 });
  const { entities } = furnitureEntities(store.project);
  const f1 = entities.find((e) => e.id === 'f1')!;
  const f2 = entities.find((e) => e.id === 'f2')!;

  it('uma entidade kind furniture por instância, em metros, malha completa, transform identidade', () => {
    expect(entities.map((e) => e.id)).toEqual(['f1', 'f2']);
    expect(f1.kind).toBe('furniture');
    expect(f1.mesh!.indices.length / 3).toBe(12);
    expect(f1.levelId).toBe(levelId);
    expect(f1.visible).toBe(true);
  });
  it('posições no mundo: cubo escala 2, girado 90 graus, em (2,3)', () => {
    const p = f1.mesh!.positions;
    const xs = p.filter((_, i) => i % 3 === 0), ys = p.filter((_, i) => i % 3 === 1), zs = p.filter((_, i) => i % 3 === 2);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 2]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([3, 5]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([0, 2]);
  });
  it('normais unitárias e coerentes com os triângulos (normal e espelhada)', () => {
    for (const e of [f1, f2]) {
      const m = e.mesh!;
      expect(m.normals!.length).toBe(m.positions.length);
      for (let i = 0; i < m.normals!.length; i += 3) expect(Math.abs(Math.hypot(m.normals![i]!, m.normals![i + 1]!, m.normals![i + 2]!) - 1)).toBeLessThan(1e-4);
      const w = winding(e);
      expect(w.bons, e.id).toBe(w.total);
    }
  });
  it('espelhada: determinante negativo e ordem de triângulos invertida (índices trocados em relação à não espelhada)', () => {
    const a = store.project.furniture!.assets[assets[0]!.id]!;
    expect(mat4Det3(furnitureWorldTransform(store.project.elements['f2'] as never, a))).toBeLessThan(0);
    // sem espelho, o primeiro triângulo da face 0 sai (0,1,2) -> com espelho (0,2,1) na mesma numeração de vértices.
    const { store: s2, assets: as2, levelId: l2 } = projetoCom([cuboInput()]);
    colocar(s2, 'n', as2[0]!.id, l2);
    colocar(s2, 'e', as2[0]!.id, l2, { mirrored: true });
    const r = furnitureEntities(s2.project).entities;
    const n = r.find((x) => x.id === 'n')!.mesh!, e = r.find((x) => x.id === 'e')!.mesh!;
    // o primeiro triângulo da espelhada é o da outra, com X negado e os vértices 1 e 2 trocados
    const tri = (m: typeof n, k: number): number[] => [0, 1, 2].map((j) => m.positions[m.indices[k + j]! * 3]!);
    [-tri(n, 0)[0]!, -tri(n, 0)[2]!, -tri(n, 0)[1]!].forEach((x, i) => expect(tri(e, 0)[i]).toBeCloseTo(x, 6));
  });
  it('UVs: com sizeM = repetições * sizeM (metros); sem sizeM = projeção em caixa em metros de mundo', () => {
    const m = f1.mesh!;
    const g0 = m.groups[0]!;
    const v0 = m.indices[g0.start + 1]!; // vértice com u=2,v=0 da face 0 (madeira, sizeM [0.5, 0.25])
    expect(g0.materialId).toBe(assets[0]!.materials[0]!.id);
    expect(m.uvs!.length).toBe((m.positions.length / 3) * 2);
    expect(m.uvs![v0 * 2]).toBeCloseTo(2 * 0.5, 5);
    expect(m.uvs![v0 * 2 + 1]).toBeCloseTo(0, 5);
    const g1 = m.groups[1]!; // tecido, sem sizeM
    expect(g1.materialId).toBe(assets[0]!.materials[1]!.id);
    for (let t = g1.start; t < g1.start + g1.count; t++) {
      const v = m.indices[t]!;
      const [nx, ny, nz] = [Math.abs(m.normals![v * 3]!), Math.abs(m.normals![v * 3 + 1]!), Math.abs(m.normals![v * 3 + 2]!)];
      const [x, y, z] = [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!];
      const [u, w] = nx >= ny && nx >= nz ? [y, z] : ny >= nz ? [x, z] : [x, y];
      expect(m.uvs![v * 2]).toBeCloseTo(u, 5);
      expect(m.uvs![v * 2 + 1]).toBeCloseTo(w, 5);
    }
  });
  it('material por triângulo: grupos apontam para materiais do projeto; vértices duplicados entre materiais', () => {
    const m = f1.mesh!;
    expect(m.groups.map((g) => g.count)).toEqual([18, 18]);
    expect(f1.materialIds).toEqual(assets[0]!.materials.map((x) => x.id));
    for (const g of m.groups) expect(store.project.materials[g.materialId!]).toBeDefined();
    const a = new Set(m.indices.slice(0, 18)), b = new Set(m.indices.slice(18));
    for (const v of a) expect(b.has(v)).toBe(false);
    expect(m.positions.length / 3).toBe(24); // 4 vértices por face, nenhum compartilhado entre os dois materiais
  });
  it('sem NaN e hash estável; mover muda o hash', () => {
    expect(f1.mesh!.positions.every(Number.isFinite)).toBe(true);
    expect(furnitureEntities(store.project).entities[0]!.mesh!.hash).toBe(f1.mesh!.hash);
    expect(f1.mesh!.hash).not.toBe(f2.mesh!.hash);
  });
});

describe('móveis: contrato (validação, categoria, 1.2/1.3)', () => {
  const { store, assets, levelId } = projetoCom([cuboInput()]);
  colocar(store, 'a', assets[0]!.id, levelId, { x: 1 });
  colocar(store, 'b', assets[0]!.id, levelId, { x: 3, mirrored: true });
  const bruto = buildSceneContent(store.project, null);
  const v13 = contentForProtocol(bruto, 3);
  const v12 = contentForProtocol(bruto, 2);

  it('materiais do móvel: categoria válida, opacidade 1, sem textura, textures []', () => {
    const ids = new Set(assets[0]!.materials.map((m) => m.id));
    const ms = v13.materials.filter((m) => ids.has(m.id));
    expect(ms).toHaveLength(2);
    for (const m of ms) { expect(CATEGORIAS.has(m.category ?? '')).toBe(true); expect(m.opacity).toBe(1); }
    expect(v13.textures).toEqual([]);
    expect(v12.textures).toEqual([]);
  });
  it('opacidade 0 vinda do .skp sai 1 para o renderizador', () => {
    const p = structuredClone(store.project);
    p.materials[assets[0]!.materials[0]!.id]!.opacity = 0;
    const c = buildSceneContent(p, null);
    expect(c.materials.find((m) => m.id === assets[0]!.materials[0]!.id)!.opacity).toBe(1);
  });
  it('metal e vidro com PBR derivado', () => {
    const p = structuredClone(store.project);
    p.materials[assets[0]!.materials[0]!.id]!.category = 'metal';
    p.materials[assets[0]!.materials[1]!.id]!.category = 'glass';
    const c = contentForProtocol(buildSceneContent(p, null), 3);
    expect(c.materials.find((m) => m.id === assets[0]!.materials[0]!.id)!.metallic).toBe(1);
    expect(c.materials.find((m) => m.id === assets[0]!.materials[1]!.id)).toMatchObject({ transmission: 0.9, ior: 1.5 });
  });
  it('snapshot 1.3 passa em validateMessage e mantém normais e UVs', () => {
    const msg = { t: 'scene.snapshot', snapshot: { projectId: 'p', projectName: 'x', revision: 1, entities: v13.entities, materials: v13.materials, textures: [] } } as unknown as Message;
    expect(validateMessage(msg)).toBeNull();
    const f = v13.entities.filter((e) => e.kind === 'furniture');
    expect(f).toHaveLength(2);
    for (const e of f) { expect(e.mesh!.normals).toBeDefined(); expect(e.mesh!.uvs).toBeDefined(); }
  });
  it('quadro 1.2 não traz nenhuma palavra nova: sem normals, uvs, category, PBR; grupos sem material', () => {
    const json = JSON.stringify(v12);
    for (const w of ['"normals"', '"uvs"', '"category"', '"metallic"', '"transmission"', '"ior"', '"emissive"', 'meshDefs', 'meshRef', 'size_m', 'texture.need']) expect(json.includes(w), w).toBe(false);
    for (const e of v12.entities.filter((x) => x.kind === 'furniture')) for (const g of e.mesh!.groups) expect(g.materialId).toBeNull();
  });
  it('sem imagem nem data: em nenhum campo (1.2 e 1.3)', () => {
    for (const c of [v12, v13]) {
      expect(findImagePayload(c)).toBeNull();
      expect(JSON.stringify(c)).not.toMatch(/data:|base64|image\/png|image\/jpeg/);
    }
  });
});

describe('móveis: bloco pesado dividido', () => {
  const W = 450; // 202.500 vértices, ~403 mil triângulos
  const { store, assets, levelId } = projetoCom([grade(W)]);
  colocar(store, 'g', assets[0]!.id, levelId, { x: 5 });
  const t0 = performance.now();
  const r = furnitureEntities(store.project);
  const ms = performance.now() - t0;

  it('divide em várias entidades <id>#n, cada uma abaixo de 8 MiB de JSON e dentro dos tetos do protocolo', () => {
    expect(r.entities.length).toBeGreaterThan(1);
    expect(r.entities.map((e) => e.id)).toEqual(r.entities.map((_, i) => `g#${i + 1}`).sort());
    for (const e of r.entities) {
      expect(JSON.stringify(e).length, e.id).toBeLessThan(8 * 1024 * 1024);
      expect(JSON.stringify(e).length, e.id).toBeLessThan(FURNITURE_ENTITY_JSON_BUDGET + 1024 * 1024);
      expect(e.mesh!.normals!.length).toBeLessThanOrEqual(NORMALS_MAX_FLOATS);
      expect(e.mesh!.uvs!.length).toBeLessThanOrEqual(UVS_MAX_FLOATS);
      expect(e.mesh!.groups[0]!.materialId).toBe(assets[0]!.materials[0]!.id);
    }
    console.log(`[medida] grade ${W}x${W}: ${r.entities.length} entidades, maior ${(Math.max(...r.entities.map((e) => JSON.stringify(e).length)) / 1048576).toFixed(2)} MiB, ${(ms).toFixed(0)} ms`);
  });
  it('nenhum triângulo perdido nem repetido', () => {
    expect(r.triangles).toBe((W - 1) * (W - 1) * 2);
    expect(r.entities.reduce((s, e) => s + e.mesh!.indices.length / 3, 0)).toBe((W - 1) * (W - 1) * 2);
  });
  it('divisão por teto de vértices pequeno também preserva tudo', () => {
    const s = furnitureEntities(store.project, { maxVertices: 20_000 });
    expect(s.entities.length).toBeGreaterThan(10);
    expect(s.triangles).toBe(r.triangles);
    for (const e of s.entities) expect(e.mesh!.positions.length / 3).toBeLessThanOrEqual(20_000);
  });
  it('várias materiais pequenos ficam juntos numa entidade só (grupos)', () => {
    const { store: s2, assets: a2, levelId: l2 } = projetoCom([cuboInput()]);
    colocar(s2, 'c', a2[0]!.id, l2);
    const e = furnitureEntities(s2.project).entities;
    expect(e).toHaveLength(1);
    expect(e[0]!.id).toBe('c');
  });
});

describe('móveis: deltas', () => {
  const { store, assets, levelId } = projetoCom([cuboInput()]);
  for (let i = 0; i < 5; i++) colocar(store, `m${i}`, assets[0]!.id, levelId, { x: i * 2 });
  const lido = (): SceneContent => contentForProtocol(buildSceneContent(store.project, null), 3);
  const antes = lido();

  it('mover gera só entity.update da instância movida', () => {
    store.exec({ type: 'updateFurniture', id: 'm2', patch: { x: 10, y: 1 } });
    const ops = diffScene(antes, lido());
    expect(ops.map((o) => o.op)).toEqual(['entity.update']);
    expect((ops[0] as { entity: SceneEntity }).entity.id).toBe('m2');
  });
  it('girar gera só entity.update; sem mudança não gera nada', () => {
    const a = lido();
    store.exec({ type: 'updateFurniture', id: 'm1', patch: { rotation: 1 } });
    const ops = diffScene(a, lido());
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'entity.update' });
    expect(diffScene(lido(), lido())).toEqual([]);
  });
  it('adicionar gera entity.add e excluir gera entity.remove', () => {
    const a = lido();
    colocar(store, 'novo', assets[0]!.id, levelId, { x: 9 });
    expect(diffScene(a, lido()).map((o) => o.op)).toEqual(['entity.add']);
    const b = lido();
    store.exec({ type: 'deleteFurniture', id: 'novo' });
    const ops = diffScene(b, lido());
    expect(ops).toEqual([{ op: 'entity.remove', id: 'novo' }]);
  });
  it('trocar a cor do material gera material.update e entity.update não (a malha não muda)', () => {
    const a = lido();
    store.exec({ type: 'setFurnitureMaterial', assetId: assets[0]!.id, materialId: assets[0]!.materials[0]!.id, patch: { color: '#112233' } });
    const ops = diffScene(a, lido());
    expect(ops.map((o) => o.op)).toEqual(['material.update']);
  });
  it('cada delta repete só a malha da instância tocada (tamanho do delta << snapshot)', () => {
    const a = lido();
    store.exec({ type: 'updateFurniture', id: 'm0', patch: { x: 20 } });
    const ops = diffScene(a, lido());
    expect(JSON.stringify(ops).length).toBeLessThan(JSON.stringify(a).length / 3);
  });
});

describe('móveis: orçamento de triângulos', () => {
  it('função pura: ok, aviso acima de 2 milhões, crítico acima de 7 milhões, com texto ao usuário', () => {
    const { store, assets, levelId } = projetoCom([grade(40)]); // 3042 triângulos
    const tri = 39 * 39 * 2;
    for (let i = 0; i < 3; i++) colocar(store, `o${i}`, assets[0]!.id, levelId);
    let b = furnitureBudget(store.project);
    expect(b).toMatchObject({ instances: 3, triangles: tri * 3, level: 'ok', messages: [] });
    const clone = (n: number): Project => {
      const p = structuredClone(store.project);
      p.furniture!.assets[assets[0]!.id]!.defs[0]!.indexCount = Math.round((n / 3) / 3) * 3 * 3; // n/3 triângulos por instância
      return p;
    };
    b = furnitureBudget(clone(TRIANGULOS_AVISO + 3));
    expect(b.level).toBe('aviso');
    expect(b.triangles).toBeGreaterThan(TRIANGULOS_AVISO);
    expect(b.messages[0]).toMatch(/milhões de triângulos/);
    b = furnitureBudget(clone(TRIANGULOS_CRITICO + 3));
    expect(b.level).toBe('critico');
    expect(b.messages[0]).toMatch(/modo leve ou menos cópias/);
    // sem tocar nos limites exatos: abaixo continua ok
    expect(furnitureBudget(clone(TRIANGULOS_AVISO - 30)).level).toBe('ok');
  });
});

describe('móveis: texturas embutidas (Fase 2, desligadas)', () => {
  it('furnitureTexturesFor devolve hash, mime, bytes, tamanho e size_m sem repetir; useEmbeddedTexture false = nada', () => {
    const base = cuboInput();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    base.textures = [{ fileName: 'C:\\u\\madeira.png', mime: 'image/png', bytes: png, width: 64, height: 32 }];
    base.materials[0] = { ...base.materials[0]!, textureIndex: 0, sizeM: [0.5, 0.25] };
    base.materials[1] = { ...base.materials[1]!, textureIndex: 0, sizeM: [0.5, 0.25] };
    const { store, assets, levelId } = projetoCom([base]);
    expect(furnitureTexturesFor(store.project)).toEqual([]); // nenhum móvel colocado
    colocar(store, 't', assets[0]!.id, levelId);
    colocar(store, 't2', assets[0]!.id, levelId);
    const t = furnitureTexturesFor(store.project);
    expect(t).toHaveLength(1);
    expect(t[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t[0]).toMatchObject({ mime: 'image/png', width: 64, height: 32, size_m: [0.5, 0.25] });
    expect([...t[0]!.bytes]).toEqual([...png]);
    expect(t[0]!.materialIds).toHaveLength(2);
    store.exec({ type: 'setFurnitureMaterial', assetId: assets[0]!.id, materialId: assets[0]!.materials[0]!.id, patch: { useEmbeddedTexture: false } });
    expect(furnitureTexturesFor(store.project)[0]!.materialIds).toEqual([assets[0]!.materials[1]!.id]);
    // nada disso entra na cena hoje
    expect(buildSceneContent(store.project, null).textures).toEqual([]);
  });
});

// ---- snapshot em partes com 30 instâncias, pelo anfitrião real ----
describe('móveis: snapshot em partes (30 instâncias) e delta pelo anfitrião', () => {
  const TOKEN = 'f'.repeat(64);
  const realSetTimeout = globalThis.setTimeout;
  const flushAuth = async (): Promise<void> => { for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(1); await new Promise<void>((r) => realSetTimeout(r, 12)); } };
  const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(1); } };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('30 instâncias de um bloco médio: várias partes, nenhuma entidade partida, contagem fecha; mover = 1 op', async () => {
    const { store, assets, levelId } = projetoCom([grade(120)]); // ~14 mil vértices, ~28 mil triângulos por cópia
    for (let i = 0; i < 30; i++) colocar(store, `s${i}`, assets[0]!.id, levelId, { x: (i % 6) * 2, y: Math.floor(i / 6) * 2 });
    const subs = new Set<() => void>();
    const ports: HostPorts = {
      scene: { projectId: () => 'proj_f', read: () => buildSceneContent(store.project, null), subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); } },
      camera: { read: () => null, write: () => false, subscribe: () => () => undefined },
      overrides: { read: () => ({}), set: () => undefined, clear: () => undefined, subscribe: () => () => undefined },
    };
    const entry: PluginEntry = { key: 'renderer', label: 'Renderizador', endpoint: { host: '127.0.0.1', port: 47800 }, enabled: false, grants: [], suggested: ['scene.read'], expectedKind: 'renderer', builtin: true };
    const wire: string[] = [];
    const plugins: TestPlugin[] = [];
    const host = new PluginHost({
      ports, store: { get: () => null, set: () => undefined }, builtins: [entry], heartbeatMs: 1000, backoffMs: [100], insecureAllowUnauthenticated: false,
      snapshotChunkChars: 2 * 1024 * 1024,
      connect: async () => {
        const [a, b] = createMemoryPair();
        const o1 = a.send.bind(a); a.send = (f) => { wire.push(f); o1(f); };
        const p = new TestPlugin(b, { heartbeatMs: 1000, token: TOKEN, protocolMax: '1.3' });
        plugins.push(p); p.hello();
        return a;
      },
    });
    host.setToken('renderer', TOKEN);
    host.enable('renderer', ['scene.read', 'events.subscribe', 'camera.read'] as Capability[]);
    await flushAuth();
    const p = plugins[0]!;
    expect(p.partsReceived).toBeGreaterThan(3);
    expect(p.snapshot!.entities).toHaveLength(30);
    expect(new Set(p.snapshot!.entities.map((e) => e.id)).size).toBe(30);
    // nenhuma entidade partida entre partes e nenhum quadro passa de ~2 MiB + uma entidade
    const parts = wire.map((f) => JSON.parse(f) as { t: string; entities?: unknown[] }).filter((m) => m.t === 'scene.snapshot.part');
    expect(parts.reduce((s, m) => s + (m.entities?.length ?? 0), 0)).toBe(30);
    // mover uma cópia: um delta com uma operação
    const antes = wire.length;
    store.exec({ type: 'updateFurniture', id: 's7', patch: { x: 50 } });
    subs.forEach((f) => f());
    await flush();
    const deltas = wire.slice(antes).map((f) => JSON.parse(f) as { t: string; delta?: { ops: Array<{ op: string; entity?: { id: string } }> } }).filter((m) => m.t === 'scene.delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.delta!.ops.map((o) => [o.op, o.entity?.id])).toEqual([['entity.update', 's7']]);
    expect(p.snapshot!.revision).toBeGreaterThan(0);
  });
});

// ---- blocos reais do usuário (somente leitura) ----
const BLOCOS = 'E:/PROGRAMAS/Clone Enscape/sket blocos';
const ARQUIVOS = ['Group_229.skp', 'sofa.skp', 'cama+azul.skp', 'sofa+(2).skp'];
const temBlocos = ARQUIVOS.every((a) => existsSync(`${BLOCOS}/${a}`));

describe.skipIf(!temBlocos)('móveis: blocos reais do usuário (somente leitura)', () => {
  for (const nome of ARQUIVOS) {
    it(`${nome}: 1, 5 e 20 cópias`, async () => {
      const { importSkp } = await import('@hestia/io/src/furniture/skp.ts');
      const b = readFileSync(`${BLOCOS}/${nome}`);
      const model = await importSkp({ name: nome, bytes: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) });
      const asset = buildFurnitureAsset({ ...model, instances: model.instances, stats: { sourceBytes: b.byteLength } });
      const p = createEmptyProject();
      const store = new ProjectStore(p);
      store.exec({ type: 'addFurnitureAsset', asset });
      const levelId = p.levels[0]!.id;
      const linhas: string[] = [];
      let n = 0;
      for (const copias of [1, 5, 20]) {
        while (n < copias) { colocar(store, `b${n}`, asset.id, levelId, { x: (n % 5) * 3, y: Math.floor(n / 5) * 3, rotation: n * 0.4, mirrored: n % 3 === 2 }); n += 1; }
        const t0 = performance.now();
        const c = contentForProtocol(buildSceneContent(store.project, null), 3);
        const ms = performance.now() - t0;
        const fur = c.entities.filter((e) => e.kind === 'furniture');
        const tam = fur.map((e) => JSON.stringify(e).length);
        for (const e of fur) {
          expect(JSON.stringify(e).length).toBeLessThan(8 * 1024 * 1024);
          expect(e.mesh!.normals).toBeDefined();
          expect(e.mesh!.uvs).toBeDefined();
          for (const g of e.mesh!.groups) expect(g.materialId === null || !!store.project.materials[g.materialId]).toBe(true);
        }
        const tri = fur.reduce((s, e) => s + e.mesh!.indices.length / 3, 0);
        expect(tri).toBe(furnitureBudget(store.project).triangles);
        linhas.push(`${copias} cópia(s): ${fur.length} entidades, ${tri} triângulos, JSON ${(tam.reduce((s, x) => s + x, 0) / 1048576).toFixed(2)} MiB (maior ${(Math.max(...tam) / 1048576).toFixed(2)} MiB), ${ms.toFixed(0)} ms`);
      }
      console.log(`[medida] ${nome} (${asset.stats.vertices} vértices, ${asset.stats.triangles} triângulos, ${asset.parts?.length ?? 0} peças, ${asset.materials.length} materiais): ${linhas.join(' | ')}`);
    }, 300_000);
  }
});

describe('móveis: grupos de dois lados (doubleSided) até o renderizador', () => {
  /** Cubo com a madeira (faces 0 a 2) de dois lados e o tecido de um lado. */
  const comLados = (): FurnitureImportInput => {
    const i = cuboInput();
    i.defs[0]!.groups = [{ start: 0, count: 18, materialIndex: 0, doubleSided: true }, { start: 18, count: 18, materialIndex: 1 }];
    return i;
  };
  const { store, assets, levelId } = projetoCom([comLados()]);
  colocar(store, 'n', assets[0]!.id, levelId, { x: 0 });
  colocar(store, 'e', assets[0]!.id, levelId, { x: 5, mirrored: true, rotation: 0.4 });
  const madeira = assets[0]!.materials[0]!.id;
  const tecido = assets[0]!.materials[1]!.id;

  it('o asset guarda doubleSided só nos grupos que o têm', () => {
    expect(assets[0]!.defs[0]!.groups.map((g) => g.doubleSided ?? false)).toEqual([true, false]);
  });
  it('a malha exportada separa os grupos de dois lados e marca doubleSided; nenhum triângulo se perde (normal e espelhada)', () => {
    const { entities, triangles } = furnitureEntities(store.project);
    expect(triangles).toBe(24);
    for (const e of entities) {
      const gs = e.mesh!.groups;
      const dois = gs.filter((g) => g.doubleSided === true);
      expect(dois.map((g) => g.materialId), e.id).toEqual([madeira]);
      expect(dois.reduce((s, g) => s + g.count, 0) / 3).toBe(6);
      expect(gs.filter((g) => !g.doubleSided).map((g) => g.materialId), e.id).toEqual([tecido]);
      expect(gs.reduce((s, g) => s + g.count, 0)).toBe(e.mesh!.indices.length);
    }
  });
  it('mesmo material de um lado e de dois lados no mesmo bloco: grupos distintos (não se fundem)', () => {
    const inp = cuboInput();
    inp.defs[0]!.groups = [{ start: 0, count: 18, materialIndex: 0, doubleSided: true }, { start: 18, count: 18, materialIndex: 0 }];
    const { store: s2, assets: a2, levelId: l2 } = projetoCom([inp]);
    colocar(s2, 'x', a2[0]!.id, l2);
    const g = furnitureEntities(s2.project).entities[0]!.mesh!.groups;
    expect(g.length).toBe(2);
    expect(g.map((x) => x.doubleSided === true).sort()).toEqual([false, true]);
    expect(new Set(g.map((x) => x.materialId)).size).toBe(1);
  });
  it('o hash da malha muda com doubleSided', () => {
    const a = furnitureEntities(store.project).entities.find((e) => e.id === 'n')!.mesh!.hash;
    const { store: s3, assets: a3, levelId: l3 } = projetoCom([cuboInput()]);
    colocar(s3, 'n', a3[0]!.id, l3, { x: 0 });
    const b = furnitureEntities(s3.project).entities[0]!.mesh!.hash;
    expect(a).not.toBe(b);
  });
  it('protocolo 1.3 leva doubleSided; 1.0 a 1.2 saem exatamente como antes (sem o campo)', () => {
    const bruto = buildSceneContent(store.project, null);
    const grupos = (c: SceneContent) => c.entities.filter((e) => e.kind === 'furniture').flatMap((e) => e.mesh!.groups);
    expect(grupos(contentForProtocol(bruto, 3)).some((g) => g.doubleSided === true)).toBe(true);
    expect(grupos(contentForProtocol(bruto, 2)).some((g) => 'doubleSided' in g)).toBe(false);
  });
});
