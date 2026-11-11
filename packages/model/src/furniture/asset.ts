import { newId } from '../ids.ts';
import { base64ToBytes, base64ToFloat32, base64ToUint32, bytesToBase64, float32ToBase64, uint32ToBase64 } from './base64.ts';
import { sha256Hex } from './sha256.ts';
import type {
  FurnitureAsset,
  FurnitureBBox,
  FurnitureCategory,
  FurnitureMaterial,
  FurnitureMeshDef,
  FurniturePart,
  FurnitureSourceFormat,
  FurnitureTexture,
} from './types.ts';

export const IDENTITY_MAT4: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Limites por asset (alinhados ao contrato 1.4 do renderizador). */
export const FURNITURE_LIMITS = {
  /** Aviso acima disto (bytes do asset no projeto, antes do base64). */
  warnAssetBytes: 40 * 1024 * 1024,
  /** Recusa acima disto: o projeto (JSON em base64) ficaria pesado demais. */
  refuseAssetBytes: 128 * 1024 * 1024,
  warnVerticesPerDef: 300_000,
  refuseVerticesPerDef: 600_000,
  maxTextureBytes: 8 * 1024 * 1024,
} as const;

/** Forma de entrada: estruturalmente compativel com `ImportedModel` (packages/io), sem importar de la. */
export interface FurnitureImportInput {
  name: string;
  /** So o nome do arquivo. */
  sourceFileName: string;
  sourceFormat: FurnitureSourceFormat;
  defs: Array<{
    id: string;
    name: string;
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    groups: Array<{ start: number; count: number; materialIndex: number }>;
  }>;
  materials: Array<{
    name: string;
    /** RGB 0..1. */
    color: [number, number, number];
    opacity: number;
    textureIndex?: number;
    sizeM?: [number, number];
    category?: FurnitureCategory;
    metallic?: number;
    roughness?: number;
    transmission?: number;
  }>;
  /** Instancias de definicoes dentro do bloco (ex.: as do .skp). Ausente = cada definicao na origem. */
  instances?: Array<{ defId: string; name?: string; transform: number[] }>;
  textures: Array<{ fileName: string; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; width?: number; height?: number }>;
  stats?: { sourceBytes?: number };
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
const toHex = (c: [number, number, number]) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

/** Remove qualquer caminho de um nome de arquivo (`C:\a\b.skp` -> `b.skp`). */
export function baseFileName(n: string): string {
  const parts = n.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

/** Constroi o asset (so dados; o comando `addFurnitureAsset` o grava e cria os Materials). Nao mexe no projeto. */
export function buildFurnitureAsset(input: FurnitureImportInput, id: string = newId('fa')): FurnitureAsset {
  const hashParts: Uint8Array[] = [];
  const enc = new TextEncoder();
  let min: [number, number, number] = [Infinity, Infinity, Infinity];
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let triangles = 0;
  let assetBytes = 0;
  const defBox = new Map<string, { lo: [number, number, number]; hi: [number, number, number] }>();
  const defs: FurnitureMeshDef[] = input.defs.map((d) => {
    const p = d.positions;
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k]!;
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
    }
    defBox.set(d.id, { lo, hi });
    vertices += p.length / 3;
    triangles += d.indices.length / 3;
    assetBytes += p.byteLength + d.normals.byteLength + d.uvs.byteLength + d.indices.byteLength;
    const def: FurnitureMeshDef = {
      id: d.id,
      name: d.name,
      positions: float32ToBase64(p),
      normals: float32ToBase64(d.normals),
      uvs: float32ToBase64(d.uvs),
      indices: uint32ToBase64(d.indices),
      vertexCount: p.length / 3,
      indexCount: d.indices.length,
      groups: d.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex })),
    };
    hashParts.push(enc.encode(`${def.id}|${def.name}|${def.positions}|${def.normals}|${def.uvs}|${def.indices}|${JSON.stringify(def.groups)}`));
    return def;
  });
  const partSource: Array<{ defId: string; name?: string; transform: number[] }> = input.instances?.length ? input.instances : defs.map((d) => ({ defId: d.id, transform: IDENTITY_MAT4 }));
  const parts: FurniturePart[] = partSource.map((q) => ({
    defId: q.defId,
    ...(q.name ? { name: q.name } : {}),
    transform: q.transform.slice(0, 16),
  }));
  for (const part of parts) {
    const b = defBox.get(part.defId);
    if (!b || b.lo[0] === Infinity) continue;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.hi[0] : b.lo[0];
      const y = i & 2 ? b.hi[1] : b.lo[1];
      const z = i & 4 ? b.hi[2] : b.lo[2];
      const m = part.transform;
      const w = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
      for (let k = 0; k < 3; k++) {
        if (w[k]! < min[k]!) min[k] = w[k]!;
        if (w[k]! > max[k]!) max[k] = w[k]!;
      }
    }
  }
  if (!defs.length || min[0] === Infinity) {
    min = [0, 0, 0];
    max = [0, 0, 0];
  }
  hashParts.push(enc.encode(`parts|${JSON.stringify(parts)}`));
  const textures: FurnitureTexture[] = input.textures.map((t) => {
    assetBytes += t.bytes.byteLength;
    const sha = sha256Hex(t.bytes);
    hashParts.push(enc.encode(`tex|${sha}`));
    return {
      fileName: baseFileName(t.fileName),
      mime: t.mime,
      bytes: bytesToBase64(t.bytes),
      sha256: sha,
      ...(t.width !== undefined ? { width: t.width } : {}),
      ...(t.height !== undefined ? { height: t.height } : {}),
      byteLength: t.bytes.byteLength,
    };
  });
  const materials: FurnitureMaterial[] = input.materials.map((m) => {
    const out: FurnitureMaterial = {
      id: newId('fm'),
      name: m.name,
      color: toHex(m.color),
      opacity: m.opacity,
      category: m.category ?? 'other',
      useEmbeddedTexture: true,
    };
    if (m.metallic !== undefined) out.metallic = m.metallic;
    if (m.roughness !== undefined) out.roughness = m.roughness;
    if (m.transmission !== undefined) out.transmission = m.transmission;
    if (m.textureIndex !== undefined) out.textureIndex = m.textureIndex;
    if (m.sizeM) out.sizeM = [m.sizeM[0], m.sizeM[1]];
    return out;
  });
  hashParts.push(enc.encode(JSON.stringify(input.materials)));
  const bbox: FurnitureBBox = { min, max };
  return {
    id,
    name: input.name,
    sourceFileName: baseFileName(input.sourceFileName),
    sourceFormat: input.sourceFormat,
    contentHash: sha256Hex(hashParts),
    defs,
    parts,
    materials,
    textures,
    bbox,
    stats: { vertices, triangles, definitions: defs.length, textures: textures.length, sourceBytes: input.stats?.sourceBytes ?? 0, assetBytes },
  };
}

