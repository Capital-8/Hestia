import { multiArea, union, type MultiPolygon } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import type { LayerBand, ResolvedLayer, ResolvedWall } from './types.ts';
import { bandPiece, levelCutterSet, type LevelCutters, type SolidPiece } from './junctionNet.ts';
import { resolveJunction, type PlanarPiece, type ResolvedPrism } from './junctionPlanar.ts';

/**
 * Junção resolvida de um nível (decisão 0023 §3 e §10, P7b e P7c). Uma função única para planta, corte, 3D e
 * quantitativos: cada camada de piso, de laje e de parede sai com as partes em que ela existe, já recortadas pela
 * camada que a vence (`resolveJunction`). Os níveis adjacentes entram como cortadores (P7c): a laje do nível de cima
 * que atravessa a parede do térreo, e a parede do térreo que sobe até a laje. Sem sobreposição, nada é recortado e o
 * desenho segue o original (`cut` falso).
 */

/** Partes de uma camada depois da junção: planta e faixa de cota (absoluta) em que ela existe. Vazio: camada vencida. */
export interface LayerParts {
  layerIndex: number;
  parts: ResolvedPrism[];
}

/** Piso, laje ou parede com a junção resolvida. `cut` falso: nenhuma camada foi recortada, então vale o desenho original. */
export interface ElementJunction {
  cut: boolean;
  layers: LayerParts[];
  /** União, em planta, das partes de todas as camadas (a região que o elemento ocupa depois do corte). Vazia sem corte. */
  region: MultiPolygon;
}

/**
 * Junção de uma parede: partes resolvidas de cada faixa de cada camada (chave `bandKey`). Faixa ausente, ou parede sem
 * `cut`, vale a faixa inteira (como antes). Faixas com topo inclinado não entram: a cota delas não se recorta plano.
 */
export interface WallJunction {
  cut: boolean;
  bands: ReadonlyMap<string, ResolvedPrism[]>;
}

/** Junção do nível: piso e laje pelo id do elemento, paredes pelo id da parede (decisão 0023 §3, F1). */
export interface JunctionLevel {
  levelId: Id;
  elements: ReadonlyMap<Id, ElementJunction>;
  walls: ReadonlyMap<Id, WallJunction>;
}

/** Chave de uma faixa dentro de uma parede: camada e faixa de altura, como vêm de `ResolvedWall`. */
export const bandKey = (layerIndex: number, bandIndex: number): string => `${layerIndex}/${bandIndex}`;

/**
 * Entrada da junção: a peça no plano e a camada de origem. Para piso e laje, `layerIndex` é a camada do elemento; para
 * parede, `wall` leva a parede e a chave da faixa, e `flat` diz se a faixa tem cota constante (recortável).
 */
interface Tagged {
  piece: PlanarPiece;
  layerIndex: number;
  wall?: { id: Id; key: string; flat: boolean };
}

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Peça plana de uma peça de sólido: a faixa de cota é a envolvente dos vértices. Membrana (espessura zero) fica de fora. */
function planarOf(sp: SolidPiece): PlanarPiece | null {
  const meta = sp.meta;
  if (!meta || sp.poly.length === 0) return null;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const poly of sp.poly) {
    for (const ring of poly) {
      for (const v of ring) {
        const [a, b] = sp.span(v);
        z0 = Math.min(z0, a);
        z1 = Math.max(z1, b);
      }
    }
  }
  if (!(z1 - z0 > 1e-9)) return null;
  return { meta: { kind: meta.kind, priority: meta.priority, core: meta.core, ...(meta.explicit ? { explicit: true } : {}) }, poly: sp.poly, z0, z1, owner: meta.owner, ...(sp.external ? { external: true } : {}) };
}

