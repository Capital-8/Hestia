/**
 * Base comum dos leitores de mobiliario (glTF, OBJ, COLLADA, FBX, ZIP): erros em portugues, matrizes 4x4 (colunas),
 * construtor de malha com deduplicacao de vertices, normais recalculadas, heuristica de categoria por nome e montagem do
 * `ImportedModel`. Versao local minima: sera unificada depois com `common.ts` do outro ramo.
 */
import { IMPORT_LIMITS, type ImportCategory, type ImportedInstance, type ImportedMaterial, type ImportedMeshDef, type ImportedMeshGroup, type ImportedModel, type ImportedTexture, type ImportOptions, type Mat4 } from './types.ts';

/** Erro de leitura com mensagem pronta para o usuario (portugues). */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Mapa de arquivos vizinhos (caminho normalizado com `/` -> bytes). Vazio quando o arquivo esta solto. */
export type FileMap = Map<string, Uint8Array>;

/** Contexto que o ZIP (ou o chamador) passa aos leitores: arquivos vizinhos e pasta do modelo principal. */
export interface ReaderContext {
  files: FileMap;
  /** Pasta (com `/` no fim ou vazia) do arquivo principal dentro do mapa. */
  baseDir: string;
}

export const emptyContext = (): ReaderContext => ({ files: new Map(), baseDir: '' });

export function checkAbort(opts?: ImportOptions): void {
  if (opts?.signal?.aborted) throw new ImportError('Importação cancelada pelo usuário.');
}

export function progress(opts: ImportOptions | undefined, fraction: number, label: string): void {
  opts?.onProgress?.(Math.max(0, Math.min(1, fraction)), label);
}

/** Nome do arquivo sem pasta (aceita `/` e `\`). */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Extensao em minusculas, sem o ponto ('' se nao houver). */
export function extensionOf(name: string): string {
  const b = baseName(name);
  const dot = b.lastIndexOf('.');
  return dot < 0 ? '' : b.slice(dot + 1).toLowerCase();
}

/**
 * Normaliza um caminho relativo vindo de arquivo (glTF uri, mtllib, zip). Recusa caminhos absolutos, unidades de disco e
 * `..` (zip-slip). Devolve `null` quando o caminho e inseguro.
 */
