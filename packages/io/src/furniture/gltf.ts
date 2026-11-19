/**
 * Leitor de glTF 2.0 (.glb e .gltf) com parser proprio (sem three no Node).
 *
 * - glTF e Y para cima em metros: tudo sai convertido para Z para cima.
 * - Uma definicao por malha (`mesh`); cada no que aponta para a malha vira uma instancia com a matriz mundial.
 * - Materiais PBR: baseColor (fator), metallic/roughness (fatores), textura difusa PNG/JPEG. Normal e ORM (metallicRoughness
 *   empacotado) sao so registrados em avisos: o contrato de material ainda nao tem esses slots.
 * - Draco e meshopt: erro claro em portugues (nao descomprimimos aqui).
 * - Esqueleto, animacao e morph targets: ignorados (com aviso); a malha sai na pose de repouso.
 */
import {
  AXIS_Y_UP_TO_Z,
  base64ToBytes,
  buildModel,
  changeAxisMat,
  checkAbort,
  decodeText,
  defaultMaterial,
  emptyContext,
  extForMime,
  guessCategory,
  ImportError,
  lookupFile,
  mat4FromTRS,
  mat4Identity,
  mat4Mul,
  MeshBuilder,
  progress,
  type ReaderContext,
  rot3,
  safeFileName,
  sniffImage,
} from './fmtCommon.ts';
import type { ImportedInstance, ImportedMaterial, ImportedMeshDef, ImportedModel, ImportedTexture, ImportFn, ImportOptions, Mat4 } from './types.ts';

// O glTF e JSON externo de forma livre: o leitor valida cada campo que usa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const UNSUPPORTED_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

interface Parsed {
  json: Json;
  bin?: Uint8Array;
}

/** Separa GLB (container binario) ou JSON puro. Erros de truncamento viram mensagem clara. */
function parseContainer(bytes: Uint8Array): Parsed {
  if (bytes.length < 12) throw new ImportError('Arquivo glTF muito pequeno ou truncado.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) === GLB_MAGIC) {
    const version = view.getUint32(4, true);
    if (version !== 2) throw new ImportError(`Versão de GLB não suportada: ${version} (use glTF 2.0).`);
    const total = view.getUint32(8, true);
    if (total > bytes.length) throw new ImportError('Arquivo GLB truncado: o cabeçalho declara mais bytes do que o arquivo tem.');
    let off = 12;
    let json: Json | undefined;
    let bin: Uint8Array | undefined;
    while (off + 8 <= total) {
      const len = view.getUint32(off, true);
      const type = view.getUint32(off + 4, true);
      const start = off + 8;
      if (start + len > total) throw new ImportError('Arquivo GLB truncado: um bloco passa do fim do arquivo.');
      const chunk = bytes.subarray(start, start + len);
      if (type === CHUNK_JSON) json = parseJson(decodeText(chunk));
      else if (type === CHUNK_BIN) bin = chunk;
      off = start + len;
    }
    if (!json) throw new ImportError('GLB sem bloco JSON: arquivo corrompido.');
    return { json, bin };
  }
  return { json: parseJson(decodeText(bytes)) };
}

function parseJson(text: string): Json {
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== 'object') throw new Error('não é objeto');
    return j as Json;
  } catch {
    throw new ImportError('JSON do glTF inválido ou truncado.');
  }
}

/** Recusa extensoes de compressao que este leitor nao descomprime. */
function assertNoCompression(json: Json): void {
  const used: string[] = [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])];
  for (const ext of UNSUPPORTED_EXT) {
    if (used.includes(ext)) {
      const nome = ext === 'KHR_draco_mesh_compression' ? 'Draco (KHR_draco_mesh_compression)' : 'meshopt (EXT_meshopt_compression)';
      throw new ImportError(`Este glTF usa compressão ${nome}, que não é suportada na importação. Exporte o modelo sem compressão (no Blender: desmarque Draco/meshopt no exportador glTF).`);
    }
  }
}

/** Carrega os bytes de um buffer (GLB interno, data URI ou arquivo vizinho). */
function loadBuffers(json: Json, bin: Uint8Array | undefined, ctx: ReaderContext): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const [i, b] of (json.buffers ?? []).entries()) {
    let data: Uint8Array | undefined;
    if (b.uri === undefined) {
      data = i === 0 ? bin : undefined;
      if (!data) throw new ImportError(`Buffer ${i} não tem dados (GLB sem bloco BIN).`);
    } else if (String(b.uri).startsWith('data:')) {
      const comma = String(b.uri).indexOf(',');
      data = base64ToBytes(String(b.uri).slice(comma + 1));
    } else {
      data = lookupFile(ctx, String(b.uri));
      if (!data) throw new ImportError(`O glTF referencia "${b.uri}", que não foi encontrado. Selecione também o .bin (ou use um .glb único).`);
    }
    if (typeof b.byteLength === 'number' && data.length < b.byteLength) {
      throw new ImportError(`Buffer "${b.uri ?? 'BIN'}" truncado: tem ${data.length} bytes, o glTF declara ${b.byteLength}.`);
    }
    out.push(data);
  }
  return out;
}