export interface FurnitureDefArrays {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

const defCache = new WeakMap<FurnitureMeshDef, FurnitureDefArrays>();

/** Arrays tipados da definicao (decodifica uma vez e guarda em cache por objeto). Nao modifique os arrays devolvidos. */
export function furnitureDefArrays(def: FurnitureMeshDef): FurnitureDefArrays {
  let a = defCache.get(def);
  if (!a) {
    a = {
      positions: base64ToFloat32(def.positions),
      normals: base64ToFloat32(def.normals),
      uvs: base64ToFloat32(def.uvs),
      indices: base64ToUint32(def.indices),
    };
    defCache.set(def, a);
  }
  return a;
}

/** Bytes de uma textura embutida (decodificados). */
export function furnitureTextureBytes(t: FurnitureTexture): Uint8Array {
  return base64ToBytes(t.bytes);
}

/** Tamanho do asset no projeto, em bytes (arrays + texturas, antes do base64). */
export function furnitureAssetBytes(a: FurnitureAsset): number {
  let n = 0;
  for (const d of a.defs) n += ((d.positions.length + d.normals.length + d.uvs.length + d.indices.length) / 4) * 3;
  for (const t of a.textures) n += t.byteLength;
  return Math.round(n);
}

/** Avisos (nao impedem): asset grande demais, bloco com muitos vertices. */
export function furnitureAssetWarnings(a: FurnitureAsset): string[] {
  const w: string[] = [];
  const bytes = furnitureAssetBytes(a);
  if (bytes > FURNITURE_LIMITS.warnAssetBytes) w.push(`Asset grande (${(bytes / 1048576).toFixed(1)} MB): o projeto fica pesado para salvar e abrir.`); // units-ok: tamanho em MB, nao e medida de projeto
  for (const d of a.defs) if (d.vertexCount > FURNITURE_LIMITS.warnVerticesPerDef) w.push(`Definicao ${d.name} com ${d.vertexCount} vertices.`);
  return w;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Motivo de recusa do asset, ou null. Valida contagens, indices, grupos, texturas e nomes sem caminho. */
export function furnitureAssetIssue(a: FurnitureAsset): string | null {
  if (!a.id) return 'Asset sem id.';
  if (!a.name) return 'Asset sem nome.';
  if (!a.sourceFileName || /[\\/]/.test(a.sourceFileName)) return 'Nome do arquivo de origem deve ser so o nome, sem caminho.';
  if (!/^[0-9a-f]{64}$/.test(a.contentHash)) return 'contentHash invalido (SHA-256 hex).';
  if (!a.defs.length) return 'Asset sem definicoes de malha.';
  const defIds = new Set<string>();
  for (const d of a.defs) {
    if (!d.id || defIds.has(d.id)) return `Definicao com id vazio ou repetido: ${d.id}`;
    defIds.add(d.id);
    if (d.vertexCount > FURNITURE_LIMITS.refuseVerticesPerDef) return `Definicao ${d.name} acima de ${FURNITURE_LIMITS.refuseVerticesPerDef} vertices.`;
    let arr: FurnitureDefArrays;
    try {
      arr = furnitureDefArrays(d);
    } catch {
      return `Dados da definicao ${d.name} ilegiveis.`;
    }
    const n = arr.positions.length / 3;
    if (!Number.isInteger(n) || n !== d.vertexCount) return `Posicoes de ${d.name} nao batem com vertexCount.`;
    if (arr.normals.length !== arr.positions.length) return `Normais de ${d.name} nao batem com as posicoes.`;
    if (arr.uvs.length !== 0 && arr.uvs.length !== n * 2) return `UVs de ${d.name} nao batem com as posicoes.`;
    if (arr.indices.length % 3 !== 0 || arr.indices.length !== d.indexCount) return `Indices de ${d.name} invalidos.`;
    for (let i = 0; i < arr.indices.length; i++) if (arr.indices[i]! >= n) return `Indice fora da malha em ${d.name}.`;
    for (let i = 0; i < arr.positions.length; i++) if (!finite(arr.positions[i])) return `Posicao nao finita em ${d.name}.`;
    for (const g of d.groups) {
      if (g.start < 0 || g.count < 0 || g.start % 3 !== 0 || g.count % 3 !== 0 || g.start + g.count > arr.indices.length) return `Grupo invalido em ${d.name}.`;
      if (!Number.isInteger(g.materialIndex) || g.materialIndex < 0 || g.materialIndex >= a.materials.length) return `Grupo com material inexistente em ${d.name}.`;
    }
  }
  for (const p of a.parts ?? []) {
    if (!defIds.has(p.defId)) return `Peca aponta para definicao inexistente: ${p.defId}`;
    if (!Array.isArray(p.transform) || p.transform.length !== 16 || !p.transform.every(finite)) return 'Peca com transformacao invalida (16 numeros finitos).';
  }
  const matIds = new Set<string>();
  for (const m of a.materials) {
    if (!m.id || matIds.has(m.id)) return `Material com id vazio ou repetido: ${m.id}`;
    matIds.add(m.id);
    if (!/^#[0-9a-fA-F]{6}$/.test(m.color)) return `Cor invalida em ${m.name}.`;
    if (!(finite(m.opacity) && m.opacity >= 0 && m.opacity <= 1)) return `Opacidade invalida em ${m.name}.`;
    if (m.textureIndex !== undefined && !(Number.isInteger(m.textureIndex) && m.textureIndex >= 0 && m.textureIndex < a.textures.length)) return `Textura inexistente em ${m.name}.`;
    if (m.sizeM && !(finite(m.sizeM[0]) && finite(m.sizeM[1]) && m.sizeM[0] > 0 && m.sizeM[1] > 0)) return `sizeM invalido em ${m.name}.`;
  }
  for (const t of a.textures) {
    if (!t.fileName || /[\\/]/.test(t.fileName)) return 'Textura com nome de arquivo invalido (sem caminho).';
    if (!/^[0-9a-f]{64}$/.test(t.sha256)) return `sha256 invalido na textura ${t.fileName}.`;
    if (t.byteLength > FURNITURE_LIMITS.maxTextureBytes) return `Textura ${t.fileName} acima de 8 MiB.`;
  }
  const b = a.bbox;
  if (![...b.min, ...b.max].every(finite)) return 'bbox invalida.';
  if (furnitureAssetBytes(a) > FURNITURE_LIMITS.refuseAssetBytes) return 'Asset acima do teto de 128 MB.';
  return null;
}