export function normalizeRelPath(raw: string): string | null {
  let p = raw.trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    // mantem o original se nao for URI valida
  }
  p = p.replace(/\\/g, '/');
  if (p.startsWith('file:')) p = p.replace(/^file:\/*/, '');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    out.push(seg);
  }
  return out.join('/');
}

/** Procura um arquivo vizinho: caminho relativo a pasta do modelo, depois casamento sem caixa, depois pelo nome unico. */
export function lookupFile(ctx: ReaderContext, rel: string): Uint8Array | undefined {
  const norm = normalizeRelPath(rel);
  if (!norm) return undefined;
  const joined = ctx.baseDir ? `${ctx.baseDir}${norm}` : norm;
  const direct = ctx.files.get(joined) ?? ctx.files.get(norm);
  if (direct) return direct;
  const lower = joined.toLowerCase();
  for (const [k, v] of ctx.files) if (k.toLowerCase() === lower) return v;
  const base = baseName(norm).toLowerCase();
  let found: Uint8Array | undefined;
  let count = 0;
  for (const [k, v] of ctx.files) {
    if (baseName(k).toLowerCase() === base) {
      found = v;
      count += 1;
    }
  }
  return count === 1 ? found : undefined;
}

/** Nome de arquivo seguro para textura: so o nome, sem caminho, sem caracteres problematicos. */
export function safeFileName(raw: string): string {
  // Remover caracteres de controle de nomes de arquivo e proposital.
  // eslint-disable-next-line no-control-regex
  const b = baseName(raw.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  return b || 'textura';
}

/** Detecta PNG/JPEG pelo cabecalho (nao confia no mime declarado). */
export function sniffImage(bytes: Uint8Array): 'image/png' | 'image/jpeg' | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return undefined;
}

/** Nome da imagem pelo tipo real (usado quando o arquivo nao traz nome). */
export function extForMime(mime: 'image/png' | 'image/jpeg'): string {
  return mime === 'image/png' ? 'png' : 'jpg';
}

/** Lista de palavras-chave PT/EN por categoria. A ordem importa: a primeira categoria que casar vence. */
const CATEGORY_RULES: Array<[ImportCategory, RegExp]> = [
  ['glass', /vidro|glass|cristal|crystal/],
  ['roof_tile', /telha|roof/],
  ['asphalt', /asfalto|asphalt/],
  ['concrete', /concreto|concrete|cimento|cement/],
  ['plaster', /gesso|plaster|reboco|stucco|drywall/],
  ['paint', /tinta|paint/],
  ['brick', /tijolo|brick/],
  ['stone', /pedra|stone|marmore|marble|granito|granite|quartzo|quartz|ardosa|slate/],
  ['ceramic', /ceramic|porcelana|porcelain|azulejo|\btile\b|louca/],
  ['leather', /couro|leather|courino|suede|camurca/],
  ['fabric', /tecido|fabric|linho|linen|algodao|cotton|veludo|velvet|cortina|curtain|tapete|carpet|\brug\b|estofa|upholster|\bla\b|wool/],
  ['grass', /grama|grass|relva/],
  ['soil', /terra|soil|dirt|\bsolo\b|barro|\bclay\b|\bmud\b/],
  ['metal', /metal|\baco\b|inox|steel|iron|ferro|aluminio|alumin|chrome|cromo|brass|latao|bronze|\bcopper\b|\bcobre\b|\bgold\b|\bouro\b|silver|\bprata\b|zinc|zinco/],
  ['wood', /madeira|wood|carvalho|\boak\b|pinho|\bpine\b|nogueira|walnut|freij|cedro|cedar|\bmdf\b|compensado|plywood|bamboo|bambu|teak|jatoba|imbuia|laminad|laminate|timber|\bipe\b/],
  ['plastic', /plastico|plastic|\bpvc\b|acrilico|acrylic|borracha|rubber|silicone/],
];

/** Sugere categoria a partir do nome (PT/EN, sem acento, sem caixa). `undefined` quando nao reconhece. */
export function guessCategory(name: string): ImportCategory | undefined {
  const t = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[._\-\s]+/g, ' ');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return undefined;
}

/** Matrizes 4x4 em ordem de colunas (16 numeros), local -> mundo. */
export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function mat4Transpose(m: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) out[c * 4 + r] = m[r * 4 + c] ?? 0;
  return out;
}

/** Matriz 4x4 (colunas) a partir de uma 3x3 em linhas. */
export function mat4FromRows3(rows: number[]): Mat4 {
  const r = (i: number, j: number) => rows[i * 3 + j] ?? 0;
  const out = mat4Identity();
  for (let c = 0; c < 3; c += 1) for (let rr = 0; rr < 3; rr += 1) out[c * 4 + rr] = r(rr, c);
  return out;
}

/** Matriz de mudanca de eixo que leva o "up" de origem para Z: (x,y,z) -> linhas da 3x3. */
export const AXIS_Y_UP_TO_Z: number[] = [1, 0, 0, 0, 0, -1, 0, 1, 0];
export const AXIS_IDENTITY: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** COLLADA X_UP: (x,y,z) -> (y,z,x), para que o X antigo vire o Z novo. */
export const AXIS_X_UP_TO_Z: number[] = [0, 1, 0, 0, 0, 1, 1, 0, 0];

/** Aplica uma 3x3 (linhas) a um vetor. */
export function rot3(R: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    (R[0] ?? 0) * x + (R[1] ?? 0) * y + (R[2] ?? 0) * z,
    (R[3] ?? 0) * x + (R[4] ?? 0) * y + (R[5] ?? 0) * z,
    (R[6] ?? 0) * x + (R[7] ?? 0) * y + (R[8] ?? 0) * z,
  ];
}

/** Conjuga uma matriz de cena (local -> mundo) pela mudanca de eixo: R * M * R^T. */
export function changeAxisMat(m: Mat4, R: number[]): Mat4 {
  const r4 = mat4FromRows3(R);
  return mat4Mul(mat4Mul(r4, m), mat4Transpose(r4));
}