/** Le um accessor como Float32Array (floats, normalizados quando preciso) ou Uint32Array (indices). */
function readAccessor(json: Json, buffers: Uint8Array[], accIndex: number, asIndex: boolean): { data: Float32Array | Uint32Array; count: number; comps: number } {
  const acc = json.accessors?.[accIndex];
  if (!acc) throw new ImportError(`Accessor ${accIndex} ausente no glTF.`);
  const comps = TYPE_COUNT[acc.type as string] ?? 1;
  const count: number = acc.count ?? 0;
  const ctype: number = acc.componentType;
  const csize = COMPONENT_SIZE[ctype];
  if (!csize) throw new ImportError(`Tipo de componente ${ctype} não suportado no glTF.`);
  const out = asIndex ? new Uint32Array(count) : new Float32Array(count * comps);
  const normalized = Boolean(acc.normalized);

  const readRaw = (buf: DataView, pos: number): number => {
    switch (ctype) {
      case 5120: return buf.getInt8(pos);
      case 5121: return buf.getUint8(pos);
      case 5122: return buf.getInt16(pos, true);
      case 5123: return buf.getUint16(pos, true);
      case 5125: return buf.getUint32(pos, true);
      default: return buf.getFloat32(pos, true);
    }
  };
  const norm = (v: number): number => {
    if (!normalized || ctype === 5126 || ctype === 5125) return v;
    if (ctype === 5120) return Math.max(v / 127, -1);
    if (ctype === 5121) return v / 255;
    if (ctype === 5122) return Math.max(v / 32767, -1);
    return v / 65535;
  };

  if (count > 0 && acc.bufferView !== undefined) {
    const bv = json.bufferViews?.[acc.bufferView];
    if (!bv) throw new ImportError(`bufferView ${acc.bufferView} ausente no glTF.`);
    if (bv.extensions && Object.keys(bv.extensions).some((k) => UNSUPPORTED_EXT.includes(k))) {
      throw new ImportError('bufferView comprimido (meshopt) não é suportado na importação.');
    }
    const buf = buffers[bv.buffer ?? 0];
    if (!buf) throw new ImportError('bufferView aponta para um buffer inexistente.');
    const elemSize = csize * (asIndex ? 1 : comps);
    const stride = bv.byteStride ?? elemSize;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const last = base + (count - 1) * stride + elemSize;
    if (last > buf.length || (bv.byteLength !== undefined && base + (count - 1) * stride + elemSize > (bv.byteOffset ?? 0) + bv.byteLength)) {
      throw new ImportError('Dados de malha truncados: um accessor passa do fim do buffer.');
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < count; i += 1) {
      const p = base + i * stride;
      if (asIndex) {
        (out as Uint32Array)[i] = readRaw(dv, p);
      } else {
        for (let c = 0; c < comps; c += 1) (out as Float32Array)[i * comps + c] = norm(readRaw(dv, p + c * csize));
      }
    }
  }

  const sparse = acc.sparse;
  if (sparse && sparse.count > 0) {
    const idxBv = json.bufferViews?.[sparse.indices.bufferView];
    const valBv = json.bufferViews?.[sparse.values.bufferView];
    if (!idxBv || !valBv) throw new ImportError('accessor esparso com bufferView inválido.');
    const ib = buffers[idxBv.buffer ?? 0];
    const vb = buffers[valBv.buffer ?? 0];
    if (!ib || !vb) throw new ImportError('accessor esparso sem buffer.');
    const idv = new DataView(ib.buffer, ib.byteOffset, ib.byteLength);
    const vdv = new DataView(vb.buffer, vb.byteOffset, vb.byteLength);
    const icsize = COMPONENT_SIZE[sparse.indices.componentType] ?? 4;
    const ibase = (idxBv.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0);
    const vbase = (valBv.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0);
    for (let s = 0; s < sparse.count; s += 1) {
      const target = readIndexRaw(idv, ibase + s * icsize, sparse.indices.componentType);
      if (target >= count) throw new ImportError('accessor esparso fora do intervalo.');
      if (asIndex) {
        (out as Uint32Array)[target] = readRaw(vdv, vbase + s * csize);
      } else {
        for (let c = 0; c < comps; c += 1) (out as Float32Array)[target * comps + c] = norm(readRaw(vdv, vbase + (s * comps + c) * csize));
      }
    }
  }
  return { data: out, count, comps };
}

