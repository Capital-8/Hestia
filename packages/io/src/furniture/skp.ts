// Leitor de SketchUp (.skp) direto, com a biblioteca OpenSKP (MIT). Cada definicao entra UMA vez e cada colocacao vira
// uma instancia com matriz. Saida em metros e Z para cima (o OpenSKP entrega glTF: Y para cima; aqui convertemos).
import { buildInstancedScene, parseSkp, type InstancedNode, type InstancedScene } from 'openskp';
import { baseName, finalizeModel, guessCategory, imageSize, sniffMime } from './common';
import {
  IMPORT_LIMITS,
  type ImportFn,
  type ImportOptions,
  type ImportedInstance,
  type ImportedMaterial,
  type ImportedMeshDef,
  type ImportedMeshGroup,
  type ImportedTexture,
  type Mat4,
} from './types';

const INCH_M = 0.0254;
const MB = 1024 * 1024;

function abortError(): Error {
  const e = new Error('Importacao cancelada.');
  e.name = 'AbortError';
  return e;
}

// ---- matrizes (4x4, ordem de colunas) ---------------------------------------------------------------------------

function mul(a: readonly number[], b: readonly number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
      o[c * 4 + r] = s;
    }
  }
  return o;
}

// glTF (Y para cima) -> Z para cima: (x, y, z) -> (x, -z, y)
const C_FROM_GLTF = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
const C_TO_GLTF = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

function matrixToZUp(m: readonly number[]): number[] {
  return mul(mul(C_FROM_GLTF, m), C_TO_GLTF);
}

function det3(m: readonly number[]): number {
  const a = m[0] as number, b = m[4] as number, c = m[8] as number;
  const d = m[1] as number, e = m[5] as number, f = m[9] as number;
  const g = m[2] as number, h = m[6] as number, i = m[10] as number;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

// ---- materiais --------------------------------------------------------------------------------------------------

interface GltfMat {
  doubleSided?: boolean;
  pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number } };
}

interface MetaMat {
  name: string;
  rgb: string;
  textured: boolean;
  unsupportedTexture: boolean;
  tileInchesW: number;
  tileInchesH: number;
  textureFile: string;
}