/** Multiplica a translacao pelo fator (unidade do arquivo -> metros). A parte linear fica igual. */
export function scaleTranslation(m: Mat4, u: number): Mat4 {
  if (u === 1) return m;
  const out = m.slice();
  out[12] = (out[12] ?? 0) * u;
  out[13] = (out[13] ?? 0) * u;
  out[14] = (out[14] ?? 0) * u;
  return out;
}

/** Escala de usuario aplicada ao mundo: S * M (linhas 0..2). */
export function scaleWorld(m: Mat4, s: number): Mat4 {
  if (s === 1) return m;
  return m.map((v, i) => (i % 4 < 3 ? v * s : v));
}

/** Matriz a partir de TRS (quaternion [x,y,z,w]) no formato glTF. */
export function mat4FromTRS(t: number[], q: number[], s: number[]): Mat4 {
  const [x, y, z, w] = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const [sx, sy, sz] = [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1,
  ];
}

/** Matriz de rotacao em torno de um eixo (angulo em graus), colunas. */
export function mat4AxisAngle(ax: number, ay: number, az: number, deg: number): Mat4 {
  const len = Math.hypot(ax, ay, az) || 1;
  const x = ax / len, y = ay / len, z = az / len;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

/** Normais unitarias por vertice (media das faces ponderada pela area). Vertices sem face ficam em +Z. */
export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = new Float64Array(positions.length);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = (indices[i] ?? 0) * 3, b = (indices[i + 1] ?? 0) * 3, c = (indices[i + 2] ?? 0) * 3;
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0), uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0), uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0), vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0), vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] = (n[k] ?? 0) + nx;
      n[k + 1] = (n[k + 1] ?? 0) + ny;
      n[k + 2] = (n[k + 2] ?? 0) + nz;
    }
  }
  const out = new Float32Array(positions.length);
  for (let i = 0; i < out.length; i += 3) {
    const x = n[i] ?? 0, y = n[i + 1] ?? 0, z = n[i + 2] ?? 0;
    const len = Math.hypot(x, y, z);
    if (len > 1e-20) {
      out[i] = x / len;
      out[i + 1] = y / len;
      out[i + 2] = z / len;
    } else {
      out[i + 2] = 1;
    }
  }
  return out;
}

/** Construtor de malha: deduplica vertices por chave, guarda triangulos por material e monta a definicao. */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly keyMap = new Map<string, number>();
  private readonly tris = new Map<number, number[]>();
  private missingNormal = false;
  private hasUv = false;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    let n = 0;
    for (const arr of this.tris.values()) n += arr.length / 3;
    return n;
  }

  /** Adiciona (ou reaproveita, com `key` nao nula) um vertice. Posicao, normal e UV ja convertidos. */
  vertex(key: string | null, p: ArrayLike<number>, n?: ArrayLike<number>, t?: ArrayLike<number>): number {
    if (key !== null) {
      const hit = this.keyMap.get(key);
      if (hit !== undefined) return hit;
    }
    const idx = this.pos.length / 3;
    this.pos.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
    if (n) {
      this.nor.push(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0);
    } else {
      this.missingNormal = true;
      this.nor.push(0, 0, 0);
    }
    if (t) {
      this.hasUv = true;
      this.uv.push(t[0] ?? 0, t[1] ?? 0);
    } else {
      this.uv.push(0, 0);
    }
    if (key !== null) this.keyMap.set(key, idx);
    return idx;
  }

  /** Triangulo (indices absolutos de vertice) do material `mat` (indice em `ImportedModel.materials`). */
  triangle(mat: number, a: number, b: number, c: number): void {
    let arr = this.tris.get(mat);
    if (!arr) {
      arr = [];
      this.tris.set(mat, arr);
    }
    arr.push(a, b, c);
  }

  /** Monta a definicao; `undefined` se nao houver triangulos. Normais do arquivo sao normalizadas; faltando, recalcula. */
  build(id: string, name: string): ImportedMeshDef | undefined {
    if (this.triangleCount === 0) return undefined;
    const positions = Float32Array.from(this.pos);
    const matKeys = [...this.tris.keys()].sort((a, b) => a - b);
    const total = this.triangleCount * 3;
    const indices = new Uint32Array(total);
    const groups: ImportedMeshGroup[] = [];
    let at = 0;
    for (const mk of matKeys) {
      const arr = this.tris.get(mk) ?? [];
      for (let i = 0; i < arr.length; i += 1) indices[at + i] = arr[i] ?? 0;
      groups.push({ start: at, count: arr.length, materialIndex: mk });
      at += arr.length;
    }
    let normals: Float32Array;
    if (!this.missingNormal) {
      normals = new Float32Array(this.nor.length);
      let bad = false;
      for (let i = 0; i < this.nor.length; i += 3) {
        const x = this.nor[i] ?? 0, y = this.nor[i + 1] ?? 0, z = this.nor[i + 2] ?? 0;
        const len = Math.hypot(x, y, z);
        if (len < 1e-12) bad = true;
        normals[i] = x / (len || 1);
        normals[i + 1] = y / (len || 1);
        normals[i + 2] = z / (len || 1);
      }
      if (bad) normals = computeNormals(positions, indices);
    } else {
      normals = computeNormals(positions, indices);
    }
    const uvs = this.hasUv ? Float32Array.from(this.uv) : new Float32Array(0);
    return { id, name, positions, normals, uvs, indices, groups };
  }
}