function readIndexRaw(dv: DataView, pos: number, ctype: number): number {
  if (ctype === 5121) return dv.getUint8(pos);
  if (ctype === 5123) return dv.getUint16(pos, true);
  return dv.getUint32(pos, true);
}

interface Ctx {
  json: Json;
  buffers: Uint8Array[];
  warnings: string[];
  textures: ImportedTexture[];
  /** indice de textura glTF -> indice em `textures` (ou -1 quando recusada). */
  textureMap: Map<number, number>;
  materials: ImportedMaterial[];
  materialMap: Map<number, number>;
  /** Materiais (indices em `materials`) com `doubleSided: true` no glTF. */
  doubleSidedMats: Set<number>;
  defaultMat?: number;
}

/** Registra a imagem de uma textura glTF (so PNG/JPEG). Devolve o indice em `textures` ou -1. */
function registerTexture(ctx: Ctx, texIndex: number, reader: ReaderContext): number {
  const cached = ctx.textureMap.get(texIndex);
  if (cached !== undefined) return cached;
  const tex = ctx.json.textures?.[texIndex];
  const img = tex?.source !== undefined ? ctx.json.images?.[tex.source] : undefined;
  let result = -1;
  if (img) {
    let bytes: Uint8Array | undefined;
    let name: string | undefined;
    if (img.bufferView !== undefined) {
      const bv = ctx.json.bufferViews?.[img.bufferView];
      const buf = ctx.buffers[bv?.buffer ?? 0];
      if (bv && buf) bytes = buf.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + (bv.byteLength ?? 0));
      name = `${img.name || `textura-${texIndex}`}`;
    } else if (typeof img.uri === 'string') {
      if (img.uri.startsWith('data:')) {
        bytes = base64ToBytes(img.uri.slice(img.uri.indexOf(',') + 1));
        name = img.name || `textura-${texIndex}`;
      } else {
        bytes = lookupFile(reader, img.uri);
        name = img.uri;
        if (!bytes) ctx.warnings.push(`Textura "${img.uri}" não encontrada ao lado do arquivo; material sem imagem.`);
      }
    }
    if (bytes) {
      const mime = sniffImage(bytes);
      if (!mime) {
        ctx.warnings.push(`Textura "${name}" em formato não suportado (só PNG e JPEG); ignorada.`);
      } else {
        const base = safeFileName(name ?? `textura-${texIndex}`);
        const fileName = /\.(png|jpe?g)$/i.test(base) ? base : `${base}.${extForMime(mime)}`;
        ctx.textures.push({ fileName, mime, bytes: bytes.slice() });
        result = ctx.textures.length - 1;
      }
    }
  }
  ctx.textureMap.set(texIndex, result);
  return result;
}

/** Fração de translucidez dada a transmissão total (KHR_materials_transmission = 1 deixa 35% de opacidade). */
const GLASS_TRANSLUCENCY = 0.65;
/** Opacidade de um material de vidro que o arquivo deixou opaco. */
const GLASS_DEFAULT_OPACITY = 0.35;

function buildMaterials(ctx: Ctx, reader: ReaderContext): void {
  for (const [i, m] of (ctx.json.materials ?? []).entries()) {
    const pbr = m.pbrMetallicRoughness ?? {};
    const bc: number[] = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const name: string = m.name || `material-${i}`;
    let textureIndex: number | undefined;
    if (pbr.baseColorTexture) {
      const t = registerTexture(ctx, pbr.baseColorTexture.index, reader);
      if (t >= 0) textureIndex = t;
    }
    if (m.normalTexture) ctx.warnings.push(`Material "${name}": mapa de normal registrado, mas não aplicado (o contrato ainda não tem esse slot).`);
    if (pbr.metallicRoughnessTexture) ctx.warnings.push(`Material "${name}": mapa metal/rugosidade empacotado (ORM) registrado, mas não aplicado.`);
    const transmission = m.extensions?.KHR_materials_transmission?.transmissionFactor;
    const mat: ImportedMaterial = {
      name,
      color: [bc[0] ?? 1, bc[1] ?? 1, bc[2] ?? 1],
      opacity: m.alphaMode === 'BLEND' ? Math.min(1, Math.max(0, bc[3] ?? 1)) : 1,
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      category: guessCategory(name),
    };
    if (textureIndex !== undefined) mat.textureIndex = textureIndex;
    if (typeof transmission === 'number' && transmission > 0) {
      mat.transmission = transmission;
      // Transmissão (vidro): o desenho só tem opacidade; 0,65 x transmissão de translucidez, sem sumir com o material.
      mat.opacity = Math.min(mat.opacity, 1 - GLASS_TRANSLUCENCY * Math.min(1, transmission));
    } else if (mat.category === 'glass' && mat.opacity >= 1) {
      // Vidro que o arquivo deixou opaco (sem transmissão nem alfa): translúcido por padrão; o aviso diz como mudar.
      mat.opacity = GLASS_DEFAULT_OPACITY;
      ctx.warnings.push(`Material "${name}": vidro opaco no arquivo; aplicada opacidade de 35% (troque a categoria para outra se não for vidro).`);
    }
    ctx.materials.push(mat);
    ctx.materialMap.set(i, ctx.materials.length - 1);
    if (m.doubleSided === true) ctx.doubleSidedMats.add(ctx.materials.length - 1);
  }
}