const rgbKey = (r: number, g: number, b: number) => `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;

function dataKey(data: Uint8Array): string {
  let head = '';
  for (let i = 0; i < 16 && i < data.length; i++) head += (i ? ',' : '') + data[i];
  return `${data.length}:${head}`;
}

interface MetaIndex {
  byTexture: Map<string, MetaMat>;
  byRgbPlain: Map<string, MetaMat>;
  byRgbUnsupported: Map<string, MetaMat>;
  unsupported: MetaMat[];
}

function readMeta(ab: ArrayBuffer, onProgress?: (cur: number, tot: number) => void): MetaIndex {
  const model = parseSkp(ab, { onProgress: (p) => onProgress?.(p.current, p.total) });
  const idx: MetaIndex = { byTexture: new Map(), byRgbPlain: new Map(), byRgbUnsupported: new Map(), unsupported: [] };
  for (const m of model.materials) {
    const rgb = rgbKey(m.color.r, m.color.g, m.color.b);
    const data = m.texture?.data ?? null;
    const mime = data && data.length > 0 ? sniffMime(data) : null;
    const meta: MetaMat = {
      name: m.name,
      rgb,
      textured: mime !== null,
      unsupportedTexture: data !== null && data.length > 0 && mime === null,
      tileInchesW: m.texture && m.texture.width > 1e-9 ? m.texture.width : 1,
      tileInchesH: m.texture && m.texture.height > 1e-9 ? m.texture.height : 1,
      textureFile: baseName(m.texture?.filename ?? ''),
    };
    if (meta.textured && data) {
      const k = dataKey(data);
      if (!idx.byTexture.has(k)) idx.byTexture.set(k, meta);
    } else if (meta.unsupportedTexture) {
      idx.unsupported.push(meta);
      if (!idx.byRgbUnsupported.has(rgb)) idx.byRgbUnsupported.set(rgb, meta);
    } else if (!idx.byRgbPlain.has(rgb)) {
      idx.byRgbPlain.set(rgb, meta);
    }
  }
  return idx;
}

function friendlyParseError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.name === 'AbortError') return e;
  const legacy = /back-ref|class slot|legacy|slot/i.test(msg);
  if (legacy) {
    return new Error(
      'Nao foi possivel ler este arquivo .skp: ele parece ter sido salvo num formato antigo do SketchUp que o leitor ' +
        'direto nao entende. Abra-o no SketchUp e use Arquivo > Exportar > Modelo 3D para COLLADA (.dae) ' +
        'ou glTF (.glb) e importe o arquivo exportado.' +
        ` (detalhe tecnico: ${msg})`,
    );
  }
  return new Error(
    `Nao foi possivel ler o arquivo .skp (${msg}). Se o arquivo for antigo ou de uma versao nova do SketchUp, ` +
      'exporte-o do SketchUp para COLLADA (.dae) ou glTF (.glb) e importe o arquivo exportado.',
  );
}

/** Importa um arquivo SketchUp (.skp). Recusa arquivos acima de `IMPORT_LIMITS.refuseFileBytes`. */
export const importSkp: ImportFn = async (file, opts: ImportOptions = {}) => {
  const t0 = performance.now();
  const { signal, onProgress } = opts;
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const check = () => {
    if (signal?.aborted) throw abortError();
  };
  const progress = (f: number, label: string) => onProgress?.(Math.min(1, Math.max(0, f)), label);

  const size = file.bytes.byteLength;
  if (size > IMPORT_LIMITS.refuseFileBytes) {
    throw new Error(
      // units-ok: tamanho de arquivo em MB, nao e grandeza do projeto
      `O arquivo tem ${(size / MB).toFixed(1)} MB, acima do limite de ${IMPORT_LIMITS.refuseFileBytes / MB} MB do leitor ` +
        'de SketchUp (ele usa de 90 a 120 vezes o tamanho do arquivo em memoria). Reduza o modelo no SketchUp ' +
        '(purgar nao usados, remover texturas grandes) ou exporte para .dae/.glb.',
    );
  }
  if (size < 64) throw new Error('Arquivo .skp vazio ou corrompido.');
  check();
  progress(0.01, 'Lendo arquivo SketchUp');

  const bytes = file.bytes;
  const ab: ArrayBuffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer
      : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

  // Passo 1: nomes e tamanho fisico das texturas dos materiais (o cenario instanciado so traz cor e indice de textura).
  let meta: MetaIndex;
  let scene: InstancedScene;
  try {
    meta = readMeta(ab, (c, t) => {
      check();
      progress(0.02 + 0.13 * (t > 0 ? c / t : 0), 'Lendo materiais');
    });
    check();
    progress(0.15, 'Montando geometria');
    scene = buildInstancedScene(ab, {
      onProgress: (p) => {
        check();
        progress(0.15 + 0.6 * (p.total > 0 ? Math.min(1, p.current / p.total) : 0), `Montando geometria (${p.stage})`);
      },
    });
  } catch (e) {
    throw friendlyParseError(e);
  }
  check();
  progress(0.78, 'Convertendo');

  const warnings: string[] = [];
  const gltfMats = scene.gltfMaterials as GltfMat[];

  // Texturas
  const textures: ImportedTexture[] = scene.textures.map((t, i) => {
    const sz = imageSize(t.data);
    const base = baseName(t.filename);
    const ext = t.mimeType === 'image/png' ? 'png' : 'jpg';
    return {
      fileName: base || `textura_${i + 1}.${ext}`,
      mime: t.mimeType,
      bytes: t.data,
      ...(sz ? { width: sz.width, height: sz.height } : {}),
    };
  });
  for (const m of meta.unsupported) {
    warnings.push(`Textura de "${m.name}"${m.textureFile ? ` (${m.textureFile})` : ''} em formato nao suportado (so PNG e JPEG): ignorada, ficou so a cor.`);
  }

  // Materiais (so os usados)
  const materials: ImportedMaterial[] = [];
  const matIndex = new Map<number, number>();
  const byKey = new Map<string, number>();
  let zeroAlphaPlain = 0;
  const textureSizeIndex = new Map<number, MetaMat>();
  for (const [k, m] of meta.byTexture) {
    // liga a textura do cenario (por conteudo) ao tamanho fisico
    const ti = scene.textures.findIndex((t) => dataKey(t.data) === k);
    if (ti >= 0) textureSizeIndex.set(ti, m);
  }
  const materialFor = (gi: number): number => {
    const hit = matIndex.get(gi);
    if (hit !== undefined) return hit;
    const g = gltfMats[gi];
    const pbr = g?.pbrMetallicRoughness;
    const f = pbr?.baseColorFactor ?? [0.53, 0.53, 0.53, 1];
    const rgb255 = rgbKey((f[0] as number) * 255, (f[1] as number) * 255, (f[2] as number) * 255);
    const texIdx = pbr?.baseColorTexture?.index;
    let name: string;
    let sizeM: [number, number] | undefined;
    let hasTexture = false;
    let textureIndex: number | undefined;
    let legacyTextured = false;
    if (texIdx !== undefined && texIdx >= 0 && texIdx < textures.length) {
      hasTexture = true;
      textureIndex = texIdx;
      const mm = textureSizeIndex.get(texIdx);
      name = mm?.name ?? textures[texIdx]!.fileName;
      const w = mm?.tileInchesW ?? 1;
      const h = mm?.tileInchesH ?? 1;
      sizeM = [w * INCH_M, h * INCH_M];
    } else {
      const unsup = meta.byRgbUnsupported.get(rgb255);
      const plain = meta.byRgbPlain.get(rgb255);
      legacyTextured = !!unsup && !plain;
      name = (plain ?? unsup)?.name ?? `Cor ${rgb255.replace(/,/g, '-')}`;
    }
    const alpha = f[3] ?? 1;
    let opacity = alpha;
    if (alpha <= 0.001) {
      opacity = 1;
      if (!hasTexture && !legacyTextured) zeroAlphaPlain++;
    }
    const color: [number, number, number] = [f[0] as number, f[1] as number, f[2] as number];
    const mat: ImportedMaterial = {
      name,
      color,
      opacity,
      ...(hasTexture ? { textureIndex } : {}),
      ...(sizeM ? { sizeM } : {}),
      category: guessCategory(name, color, hasTexture),
      metallic: 0,
      roughness: 0.8,
    };
    if (opacity < 1) mat.transmission = 1 - opacity;
    // Materiais do OpenSKP variam por dupla face; para o Hestia basta um por (nome, cor, opacidade, textura).
    const key = `${name}|${color.join(",")}|${opacity}|${textureIndex ?? -1}`;
    let idx = byKey.get(key);
    if (idx === undefined) {
      idx = materials.length;
      materials.push(mat);
      byKey.set(key, idx);
    }
    matIndex.set(gi, idx);
    return idx;
  };

  // Definicoes: uma por recurso de malha, primitivas fundidas em uma malha com grupos por material.
  const defs: ImportedMeshDef[] = [];
  const defIds = new Set<string>();
  const total = scene.meshResources.length;
  for (let r = 0; r < total; r++) {
    const res = scene.meshResources[r]!;
    let nv = 0;
    let ni = 0;
    let anyTex = false;
    for (const p of res.primitives) {
      nv += p.positions.length / 3;
      ni += p.indices.length;
      if (gltfMats[p.materialIndex]?.pbrMetallicRoughness?.baseColorTexture) anyTex = true;
    }
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(anyTex ? nv * 2 : 0);
    const indices = new Uint32Array(ni);
    const groups: ImportedMeshGroup[] = [];
    let vo = 0;
    let io = 0;
    for (const p of res.primitives) {
      const pv = p.positions.length / 3;
      for (let i = 0; i < pv; i++) {
        const o = (vo + i) * 3;
        positions[o] = (p.positions[i * 3] as number) * scale;
        positions[o + 1] = -(p.positions[i * 3 + 2] as number) * scale;
        positions[o + 2] = (p.positions[i * 3 + 1] as number) * scale;
        normals[o] = p.normals[i * 3] as number;
        normals[o + 1] = -(p.normals[i * 3 + 2] as number);
        normals[o + 2] = p.normals[i * 3 + 1] as number;
      }
      if (anyTex) uvs.set(p.uvs, vo * 2);
      for (let i = 0; i < p.indices.length; i++) indices[io + i] = (p.indices[i] as number) + vo;
      // O OpenSKP marca `doubleSided` quando frente e verso da face tem a mesma cor (e entao emite so um lado). Sem isto
      // as faces com a frente voltada para dentro sumiam (descarte de faces traseiras).
      const ds = gltfMats[p.materialIndex]?.doubleSided === true;
      groups.push({ start: io, count: p.indices.length, materialIndex: materialFor(p.materialIndex), ...(ds ? { doubleSided: true } : {}) });
      vo += pv;
      io += p.indices.length;
    }
    const id = res.id;
    defIds.add(id);
    defs.push({ id, name: res.definitionName || id, positions, normals, uvs, indices, groups });
    if ((r & 15) === 0) {
      check();
      progress(0.78 + 0.15 * (r / Math.max(1, total)), 'Convertendo geometria');
    }
  }

  // Instancias: percorre a hierarquia compondo as matrizes (pai x filho) e converte para Z para cima.
  const instances: ImportedInstance[] = [];
  let mirrored = 0;
  // Compomos em espaco glTF e convertemos so no fim, para evitar erro numerico acumulado.
  const stackG: Array<{ node: InstancedNode; parent: number[] }> = [
    { node: scene.sceneHierarchy, parent: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  ];
  while (stackG.length > 0) {
    const { node, parent } = stackG.pop()!;
    const world = mul(parent, node.matrix);
    if (node.meshResourceId) {
      const defId = node.meshResourceId;
      if (defIds.has(defId)) {
        const m = matrixToZUp(world);
        if (scale !== 1) {
          m[12] = (m[12] as number) * scale;
          m[13] = (m[13] as number) * scale;
          m[14] = (m[14] as number) * scale;
        }
        if (det3(m) < 0) mirrored++;
        instances.push({ defId, name: node.nameIsGenerated ? node.definitionName || node.name : node.name || node.definitionName, transform: m as Mat4 });
      }
    }
    for (let i = node.children.length - 1; i >= 0; i--) stackG.push({ node: node.children[i]!, parent: world });
  }
  if (mirrored > 0) {
    warnings.push(`${mirrored} instancia(s) com espelhamento (escala negativa): as faces podem aparecer invertidas.`);
  }
  if (zeroAlphaPlain > 0) {
    warnings.push(`${zeroAlphaPlain} material(is) sem textura com transparencia total no arquivo: tratados como opacos.`);
  }
  const tinyTiles = materials.filter((m) => m.sizeM && m.sizeM[0] <= INCH_M * 1.001 && m.sizeM[1] <= INCH_M * 1.001).length;
  if (tinyTiles > 0) {
    warnings.push(`${tinyTiles} material(is) com textura de tamanho fisico de 1 polegada no arquivo (valor padrao do SketchUp): a escala da textura pode precisar de ajuste.`);
  }
  if (defs.length === 0) warnings.push('O arquivo nao tem geometria visivel.');

  check();
  progress(0.95, 'Validando');
  const baseNameNoExt = baseName(file.name).replace(/\.skp$/i, '');
  const model = finalizeModel({
    name: baseNameNoExt || 'bloco',
    sourceFileName: baseName(file.name),
    sourceFormat: 'skp',
    defs,
    instances,
    materials,
    textures,
    warnings,
    stats: { sourceBytes: size, ms: Math.round(performance.now() - t0) },
  });
  model.stats.ms = Math.round(performance.now() - t0);
  progress(1, 'Pronto');
  return model;
};
