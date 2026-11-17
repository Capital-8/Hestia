/**
 * Leitor de Wavefront OBJ com MTL (parser proprio).
 *
 * - Unidade presumida em metros (OBJ nao declara unidade): sempre gera aviso.
 * - `up` (padrao 'y'): o arquivo e Y para cima e e convertido para Z para cima. Use `up: 'z'` para arquivos ja em Z.
 * - Um objeto (`o`) vira uma definicao; sem `o`, o arquivo inteiro vira uma definicao. Grupos (`usemtl`) viram grupos.
 * - MTL: Kd (cor), d ou Tr (opacidade), Ns (rugosidade aproximada), map_Kd (textura PNG/JPEG vizinha).
 * - UV: vt copiado como esta (1.0 = uma imagem). A origem de V nao e invertida: o renderizador decide.
 */
import {
  AXIS_IDENTITY,
  AXIS_Y_UP_TO_Z,
  baseName,
  buildModel,
  checkAbort,
  decodeText,
  defaultMaterial,
  emptyContext,
  extForMime,
  guessCategory,
  ImportError,
  lookupFile,
  MeshBuilder,
  mat4Identity,
  progress,
  type ReaderContext,
  rot3,
  roughnessFromShininess,
  safeFileName,
  sniffImage,
} from './fmtCommon.ts';
import type { ImportedMaterial, ImportedMeshDef, ImportedModel, ImportedTexture, ImportFn, ImportOptions } from './types.ts';

export interface ObjOptions {
  /** Eixo para cima do arquivo: 'y' (padrao, converte) ou 'z' (nao converte). */
  up?: 'y' | 'z';
}

interface MtlResult {
  materials: ImportedMaterial[];
  byName: Map<string, number>;
}

