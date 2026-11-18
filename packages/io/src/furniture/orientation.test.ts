import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { importGltf } from './gltf.ts';
import { importObj } from './obj.ts';
import { importSkp } from './skp.ts';
import { markDoubleSided, trianglesNeedingBothSides } from './orientation.ts';
import { simplifyMesh } from './simplify.ts';
import type { ImportedMeshDef } from './types.ts';

/** Cubo [0,1]^3 com 8 vertices soldados; `fora` = triangulos anti-horarios vistos de fora. */
function cubo(fora: boolean, dx = 0): { pos: number[]; idx: number[] } {
  const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const pos = P.flatMap((p) => [p[0]! + dx, p[1]!, p[2]!]);
  // faces com quatro cantos anti-horarios vistos de fora
  const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const idx: number[] = [];
  for (const f of F) {
    const q = fora ? f : [...f].reverse();
    idx.push(q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!);
  }
  return { pos, idx };
}

function def(pos: number[], idx: number[], extra: Partial<ImportedMeshDef> = {}): ImportedMeshDef {
  return {
    id: 'd', name: 'd', positions: new Float32Array(pos), normals: new Float32Array(pos.length), uvs: new Float32Array(0),
    indices: new Uint32Array(idx), groups: [{ start: 0, count: idx.length, materialIndex: 0 }], ...extra,
  };
}

describe('orientacao das faces (obj, dae, fbx)', () => {
  it('malha fechada com as faces para fora: nenhum triangulo precisa dos dois lados', () => {
    const c = cubo(true);
    expect(trianglesNeedingBothSides(new Float32Array(c.pos), new Uint32Array(c.idx), 0, c.idx.length).some(Boolean)).toBe(false);
    const d = def(c.pos, c.idx);
    expect(markDoubleSided(d)).toBe(0);
    expect(d.groups).toEqual([{ start: 0, count: 36, materialIndex: 0 }]);
  });

  it('malha fechada de dentro para fora: as faces vistas de fora seriam descartadas, entao precisa dos dois lados', () => {
    const c = cubo(false);
    expect(trianglesNeedingBothSides(new Float32Array(c.pos), new Uint32Array(c.idx), 0, c.idx.length).every(Boolean)).toBe(true);
  });

  it('chapa aberta (tecido, folha, tampo de uma face): dois lados', () => {
    const d = def([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], [0, 1, 2, 0, 2, 3]);
    expect(markDoubleSided(d)).toBe(2);
    expect(d.groups).toEqual([{ start: 0, count: 6, materialIndex: 0, doubleSided: true }]);
  });

  it('vertices duplicados por normal/UV (nao compartilhados) continuam sendo reconhecidos como fechados', () => {
    const c = cubo(true);
    // um vertice proprio por canto de triangulo
    const pos: number[] = [];
    const idx: number[] = [];
    for (const i of c.idx) { idx.push(pos.length / 3); pos.push(c.pos[i * 3]!, c.pos[i * 3 + 1]!, c.pos[i * 3 + 2]!); }
    expect(trianglesNeedingBothSides(new Float32Array(pos), new Uint32Array(idx), 0, idx.length).some(Boolean)).toBe(false);
  });

  it('cubo fechado + chapa solta no mesmo material: grupo de um lado (cubo) e grupo de dois lados (chapa), nenhum triangulo some', () => {
    const c = cubo(true);
    const base = c.pos.length / 3;
    const pos = [...c.pos, 3, 0, 0, 4, 0, 0, 4, 1, 0, 3, 1, 0];
    const idx = [...c.idx, base, base + 1, base + 2, base, base + 2, base + 3];
    const d = def(pos, idx);
    expect(markDoubleSided(d)).toBe(2);
    expect(d.indices.length).toBe(idx.length);
    expect(d.groups).toEqual([
      { start: 0, count: 36, materialIndex: 0 },
      { start: 36, count: 6, materialIndex: 0, doubleSided: true },
    ]);
    // o mesmo conjunto de triangulos
    const tris = (a: ArrayLike<number>) => {
      const o: string[] = [];
      for (let i = 0; i < a.length; i += 3) o.push([a[i], a[i + 1], a[i + 2]].join(','));
      return o.sort();
    };
    expect(tris(d.indices)).toEqual(tris(idx));
  });

  it('grupos que o arquivo ja classificou (glTF, skp) nao sao tocados', () => {
    const c = cubo(false);
    const d = def(c.pos, c.idx, { groups: [{ start: 0, count: 36, materialIndex: 0, doubleSided: false }] });
    expect(markDoubleSided(d)).toBe(0);
    expect(d.groups).toEqual([{ start: 0, count: 36, materialIndex: 0, doubleSided: false }]);
  });

  it('a simplificacao mantem doubleSided nos grupos', () => {
    const n = 24;
    const pos: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i / n, j / n, 0);
    const idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, cc = a + n + 1, dd = cc + 1;
      idx.push(a, b, dd, a, dd, cc);
    }
    const d = def(pos, idx, { groups: [{ start: 0, count: idx.length, materialIndex: 0, doubleSided: true }] });
    const s = simplifyMesh(d, 100);
    expect(s.indices.length / 3).toBeLessThan(idx.length / 3);
    expect(s.groups.length).toBeGreaterThan(0);
    expect(s.groups.every((g) => g.doubleSided === true)).toBe(true);
  });
});

