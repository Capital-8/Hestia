import { planFootprint } from './stairs.ts';
import { pontosDaMassaEmPlanta } from './massa.ts';
import { resolveRampOne, resolveStairOne } from '@hestia/engine';
import { isOpening, isRamp, isStair, isWall, type Element, type Id, type Project } from '@hestia/model';
import type { MultiPolygon, Vec2 } from '@hestia/geom';

/**
 * EXTENSÃO DO MODELO (contrato de ferramentas, regra 3): a caixa em planta (metros) que envolve TUDO o que aparece nas
 * vistas de elevação e de corte, de qualquer tipo de elemento. É a fonte única dos limites da elevação de edifício, do
 * "enquadrar tudo" da planta e das pranchas: ninguém mais calcula caixa só com paredes.
 *
 * `COLETORES` é um `Record<Element['kind'], ...>`: um kind novo em `Element` sem linha aqui não compila. Cada linha diz se
 * o kind entra na extensão (`entra: true`, com a função que devolve os pontos dele em planta) ou, com o motivo escrito,
 * por que não entra (hoje: o que o desenho de elevação ainda não mostra).
 */
export interface CaixaPlano {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Pontos = Vec2[];

interface Coletor<E extends Element> {
  /** Entra na extensão? Falso exige `motivo`. */
  entra: boolean;
  motivo?: string;
  /** Pontos do elemento em planta (metros); o contexto resolve o que precisa do projeto. */
  pontos: (e: E, p: Project) => Pontos;
}

/** O elemento de um kind (a esquadria tem dois kinds num só tipo, então `Extract` pelo discriminante não serve). */
type Do<K extends Element['kind']> = Element extends infer E ? (E extends Element ? (K extends E['kind'] ? E : never) : never) : never;
type Coletores = { [K in Element['kind']]: Coletor<Do<K>> };

const nenhum = (): Pontos => [];

const pontosDeMulti = (m: MultiPolygon): Pontos => m.flatMap((poly) => poly.flat());

/** Pontos da parede: extremos e o meio do arco (a flecha `sag` fica à esquerda de a→b). */
function pontosDaParede(w: Do<'wall'>): Pontos {
  if (!w.sag) return [w.a, w.b];
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return [w.a, w.b, { x: (w.a.x + w.b.x) / 2 - (dy / len) * w.sag, y: (w.a.y + w.b.y) / 2 + (dx / len) * w.sag }];
}

/** Pegada da escada em planta (degraus mais chegada), a mesma da seleção; vazia se a escada não resolve. */
function pontosDaEscada(p: Project, id: Id): Pontos {
  const s = p.elements[id];
  if (!isStair(s)) return [];
  const r = resolveStairOne(p, s);
  return r ? pontosDeMulti(planFootprint(r)) : [];
}

function pontosDaRampa(p: Project, id: Id): Pontos {
  const r0 = p.elements[id];
  if (!isRamp(r0)) return [];
  const r = resolveRampOne(p, r0);
  return r ? pontosDeMulti(r.footprint) : [];
}

const COLETORES: Coletores = {
  wall: { entra: true, pontos: pontosDaParede },
  // A esquadria mora na parede (o vão nasce sobre o eixo dela): entra com o centro do vão, que a parede já cobre.
  door: { entra: true, pontos: (e, p) => pontosDaAbertura(e, p) },
  window: { entra: true, pontos: (e, p) => pontosDaAbertura(e, p) },
  floor: { entra: true, pontos: (e) => e.boundary },
  slab: { entra: true, pontos: (e) => e.boundary },
  ceiling: { entra: true, pontos: (e) => e.boundary },
  roof: { entra: true, pontos: (e) => e.boundary },
  stair: { entra: true, pontos: (e, p) => pontosDaEscada(p, e.id) },
  ramp: { entra: true, pontos: (e, p) => pontosDaRampa(p, e.id) },
  railing: {
    entra: true,
    pontos: (e, p) => {
      const h = e.hospedeiro;
      // Manual: o caminho traçado. Em escada e rampa, o caminho vem do hospedeiro (a pegada dele já cobre o guarda-corpo).
      if (h.tipo === 'manual') return h.caminho;
      return h.tipo === 'escada' ? pontosDaEscada(p, h.escadaId) : pontosDaRampa(p, h.rampaId);
    },
  },
  // A massa entra com os contornos de todas as seções e cópias (a caixa do envelope, sem o kernel): é o que a planta e o corte mostram.
  mass: { entra: true, pontos: (e) => pontosDaMassaEmPlanta(e) },
  room: { entra: false, motivo: 'O ambiente é só uma área de planta (derivada das paredes); não tem desenho em corte nem em elevação.', pontos: nenhum },
  generic: {
    entra: false,
    motivo: 'TODO: o objeto importado (viga, pilar, mobiliário) é uma malha 3D; o corte e a elevação ainda não projetam a malha, então não há o que enquadrar.',
    pontos: nenhum,
  },
  cad: { entra: false, motivo: 'O desenho CAD importado é só de planta (traços 2D); não aparece em corte nem em elevação.', pontos: nenhum },
};

function pontosDaAbertura(e: Do<'door'> | Do<'window'>, p: Project): Pontos {
  const host = p.elements[e.hostId];
  if (!isWall(host)) return [];
  const dx = host.b.x - host.a.x;
  const dy = host.b.y - host.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return [{ x: host.a.x + (dx / len) * e.offset, y: host.a.y + (dy / len) * e.offset }];
}

/** Os kinds que entram na extensão e os que não entram (com o motivo), para o teste-guarda e para a documentação. */
export const KINDS_NA_EXTENSAO: Readonly<Record<Element['kind'], { entra: boolean; motivo?: string }>> = Object.fromEntries(
  Object.entries(COLETORES).map(([k, c]) => [k, { entra: c.entra, ...(c.motivo ? { motivo: c.motivo } : {}) }]),
) as Record<Element['kind'], { entra: boolean; motivo?: string }>;

/** Nível do elemento: o próprio; a esquadria herda o da parede anfitriã. Sem nível conhecido, undefined. */
function nivelDe(e: Element, p: Project): Id | undefined {
  if (isOpening(e)) {
    const host = p.elements[e.hostId];
    return isWall(host) ? host.levelId : undefined;
  }
  return e.levelId;
}

/** Pontos em planta de tudo o que entra na extensão (do nível dado, ou do modelo inteiro sem nível). */
export function pontosDaExtensao(p: Project, levelId?: Id): Pontos {
  const pts: Pontos = [];
  for (const e of Object.values(p.elements)) {
    if (levelId !== undefined && nivelDe(e, p) !== levelId) continue;
    const c = COLETORES[e.kind] as Coletor<Element>;
    if (c.entra) pts.push(...c.pontos(e, p));
  }
  return pts;
}

/**
 * Caixa em planta (m, sem folga) de TODOS os elementos que aparecem em corte e elevação: paredes, esquadrias, pisos,
 * lajes, forros, telhados, escadas, rampas e guarda-corpos. Com `levelId`, só os daquele nível; sem ele, o modelo todo.
 * Null quando nada entra (modelo ou nível sem elemento desenhável).
 */
export function extensaoDoModelo(p: Project, levelId?: Id): CaixaPlano | null {
  const pts = pontosDaExtensao(p, levelId);
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
