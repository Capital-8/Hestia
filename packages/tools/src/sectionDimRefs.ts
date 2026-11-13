import type { Vec2 } from '@hestia/geom';
import type { Dimension, SectionAnnotations, SectionDimRef } from '@hestia/model';
import type { SectionSnapIndex } from './sectionSnapIndex.ts';

/**
 * Cotas de corte/elevação ligadas ao elemento (parede, laje, escada, guarda-corpo...): a ponta guarda o elemento e QUAL ponto de
 * captura dele (tipo e ordem entre os do mesmo tipo), não a coordenada. A cada leitura da vista o ponto é buscado de novo no índice de
 * captura; se a escada ou o guarda-corpo muda, a cota acompanha. Genérico: vale para qualquer elemento que o índice de captura traga.
 * Se o ponto deixou de existir (o elemento sumiu ou ficou com menos pontos), a ponta mantém a última coordenada.
 */

const TOL = 1e-6;
const KINDS = ['endpoint', 'midpoint'] as const;

/** Ponto de captura de elemento exatamente em `at` (extremidade antes de ponto médio), como referência de ponta de cota. */
export function sectionDimRefAt(index: SectionSnapIndex, at: Vec2, tol = TOL): SectionDimRef | undefined {
  for (const kind of KINDS) {
    for (const [hostId, bucket] of index.byHost) {
      let ord = 0;
      for (const q of bucket.points) {
        if (q.kind !== kind) continue;
        if (Math.abs(q.x - at.x) <= tol && Math.abs(q.y - at.y) <= tol) return { hostId, kind, ord };
        ord++;
      }
    }
  }
  return undefined;
}

/** O ponto que a referência aponta na vista atual, ou null (elemento ausente ou sem esse ponto). */
export function resolveSectionDimRef(index: SectionSnapIndex, ref: SectionDimRef): Vec2 | null {
  const bucket = index.byHost.get(ref.hostId);
  if (!bucket) return null;
  let ord = 0;
  for (const q of bucket.points) {
    if (q.kind !== ref.kind) continue;
    if (ord === ref.ord) return { x: q.x, y: q.y };
    ord++;
  }
  return null;
}

const same = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

/** Cotas com as pontas ligadas relidas do índice. Devolve a mesma lista (mesmos objetos) quando nada mudou de lugar. */
export function resolveSectionDimensions(dims: readonly Dimension[], index: SectionSnapIndex): Dimension[] {
  return dims.map((d) => {
    if (!d.secRefs) return d;
    // O índice traz todos os elementos, ocultos ou não: esconder o elemento na vista não move a cota.
    const a = d.secRefs.a ? resolveSectionDimRef(index, d.secRefs.a) : null;
    const b = d.secRefs.b ? resolveSectionDimRef(index, d.secRefs.b) : null;
    const na = a ?? d.a;
    const nb = b ?? d.b;
    return same(na, d.a) && same(nb, d.b) ? d : { ...d, a: na, b: nb };
  });
}

/** Anotações com as cotas ligadas relidas; o mesmo objeto se nada mudou. */
export function resolveSectionAnnotations(a: SectionAnnotations, index: SectionSnapIndex): SectionAnnotations {
  const dims = resolveSectionDimensions(a.dimensions, index);
  return dims.every((d, i) => d === a.dimensions[i]) ? a : { ...a, dimensions: dims };
}
