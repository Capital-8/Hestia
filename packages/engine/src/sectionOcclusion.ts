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
 * Índice espacial das partes visíveis já processadas: grade uniforme sobre (t, z) que devolve, em ordem de inserção, só as
 * caixas que encostam na consulta. Antes cada item varria TODAS as partes anteriores (O(n²) em caixas); numa elevação com
 * dezenas de escadas acabadas são milhares de peças e a varredura passava de 100 ms. O conjunto devolvido é o mesmo (a grade só
 * descarta quem não pode encostar), e a ordem é a de inserção, então a diferença de polígonos sai igual à varredura completa.
 * Caixa que cobre muitas células (parede comprida, laje) fica numa lista à parte, varrida sempre.
 */
class GradeDeCaixas<T extends { box: Box }> {
  private readonly celulas = new Map<number, number[]>();
  private readonly grandes: number[] = [];
  private readonly lista: T[] = [];
  private visto: Int32Array = new Int32Array(0);
  private carimbo = 0;

  constructor(
    private readonly x0: number,
    private readonly y0: number,
    private readonly lado: number,
    private readonly colunas: number,
  ) {}

  private faixa(min: number, max: number, origem: number, n: number): [number, number] {
    const i0 = Math.max(0, Math.min(n - 1, Math.floor((min - origem) / this.lado)));
    const i1 = Math.max(0, Math.min(n - 1, Math.floor((max - origem) / this.lado)));
    return [i0, i1];
  }

  add(item: T): void {
    const k = this.lista.length;
    this.lista.push(item);
    if (this.visto.length <= k) {
      const maior = new Int32Array(Math.max(64, this.visto.length * 2));
      maior.set(this.visto);
      this.visto = maior;
    }
    const b = item.box;
    const [i0, i1] = this.faixa(b.minX, b.maxX, this.x0, this.colunas);
    const [j0, j1] = this.faixa(b.minY, b.maxY, this.y0, this.colunas);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELULAS_POR_CAIXA) {
      this.grandes.push(k);
      return;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const chave = i * this.colunas + j;
        const c = this.celulas.get(chave);
        if (c) c.push(k);
        else this.celulas.set(chave, [k]);
      }
    }
  }

  /** Os itens cuja caixa encosta em `box` (folga `eps`), na ordem em que entraram. */
  consultar(box: Box, eps: number): T[] {
    this.carimbo++;
    const achados: number[] = [];
    const ver = (k: number): void => {
      if (this.visto[k] === this.carimbo) return;
      this.visto[k] = this.carimbo;
      if (boxesOverlap(this.lista[k]!.box, box, eps)) achados.push(k);
    };
    const [i0, i1] = this.faixa(box.minX - eps, box.maxX + eps, this.x0, this.colunas);
    const [j0, j1] = this.faixa(box.minY - eps, box.maxY + eps, this.y0, this.colunas);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = this.celulas.get(i * this.colunas + j);
        if (c) for (const k of c) ver(k);
      }
    }
    for (const k of this.grandes) ver(k);
    achados.sort((p, q) => p - q);
    return achados.map((k) => this.lista[k]!);
  }
}

/** Acima de tantos oclusores, a subtração vai em lotes (ver `subtrairEmLotes`). */
const MAX_OCLUSORES_POR_PASSADA = 8;
/** Tamanho do lote da subtração. */
const LOTE_DE_OCLUSORES = 4;

/**
 * `item − (o1 ∪ o2 ∪ ...)`. Com poucos oclusores é uma passada só. Com muitos, vai em lotes de 4: a passada única do kernel pagava dezenas de milissegundos por
 * peça quando os oclusores eram muitos e cheios de frestas finas (acabamentos de escada vistos de frente, projetados uns sobre os outros: uma elevação de
 * prédio com escadas em vários níveis levava 8 s, e os mesmos oclusores em lotes levam poucos ms). A região resultante é a mesma (a diferença não depende da
 * ordem nem do agrupamento); só a ordem dos vértices pode mudar. Para quando a peça some.
 */
function subtrairEmLotes(poligonos: MultiPolygon, oclusores: MultiPolygon[]): MultiPolygon {
  if (oclusores.length <= MAX_OCLUSORES_POR_PASSADA) return differenceClipper(poligonos, ...oclusores);
  let resto = poligonos;
  for (let i = 0; i < oclusores.length && resto.length > 0; i += LOTE_DE_OCLUSORES) resto = differenceClipper(resto, ...oclusores.slice(i, i + LOTE_DE_OCLUSORES));
  return resto;
}

/** Mais células que isto numa só caixa: ela vai para a lista de grandes. */
const MAX_CELULAS_POR_CAIXA = 64;

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

  // A parte visível de um item está dentro da caixa dele, então a grade usa as caixas dos itens para dimensionar.
  const caixas = new Map<number, Box>();
  const total: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const i of order) {
    const b = boxOf(multiPoints(items[i]!.polygons));
    caixas.set(i, b);
    total.minX = Math.min(total.minX, b.minX);
    total.minY = Math.min(total.minY, b.minY);
    total.maxX = Math.max(total.maxX, b.maxX);
    total.maxY = Math.max(total.maxY, b.maxY);
  }
  const n = order.length;
  const colunas = Math.max(1, Math.min(512, Math.ceil(Math.sqrt(n))));
  const lado = Math.max((total.maxX - total.minX) / colunas, (total.maxY - total.minY) / colunas, 1e-6);
  const grade = new GradeDeCaixas<{ box: Box; polygons: MultiPolygon }>(total.minX, total.minY, lado, colunas + 1);
  for (const i of order) {
    const item = items[i]!;
    const box = caixas.get(i)!;
    const hits = grade.consultar(box, 1e-9).map((o) => o.polygons);
    const visible = hits.length > 0 ? subtrairEmLotes(item.polygons, hits) : item.polygons;
    if (visible.length === 0) continue;
    const area = multiArea(visible);
    if (area < MIN_VISIBLE_AREA || (2 * area) / multiPerimeter(visible) < MIN_VISIBLE_WIDTH) continue;
    out[i] = visible;
    grade.add({ box: boxOf(multiPoints(visible)), polygons: visible });
  }
  return out;
}
