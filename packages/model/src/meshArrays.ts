import type { Generic, GenericMesh, Project } from './types.ts';

/**
 * Malha dos objetos genéricos em memória: `Float32Array` (posições) e `Uint32Array` (índices). O arquivo salvo
 * continua com arrays JSON comuns (formato idêntico ao anterior), então não há migração de esquema: a leitura aceita
 * os dois formatos e normaliza, e a gravação (`serializeProject`) converte de volta.
 */

/** Malha com arrays tipados; devolve a mesma referência quando já está normalizada. */
export function typedMesh(mesh: GenericMesh): { positions: Float32Array; indices: Uint32Array } {
  const { positions, indices } = mesh;
  if (positions instanceof Float32Array && indices instanceof Uint32Array) return { positions, indices };
  return {
    positions: positions instanceof Float32Array ? positions : Float32Array.from(positions),
    indices: indices instanceof Uint32Array ? indices : Uint32Array.from(indices),
  };
}

/** Desloca o Z (terceira coordenada) de uma lista x, y, z...; sempre devolve uma cópia tipada. */
export function meshShiftedZ(positions: GenericMesh['positions'], dz: number): Float32Array {
  const out = Float32Array.from(positions);
  for (let i = 2; i < out.length; i += 3) out[i] = out[i]! + dz;
  return out;
}

/**
 * Normaliza as malhas de todos os genéricos para arrays tipados (in place no mapa `elements`, que é do chamador:
 * vem de um `JSON.parse` ou de um import recém-montado). Libera os arrays comuns assim que cada malha é convertida.
 */
export function normalizeProjectMeshes<T extends Pick<Project, 'elements'>>(p: T): T {
  for (const [id, e] of Object.entries(p.elements)) {
    if (e?.kind !== 'generic') continue;
    const g = e as Generic;
    if (!g.mesh) continue;
    if (g.mesh.positions instanceof Float32Array && g.mesh.indices instanceof Uint32Array) continue;
    (p.elements as Record<string, unknown>)[id] = { ...g, mesh: typedMesh(g.mesh) };
  }
  return p;
}

const POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

/** Menor texto decimal que volta ao mesmo float32 (evita `0.10000000149011612` no arquivo). Aritmética barata primeiro. */
function shortFloat32(x: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return x;
  for (let d = 1; d < POW10.length; d++) {
    const y = Math.round(x * POW10[d]!) / POW10[d]!;
    if (Math.fround(y) === x) return y;
  }
  return Number(x.toPrecision(9));
}

/** Replacer do `JSON.stringify`: typed array vira array comum (posições com o texto mais curto que preserva o float32). */
export function meshJsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float32Array) {
    const out = new Array<number>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = shortFloat32(value[i]!);
    return out;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return Array.from(value as unknown as ArrayLike<number>);
  return value;
}

/** Ponto único de gravação do projeto (Salvar, autosave, biblioteca): mesmo JSON de sempre, com as malhas como arrays. */
export function serializeProject(p: Project, space?: number): string {
  return JSON.stringify(p, meshJsonReplacer, space);
}