/** Assinatura do conteúdo das peças (camada, faixa, prioridade e contorno): muda quando o nível muda. */
function signature(tagged: readonly Tagged[]): string {
  return tagged
    .map(({ piece: t, layerIndex }) => {
      const poly = t.poly.map((p) => p.map((ring) => ring.map((v) => `${r6(v.x)},${r6(v.y)}`).join(' ')).join('/')).join('#');
      return `${t.external ? 'x' : ''}${t.owner}|${layerIndex}|${t.meta.kind}|${t.meta.priority}|${t.meta.core ? 1 : 0}|${t.meta.explicit ? 1 : 0}|${r6(t.z0)}|${r6(t.z1)}|${poly}`;
    })
    .join('\n');
}

/** Cache por nível e por conteúdo (como o circuito de ambientes, decisão 0023 §11): nível não editado = mesmo resultado. */
const levelCache = new Map<Id, { sig: string; value: JunctionLevel }>();
/** Atalho por snapshot imutável: evita reconstruir assinatura e cortadores quando o mesmo nível é consultado de novo. */
const projectLevelCache = new WeakMap<Project, Map<Id, JunctionLevel>>();
/** Conteúdo de cortadores compartilhado entre snapshots também compartilha a junção e sua assinatura. */
const cutterSetResultCache = new WeakMap<LevelCutters, JunctionLevel>();

/** Volume (metros cúbicos) das partes de uma camada: área em planta vezes a altura de cada parte. */
const volumeOfParts = (parts: readonly ResolvedPrism[]): number => parts.reduce((s, x) => s + multiArea(x.poly) * (x.z1 - x.z0), 0);

/**
 * A camada perdeu volume? Compara o volume antes e depois (tolerância 1e-9 metros cúbicos), não a identidade do polígono: o
 * `difference` que não tira nada devolve geometria nova com a mesma área, e isso não é corte (P7c, `cut` falso).
 */
const lostVolume = (t: PlanarPiece, parts: readonly ResolvedPrism[]): boolean =>
  Math.abs(multiArea(t.poly) * (t.z1 - t.z0) - volumeOfParts(parts)) > 1e-9;

/**
 * Junção resolvida do nível. Pisos, lajes e paredes com camadas recortadas pela de maior prioridade (`resolveJunction`),
 * com os elementos dos níveis adjacentes como cortadores (P7c, só o que cruza a cota). Lajes com caimento ficam de fora,
 * porque a faixa inclinada não se recorta por aproximação plana (quantitativos já integram).
 */
export function junctionLevel(p: Project, levelId: Id): JunctionLevel {
  const exact = projectLevelCache.get(p)?.get(levelId);
  if (exact) return exact;
  const remember = (value: JunctionLevel): JunctionLevel => {
    let byLevel = projectLevelCache.get(p);
    if (!byLevel) {
      byLevel = new Map();
      projectLevelCache.set(p, byLevel);
    }
    byLevel.set(levelId, value);
    return value;
  };
  const cutters = levelCutterSet(p, levelId);
  const cutterResult = cutterSetResultCache.get(cutters);
  if (cutterResult) return remember(cutterResult);
  // Cortadores do nível e dos níveis que o alcançam (F1b). Laje com caimento fica de fora da junção.
  const tagged: Tagged[] = [];
  for (const sp of [...cutters.floors, ...cutters.slabs, ...cutters.walls].flatMap((c) => c.pieces)) {
    const meta = sp.meta;
    if (!meta || (meta.kind === 'slab' && !sp.flat)) continue;
    const piece = planarOf(sp);
    if (!piece) continue;
    const layerIndex = meta.layerIndex ?? -1;
    tagged.push(
      meta.kind === 'wall'
        ? { piece, layerIndex, wall: { id: meta.owner, key: bandKey(layerIndex, meta.bandIndex ?? 0), flat: sp.flat } }
        : { piece, layerIndex },
    );
  }

  const sig = signature(tagged);
  const hit = levelCache.get(levelId);
  if (hit && hit.sig === sig) {
    cutterSetResultCache.set(cutters, hit.value);
    return remember(hit.value);
  }

  const res = resolveJunction(tagged.map((t) => t.piece));
  const elements = new Map<Id, ElementJunction>();
  const walls = new Map<Id, { cut: boolean; bands: Map<string, ResolvedPrism[]> }>();
  tagged.forEach(({ piece, layerIndex, wall }, i) => {
    const parts = res[i]!;
    // Peça de outro nível só corta (0023 §10, P7c): não faz parte do desenho deste nível.
    if (piece.external) return;
    // Intacta só se o volume sobrou: uma fatia com a mesma forma, mas em cota menor, já foi recortada. Comparar volume
    // pega este caso e o da peça recortada só em altura (P7c, F7), sem depender da identidade do polígono.
    const untouched = !lostVolume(piece, parts);
    if (wall) {
      const wj = walls.get(wall.id) ?? { cut: false, bands: new Map<string, ResolvedPrism[]>() };
      if (wall.flat) {
        if (!untouched) wj.cut = true;
        wj.bands.set(wall.key, parts);
      }
      walls.set(wall.id, wj);
      return;
    }
    const owner = piece.owner!;
    const el = elements.get(owner) ?? { cut: false, layers: [], region: [] };
    if (!untouched) el.cut = true;
    el.layers.push({ layerIndex, parts });
    elements.set(owner, el);
  });
  for (const el of elements.values()) {
    if (el.cut) el.region = union(...el.layers.flatMap((l) => l.parts.map((x) => x.poly)));
  }
  const value: JunctionLevel = { levelId, elements, walls };
  levelCache.set(levelId, { sig, value });
  cutterSetResultCache.set(cutters, value);
  return remember(value);
}

