import { materialEfetivo, type Material } from '@hestia/model';

/** Partes puras da prévia de material (sem three.js): ladrilhos soltos e parâmetros do material físico. */

/** Fresta entre ladrilhos, em fração do lado. */
export const FRESTA = 0.08;
/** Raio do canto, em fração do lado do ladrilho. */
export const RAIO_CANTO = 0.15;

/** Três tons neutros alternados (sRGB). */
export const TONS_LADRILHO: readonly [string, string, string] = ['#d9d6d0', '#c4c1bb', '#adaaa5'];

export interface Ladrilho {
  /** Centro no plano do ladrilho (u horizontal, v vertical/profundidade). */
  u: number;
  v: number;
  /** Índice do tom (0..2). */
  tom: 0 | 1 | 2;
}

/** Hash inteiro determinístico: o mesmo layout em toda renderização (sem Math.random). */
function hash(i: number, j: number): number {
  let h = (Math.imul(i + 374761393, 668265263) ^ Math.imul(j + 1274126177, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Grade de ladrilhos centrada em `centro` (u,v). Tom alternado pelo xadrez deslocado por um hash, de modo que
 * vizinhos diretos nunca repetem o tom (visual solto, não uniforme).
 */
export function gerarLadrilhos(colunas: number, linhas: number, lado: number, centro: readonly [number, number] = [0, 0]): Ladrilho[] {
  const out: Ladrilho[] = [];
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < colunas; i++) {
      const base = (i + j) % 2 === 0 ? 0 : 1;
      // Metade dos ladrilhos do "par" troca para o terceiro tom: três tons sem vizinhos iguais.
      const tom = (base === 0 && hash(i, j) % 3 === 0 ? 2 : base) as 0 | 1 | 2;
      out.push({ u: centro[0] + (i - (colunas - 1) / 2) * lado, v: centro[1] + (j - (linhas - 1) / 2) * lado, tom });
    }
  }
  return out;
}

/** Quantidade de ladrilhos por lado: miniatura usa poucos. */
export function gradeLadrilhos(low: boolean): { colunas: number; linhas: number } {
  return low ? { colunas: 5, linhas: 3 } : { colunas: 9, linhas: 5 };
}

export interface ParametrosMaterial {
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  depthWrite: boolean;
}

/** `materialEfetivo` → parâmetros do MeshPhysicalMaterial. Textura é TODO(etapa futura): hoje só cor e escalares. */
export function parametrosMaterial(m: Material): ParametrosMaterial {
  const a = materialEfetivo(m).aparencia;
  const liso = 1 - a.rugosidade;
  const opaco = a.opacidade >= 0.999;
  return {
    color: a.cor,
    roughness: a.rugosidade,
    metalness: a.metal,
    opacity: a.opacidade,
    transparent: !opaco,
    // Verniz só em superfícies lisas e não metálicas (cerâmica, vidro, laca).
    clearcoat: a.metal < 0.5 ? Math.max(0, liso - 0.5) * 0.8 : 0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.6 + 0.8 * a.metal,
    depthWrite: opaco,
  };
}
