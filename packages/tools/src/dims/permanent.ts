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
 * ficam livres. Com `viewId`, a cota mora nessa vista de planta (piso, cobertura ou área); com `planId`, na planta de
 * área; sem nenhum dos dois, na planta de piso do nível. `hidden` (regra 4.5: cota nova só referencia o que a vista
 * mostra): a ponta presa a elemento oculto nasce livre, no ponto medido.
 */
export function toPermanent(levelId: Id, dims: readonly TempDim[], planId?: Id, viewId?: Id, hidden?: ReadonlySet<Id>): Command[] {
  return dims.map((d) => {
    const a = d.refs?.a && !hidden?.has(d.refs.a.elementId) ? d.refs.a : undefined;
    const b = d.refs?.b && !hidden?.has(d.refs.b.elementId) ? d.refs.b : undefined;
    return {
      type: 'addDimension' as const,
      levelId,
      ...(viewId ? { viewId } : planId ? { planId } : {}),
      dimension: {
        id: newId('dim'),
        a: { ...d.a },
        b: { ...d.b },
        offset: d.offset,
        mode: 'aligned' as const,
        ...(a || b ? { refs: { ...(a ? { a: { ...a } } : {}), ...(b ? { b: { ...b } } : {}) } } : {}),
      },
    };
  });
}
