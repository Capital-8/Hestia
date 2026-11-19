import type { Vec2 } from '@hestia/geom';
import { TERRENO_LIMITES, type CurvaTerreno, type OpTerreno } from '@hestia/model';
import type { PreviewItem } from './types.ts';

/**
 * Fontes que a ferramenta Topografia acumula até o Enter final: pontos soltos (x, y, z) e curvas de nível (z único).
 * São DADO DO MODELO (as fontes do terreno), nunca geometria derivada: a malha e as curvas desenhadas vêm do kernel.
 */
export interface FontesPendentes {
  pontos: number[];
  curvas: CurvaTerreno[];
}

export const semFontes = (): FontesPendentes => ({ pontos: [], curvas: [] });

/** Quantos vértices (pontos soltos e vértices de curvas) as fontes têm; o terreno aceita até `TERRENO_LIMITES.vertices`. */
export const verticesDasFontes = (f: FontesPendentes): number => f.pontos.length / 3 + f.curvas.reduce((n, c) => n + c.xy.length / 2, 0);

export const fontesVazias = (f: FontesPendentes): boolean => f.pontos.length === 0 && f.curvas.length === 0;

/** Cabe mais `n` vértices no limite do terreno (somando os que já existem em `existentes`)? */
export const cabeMais = (f: FontesPendentes, n: number, existentes = 0): boolean => verticesDasFontes(f) + existentes + n <= TERRENO_LIMITES.vertices;

/** Curva de nível feita dos pontos do rascunho, todos na mesma cota. */
export function curvaDoRascunho(pts: readonly Vec2[], z: number, fechada: boolean): CurvaTerreno {
  return { z, xy: pts.flatMap((q) => [q.x, q.y]), fechada };
}

/** Operações que ACRESCENTAM as fontes pendentes a um terreno existente (um `editTerrainFontes`). */
export function opsAcrescentar(f: FontesPendentes): OpTerreno[] {
  const ops: OpTerreno[] = [];
  for (let i = 0; i + 2 < f.pontos.length; i += 3) ops.push({ op: 'addPonto', x: f.pontos[i]!, y: f.pontos[i + 1]!, z: f.pontos[i + 2]! });
  for (const c of f.curvas) ops.push({ op: 'addCurva', z: c.z, xy: c.xy.slice(), fechada: c.fechada });
  return ops;
}

/** Operação que dá ao terreno recém-criado as fontes pendentes (`substituirFontes`). */
export function opSubstituir(f: FontesPendentes): OpTerreno {
  return { op: 'substituirFontes', pontos: f.pontos.slice(), curvas: f.curvas.map((c) => ({ z: c.z, xy: c.xy.slice(), fechada: c.fechada })), quebras: [] };
}

/** Limite de segmentos da prévia das curvas já concluídas. */
const PREVIA_MAX_SEGMENTOS = 2000;

/** Prévia das fontes pendentes: pontos soltos como pontos, curvas concluídas como polilinhas. */
export function previaDasFontes(f: FontesPendentes): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (let i = 0; i + 2 < f.pontos.length; i += 3) out.push({ kind: 'point', at: { x: f.pontos[i]!, y: f.pontos[i + 1]! } });
  let n = 0;
  for (const c of f.curvas) {
    const m = c.xy.length / 2;
    const fim = c.fechada ? m : m - 1;
    for (let i = 0; i < fim && n < PREVIA_MAX_SEGMENTOS; i++, n++) {
      const j = (i + 1) % m;
      out.push({ kind: 'line', a: { x: c.xy[2 * i]!, y: c.xy[2 * i + 1]! }, b: { x: c.xy[2 * j]!, y: c.xy[2 * j + 1]! } });
    }
  }
  return out;
}
