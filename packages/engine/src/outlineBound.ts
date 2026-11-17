import type { Polygon } from '@hestia/geom';
import type { Floor, Id, OutlineSource, Project, Slab } from '@hestia/model';
import { enclosedRooms, outerPerimeter, roomAt, type RoomExtend } from './enclosed.ts';
import { levelFrames } from './resolve.ts';

/** Motivo de um contorno vinculado não fechar (decisão 0023 §8.2c). `aberto` = circuito com vão; `fora` = sem paredes. */
export type OutlineProblem = 'aberto' | 'fora';

/** Contorno derivado de um piso ou laje vinculado às paredes, ou o motivo de não ter fechado. */
export interface ResolvedOutline {
  /** Anel externo + furos de ilhas de parede quando o circuito fecha; null quando abre ou a semente fica fora. */
  polygon: Polygon | null;
  /** Motivo do circuito não fechar; null quando resolveu (ou quando o elemento é estático, sem `outlineSource`). */
  problem: OutlineProblem | null;
}

const refOf = (src: OutlineSource): 'base' | 'top' => (src.reference === 'top' ? 'top' : 'base');

const extendFor = (mode: OutlineSource['mode']): RoomExtend => (mode === 'walls-core' ? 'core' : 'finish');

/** Sem paredes no nível, a semente não pode estar em circuito algum: `fora`; com paredes, é um circuito aberto. */
const openOrOutside = (p: Project, levelId: Id): OutlineProblem => (levelFrames(p, levelId).length === 0 ? 'fora' : 'aberto');

/**
 * Contorno de um piso ou laje a partir da origem guardada (`outlineSource`, decisão 0023 §8.2). Para elemento vinculado
 * recalcula o circuito de paredes que contém a semente (ou o perímetro externo); para elemento estático (sem origem ou
 * `linked` falso) devolve null sem problema: vale o `boundary` gravado. Nunca lança: quando o circuito abre, devolve o
 * `problem` e quem chama mantém o último contorno válido.
 */
export function resolveBoundary(p: Project, levelId: Id, el: Floor | Slab): ResolvedOutline {
  const src = el.outlineSource;
  if (!src || !src.linked) return { polygon: null, problem: null };
  if (src.mode === 'perimeter') {
    const ring = outerPerimeter(p, levelId, src.seed, src.extend === 'core' ? 'core' : 'finish', refOf(src));
    return ring ? { polygon: [ring], problem: null } : { polygon: null, problem: openOrOutside(p, levelId) };
  }
  if (!src.seed) return { polygon: null, problem: openOrOutside(p, levelId) };
  const poly = roomAt(enclosedRooms(p, levelId, extendFor(src.mode), refOf(src)), src.seed);
  return poly ? { polygon: poly, problem: null } : { polygon: null, problem: openOrOutside(p, levelId) };
}

const comTopo = new WeakMap<Project, boolean>();

/**
 * T-F: o projeto tem piso ou laje vinculado com `reference: 'top'`? O kernel Rust não tem o topo da parede (os circuitos
 * do topo vêm só do TypeScript), então o despacho cai para o TS nesses projetos, no padrão da guarda E5.
 */
export function projetoTemContornoNoTopo(p: Project): boolean {
  let r = comTopo.get(p);
  if (r === undefined) {
    r = Object.values(p.elements).some((e) => (e.kind === 'floor' || e.kind === 'slab') && !!e.outlineSource?.linked && e.outlineSource.reference === 'top');
    comTopo.set(p, r);
  }
  return r;
}
