import { boxOf, boxesOverlap, difference, multiPoints, type MultiPolygon } from '@hestia/geom';
import { layerPriority, type Layer } from '@hestia/model';

/**
 * Junção piso/laje × parede por prioridade de camada (decisão 0023 §1, P7). Duas camadas que ocupam a mesma região
 * (planta × faixa de cota) não se atravessam pela regra de prioridade; quem perde recorta a região comum. A regra é
 * por atributo de camada (prioridade efetiva, função e posição no núcleo), nunca por nome ou material (P-6).
 */

/** Tipo de elemento para a junção. A hierarquia padrão (§1.3) só desempata prioridade igual. */
export type JunctionKind = 'wall' | 'floor' | 'slab';

/** Quem vence o desempate de prioridade igual: laje corta piso e parede; piso corta parede. */
const TYPE_RANK: Record<JunctionKind, number> = { wall: 1, floor: 2, slab: 3 };

/** Atributos de uma camada que decidem a junção. */
export interface JunctionMeta {
  kind: JunctionKind;
  /** Prioridade efetiva (menor número vence). */
  priority: number;
  /** Camada dentro do núcleo do elemento (§1.2). */
  core: boolean;
  /** Término com regra explícita (decisão 0025): paredes não a recortam (a regra da camada já decide a região). */
  explicit?: boolean;
}

/**
 * Camada no plano: a região em planta e a faixa de cota (absoluta, m; face inferior `z0`, superior `z1`). `owner` é o
 * elemento dono: as camadas de um mesmo elemento não se cortam.
 */
export interface PlanarPiece {
  meta: JunctionMeta;
  poly: MultiPolygon;
  z0: number;
  z1: number;
  owner?: string;
  /**
   * Peça de um nível adjacente (0023 §10, P7c): só corta as peças do nível (parede × piso e laje de nível vizinho) e não
   * é resolvida aqui. Par de dois elementos externos não conta; piso × piso e laje × laje de outro nível não entram.
   */
  external?: boolean;
}

/** Tolerância (m) para duas faixas de cota se cruzarem de verdade (faces que apenas se encostam não contam). */
const Z_EPS = 1e-6;

/**
 * Núcleo do elemento (§1.2 e §2): da primeira à última camada de estrutura, inclusive. Sem estrutura, o elemento
 * inteiro é núcleo. Mesma convenção de `coreRange` (parede), para piso e laje.
 */
export function layerCoreFlags(layers: readonly Pick<Layer, 'function'>[]): boolean[] {
  const idx = layers.flatMap((l, i) => (l.function === 'structure' ? [i] : []));
  if (idx.length === 0) return layers.map(() => true);
  const first = idx[0]!;
  const last = idx[idx.length - 1]!;
  return layers.map((_, i) => i >= first && i <= last);
}

/** Metadados de junção de cada camada de um elemento, na ordem das camadas. */
export function layerMetas(kind: JunctionKind, layers: readonly Layer[]): JunctionMeta[] {
  const core = layerCoreFlags(layers);
  return layers.map((l, i) => ({ kind, priority: layerPriority(l), core: core[i]! }));
}

/**
 * Decide quem vence entre duas camadas que se cruzam: `true` se `a` corta `b` (b perde a região comum), `false` se `b`
 * corta `a`, `null` se nenhuma corta (mesmo tipo e mesma prioridade: ficam com linha de fronteira, sem resolver).
 * Ordem: (1) núcleo: camada no núcleo do seu elemento se estende pelo núcleo do outro e atravessa camadas de prioridade
 * maior (número menor) que estejam fora do núcleo; (2) prioridade: número menor vence; (3) empate: hierarquia por tipo.
 */
export function winsOver(a: JunctionMeta, b: JunctionMeta): boolean | null {
  // Camada com regra explícita (0025) decide a própria região com as paredes: ela não é recortada por parede e também
  // não recorta a parede (senão os dois lados perdem a mesma faixa e sobra um vazio).
  if (b.explicit && a.kind === 'wall') return null;
  if (a.explicit && b.kind === 'wall') return null;
  if (a.core && !b.core && b.priority < a.priority) return true;
  if (b.core && !a.core && a.priority < b.priority) return false;
  if (a.priority !== b.priority) return a.priority < b.priority;
  if (a.kind === b.kind) return null;
  return TYPE_RANK[a.kind] > TYPE_RANK[b.kind];
}