/** Le um .mtl e registra materiais e texturas. Textura ausente vira aviso. */
function parseMtl(text: string, ctx: ReaderContext, warnings: string[], textures: ImportedTexture[], textureByFile: Map<string, number>): MtlResult {
  const materials: ImportedMaterial[] = [];
  const byName = new Map<string, number>();
  let cur: ImportedMaterial | undefined;
  let mapName: string | undefined;
  const flush = () => {
    if (!cur) return;
    if (mapName) {
      const file = mapName;
      let ti = textureByFile.get(file);
      if (ti === undefined) {
        const bytes = lookupFile(ctx, file);
        if (!bytes) {
          warnings.push(`Textura "${baseName(file)}" do material "${cur.name}" não foi encontrada ao lado do OBJ; material sem imagem.`);
        } else {
          const mime = sniffImage(bytes);
          if (!mime) {
            warnings.push(`Textura "${baseName(file)}" em formato não suportado (só PNG e JPEG); ignorada.`);
          } else {
            const base = safeFileName(baseName(file));
            const fileName = /\.(png|jpe?g)$/i.test(base) ? base : `${base}.${extForMime(mime)}`;
            textures.push({ fileName, mime, bytes: bytes.slice() });
            ti = textures.length - 1;
            textureByFile.set(file, ti);
          }
        }
      }
      if (ti !== undefined) cur.textureIndex = ti;
    }
    materials.push(cur);
    byName.set(cur.name, materials.length - 1);
    cur = undefined;
    mapName = undefined;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    const args = rest;
    switch (key) {
      case 'newmtl':
        flush();
        cur = { name: args.join(' ') || `material-${materials.length}`, color: [0.8, 0.8, 0.8], opacity: 1 };
        cur.category = guessCategory(cur.name);
        break;
      case 'Kd':
        if (cur && args.length >= 3) cur.color = [Number(args[0]), Number(args[1]), Number(args[2])];
        break;
      case 'd':
        if (cur && args[0] !== undefined) cur.opacity = clamp01(Number(args[0]));
        break;
      case 'Tr':
        if (cur && args[0] !== undefined) cur.opacity = clamp01(1 - Number(args[0]));
        break;
      case 'Ns':
        if (cur && args[0] !== undefined) cur.roughness = roughnessFromShininess(Number(args[0]));
        break;
      case 'map_Kd':
        // opcoes (-s, -o, -clamp ...) vem antes do nome; o nome e o ultimo token
        if (cur) mapName = args[args.length - 1];
        break;
      default:
        break;
    }
  }
  flush();
  return { materials, byName };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/** Le OBJ (e MTL vizinho) com contexto de arquivos. */
export async function readObj(file: { name: string; bytes: Uint8Array }, opts: ImportOptions | undefined, ctx: ReaderContext, obj: ObjOptions = {}): Promise<ImportedModel> {
  const startedAt = Date.now();
  checkAbort(opts);
  progress(opts, 0.05, 'Lendo OBJ');
  const text = decodeText(file.bytes);
  const up = obj.up ?? 'y';
  const R = up === 'y' ? AXIS_Y_UP_TO_Z : AXIS_IDENTITY;
  const warnings: string[] = ['Unidade do OBJ presumida em metros (o formato não declara unidade).'];
  const textures: ImportedTexture[] = [];
  const textureByFile = new Map<string, number>();
  const materials: ImportedMaterial[] = [];
  const matByName = new Map<string, number>();

  const getMaterial = (name: string): number => {
    const hit = matByName.get(name);
    if (hit !== undefined) return hit;
    const m = defaultMaterial(name);
    materials.push(m);
    matByName.set(name, materials.length - 1);
    return materials.length - 1;
  };

  const vs: number[][] = [];
  const vts: number[][] = [];
  const vns: number[][] = [];
  const defs: ImportedMeshDef[] = [];
  let mb = new MeshBuilder();
  let objName: string | undefined;
  let curMat = getMaterial('Sem material');
  let defCount = 0;
  const vertexKeyBase = new Map<string, number>();
  let hasObjects = false;

  const flushDef = () => {
    const name = objName ?? baseName(file.name).replace(/\.obj$/i, '');
    const def = mb.build(`o${defCount}`, name);
    if (def) {
      defs.push(def);
      defCount += 1;
    }
    mb = new MeshBuilder();
    vertexKeyBase.clear();
  };

  const resolveIdx = (raw: string, len: number): number => {
    const v = Number(raw);
    if (!Number.isInteger(v) || v === 0) throw new ImportError(`Índice inválido no OBJ: "${raw}".`);
    const idx = v < 0 ? len + v : v - 1;
    if (idx < 0 || idx >= len) throw new ImportError('Índice de vértice fora do intervalo no OBJ (arquivo corrompido ou truncado?).');
    return idx;
  };

  const mtllibs: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li += 1) {
    const line = (lines[li] ?? '').trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...args] = line.split(/\s+/);
    switch (key) {
      case 'v': {
        if (args.length < 3) throw new ImportError(`Linha "v" incompleta no OBJ (linha ${li + 1}); arquivo truncado?`);
        vs.push([Number(args[0]), Number(args[1]), Number(args[2])]);
        break;
      }
      case 'vt':
        vts.push([Number(args[0] ?? 0), Number(args[1] ?? 0)]);
        break;
      case 'vn':
        vns.push([Number(args[0] ?? 0), Number(args[1] ?? 0), Number(args[2] ?? 0)]);
        break;
      case 'o':
      case 'g':
        if (key === 'o') {
          if (hasObjects || mb.triangleCount > 0) flushDef();
          hasObjects = true;
          objName = args.join(' ') || `objeto-${defCount}`;
        }
        break;
      case 'usemtl':
        curMat = getMaterial(args.join(' ') || 'Sem material');
        break;
      case 'mtllib':
        mtllibs.push(args.join(' '));
        break;
      case 'f': {
        const corners = args.map((tok) => {
          const parts = tok.split('/');
          const vi = resolveIdx(parts[0] ?? '', vs.length);
          const ti = parts[1] !== undefined && parts[1] !== '' ? resolveIdx(parts[1], vts.length) : undefined;
          const ni = parts[2] !== undefined && parts[2] !== '' ? resolveIdx(parts[2], vns.length) : undefined;
          const key = `${vi}/${ti ?? ''}/${ni ?? ''}`;
          let idx = vertexKeyBase.get(key);
          if (idx === undefined) {
            const p = vs[vi] ?? [0, 0, 0];
            const q = rot3(R, p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
            const n = ni !== undefined ? vns[ni] : undefined;
            const nn = n ? rot3(R, n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) : undefined;
            const t = ti !== undefined ? vts[ti] : undefined;
            idx = mb.vertex(null, q, nn, t);
            vertexKeyBase.set(key, idx);
          }
          return idx;
        });
        for (let k = 1; k + 1 < corners.length; k += 1) {
          mb.triangle(curMat, corners[0] ?? 0, corners[k] ?? 0, corners[k + 1] ?? 0);
        }
        break;
      }
      default:
        break;
    }
  }
  flushDef();
  if (defs.length === 0) throw new ImportError('Nenhuma face encontrada no OBJ.');
  progress(opts, 0.5, 'Materiais');

  for (const lib of mtllibs) {
    const bytes = lookupFile(ctx, lib);
    if (!bytes) {
      warnings.push(`Biblioteca de materiais "${lib}" não encontrada; materiais padrão aplicados.`);
      continue;
    }
    const mtl = parseMtl(decodeText(bytes), ctx, warnings, textures, textureByFile);
    for (const m of mtl.materials) {
      const hit = matByName.get(m.name);
      if (hit !== undefined) materials[hit] = m;
      else {
        materials.push(m);
        matByName.set(m.name, materials.length - 1);
      }
    }
  }

  // Materiais criados por usemtl sem definicao no MTL, e o padrao de "Sem material", ficam como estao.
  const used = new Set<number>();
  for (const d of defs) for (const g of d.groups) used.add(g.materialIndex);
  const finalMaterials = materials.length ? materials : [defaultMaterial()];
  // Remapeia indices: descarta os nao usados para nao poluir a lista.
  const remap = new Map<number, number>();
  const outMats: ImportedMaterial[] = [];
  for (let i = 0; i < finalMaterials.length; i += 1) {
    if (!used.has(i)) continue;
    remap.set(i, outMats.length);
    outMats.push(finalMaterials[i]!);
  }
  for (const d of defs) for (const g of d.groups) g.materialIndex = remap.get(g.materialIndex) ?? 0;
  progress(opts, 0.9, 'Montando modelo');

  // Instancia unica: o OBJ e um bloco; a transformacao e a identidade (Z para cima ja aplicado nos vertices).
  const instances = defs.map((d) => ({ defId: d.id, name: d.name, transform: mat4Identity() }));
  const name = baseName(file.name).replace(/\.obj$/i, '');
  return buildModel({
    name,
    sourceFileName: file.name,
    sourceFormat: 'obj',
    defs,
    instances,
    materials: outMats,
    textures,
    warnings,
    startedAt,
    sourceBytes: file.bytes.length,
    scale: opts?.scale,
  });
}

/** `ImportFn` do OBJ (Y para cima, convertido), sem arquivos vizinhos. */
export const importObj: ImportFn = (file, opts) => readObj(file, opts, emptyContext());

/** Variante com opcoes (ex.: `up: 'z'`) e contexto de arquivos vizinhos (ZIP). */
export function importObjWith(obj: ObjOptions, ctx: ReaderContext): ImportFn {
  return (file, opts) => readObj(file, opts, ctx, obj);
}
