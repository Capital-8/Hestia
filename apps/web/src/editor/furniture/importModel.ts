import { buildFurnitureAsset, type FurnitureAsset, type FurnitureCategory, type FurnitureImportInput } from '@hestia/model';
import { IMPORT_LIMITS, type FurnitureImportedModel } from '@hestia/io';

/** Unidade em que os números do arquivo estão (multiplicador sobre o que o leitor já entregou, em metros). */
export type FileUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft';
export const FILE_UNITS: readonly FileUnit[] = ['m', 'cm', 'mm', 'in', 'ft'];
export const UNIT_FACTOR: Record<FileUnit, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };

/** Eixo "para cima" do arquivo: `auto` = o padrão do formato (glTF/OBJ/FBX/DAE: Y; SKP: Z). */
export type UpChoice = 'auto' | 'y' | 'z';
export const UP_CHOICES: readonly UpChoice[] = ['auto', 'y', 'z'];

/** O leitor já converte para Z para cima; o padrão de cada formato diz de onde ele partiu. */
export function formatUp(format: string): 'y' | 'z' {
  return format === 'skp' ? 'z' : 'y';
}

/** Matriz 3x3 (linhas) a aplicar sobre o modelo já lido para refletir o eixo escolhido; `null` = nada a fazer. */
export function upCorrection(format: string, choice: UpChoice): number[] | null {
  const def = formatUp(format);
  if (choice === 'auto' || choice === def) return null;
  // arquivo Y-up lido como padrão e na verdade Z-up: desfaz Y->Z; arquivo Z-up (skp) que na verdade é Y-up: aplica Y->Z.
  return choice === 'z' ? [1, 0, 0, 0, 0, 1, 0, -1, 0] : [1, 0, 0, 0, 0, -1, 0, 1, 0];
}

/** Dimensões (X, Y, Z) depois da correção de eixo: trocar Y e Z de lugar (a correção é uma rotação de 90° em X). */
export function orientDims(dims: [number, number, number], format: string, choice: UpChoice): [number, number, number] {
  return upCorrection(format, choice) ? [dims[0], dims[2], dims[1]] : dims;
}

/**
 * Multiplicadores por eixo para o usuário digitar a dimensão final de UM eixo. `dims` são as dimensões atuais SEM o
 * multiplicador (já com unidade e eixo). Com `keepRatio` os três eixos recebem o mesmo multiplicador.
 */
export function scaleForTarget(dims: readonly number[], axis: 0 | 1 | 2, target: number, keepRatio: boolean, current: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const d = dims[axis]!;
  if (!(d > 0) || !(target > 0) || !Number.isFinite(target)) return current;
  const k = target / d;
  if (keepRatio) return [k, k, k];
  const out: [number, number, number] = [...current];
  out[axis] = k;
  return out;
}

/** As 17 categorias de material (mesmas do contrato 1.4), na ordem de exibição. */
export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'wood', 'metal', 'glass', 'ceramic', 'concrete', 'plaster', 'paint', 'brick', 'stone',
  'roof_tile', 'fabric', 'leather', 'grass', 'soil', 'asphalt', 'plastic', 'other',
];

/** O que o usuário pode mudar em cada material do arquivo. */
export interface MaterialEdit {
  category: FurnitureCategory;
  /** #rrggbb. */
  color: string;
  useEmbeddedTexture: boolean;
}

const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
export const rgbToHex = (c: readonly [number, number, number]): string => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
export function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1]!, 16) : 0x808080;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Valores iniciais dos campos por material: o que o leitor sugeriu. */
export function initialMaterialEdits(model: FurnitureImportedModel): MaterialEdit[] {
  return model.materials.map((m) => ({
    category: m.category ?? 'other',
    color: rgbToHex(m.color),
    useEmbeddedTexture: m.textureIndex !== undefined,
  }));
}

export interface ModelSummary {
  vertices: number;
  triangles: number;
  parts: number;
  definitions: number;
  textures: number;
  materials: number;
  /** Dimensões em metros (X, Y, Z) já com o fator de unidade. */
  dims: [number, number, number];
}

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Dimensões do bloco (caixa das peças no espaço do bloco), em metros, com `factor` aplicado. */
export function modelDims(model: FurnitureImportedModel, factor = 1): [number, number, number] {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const box = new Map<string, { lo: number[]; hi: number[] }>();
  for (const d of model.defs) {
    const l = [Infinity, Infinity, Infinity];
    const h = [-Infinity, -Infinity, -Infinity];
    const p = d.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k]!;
        if (v < l[k]!) l[k] = v;
        if (v > h[k]!) h[k] = v;
      }
    }
    box.set(d.id, { lo: l, hi: h });
  }
  const parts = model.instances.length ? model.instances : model.defs.map((d) => ({ defId: d.id, transform: IDENT }));
  for (const part of parts) {
    const b = box.get(part.defId);
    if (!b || b.lo[0] === Infinity) continue;
    const m = part.transform;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.hi[0]! : b.lo[0]!;
      const y = i & 2 ? b.hi[1]! : b.lo[1]!;
      const z = i & 4 ? b.hi[2]! : b.lo[2]!;
      const w = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
      for (let k = 0; k < 3; k++) {
        if (w[k]! < lo[k]!) lo[k] = w[k]!;
        if (w[k]! > hi[k]!) hi[k] = w[k]!;
      }
    }
  }
  if (lo[0] === Infinity) return [0, 0, 0];
  return [(hi[0]! - lo[0]!) * factor, (hi[1]! - lo[1]!) * factor, (hi[2]! - lo[2]!) * factor];
}