function materialFor(ctx: Ctx, primMat: number | undefined): number {
  if (primMat !== undefined && ctx.materialMap.has(primMat)) return ctx.materialMap.get(primMat)!;
  if (ctx.defaultMat === undefined) {
    ctx.materials.push(defaultMaterial());
    ctx.defaultMat = ctx.materials.length - 1;
  }
  return ctx.defaultMat;
}

/** Converte uma malha glTF (todas as primitivas) em uma definicao em Z para cima. */
function buildMesh(ctx: Ctx, meshIndex: number, id: string): ImportedMeshDef | undefined {
  const mesh = ctx.json.meshes[meshIndex];
  const mb = new MeshBuilder();
  for (const prim of mesh.primitives ?? []) {
    if (prim.extensions && Object.keys(prim.extensions).some((k) => UNSUPPORTED_EXT.includes(k))) {
      throw new ImportError('Primitiva com compressão Draco/meshopt não é suportada na importação.');
    }
    const mode: number = prim.mode ?? 4;
    if (mode !== 4 && mode !== 5 && mode !== 6) {
      ctx.warnings.push(`Malha "${mesh.name ?? meshIndex}": primitiva de linhas ou pontos ignorada.`);
      continue;
    }
    if (prim.attributes?.POSITION === undefined) continue;
    const pos = readAccessor(ctx.json, ctx.buffers, prim.attributes.POSITION, false);
    const nor = prim.attributes.NORMAL !== undefined ? readAccessor(ctx.json, ctx.buffers, prim.attributes.NORMAL, false) : undefined;
    const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(ctx.json, ctx.buffers, prim.attributes.TEXCOORD_0, false) : undefined;
    const vcount = pos.count;
    const base = mb.vertexCount;
    const pf = pos.data as Float32Array;
    for (let v = 0; v < vcount; v += 1) {
      const p = rot3(AXIS_Y_UP_TO_Z, pf[v * 3] ?? 0, pf[v * 3 + 1] ?? 0, pf[v * 3 + 2] ?? 0);
      let n: [number, number, number] | undefined;
      if (nor && nor.count === vcount) {
        const nf = nor.data as Float32Array;
        n = rot3(AXIS_Y_UP_TO_Z, nf[v * 3] ?? 0, nf[v * 3 + 1] ?? 0, nf[v * 3 + 2] ?? 0);
      }
      let t: [number, number] | undefined;
      if (uv && uv.count === vcount) {
        const uf = uv.data as Float32Array;
        t = [uf[v * 2] ?? 0, uf[v * 2 + 1] ?? 0];
      }
      mb.vertex(null, p, n, t);
    }
    let idx: number[];
    if (prim.indices !== undefined) {
      const ia = readAccessor(ctx.json, ctx.buffers, prim.indices, true).data as Uint32Array;
      idx = Array.from(ia);
    } else {
      idx = Array.from({ length: vcount }, (_, k) => k);
    }
    const matIdx = materialFor(ctx, prim.material);
    const triCount = mode === 4 ? Math.floor(idx.length / 3) : Math.max(0, idx.length - 2);
    for (let t = 0; t < triCount; t += 1) {
      let a: number, b: number, c: number;
      if (mode === 4) {
        a = idx[t * 3] ?? 0; b = idx[t * 3 + 1] ?? 0; c = idx[t * 3 + 2] ?? 0;
      } else if (mode === 5) {
        // strip: alterna a orientacao para manter o sentido das faces
        a = idx[t] ?? 0; b = idx[t + 1] ?? 0; c = idx[t + 2] ?? 0;
        if (t % 2 === 1) [b, c] = [c, b];
      } else {
        a = idx[0] ?? 0; b = idx[t + 1] ?? 0; c = idx[t + 2] ?? 0;
      }
      if (a >= vcount || b >= vcount || c >= vcount) throw new ImportError('Índice de vértice fora do intervalo (arquivo corrompido?).');
      mb.triangle(matIdx, base + a, base + b, base + c);
    }
    if (prim.targets) ctx.warnings.push(`Malha "${mesh.name ?? meshIndex}": morph targets ignorados (usa a forma base).`);
  }
  const def = mb.build(id, mesh.name || `malha-${meshIndex}`);
  // `doubleSided` do material (glTF: padrao falso). Dizer explicitamente (true/false) evita a analise de malha do buildModel.
  if (def) for (const g of def.groups) g.doubleSided = ctx.doubleSidedMats.has(g.materialIndex);
  return def;
}

