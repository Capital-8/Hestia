import { boxOf, boxesOverlap, difference, multiPoints, union, type Box, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { openingsOfWall, type Id, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry, resolveLevel } from './resolve.ts';
import type { ResolvedWall } from './types.ts';

/**
 * Zona bloqueada de cada parede para o término por camada (decisão 0025). Para uma camada de piso ou de laje com regra
 * explícita, a região dela é o contorno do elemento menos a zona bloqueada de cada parede que cruza o contorno:
 * - `face`: a pegada inteira da parede (todas as camadas), a camada para na face de acabamento;
 * - `nucleo`: só a faixa do núcleo, a camada avança sob os acabamentos e para no núcleo;
 * - `ate` N: da primeira camada da parede (de fora para dentro, em cada face) de prioridade efetiva ≤ N até a última
 *   dessa mesma ordem do outro lado: é a faixa entre o menor e o maior índice dessas camadas. Sem camada assim, a
 *   parede é passa (nenhuma zona).
 * Vão de porta que chega ao piso (cota do vão ≤ topo da camada) é tirado da zona: o acabamento continua sob a soleira.
 * Nenhuma regra lê nome ou material: só prioridade, núcleo e a cota.
 */

/** Regra de parede que define a zona bloqueada (o `passa` não tem zona e não entra aqui). */
export type BlockRule = { kind: 'face' } | { kind: 'nucleo' } | { kind: 'ate'; prioridade: number };

/** Tolerância (m) para cotas: parede que encosta na camada conta como tocando (decisão 0025). */
export const Z_TOL = 1e-3;

/** Parede do nível cuja faixa de cota (base até base mais altura) toca a faixa da camada (± 1 mm). */
export const wallTouchesZone = (rw: ResolvedWall, z0: number, z1: number): boolean => {
  // Faixa nominal: a parede anexada a uma laje (topo na face inferior) ainda atravessa as camadas que o término esvazia.
  const b0 = rw.nominalZ0 ?? rw.baseZ;
  const b1 = rw.nominalZ1 ?? rw.baseZ + rw.height;
  return b0 <= z1 + Z_TOL && b1 >= z0 - Z_TOL;
};

/** Índices das camadas da parede que a regra bloqueia (faixa contígua entre o menor e o maior índice, no caso `ate`). */
export function blockedLayerIndexes(rw: ResolvedWall, rule: BlockRule): number[] {
  const all = rw.layers.map((_, i) => i);
  if (rule.kind === 'face') return all;
  if (rule.kind === 'nucleo') return all.filter((i) => rw.layers[i]!.core);
  const hit = all.filter((i) => rw.layers[i]!.priority <= rule.prioridade);
  if (hit.length === 0) return [];
  const lo = hit[0]!;
  const hi = hit[hit.length - 1]!;
  return all.filter((i) => i >= lo && i <= hi);
}

/** Pegada da zona bloqueada da parede (sem vãos de porta), em planta. Vazia para parede passa. */
export function wallBlockedZone(rw: ResolvedWall, rule: BlockRule): MultiPolygon {
  const idx = blockedLayerIndexes(rw, rule);
  if (idx.length === 0) return [];
  return union(...idx.map((i) => rw.layers[i]!.raw));
}

/** Retângulo, em planta, de um vão de porta (largura do vão × espessura da parede, com margem de 5 mm por face). */
function doorRect(c: Vec2, u: Vec2, n: Vec2, halfWidth: number, halfThick: number): Ring {
  const at = (a: number, b: number): Vec2 => ({ x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b });
  return [at(-halfWidth, -halfThick), at(halfWidth, -halfThick), at(halfWidth, halfThick), at(-halfWidth, halfThick)];
}

/**
 * Vãos de porta da parede que chegam ao piso até o topo `z1` da camada (soleira no nível do acabamento): retângulos em
 * planta. Janela não entra: a zona só perde o trecho onde o piso passa por baixo de porta.
 */
export function doorRectsReaching(p: Project, rw: ResolvedWall, z1: number): MultiPolygon[] {
  const f = frameOfWall(p, rw.wallId);
  if (!f) return [];
  const rects: MultiPolygon[] = [];
  for (const o of openingsOfWall(p, rw.wallId)) {
    if (o.kind !== 'door') continue;
    const g = openingGeometry(p, o, f);
    if (rw.baseZ + g.sill > z1 + Z_TOL) continue;
    rects.push([[doorRect(g.center, g.u, g.n, g.width / 2, g.thickness / 2 + 0.005)]]);
  }
  return rects;
}

/** Zona de uma parede para a regra, na camada de topo `z1`: a pegada menos os vãos de porta que chegam ao piso. */
export function wallZoneAt(p: Project, rw: ResolvedWall, rule: BlockRule, z1: number): MultiPolygon {
  const zone = wallBlockedZone(rw, rule);
  if (zone.length === 0) return zone;
  const doors = doorRectsReaching(p, rw, z1);
  return doors.length === 0 ? zone : difference(zone, ...doors);
}

const paredesPorProjeto = new WeakMap<Project, Map<Id, ResolvedWall[]>>();

/**
 * Paredes resolvidas de um nível (o resolvedor do nível, com o cache dele). Em cache por projeto e nível: cada piso e cada
 * laje pede as paredes de até três níveis, e o resolvedor refaz quadros, pontas e alvos de anexo a cada chamada (era a
 * maior parte da montagem fria da 3D). O projeto é imutável: a edição gera outro objeto e o cache antigo sai com ele.
 * O vetor devolvido é compartilhado: quem chama não pode alterá-lo.
 */
export function wallsOfLevel(p: Project, levelId: Id): ResolvedWall[] {
  let porNivel = paredesPorProjeto.get(p);
  if (!porNivel) paredesPorProjeto.set(p, (porNivel = new Map()));
  let paredes = porNivel.get(levelId);
  if (!paredes) {
    // Anexo plano: as paredes que esvaziam as camadas não dependem das camadas (sem ciclo, decisão 0025).
    paredes = Object.values(resolveLevel(p, levelId, undefined, { flatAttach: true }).walls);
    porNivel.set(levelId, paredes);
  }
  return paredes;
}

/** Caixa de um polígono (para o filtro barato antes das booleanas). */
export const boxOfMulti = (m: MultiPolygon): Box | null => (m.length ? boxOf(multiPoints(m)) : null);

/**
 * Região da camada depois das zonas bloqueadas: `ref` menos a zona de cada parede (do conjunto `walls`) que toca a faixa
 * da camada e cruza `ref` em planta. Sem parede, devolve `ref`.
 */
export function regionMinusWalls(p: Project, ref: MultiPolygon, walls: readonly ResolvedWall[], rule: BlockRule, z0: number, z1: number): MultiPolygon {
  const bx = boxOfMulti(ref);
  if (!bx) return ref;
  const blocks: MultiPolygon[] = [];
  for (const rw of walls) {
    if (!wallTouchesZone(rw, z0, z1)) continue;
    const zone = wallZoneAt(p, rw, rule, z1);
    if (zone.length === 0) continue;
    const bz = boxOfMulti(zone);
    if (!bz || !boxesOverlap(bx, bz)) continue;
    blocks.push(zone);
  }
  return blocks.length === 0 ? ref : difference(ref, ...blocks);
}


/**
 * Região da camada que passa pelas paredes (`passa` em elemento vinculado): `ref` mais a pegada inteira das paredes que
 * tocam a faixa da camada e cruzam `ref` em planta. Sem vão: a camada não é recortada pela parede.
 */
export function regionPlusWalls(ref: MultiPolygon, walls: readonly ResolvedWall[], z0: number, z1: number): MultiPolygon {
  const bx = boxOfMulti(ref);
  if (!bx) return ref;
  const extra: MultiPolygon[] = [];
  for (const rw of walls) {
    if (!wallTouchesZone(rw, z0, z1)) continue;
    const pegada = wallBlockedZone(rw, { kind: 'face' });
    const bz = boxOfMulti(pegada);
    if (bz && boxesOverlap(bx, bz)) extra.push(pegada);
  }
  return extra.length === 0 ? ref : union(ref, ...extra);
}

/** Nível anterior e seguinte (por cota) do nível dado: as lajes também recortam as paredes deles (teto entre pavimentos). */
export function adjacentLevelIds(p: Project, levelId: Id): Id[] {
  const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex((l) => l.id === levelId);
  if (i < 0) return [];
  return [sorted[i - 1]?.id, sorted[i + 1]?.id].filter((id): id is Id => id !== undefined);
}