/** glTF de um triangulo com dados embutidos (data URI), um material com ou sem `doubleSided`. */
function gltfTriangulo(materialExtra: Record<string, unknown>): Uint8Array {
  const buf = new Uint8Array(44);
  buf.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), 0);
  buf.set(new Uint8Array(new Uint16Array([0, 1, 2, 0]).buffer), 36);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'M', pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, ...materialExtra }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: 44, uri: `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}` }],
  };
  return new TextEncoder().encode(JSON.stringify(json));
}

describe('doubleSided na importacao', () => {
  it('glTF: `doubleSided` do material vai para o grupo; sem a chave o padrao do glTF e um lado so', async () => {
    const um = await importGltf({ name: 't.gltf', bytes: gltfTriangulo({}) });
    expect(um.defs[0]!.groups.map((g) => g.doubleSided)).toEqual([false]);
    const dois = await importGltf({ name: 't.gltf', bytes: gltfTriangulo({ doubleSided: true }) });
    expect(dois.defs[0]!.groups.map((g) => g.doubleSided)).toEqual([true]);
  });

  it('obj: chapa solta (um quadrado) sai de dois lados; cubo fechado fica de um lado', async () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    const chapa = await importObj({ name: 'chapa.obj', bytes: enc('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n') });
    expect(chapa.defs[0]!.groups.every((g) => g.doubleSided === true)).toBe(true);
    const c = cubo(true);
    const v = Array.from({ length: c.pos.length / 3 }, (_, i) => `v ${c.pos[i * 3]} ${c.pos[i * 3 + 1]} ${c.pos[i * 3 + 2]}`).join('\n');
    const f = Array.from({ length: c.idx.length / 3 }, (_, i) => `f ${c.idx[i * 3]! + 1} ${c.idx[i * 3 + 1]! + 1} ${c.idx[i * 3 + 2]! + 1}`).join('\n');
    const fechado = await importObj({ name: 'cubo.obj', bytes: enc(`${v}\n${f}\n`) });
    expect(fechado.defs[0]!.groups.some((g) => g.doubleSided === true)).toBe(false);
    expect(fechado.stats.triangles).toBe(12);
  });
});

const BLOCOS = 'E:/PROGRAMAS/Clone Enscape/sket blocos';
describe.skipIf(!existsSync(BLOCOS))('skp real: faces de dois lados', () => {
  // Contagem medida no OpenSKP: frente e verso do mesmo material saem como UM lado so, marcado `doubleSided`.
  const esperado: Record<string, { minDs: number }> = { 'sofa.skp': { minDs: 0.1 }, 'Group_229.skp': { minDs: 0.9 }, 'cama+azul.skp': { minDs: 0.3 }, 'sofa+(2).skp': { minDs: 0.8 } };
  for (const [nome, e] of Object.entries(esperado)) {
    it(`${nome}: a maior parte dos triangulos esta em grupos doubleSided e nenhum triangulo se perde`, async () => {
      const b = readFileSync(`${BLOCOS}/${nome}`);
      const m = await importSkp({ name: nome, bytes: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) });
      let ds = 0, tot = 0, cobertos = 0;
      for (const d of m.defs) {
        for (const g of d.groups) { tot += g.count / 3; cobertos += g.count; if (g.doubleSided) ds += g.count / 3; }
        expect(cobertos).toBeGreaterThan(0);
        expect(d.groups.reduce((s, g) => s + g.count, 0)).toBe(d.indices.length);
        cobertos = 0;
      }
      expect(ds / tot).toBeGreaterThan(e.minDs);
    }, 180_000);
  }
});
