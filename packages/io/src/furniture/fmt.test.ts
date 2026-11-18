import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importDae } from './dae.ts';
import { importFurnitureFile } from './readAny.ts';
import { readGltf, importGltf } from './gltf.ts';
import { importObj, importObjWith } from './obj.ts';
import { readZip } from './zip.ts';
import { emptyContext, ImportError, type FileMap } from './fmtCommon.ts';
import type { ImportedModel } from './types.ts';

const POLY = 'E:/tmp/blocos-teste/polyhaven';
const KENNEY = 'E:/tmp/blocos-teste/skp-livres/opengameart-kenney-furniture/kenney_furniturePack.zip';

/** Carrega uma pasta inteira em mapa de arquivos (caminho relativo com `/`). */
function folderToFiles(dir: string): FileMap {
  const out: FileMap = new Map();
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(full).isDirectory()) walk(full, r);
      else out.set(r, new Uint8Array(readFileSync(full)));
    }
  };
  walk(dir, '');
  return out;
}

/** Extensoes da caixa (bbox) de todas as instancias, em metros, Z para cima. */
function worldBounds(m: ImportedModel): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const inst of m.instances) {
    const def = m.defs.find((d) => d.id === inst.defId)!;
    const t = inst.transform;
    for (let i = 0; i < def.positions.length; i += 3) {
      const x = def.positions[i]!, y = def.positions[i + 1]!, z = def.positions[i + 2]!;
      const wx = t[0]! * x + t[4]! * y + t[8]! * z + t[12]!;
      const wy = t[1]! * x + t[5]! * y + t[9]! * z + t[13]!;
      const wz = t[2]! * x + t[6]! * y + t[10]! * z + t[14]!;
      const w = [wx, wy, wz];
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, w[k]!);
        max[k] = Math.max(max[k]!, w[k]!);
      }
    }
  }
  return { min, max };
}

/** Monta um GLB minimo: um triangulo (0,0,0)-(1,0,0)-(0,1,0) em Y para cima, usado em duas instancias. */
function makeTriangleGlb(extra: Record<string, unknown> = {}): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = new Uint16Array([0, 1, 2, 0]); // 3 indices + padding
  const bin = new Uint8Array(36 + 8);
  bin.set(new Uint8Array(pos.buffer), 0);
  bin.set(new Uint8Array(idx.buffer), 36);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { mesh: 0, translation: [2, 0, 0] },
      { mesh: 0, translation: [0, 3, 0] },
    ],
    meshes: [{ name: 'tri', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: bin.length }],
    materials: [{ name: 'Madeira carvalho', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.3, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.7 } }],
    ...extra,
  };
  return packGlb(json, bin);
}

function packGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (jsonBytes.length + 3) & ~3;
  const jb = new Uint8Array(jpad).fill(0x20);
  jb.set(jsonBytes, 0);
  const bpad = (bin.length + 3) & ~3;
  const bb = new Uint8Array(bpad);
  bb.set(bin, 0);
  const total = 12 + 8 + jb.length + 8 + bb.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  const binOff = 20 + jb.length;
  dv.setUint32(binOff, bb.length, true);
  dv.setUint32(binOff + 4, 0x004e4942, true);
  out.set(bb, binOff + 8);
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

