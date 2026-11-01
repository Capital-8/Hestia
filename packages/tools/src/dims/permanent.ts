import { dimRefCandidates, newId, type Command, type DimensionElementRef, type Id, type Project } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import type { TempDim } from './types.ts';

/**
 * Feição de um dos elementos dados cujo ponto coincide com `at` (tolerância em m); undefined se nenhuma. Os provedores
 * usam para gravar `TempDim.refs` só quando a ponta medida É uma feição do elemento (a cota permanente então acompanha).
 */
export function matchDimRef(project: Project, at: Vec2, elementIds: ReadonlyArray<Id | null | undefined>, tol = 1e-4): DimensionElementRef | undefined {
  for (const id of elementIds) {
    const el = id ? project.elements[id] : undefined;
    if (!el) continue;
    for (const c of dimRefCandidates(project, el)) if (Math.hypot(c.point.x - at.x, c.point.y - at.y) <= tol && c.ref.elementId === el.id) return c.ref;
  }
  return undefined;
}

/** `refs` do TempDim só se alguma ponta foi reconhecida. */
export const tempRefs = (a: DimensionElementRef | undefined, b: DimensionElementRef | undefined): Pick<TempDim, 'refs'> =>
  a || b ? { refs: { ...(a ? { a } : {}), ...(b ? { b } : {}) } } : {};

/**
 * Converte cotas dinâmicas em cotas permanentes (ícone "I"): um `addDimension` por `TempDim`, com os mesmos pontos,
 * afastamento e medida. Sem `unit`/`precision`/`prefix`: a leitura segue as unidades do projeto. Pontas que o provedor
 * identificou como feição de elemento (`TempDim.refs`) gravam `Dimension.refs` e a cota acompanha o elemento; as demais
 * ficam livres. Com `planId`, a cota mora na planta de área (senão no nível).
 */
export function toPermanent(levelId: Id, dims: readonly TempDim[], planId?: Id): Command[] {
  return dims.map((d) => ({
    type: 'addDimension' as const,
    levelId,
    ...(planId ? { planId } : {}),
    dimension: {
      id: newId('dim'),
      a: { ...d.a },
      b: { ...d.b },
      offset: d.offset,
      mode: 'aligned' as const,
      ...(d.refs ? { refs: { ...(d.refs.a ? { a: { ...d.refs.a } } : {}), ...(d.refs.b ? { b: { ...d.refs.b } } : {}) } } : {}),
    },
  }));
}
