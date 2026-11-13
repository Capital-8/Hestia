import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import { type CurvaTerreno, type Terrain, type TerrainRegion } from './terrainTypes.ts';
import { areaAnelComSinal, paresParaPontos } from './validateTerrain.ts';
import type { Element } from './types.ts';

export const isTerrain = (e: Element | undefined): e is Terrain => e?.kind === 'terrain';
export const isTerrainRegion = (e: Element | undefined): e is TerrainRegion => e?.kind === 'terrainRegion';

/** Monta um terreno com os padrões do modelo (A.3). `order` o comando atribui. */
export function makeTerrain(p: Pick<Terrain, 'id' | 'levelId'> & Partial<Omit<Terrain, 'kind' | 'order'>>): Omit<Terrain, 'order'> {
  return {
    kind: 'terrain',
    name: 'Terreno',
    pontos: [],
    curvas: [],
    quebras: [],
    intervaloCurvas: 1,
    mestraCada: 5,
    espessuraBase: 3,
    mostrarExistente: false,
    linhasRotulo: [],
    pontosCotados: [],
    ...p,
  };
}

/** Monta uma região com os padrões do modelo: `permeavel` é true só na subdivisão. `order` o comando atribui. */
export function makeTerrainRegion(p: Pick<TerrainRegion, 'id' | 'levelId' | 'terrenoId' | 'contorno'> & Partial<Omit<TerrainRegion, 'kind' | 'order'>>): Omit<TerrainRegion, 'order'> {
  return {
    kind: 'terrainRegion',
    name: 'Região',
    papel: 'subdivisao',
    cota: 0,
    inclinacao: 0,
    direcao: 0,
    taludeCorte: 0,
    taludeAterro: 0,
    permeavel: (p.papel ?? 'subdivisao') === 'subdivisao',
    ...p,
  };
}

/** Pares (x, y) de um vetor plano de `passo` números por ponto passam por `f`; o resto (z) segue como está. */
function mapXY(v: readonly number[], passo: number, f: (p: Vec2) => Vec2): number[] {
  const out = v.slice();
  for (let k = 0; k + 1 < v.length; k += passo) {
    const q = f({ x: v[k]!, y: v[k + 1]! });
    out[k] = q.x;
    out[k + 1] = q.y;
  }
  return out;
}

/** Inverte a ordem dos pares (x, y) de um vetor plano de pares. */
function inverterPares(xy: readonly number[]): number[] {
  const out: number[] = [];
  for (let k = xy.length - 2; k >= 0; k -= 2) out.push(xy[k]!, xy[k + 1]!);
  return out;
}

/** Borda sempre anti-horária (o comando normaliza o sentido; A.3 item 6). */
export function normalizarBorda(xy: readonly number[]): number[] {
  const pts = paresParaPontos(xy);
  return pts.length >= 3 && areaAnelComSinal(pts) < 0 ? inverterPares(xy) : xy.slice();
}

/** Contorno sempre anti-horário. */
export const normalizarContorno = (c: readonly Vec2[]): Vec2[] => (c.length >= 3 && areaAnelComSinal(c) < 0 ? c.map((q) => ({ ...q })).reverse() : c.map((q) => ({ ...q })));

export const copiaCurva = (c: CurvaTerreno): CurvaTerreno => ({ z: c.z, xy: c.xy.slice(), fechada: c.fechada });

/** Cópia profunda das fontes e listas do terreno (não compartilha vetores com o argumento). */
export const copiarTerreno = <T extends Omit<Terrain, 'order'>>(tn: T): T => ({
  ...tn,
  pontos: tn.pontos.slice(),
  curvas: tn.curvas.map(copiaCurva),
  quebras: tn.quebras.map((q) => ({ xyz: q.xyz.slice() })),
  ...(tn.borda ? { borda: tn.borda.slice() } : {}),
  linhasRotulo: tn.linhasRotulo.slice(),
  pontosCotados: tn.pontosCotados.slice(),
});

/**
 * Move, gira ou espelha o terreno (A.3 item 5): translação, rotação e espelho em todo par (x, y) de pontos, curvas,
 * quebras, borda, linhas de rótulo e pontos cotados. O z não muda. No espelho a ordem da borda é invertida (continua
 * anti-horária).
 */
export function transformTerrain(tn: Terrain, t: Transform): Terrain {
  const f = (p: Vec2): Vec2 => applyTransform(t, p);
  const borda = tn.borda ? mapXY(tn.borda, 2, f) : undefined;
  return {
    ...tn,
    pontos: mapXY(tn.pontos, 3, f),
    curvas: tn.curvas.map((c) => ({ ...c, xy: mapXY(c.xy, 2, f) })),
    quebras: tn.quebras.map((q) => ({ xyz: mapXY(q.xyz, 3, f) })),
    ...(borda ? { borda: t.kind === 'mirror' ? inverterPares(borda) : borda } : {}),
    linhasRotulo: mapXY(tn.linhasRotulo, 2, f),
    pontosCotados: mapXY(tn.pontosCotados, 2, f),
  };
}

/**
 * Move, gira ou espelha a região (A.3 item 5). Rotação soma o ângulo a `direcao`. Espelho em torno de uma linha de
 * ângulo φ: `direcao' = 2φ − direcao` e a ordem dos pontos é invertida (continua anti-horária).
 */
export function transformTerrainRegion(r: TerrainRegion, t: Transform): TerrainRegion {
  const contorno = r.contorno.map((q) => applyTransform(t, q));
  if (t.kind === 'mirror') {
    const phi = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
    return { ...r, contorno: contorno.reverse(), direcao: 2 * phi - r.direcao };
  }
  return { ...r, contorno, direcao: r.direcao + (t.kind === 'rotate' ? t.angle : 0) };
}