/**
 * Região em planta do preenchimento de um piso ou laje (decisões 0023 F7 e 0025). Com corte, é a região resolvida do
 * elemento; quando a camada de topo tem regra explícita de término, é a própria camada (o piso para na face da parede e
 * o resto segue sob ela). Sem corte, é a camada de cima: o término dela vale mesmo sem junção (sem isso, o piso ia até a
 * face de acabamento).
 */
export function fillRegionOf(top: { explicit: boolean; polygon: MultiPolygon }, el?: ElementJunction): MultiPolygon {
  const parts = top.explicit && el?.cut ? el.layers.find((l) => l.layerIndex === 0)?.parts : undefined;
  if (parts) return union(...parts.map((x) => x.poly));
  return el?.cut ? el.region : top.polygon;
}

/**
 * Partes de uma camada para o desenho: as resolvidas quando o elemento foi cortado e a camada está nele; senão `fallback`
 * (a camada inteira, como antes). Membrana e camada sem junção caem no `fallback`.
 */
export function layerPartsOf(el: ElementJunction | undefined, layerIndex: number, fallback: ResolvedPrism[]): ResolvedPrism[] {
  if (!el || !el.cut) return fallback;
  const hit = el.layers.filter((l) => l.layerIndex === layerIndex);
  return hit.length ? hit.flatMap((l) => l.parts) : fallback;
}

/**
 * Faixas de uma camada de parede depois da junção com piso e laje, no formato de `LayerBand` (cota relativa à base da
 * parede). Faixa recortada vira as partes que sobram; sem corte, a própria faixa. Corte, 3D e planta usam esta função,
 * e quem desenha funde as faixas depois (`fuseBands`).
 */
export function wallLayerBandsAfterJunction(jl: JunctionLevel | undefined, rw: ResolvedWall, layer: ResolvedLayer): LayerBand[] {
  return layer.bands.flatMap((b, bandIndex) => {
    const parts = wallBandCut(jl, rw.wallId, layer.layerIndex, bandIndex);
    if (!parts) return [b];
    return parts.map((x) => ({ z0: x.z0 - rw.baseZ, z1: x.z1 - rw.baseZ, poly: x.poly }));
  });
}

/**
 * Partes de uma faixa de parede para o desenho (planta, corte e 3D): as resolvidas quando a parede foi recortada por piso
 * ou laje; senão `fallback` (a faixa inteira). Faixa com topo inclinado sempre cai no `fallback`.
 */
