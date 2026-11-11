/**
 * Leitor de FBX usando o FBXLoader do three (ja no repo, via packages/render).
 *
 * - Unidade: `GlobalSettings.UnitScaleFactor` (1 = centimetro, 100 = metro); FBX sem a propriedade e lido como cm.
 * - Eixo: FBX costuma ser Y para cima; o leitor assume isso e converte para Z (aviso emitido).
 * - Texturas embutidas no FBX nao sao extraidas (avisos); cor difusa e usada.
 * - Limitacao: o FBXLoader depende do parser do three. Se ele falhar em Node, a mensagem sai em portugues.
 */
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  AXIS_Y_UP_TO_Z,
  baseName,
  buildModel,
  changeAxisMat,
  checkAbort,
  defaultMaterial,
  emptyContext,
  guessCategory,
  ImportError,
  MeshBuilder,
  progress,
  type ReaderContext,
  rot3,
  scaleTranslation,
} from './fmtCommon.ts';
import type { ImportedInstance, ImportedMaterial, ImportedMeshDef, ImportedModel, ImportFn, ImportOptions, Mat4 } from './types.ts';

/** Objeto minimo do three que usamos (evita depender de tipos completos). */
interface ThreeObj {
  isMesh?: boolean;
  name: string;
  matrixWorld: { elements: number[] };
  geometry: any;
  material: any;
  children: ThreeObj[];
  userData: Record<string, any>;
  updateMatrixWorld?: (force: boolean) => void;
}

export async function readFbx(file: { name: string; bytes: Uint8Array }, opts: ImportOptions | undefined, ctx: ReaderContext): Promise<ImportedModel> {
  void ctx;
  const startedAt = Date.now();
  checkAbort(opts);
  progress(opts, 0.05, 'Lendo FBX');
  const warnings: string[] = [];
  let root: ThreeObj;
  try {
    const buf = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    root = new FBXLoader().parse(buf, '') as unknown as ThreeObj;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    throw new ImportError(`Não foi possível ler este FBX (${motivo}). Exporte como glTF (.glb) ou OBJ no software 3D.`);
  }
  root.updateMatrixWorld?.(true);
  const unitScale = Number(root.userData?.unitScaleFactor ?? 1);
  const toMeters = (Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1) / 100;
  if (!root.userData?.unitScaleFactor) warnings.push('FBX sem unidade declarada: presumido centímetro.');
  warnings.push('FBX: eixo presumido Y para cima (convertido para Z).');
  warnings.push('FBX: texturas embutidas não são extraídas nesta versão; usada a cor difusa.');

  const materials: ImportedMaterial[] = [];
  const matIndexByObj = new Map<unknown, number>();
  const materialOf = (m: any): number => {
    const hit = matIndexByObj.get(m);
    if (hit !== undefined) return hit;
    const name: string = m?.name || `material-${materials.length}`;
    const c = m?.color;
    const mat: ImportedMaterial = {
      name,
      color: c ? [c.r ?? 0.8, c.g ?? 0.8, c.b ?? 0.8] : [0.8, 0.8, 0.8],
      opacity: typeof m?.opacity === 'number' ? Math.min(1, Math.max(0, m.opacity)) : 1,
      category: guessCategory(name),
    };
    materials.push(mat);
    matIndexByObj.set(m, materials.length - 1);
    return materials.length - 1;
  };

  const defs: ImportedMeshDef[] = [];
  const defByGeom = new Map<unknown, string>();
  const instances: ImportedInstance[] = [];
  const buildDef = (geom: any, mats: any[]): ImportedMeshDef | undefined => {
    const pos = geom.attributes?.position;
    if (!pos) return undefined;
    const nor = geom.attributes.normal;
    const uv = geom.attributes.uv;
    const mb = new MeshBuilder();
    const n = pos.count as number;
    for (let v = 0; v < n; v += 1) {
      const p = rot3(AXIS_Y_UP_TO_Z, pos.getX(v) * toMeters, pos.getY(v) * toMeters, pos.getZ(v) * toMeters);
      const nv = nor ? rot3(AXIS_Y_UP_TO_Z, nor.getX(v), nor.getY(v), nor.getZ(v)) : undefined;
      const tv = uv ? [uv.getX(v), uv.getY(v)] : undefined;
      mb.vertex(null, p, nv, tv);
    }
    const index: ArrayLike<number> | undefined = geom.index?.array;
    const triCount = Math.floor((index ? index.length : n) / 3);
    const at = (k: number) => (index ? (index[k] as number) : k);
    const groups: Array<{ start: number; count: number; materialIndex: number }> = geom.groups?.length
      ? geom.groups
      : [{ start: 0, count: triCount * 3, materialIndex: 0 }];
    for (const g of groups) {
      const mIdx = mats.length ? materialOf(mats[g.materialIndex] ?? mats[0]) : materialOf(undefined);
      for (let k = g.start; k + 2 < g.start + g.count; k += 3) mb.triangle(mIdx, at(k), at(k + 1), at(k + 2));
    }
    return mb.build(`f${defs.length}`, geom.name || `malha-${defs.length}`);
  };

  const visit = (o: ThreeObj, depth: number): void => {
    if (depth > 256) throw new ImportError('Hierarquia do FBX profunda demais.');
    if (o.isMesh && o.geometry) {
      let defId = defByGeom.get(o.geometry);
      if (!defId) {
        const mats: any[] = Array.isArray(o.material) ? o.material : [o.material];
        const def = buildDef(o.geometry, mats);
        if (def) {
          defs.push(def);
          defId = def.id;
          defByGeom.set(o.geometry, defId);
        }
      }
      if (defId) {
        const m = o.matrixWorld.elements as Mat4;
        instances.push({ defId, name: o.name || undefined, transform: scaleTranslation(changeAxisMat(m, AXIS_Y_UP_TO_Z), toMeters) });
      }
    }
    for (const c of o.children) visit(c, depth + 1);
  };
  visit(root, 0);
  if (defs.length === 0) throw new ImportError('Nenhuma malha encontrada no FBX.');
  progress(opts, 0.9, 'Montando modelo');
  return buildModel({
    name: baseName(file.name).replace(/\.fbx$/i, ''),
    sourceFileName: file.name,
    sourceFormat: 'fbx',
    defs,
    instances,
    materials: materials.length ? materials : [defaultMaterial()],
    textures: [],
    warnings,
    startedAt,
    sourceBytes: file.bytes.length,
    scale: opts?.scale,
  });
}

/** `ImportFn` do FBX. */
export const importFbx: ImportFn = (file, opts) => readFbx(file, opts, emptyContext());
