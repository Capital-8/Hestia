import type { Id, Project } from '@hestia/model';

/**
 * Quantitativos de um objeto genérico importado (malha triangular): viga, pilar, escada, mobiliário, MEP, curtain wall
 * e afins que chegam de outro programa sem equivalente nativo (`Generic`, `sourceClass`).
 *
 * É um quantitativo de FALLBACK geométrico: serve para orçar o que o motor não modela. NÃO entra no quantitativo
 * nativo (paredes, pisos, lajes, forros, telhados e escadas), que continua saindo das regras de junção e de camadas.
 * As coordenadas da malha já estão em metros, no mundo.
 */
export interface GenericQuantity {
  id: Id;
  levelId: Id;
  /** Classe IFC de origem (`IFCBEAM`, `IFCFURNISHINGELEMENT`...). */
  sourceClass: string;
  /** Volume da malha fechada (m³), em valor absoluto. Malha aberta ou com faces invertidas pode não representar o volume real. */
  volume: number;
  /** Área da superfície triangular (m²). */
  area: number;
  /** Nº de triângulos da malha (índices ÷ 3; tripla incompleta no fim é descartada). */
  triangles: number;
}

/** Número de vértices completos (x, y, z) da lista de posições. */
const vertexCount = (positions: ArrayLike<number>): number => Math.floor(positions.length / 3);

/** Índice inteiro e dentro do intervalo de vértices. */
const validIndex = (i: number | undefined, count: number): i is number => i !== undefined && Number.isInteger(i) && i >= 0 && i < count;

/**
 * Quantitativos dos objetos genéricos do projeto, opcionalmente só de um nível.
 *
 * - Volume: soma dos tetraedros assinados (origem → triângulo), `Σ a·(b × c) / 6`, com o valor absoluto no fim. Para
 *   malha fechada e orientada para fora o resultado é o volume real; a soma assinada dispensa fechar o sólido.
 * - Área: soma de `0,5 · |(b − a) × (c − a)|`, a área de cada triângulo no espaço.
 * - Triângulos com índice fora do intervalo (ou posição não finita) são ignorados no volume e na área; nunca lançam.
 * - A ordem é por `id`, para a tabela sair sempre igual (determinismo).
 */
export function genericQuantities(p: Project, levelId?: Id): GenericQuantity[] {
  const rows: GenericQuantity[] = [];
  for (const e of Object.values(p.elements)) {
    if (e?.kind !== 'generic') continue;
    if (levelId !== undefined && e.levelId !== levelId) continue;
    const positions = e.mesh.positions;
    const indices = e.mesh.indices;
    const count = vertexCount(positions);
    let signedVolume = 0;
    let area = 0;
    const triples = Math.floor(indices.length / 3);
    for (let t = 0; t < triples; t++) {
      const ia = indices[t * 3];
      const ib = indices[t * 3 + 1];
      const ic = indices[t * 3 + 2];
      if (!validIndex(ia, count) || !validIndex(ib, count) || !validIndex(ic, count)) continue;
      const ax = positions[ia * 3]!;
      const ay = positions[ia * 3 + 1]!;
      const az = positions[ia * 3 + 2]!;
      const bx = positions[ib * 3]!;
      const by = positions[ib * 3 + 1]!;
      const bz = positions[ib * 3 + 2]!;
      const cx = positions[ic * 3]!;
      const cy = positions[ic * 3 + 1]!;
      const cz = positions[ic * 3 + 2]!;
      if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) continue;
      // Tetraedro (origem, a, b, c): produto misto a · (b × c) ÷ 6.
      signedVolume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      // Área do triângulo: metade do módulo do produto vetorial de duas arestas.
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    rows.push({
      id: e.id,
      levelId: e.levelId,
      sourceClass: e.sourceClass,
      volume: Math.abs(signedVolume),
      area,
      triangles: triples,
    });
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Totais dos objetos genéricos: volume (m³), área (m²) e contagem de objetos. */
export function genericQuantitiesTotal(rows: readonly GenericQuantity[]): { volume: number; area: number; count: number } {
  return {
    volume: rows.reduce((s, r) => s + r.volume, 0),
    area: rows.reduce((s, r) => s + r.area, 0),
    count: rows.length,
  };
}