/** Material padrao usado quando a primitiva nao tem material. */
export function defaultMaterial(name = 'Sem material'): ImportedMaterial {
  return {
    name,
    color: [0.8, 0.8, 0.8],
    opacity: 1,
    category: guessCategory(name),
  };
}

export interface ModelParts {
  name: string;
  sourceFileName: string;
  sourceFormat: ImportedModel['sourceFormat'];
  defs: ImportedMeshDef[];
  instances: ImportedInstance[];
  materials: ImportedMaterial[];
  textures: ImportedTexture[];
  warnings: string[];
  startedAt: number;
  sourceBytes: number;
  /** Escala extra do usuario (opts.scale). */
  scale?: number;
}

/** Monta o `ImportedModel`: aplica escala do usuario, confere limites e preenche estatisticas. */
export function buildModel(p: ModelParts): ImportedModel {
  const warnings = [...p.warnings];
  const instances = p.instances.map((i) => ({ ...i, transform: scaleWorld(i.transform, p.scale ?? 1) }));
  if (p.defs.length === 0 || instances.length === 0) throw new ImportError('Nenhuma malha encontrada no arquivo.');
  const vertices = p.defs.reduce((s, d) => s + d.positions.length / 3, 0);
  const triangles = p.defs.reduce((s, d) => s + d.indices.length / 3, 0);
  if (vertices > IMPORT_LIMITS.refuseVerticesPerBlock) {
    // units-ok: contagem de vertices, nao e medida do projeto
    throw new ImportError(`Bloco com ${vertices.toLocaleString('pt-BR')} vértices; o limite é ${IMPORT_LIMITS.refuseVerticesPerBlock.toLocaleString('pt-BR')}. Simplifique o modelo antes de importar.`);
  }
  if (vertices > IMPORT_LIMITS.warnVerticesPerBlock) {
    // units-ok: contagem de vertices, nao e medida do projeto
    warnings.push(`Bloco pesado (${vertices.toLocaleString('pt-BR')} vértices): a importação funciona, mas pode ficar lenta.`);
  }
  return {
    name: p.name,
    sourceFileName: p.sourceFileName,
    sourceFormat: p.sourceFormat,
    defs: p.defs,
    instances,
    materials: p.materials,
    textures: p.textures,
    warnings,
    stats: {
      vertices,
      triangles,
      definitions: p.defs.length,
      instances: instances.length,
      textures: p.textures.length,
      sourceBytes: p.sourceBytes,
      ms: Date.now() - p.startedAt,
    },
  };
}

/** Converte coeficiente de brilho (Phong/OBJ Ns) em rugosidade aproximada. */
export function roughnessFromShininess(ns: number): number {
  return Math.min(1, Math.max(0, Math.sqrt(2 / (Math.max(0, ns) + 2))));
}

/** Decodifica base64 (funciona em Node e no navegador). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Texto UTF-8 de bytes (sem BOM). */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}