/** Há sobreposição de cota (faixa comum com espessura positiva). */
export const zOverlaps = (a: Pick<PlanarPiece, 'z0' | 'z1'>, b: Pick<PlanarPiece, 'z0' | 'z1'>): boolean =>
  Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > Z_EPS;

/** Parte de uma camada depois da junção: a região em planta e a faixa de cota em que ela existe. */
export interface ResolvedPrism {
  poly: MultiPolygon;
  z0: number;
  z1: number;
}

/**
 * Região resolvida de cada camada (saída na ordem de `pieces`; peça externa sai vazia, só corta). A camada perde, em cada faixa de cota, a região comum
 * com as camadas que a vencem e se cruzam ali. Como a cota pode mudar dentro da camada (piso sob parede alta), a faixa
 * é dividida nas cotas de corte: cada parte tem uma região em planta constante. Não muda o modelo: é derivada, usada
 * por planta, corte, 3D e quantitativos. Sem vencedor, a camada inteira fica (inclusive em mesmo tipo e mesma
 * prioridade: a sobreposição vira aviso, sem resolver).
 */
/**
 * Par que entra na junção (0023 §1.3, P7b): camadas do mesmo elemento não se cortam, e parede não corta parede (a
 * junção entre paredes é a da própria parede). Piso × piso e laje × laje entram, como nos quantitativos.
 */
const pairCuts = (c: PlanarPiece, t: PlanarPiece): boolean => {
  if (c.external || t.external) {
    // Entre níveis só parede × piso ou laje (P7c): exatamente um externo e exatamente uma parede no par.
    return c.external !== t.external && (c.meta.kind === 'wall') !== (t.meta.kind === 'wall');
  }
  return !(c.owner !== undefined && c.owner === t.owner) && !(c.meta.kind === 'wall' && t.meta.kind === 'wall');
};

export function resolveJunction(pieces: readonly PlanarPiece[]): ResolvedPrism[][] {
  // Caixa de cada camada: pré-filtro barato para o par não entrar no `difference` quando não há sobreposição em planta.
  const boxes = pieces.map((t) => (t.poly.length ? boxOf(multiPoints(t.poly)) : null));
  return pieces.map((t, i) => {
    if (t.external) return [];
    const bi = boxes[i];
    const winners = pieces.filter((c, j) => {
      const bj = boxes[j];
      return j !== i && bi && bj && boxesOverlap(bi, bj) && pairCuts(c, t) && zOverlaps(t, c) && winsOver(c.meta, t.meta) === true;
    });
    if (winners.length === 0) return [{ poly: t.poly, z0: t.z0, z1: t.z1 }];
    // Mesma grade de EPS_Z das alturas de parede (resolve.ts): alturas quase iguais não criam fatias minúsculas.
    const grade = (z: number): number => Math.round(z / Z_EPS) * Z_EPS;
    const cuts = [grade(t.z0), grade(t.z1)];
    for (const w of winners) cuts.push(grade(w.z0), grade(w.z1));
    const bounds = [...new Set(cuts.filter((z) => z >= t.z0 - Z_EPS && z <= t.z1 + Z_EPS).map((z) => Math.min(t.z1, Math.max(t.z0, z))))].sort((a, b) => a - b);
    const out: ResolvedPrism[] = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const z0 = bounds[k]!;
      const z1 = bounds[k + 1]!;
      if (z1 - z0 <= Z_EPS) continue;
      const mid = (z0 + z1) / 2;
      const active = winners.filter((w) => w.z0 < mid && w.z1 > mid).map((w) => w.poly);
      const poly = active.length === 0 ? t.poly : difference(t.poly, ...active);
      if (poly.length > 0) out.push({ poly, z0, z1 });
    }
    return out;
  });
}