/** Matriz local de um no (matrix ou TRS), no formato de colunas. */
function localMatrix(node: Json): Mat4 {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return (node.matrix as number[]).slice();
  return mat4FromTRS(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
}

/** Le um glTF/GLB com um contexto de arquivos vizinhos (ZIP usa isso). */
export async function readGltf(file: { name: string; bytes: Uint8Array }, opts: ImportOptions | undefined, reader: ReaderContext): Promise<ImportedModel> {
  const startedAt = Date.now();
  checkAbort(opts);
  progress(opts, 0.05, 'Lendo glTF');
  const { json, bin } = parseContainer(file.bytes);
  assertNoCompression(json);
  if (!Array.isArray(json.meshes) || json.meshes.length === 0) throw new ImportError('O glTF não contém malhas.');
  const buffers = loadBuffers(json, bin, reader);
  progress(opts, 0.3, 'Lendo malhas e materiais');

  const warnings: string[] = [];
  if (json.skins) warnings.push('Esqueleto (skin) ignorado: a malha sai na pose de repouso.');
  if (json.animations?.length) warnings.push('Animações ignoradas: o modelo sai parado.');
  const ctx: Ctx = { json, buffers, warnings, textures: [], textureMap: new Map(), materials: [], materialMap: new Map(), doubleSidedMats: new Set() };
  buildMaterials(ctx, reader);

  // Nos raiz da cena escolhida (ou todos os nos sem pai, quando nao ha cena).
  const nodes: Json[] = json.nodes ?? [];
  const sceneIdx = json.scene ?? 0;
  let roots: number[] = json.scenes?.[sceneIdx]?.nodes ?? [];
  if (roots.length === 0) {
    const childSet = new Set<number>();
    for (const n of nodes) for (const c of n.children ?? []) childSet.add(c);
    roots = nodes.map((_, i) => i).filter((i) => !childSet.has(i));
  }

  const defs: ImportedMeshDef[] = [];
  const defIdByMesh = new Map<number, string>();
  const instances: ImportedInstance[] = [];
  const visit = (nodeIndex: number, parent: Mat4, depth: number): void => {
    if (depth > 256) throw new ImportError('Hierarquia de nós profunda demais (arquivo corrompido?).');
    const node = nodes[nodeIndex];
    if (!node) return;
    const world = mat4Mul(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      let defId = defIdByMesh.get(node.mesh);
      if (!defId) {
        const def = buildMesh(ctx, node.mesh, `m${node.mesh}`);
        if (def) {
          defs.push(def);
          defId = def.id;
          defIdByMesh.set(node.mesh, defId);
        }
      }
      if (defId) instances.push({ defId, name: node.name, transform: changeAxisMat(world, AXIS_Y_UP_TO_Z) });
    }
    for (const c of node.children ?? []) visit(c, world, depth + 1);
  };
  for (const r of roots) visit(r, mat4Identity(), 0);
  progress(opts, 0.9, 'Montando modelo');
  checkAbort(opts);

  if (ctx.textures.length) progress(opts, 0.95, 'Texturas');
  const name = file.name.replace(/\.(glb|gltf)$/i, '');
  return buildModel({
    name,
    sourceFileName: file.name,
    sourceFormat: /\.glb$/i.test(file.name) ? 'glb' : 'gltf',
    defs,
    instances,
    materials: ctx.materials.length ? ctx.materials : [defaultMaterial()],
    textures: ctx.textures,
    warnings,
    startedAt,
    sourceBytes: file.bytes.length,
    scale: opts?.scale,
  });
}

/** `ImportFn` do glTF/GLB sem arquivos vizinhos (GLB ou .gltf com dados embutidos). */
export const importGltf: ImportFn = (file, opts) => readGltf(file, opts, emptyContext());