export function summarizeModel(model: FurnitureImportedModel, factor = 1, up: UpChoice = 'auto', axisScale: [number, number, number] = [1, 1, 1]): ModelSummary {
  const d = orientDims(modelDims(model, factor), model.sourceFormat, up);
  return {
    vertices: model.stats.vertices,
    triangles: model.stats.triangles,
    parts: model.instances.length || model.defs.length,
    definitions: model.defs.length,
    textures: model.textures.length,
    materials: model.materials.length,
    dims: [d[0] * axisScale[0], d[1] * axisScale[1], d[2] * axisScale[2]],
  };
}

/** Recusa por tamanho do ARQUIVO antes de ler (50 MB). */
export function fileTooBig(bytes: number): boolean {
  return bytes > IMPORT_LIMITS.refuseFileBytes;
}

/** Classificação por vértices: `ok`, `warn` (acima de 300 mil) ou `refuse` (acima de 600 mil). */
export function vertexLevel(vertices: number): 'ok' | 'warn' | 'refuse' {
  if (vertices > IMPORT_LIMITS.refuseVerticesPerBlock) return 'refuse';
  if (vertices > IMPORT_LIMITS.warnVerticesPerBlock) return 'warn';
  return 'ok';
}

export interface BuildOptions {
  name: string;
  /** Multiplicador de unidade (ver `UNIT_FACTOR`). */
  factor: number;
  materials: MaterialEdit[];
  /** Eixo "para cima" escolhido (padrão `auto`). */
  up?: UpChoice;
  /** Multiplicadores extras por eixo final (X, Y, Z), depois da unidade; padrão 1. */
  axisScale?: [number, number, number];
}

const mulMat = (a: number[], b: number[]): number[] => {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
};
const ID16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Matriz 4x4 (colunas) S·R: correção de eixo e depois multiplicadores por eixo; `null` se for a identidade. */
function finalMatrix(format: string, up: UpChoice, s: [number, number, number]): number[] | null {
  const r = upCorrection(format, up);
  if (!r && s.every((v) => v === 1)) return null;
  const R = r ? [r[0]!, r[3]!, r[6]!, 0, r[1]!, r[4]!, r[7]!, 0, r[2]!, r[5]!, r[8]!, 0, 0, 0, 0, 1] : ID16;
  return mulMat([s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1], R);
}

/**
 * Converte o modelo lido em entrada do `buildFurnitureAsset`. Com `factor` diferente de 1 as posições (e o tamanho físico
 * das texturas) são multiplicadas e a translação das peças também; a parte linear das peças não muda.
 */
export function toFurnitureInput(model: FurnitureImportedModel, o: BuildOptions): FurnitureImportInput {
  const f = o.factor > 0 && Number.isFinite(o.factor) ? o.factor : 1;
  const defs = model.defs.map((d) => {
    if (f === 1) return d;
    const positions = new Float32Array(d.positions.length);
    for (let i = 0; i < positions.length; i++) positions[i] = d.positions[i]! * f;
    return { ...d, positions };
  });
  const A = finalMatrix(model.sourceFormat, o.up ?? 'auto', o.axisScale ?? [1, 1, 1]);
  const source = A && model.instances.length === 0 ? model.defs.map((d) => ({ defId: d.id, name: undefined as string | undefined, transform: ID16 })) : model.instances;
  const instances = source.map((i) => {
    let m = i.transform.slice();
    if (f !== 1) {
      m[12] = m[12]! * f;
      m[13] = m[13]! * f;
      m[14] = m[14]! * f;
    }
    if (A) m = mulMat(A, m);
    return { defId: i.defId, ...(i.name ? { name: i.name } : {}), transform: m };
  });
  const ms = o.axisScale ? (o.axisScale[0] + o.axisScale[1] + o.axisScale[2]) / 3 : 1;
  return {
    name: o.name.trim() || model.name,
    sourceFileName: model.sourceFileName,
    sourceFormat: model.sourceFormat,
    defs,
    instances,
    materials: model.materials.map((m, i) => {
      const e = o.materials[i];
      return {
        name: m.name,
        color: e ? hexToRgb(e.color) : m.color,
        opacity: m.opacity,
        category: e?.category ?? m.category ?? 'other',
        ...(m.textureIndex !== undefined ? { textureIndex: m.textureIndex } : {}),
        ...(m.sizeM ? { sizeM: [m.sizeM[0] * f * ms, m.sizeM[1] * f * ms] as [number, number] } : {}),
        ...(m.metallic !== undefined ? { metallic: m.metallic } : {}),
        ...(m.roughness !== undefined ? { roughness: m.roughness } : {}),
        ...(m.transmission !== undefined ? { transmission: m.transmission } : {}),
      };
    }),
    textures: model.textures,
    stats: { sourceBytes: model.stats.sourceBytes },
  };
}

/** Monta o asset pronto para o comando `addFurnitureAsset` (aplica "usar a textura do arquivo" por material). */
export function buildAssetFromModel(model: FurnitureImportedModel, o: BuildOptions, id?: string): FurnitureAsset {
  const asset = buildFurnitureAsset(toFurnitureInput(model, o), id);
  asset.materials.forEach((m, i) => {
    m.useEmbeddedTexture = o.materials[i]?.useEmbeddedTexture !== false && m.textureIndex !== undefined;
  });
  return asset;
}