describe('glTF / GLB sintetico', () => {
  it('le GLB com instancias de no e converte Y para Z', async () => {
    const m = await importGltf({ name: 'tri.glb', bytes: makeTriangleGlb() });
    expect(m.sourceFormat).toBe('glb');
    expect(m.defs).toHaveLength(1);
    expect(m.instances).toHaveLength(2);
    const d = m.defs[0]!;
    // (0,1,0) em Y para cima vira (0,0,1) em Z para cima
    expect(Array.from(d.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    // normais recalculadas (faltavam): unitarias
    for (let i = 0; i < d.normals.length; i += 3) {
      expect(Math.hypot(d.normals[i]!, d.normals[i + 1]!, d.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
    // translacoes Y para cima -> Z para cima: (0,3,0) vira (0,0,3)
    expect(m.instances[0]!.transform[12]).toBeCloseTo(2);
    expect(m.instances[1]!.transform[14]).toBeCloseTo(3);
    expect(m.materials[0]!.category).toBe('wood');
    expect(m.materials[0]!.color[0]).toBeCloseTo(0.5);
    expect(m.materials[0]!.roughness).toBeCloseTo(0.7);
    expect(m.stats.triangles).toBe(1);
  });

  it('aplica a escala do usuario ao mundo', async () => {
    const m = await importGltf({ name: 'tri.glb', bytes: makeTriangleGlb() }, { scale: 2 });
    expect(m.instances[0]!.transform[12]).toBeCloseTo(4);
  });

  it('recusa Draco com mensagem em portugues', async () => {
    const glb = makeTriangleGlb({ extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] });
    await expect(importGltf({ name: 'x.glb', bytes: glb })).rejects.toThrow(/Draco/);
  });

  it('recusa meshopt', async () => {
    const glb = makeTriangleGlb({ extensionsRequired: ['EXT_meshopt_compression'] });
    await expect(importGltf({ name: 'x.glb', bytes: glb })).rejects.toThrow(/meshopt/);
  });

  it('GLB truncado vira erro claro', async () => {
    const glb = makeTriangleGlb();
    const cut = glb.subarray(0, glb.length - 40);
    await expect(importGltf({ name: 'x.glb', bytes: cut })).rejects.toThrow(ImportError);
    await expect(importGltf({ name: 'x.glb', bytes: glb.subarray(0, 10) })).rejects.toThrow(/truncado|pequeno/);
  });

  it('bin externo ausente vira erro claro', async () => {
    const json = {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      buffers: [{ uri: 'falta.bin', byteLength: 36 }],
    };
    await expect(readGltf({ name: 'x.gltf', bytes: enc(JSON.stringify(json)) }, undefined, emptyContext())).rejects.toThrow(/falta\.bin/);
  });
});

describe('COLLADA sintetico', () => {
  const dae = (unit: string, up: string, translate: string) => `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="centimeter" meter="${unit}"/><up_axis>${up}</up_axis></asset>
  <library_effects>
    <effect id="ef1"><profile_COMMON><technique sid="c"><phong><diffuse><color>0.2 0.4 0.6 1</color></diffuse></phong></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials><material id="mat1" name="Tecido azul"><instance_effect url="#ef1"/></material></library_materials>
  <library_geometries>
    <geometry id="geo1" name="tri">
      <mesh>
        <source id="pos"><float_array id="pa" count="9">0 0 0 100 0 0 0 100 0</float_array>
          <technique_common><accessor source="#pa" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
        <vertices id="vtx"><input semantic="POSITION" source="#pos"/></vertices>
        <triangles material="M" count="1"><input semantic="VERTEX" source="#vtx" offset="0"/><p>0 1 2</p></triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="vs"><node id="n1" name="bloco"><translate>${translate}</translate>
      <instance_geometry url="#geo1"><bind_material><technique_common><instance_material symbol="M" target="#mat1"/></technique_common></bind_material></instance_geometry>
    </node></visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#vs"/></scene>
</COLLADA>`;

  it('aplica unidade (cm), up Y e translacao; material por nome', async () => {
    const m = await importDae({ name: 'bloco.dae', bytes: enc(dae('0.01', 'Y_UP', '100 0 0')) });
    expect(m.sourceFormat).toBe('dae');
    const d = m.defs[0]!;
    // 100 cm = 1 m; Y para cima -> Z
    expect(Array.from(d.positions).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(m.instances[0]!.transform[12]).toBeCloseTo(1);
    expect(m.materials[0]!.name).toBe('Tecido azul');
    expect(m.materials[0]!.category).toBe('fabric');
    expect(m.materials[0]!.color[2]).toBeCloseTo(0.6);
  });

  it('Z_UP nao converte os eixos', async () => {
    const m = await importDae({ name: 'bloco.dae', bytes: enc(dae('1', 'Z_UP', '0 0 0')) });
    // unit meter=1: a geometria de 100 unidades continua 100 (sem conversao de eixo)
    expect(Array.from(m.defs[0]!.positions)).toEqual([0, 0, 0, 100, 0, 0, 0, 100, 0]);
  });

  it('XML truncado vira erro claro', async () => {
    const text = dae('1', 'Y_UP', '0 0 0');
    await expect(importDae({ name: 'x.dae', bytes: enc(text.slice(0, text.length - 60)) })).rejects.toThrow(/XML|COLLADA|truncad/);
  });
});

describe('OBJ sintetico', () => {
  const obj = `# teste\nmtllib t.mtl\no bloco\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nusemtl Madeira\nf 1/1/1 2/2/1 3/3/1\n`;
  const mtl = `newmtl Madeira\nKd 0.6 0.4 0.2\nd 0.5\nNs 500\n`;

  it('converte Y para cima por padrao e aplica MTL', async () => {
    const m = await importObj({ name: 'bloco.obj', bytes: enc(obj) });
    expect(m.warnings.some((w) => /metros/.test(w))).toBe(true);
    expect(Array.from(m.defs[0]!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(m.defs[0]!.uvs.length).toBe(6);
    expect(m.materials[0]!.name).toBe('Madeira');
    expect(m.materials[0]!.category).toBe('wood');
  });

  it('up z nao converte', async () => {
    const f = importObjWith({ up: 'z' }, { files: new Map([['t.mtl', enc(mtl)]]), baseDir: '' });
    const m = await f({ name: 'bloco.obj', bytes: enc(obj) });
    expect(Array.from(m.defs[0]!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(m.materials[0]!.color[0]).toBeCloseTo(0.6);
    expect(m.materials[0]!.opacity).toBeCloseTo(0.5);
  });

  it('indice fora do intervalo vira erro', async () => {
    await expect(importObj({ name: 'x.obj', bytes: enc('v 0 0 0\nf 1 2 3\n') })).rejects.toThrow(/fora do intervalo/);
  });
});

describe('ZIP e leitura por extensao', () => {
  it('recusa caminho com .. (zip-slip)', async () => {
    const zip = zipSync({ '../evil.obj': enc('v 0 0 0\n'), 'ok.obj': enc('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n') });
    await expect(readZip({ name: 'mau.zip', bytes: zip }, undefined)).rejects.toThrow(/inseguro/);
  });

  it('acha o GLB dentro do ZIP com o .bin vizinho', async () => {
    const glb = makeTriangleGlb();
    // zip com um glTF (JSON) e um .bin vizinho em subpasta
    const json = {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      buffers: [{ uri: 'dados/peca.bin', byteLength: 44 }],
    };
    const bin = new Uint8Array(44);
    bin.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), 0);
    bin.set(new Uint8Array(new Uint16Array([0, 1, 2]).buffer), 36);
    void glb;
    const zip = zipSync({ 'modelo/peca.gltf': enc(JSON.stringify(json)), 'modelo/dados/peca.bin': bin });
    const m = await importFurnitureFile({ name: 'peca.zip', bytes: zip });
    expect(m.sourceFormat).toBe('zip');
    expect(m.defs[0]!.indices.length).toBe(3);
    expect(m.warnings.some((w) => /peca\.gltf/.test(w))).toBe(true);
  });

  it('recusa arquivo acima de 50 MB antes de ler', async () => {
    await expect(importFurnitureFile({ name: 'grande.obj', bytes: new Uint8Array(51 * 1024 * 1024) })).rejects.toThrow(/50 MB/);
  });

  it('extensao desconhecida vira erro em portugues', async () => {
    await expect(importFurnitureFile({ name: 'x.skp', bytes: enc('x') })).rejects.toThrow(/Formato não suportado/);
  });
});

describe('modelos reais (pulados se a pasta nao existir)', () => {
  const polyChair = join(POLY, 'ArmChair_01');
  it.skipIf(!existsSync(polyChair))('Poly Haven ArmChair_01 (glTF + bin + JPG): metros, Z para cima, texturas', async () => {
    const files = folderToFiles(polyChair);
    const bytes = files.get('ArmChair_01_1k.gltf')!;
    const m = await readGltf({ name: 'ArmChair_01_1k.gltf', bytes }, undefined, { files, baseDir: '' });
    expect(m.sourceFormat).toBe('gltf');
    const b = worldBounds(m);
    const size = b.max.map((v, i) => v - b.min[i]!);
    // cadeira: ~0,6 a 1,2 m de largura/profundidade e ~0,6 a 1,4 m de altura (Z)
    expect(size[2]!).toBeGreaterThan(0.5);
    expect(size[2]!).toBeLessThan(1.5);
    expect(Math.max(size[0]!, size[1]!)).toBeLessThan(1.5);
    expect(m.textures.length).toBeGreaterThan(0);
    for (const t of m.textures) {
      expect(['image/png', 'image/jpeg']).toContain(t.mime);
      expect(t.fileName).not.toMatch(/[\\/]/);
    }
    expect(m.stats.triangles).toBeGreaterThan(100);
    // cada malha uma definicao: nenhuma definicao repetida
    expect(new Set(m.defs.map((d) => d.id)).size).toBe(m.defs.length);
    console.info('[poly ArmChair]', JSON.stringify({ size, tris: m.stats.triangles, defs: m.defs.length, inst: m.instances.length, tex: m.textures.map((t) => t.fileName), mats: m.materials.map((x) => x.name), ms: m.stats.ms }));
  }, 120000);

  it.skipIf(!existsSync(POLY))('todos os glTF do Poly Haven: medidas em metros, Z para cima, avisos', async () => {
    const rows: string[] = [];
    for (const dir of readdirSync(POLY)) {
      const d = join(POLY, dir);
      if (!statSync(d).isDirectory()) continue;
      const gltf = readdirSync(d).find((f) => /\.(gltf|glb)$/i.test(f));
      if (!gltf) continue;
      const files = folderToFiles(d);
      const m = await readGltf({ name: gltf, bytes: files.get(gltf)! }, undefined, { files, baseDir: '' });
      const b = worldBounds(m);
      const s = b.max.map((v, i) => v - b.min[i]!);
      rows.push(`${dir}: ${s.map((v) => v.toFixed(2)).join(' x ')} m; tris ${m.stats.triangles}; defs ${m.defs.length}; inst ${m.instances.length}; tex ${m.textures.length}; avisos ${m.warnings.length}`);
      expect(Math.max(...s)).toBeGreaterThan(0.05);
      expect(Math.max(...s)).toBeLessThan(15);
      expect(m.instances.length).toBeGreaterThan(0);
    }
    console.info('[poly todos]\n' + rows.join('\n'));
    expect(rows.length).toBeGreaterThan(3);
  }, 120000);

  it.skipIf(!existsSync(KENNEY))('pacote Kenney completo (987 entradas) e recusado pelo limite de 500 arquivos', async () => {
    const bytes = new Uint8Array(readFileSync(KENNEY));
    await expect(readZip({ name: 'kenney.zip', bytes }, undefined)).rejects.toThrow(/500 arquivos/);
  }, 120000);

  it.skipIf(!existsSync(KENNEY))('Kenney bathtub: OBJ + MTL reais em ZIP pequeno e FBX ASCII real', async () => {
    const { unzipSync, zipSync } = await import('fflate');
    const all = unzipSync(new Uint8Array(readFileSync(KENNEY)), { filter: (f) => /^Models\/bathtub\.(obj|mtl|fbx)$/.test(f.name) });
    // OBJ dentro de um ZIP pequeno (so os dois arquivos do modelo)
    const zip = zipSync({ 'bathtub/bathtub.obj': all['Models/bathtub.obj']!, 'bathtub/bathtub.mtl': all['Models/bathtub.mtl']! });
    const m = await readZip({ name: 'bathtub.zip', bytes: zip }, undefined);
    expect(m.sourceFormat).toBe('zip');
    expect(m.defs.length).toBeGreaterThan(0);
    const b = worldBounds(m);
    const size = b.max.map((v, i) => v - b.min[i]!);
    // Medido no arquivo bruto: x -11,9..0; y 0..4,2 (altura); z 0..5,6. Sem unidade declarada: o leitor presume metros
    // (aviso), entao a banheira sai com 11,9 m. Escala do Kenney nao e metrica: o usuario ajusta com `scale`.
    expect(size[0]).toBeCloseTo(11.9, 1);
    expect(size[1]).toBeCloseTo(5.6, 1);
    expect(size[2]).toBeCloseTo(4.2, 1);
    expect(m.warnings.some((w) => /presumida em metros/.test(w))).toBe(true);
    expect(m.materials.some((x) => x.name === 'metalLight')).toBe(true);
    console.info('[kenney obj]', JSON.stringify({ size: size.map((v) => +v.toFixed(3)), tris: m.stats.triangles, mats: m.materials.map((x) => `${x.name}:${x.category ?? '-'}`), ms: m.stats.ms, avisos: m.warnings }));

    // FBX ASCII real (7.3) do mesmo pacote
    // LIMITACAO medida: o FBXLoader do three 0.180 quebra (parseUVs) no FBX ASCII 7.3 deste pacote. O leitor devolve
    // erro claro em portugues em vez de um modelo errado.
    await expect(importFurnitureFile({ name: 'bathtub.fbx', bytes: all['Models/bathtub.fbx']! })).rejects.toThrow(/Não foi possível ler este FBX/);
  }, 120000);
});

describe('glTF: vidro', () => {
  const mat = (m: Record<string, unknown>) => makeTriangleGlb({ materials: [m] });
  it('transmissao 1 deixa 35% de opacidade (1 - 0,65); transmissao 0,5 deixa 67,5%', async () => {
    const t1 = await importGltf({ name: 'v.glb', bytes: mat({ name: 'Vidro', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } }) });
    expect(t1.materials[0]!.opacity).toBeCloseTo(0.35, 6);
    const t2 = await importGltf({ name: 'v.glb', bytes: mat({ name: 'Vidro', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, extensions: { KHR_materials_transmission: { transmissionFactor: 0.5 } } }) });
    expect(t2.materials[0]!.opacity).toBeCloseTo(0.675, 6);
  });
  it('material "glass" opaco no arquivo vira 35% com aviso; "Madeira" continua opaco', async () => {
    const g = await importGltf({ name: 'v.glb', bytes: mat({ name: 'glass', pbrMetallicRoughness: { baseColorFactor: [0.7, 0.8, 0.8, 1] } }) });
    expect(g.materials[0]!.opacity).toBeCloseTo(0.35, 6);
    expect(g.warnings.some((w) => /vidro opaco/.test(w))).toBe(true);
    const w = await importGltf({ name: 'm.glb', bytes: makeTriangleGlb() });
    expect(w.materials[0]!.opacity).toBe(1);
  });
});
