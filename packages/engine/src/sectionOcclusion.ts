import { boxOf, boxesOverlap, differenceClipper, multiArea, multiPoints, type Box, type MultiPolygon } from '@hestia/geom';

/**
 * Remoção de superfícies ocultas (linha oculta, como Revit e Archicad) em (t, z) para o corte e a elevação.
 *
 * Cada item é um multipolígono em (t, z) com a profundidade do seu ponto mais próximo ao plano. Ordena-se do mais
 * perto ao mais longe; `occluder` é a união das partes visíveis já processadas (opacas: paredes, pisos, lajes,
 * telhados, escadas e aberturas, com caixilho, folha e vidro). A parte visível de cada item é o polígono menos o
 * `occluder`, e só então ele entra no `occluder`. Empate de profundidade: pela `rank` (corte antes de abertura, que
 * vem antes do além) e depois pela ordem da lista.
 *
 * Corte (depth 0): todas as regiões de corte estão no plano, então a profundidade não separa uma da outra. Quem fica
 * por cima é a cota (ver `cotaKeys`), não a ordem de inserção (decisão 0023 §3, P6).
 *
 * Desempenho: uma caixa envolvente por item; só se subtrai dos já processados cuja caixa encosta na do item, o que
 * é exato (os demais não mudam o resultado) e poupa quase todas as operações booleanas num projeto grande.
 */

/** Ordem de empate na mesma profundidade: o corte antes, depois as aberturas, depois o que está além. */
export const OCCLUSION_RANK = { cut: 0, opening: 1, beyond: 2 } as const;

/** Área (metros quadrados) abaixo da qual uma parte visível é descartada: resíduo numérico de contato, não superfície. */
export const MIN_VISIBLE_AREA = 1e-6;

/**
 * Largura equivalente (m) abaixo da qual uma parte visível é só fresta numérica de contato (ex.: o fio de ~1 µm que sobra
 * ao longo da face inferior de uma escada quando as peças são unidas): 2·área ÷ perímetro, a largura de uma faixa fina.
 */
export const MIN_VISIBLE_WIDTH = 1e-5;

/** Perímetro total (contornos e furos) de um multipolígono. */
function multiPerimeter(m: MultiPolygon): number {
  let sum = 0;
  for (const poly of m) for (const ring of poly) for (let i = 0; i < ring.length; i++) sum += Math.hypot(ring[(i + 1) % ring.length]!.x - ring[i]!.x, ring[(i + 1) % ring.length]!.y - ring[i]!.y);
  return sum;
}

/** Tolerância de cota (m) nas comparações de topo, base e contenção. */
const COTA_EPS = 1e-6;

/** Diferença de chave que faz a parede ganhar do piso, laje, forro, telhado ou escada de mesma cota de topo. */
const WALL_KEY_EPS = 1e-7;

/** Cota de um elemento do corte: a faixa de cotas do elemento inteiro (todas as camadas), não só a da peça. */
export interface OcclusionCota {
  /** Cota da face inferior do elemento. */
  bottom: number;
  /** Cota da face superior do elemento. */
  top: number;
  /** Parede (vertical). Pisos, lajes, forros, telhados e escadas são `false`. */
  wall: boolean;
}

export interface OcclusionItem {
  /** Distância do plano de corte (ou da linha de elevação) ao ponto mais próximo do item. */
  depth: number;
  /** Ordem de empate (`OCCLUSION_RANK`). */
  rank: number;
  polygons: MultiPolygon;
  /** Só no corte (depth 0): a cota do elemento de origem. Sem o campo, o item não entra na regra de cota. */
  cota?: OcclusionCota;
}

/**
 * Chave de cota de cada região de corte (depth 0); os demais itens ficam sem chave. Quem tem a maior chave fica por
 * cima onde se sobrepõe. A regra (decisão 0023 §3):
 * 1. Cota de topo: o elemento mais alto prevalece no ponto.
 * 2. Parede contida em cota: se a base e o topo da parede estão dentro da faixa de cotas de um piso, laje, forro,
 *    telhado ou escada que a toca em planta, a parede não é ocultada por ele (a chave da parede vai para o topo desse
 *    elemento). Parede embutida no piso aparece inteira e o piso perde só a parte em comum; a área do conjunto não cai.
 * 3. Empate de topo: a parede fica por cima; o resto, pela ordem da lista.
 */
export function cotaKeys(items: OcclusionItem[]): Array<number | undefined> {
  const boxes = items.map((it) => (it.cota && it.polygons.length > 0 ? boxOf(multiPoints(it.polygons)) : undefined));
  const horizontal = items.map((it, i) => (it.cota && !it.cota.wall ? i : -1)).filter((i) => i >= 0);
  return items.map((it, i): number | undefined => {
    const c = it.cota;
    const box = boxes[i];
    if (!c || !box) return undefined;
    if (!c.wall) return c.top;
    let key = c.top;
    for (const j of horizontal) {
      const other = items[j]!.cota!;
      const otherBox = boxes[j];
      if (!otherBox || !boxesOverlap(box, otherBox, 0)) continue;
      if (other.bottom <= c.bottom + COTA_EPS && c.top <= other.top + COTA_EPS) key = Math.max(key, other.top);
    }
    return key + WALL_KEY_EPS;
  });
}

/**
 * Parte visível de cada item, alinhada a `items` (multipolígono vazio quando o item está oculto ou é residual).
 */
export function visibleParts(items: OcclusionItem[]): MultiPolygon[] {
  const out: MultiPolygon[] = items.map((): MultiPolygon => []);
  const keys = cotaKeys(items);
  const order = items
    .map((_, i) => i)
    .filter((i) => items[i]!.polygons.length > 0)
    .sort((i, j) => items[i]!.depth - items[j]!.depth || items[i]!.rank - items[j]!.rank || (keys[j] ?? 0) - (keys[i] ?? 0) || i - j);

  const occluders: Array<{ box: Box; polygons: MultiPolygon }> = [];
  for (const i of order) {
    const item = items[i]!;
    const box = boxOf(multiPoints(item.polygons));
    const hits: MultiPolygon[] = [];
    for (const o of occluders) if (boxesOverlap(o.box, box, 1e-9)) hits.push(o.polygons);
    const visible = hits.length > 0 ? differenceClipper(item.polygons, ...hits) : item.polygons;
    if (visible.length === 0) continue;
    const area = multiArea(visible);
    if (area < MIN_VISIBLE_AREA || (2 * area) / multiPerimeter(visible) < MIN_VISIBLE_WIDTH) continue;
    out[i] = visible;
    occluders.push({ box: boxOf(multiPoints(visible)), polygons: visible });
  }
  return out;
}