export function wallBandPartsOf(
  jl: JunctionLevel | undefined,
  wallId: Id,
  layerIndex: number,
  bandIndex: number,
  fallback: ResolvedPrism[],
): ResolvedPrism[] {
  return wallBandCut(jl, wallId, layerIndex, bandIndex) ?? fallback;
}

/** Partes recortadas de uma faixa de parede, ou `undefined` quando a faixa não foi recortada (vale a inteira). */
export function wallBandCut(jl: JunctionLevel | undefined, wallId: Id, layerIndex: number, bandIndex: number): ResolvedPrism[] | undefined {
  const wj = jl?.walls.get(wallId);
  if (!wj || !wj.cut) return undefined;
  return wj.bands.get(bandKey(layerIndex, bandIndex));
}

/** Peças de piso e laje (próprias e de outros níveis) que cortam parede, como entram na junção do nível. */
function pecasNaoParede(p: Project, levelId: Id): PlanarPiece[] {
  const cutters = levelCutterSet(p, levelId);
  const out: PlanarPiece[] = [];
  for (const sp of [...cutters.floors, ...cutters.slabs].flatMap((c) => c.pieces)) {
    const meta = sp.meta;
    if (!meta || (meta.kind === 'slab' && !sp.flat)) continue;
    const piece = planarOf(sp);
    if (piece) out.push(piece);
  }
  return out;
}

/**
 * Junção só de algumas paredes do nível, para a edição de esquadria no 3D: a parede nunca é cortada por outra parede
 * (`pairCuts`), só por piso e laje, então o resultado dela depende apenas das próprias faixas e das peças de piso e laje.
 * `p` é o projeto da junção (o reduzido de `projetoDaJuncao`) em que esses cortadores já estão em cache. O resultado
 * de cada parede é o mesmo que `junctionLevel` daria para ela com as mesmas peças de piso e laje.
 */
export function junctionOfWalls(p: Project, levelId: Id, paredes: readonly ResolvedWall[]): ReadonlyMap<Id, WallJunction> {
  const tagged: Array<{ piece: PlanarPiece; wall: { id: Id; key: string; flat: boolean } }> = [];
  for (const rw of paredes) {
    for (const l of rw.layers) {
      l.bands.forEach((b, bandIndex) => {
        const sp = bandPiece(rw, b, { priority: l.priority, core: l.core, layerIndex: l.layerIndex, bandIndex });
        const piece = sp.meta ? planarOf(sp) : null;
        if (piece) tagged.push({ piece, wall: { id: rw.wallId, key: bandKey(l.layerIndex, bandIndex), flat: sp.flat } });
      });
    }
  }
  const res = resolveJunction([...tagged.map((t) => t.piece), ...pecasNaoParede(p, levelId)]);
  const walls = new Map<Id, { cut: boolean; bands: Map<string, ResolvedPrism[]> }>();
  for (const rw of paredes) walls.set(rw.wallId, { cut: false, bands: new Map() });
  tagged.forEach(({ piece, wall }, i) => {
    const parts = res[i]!;
    const wj = walls.get(wall.id)!;
    if (wall.flat) {
      if (lostVolume(piece, parts)) wj.cut = true;
      wj.bands.set(wall.key, parts);
    }
  });
  return walls;
}

/**
 * Alguma peça de piso ou laje (do nível ou de outro que o alcança) ocupa a faixa de cota `[z0, z1]` sobre a caixa
 * `[minX, minY, maxX, maxY]`? Se não, mudar uma esquadria nessa faixa não altera o corte de piso ou laje por parede.
 */
export function pisoOuLajeNaFaixa(p: Project, levelId: Id, z0: number, z1: number, caixa: readonly [number, number, number, number]): boolean {
  const eps = 1e-6;
  for (const t of pecasNaoParede(p, levelId)) {
    if (!(Math.min(t.z1, z1) - Math.max(t.z0, z0) > eps)) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of t.poly) for (const ring of poly) for (const v of ring) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    if (maxX >= caixa[0] - eps && minX <= caixa[2] + eps && maxY >= caixa[1] - eps && minY <= caixa[3] + eps) return true;
  }
  return false;
}
