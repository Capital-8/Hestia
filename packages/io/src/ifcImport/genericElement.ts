import type { Generic, Id, Project } from '@hestia/model';
import { bodyPoints, hull2, type Body } from './geometry.ts';
import { styleOfWithMaterial } from './elementTypes.ts';
import type { IfcFile } from './ifc.ts';
import { propertiesOf } from './psets.ts';
import type { StepEntity } from './step.ts';

/** Contexto mínimo para montar um genérico (sem depender do `Ctx` do mapeamento). */
export interface GenericSource {
  f: IfcFile;
  p: Project;
  typeOf: Map<number, StepEntity>;
}

/** Cota mais baixa do corpo, usada para escolher o nível do objeto. */
export function minZOf(body: Body): number {
  let z = Infinity;
  for (const prism of body.prisms) z = Math.min(z, prism.z0);
  const t = body.tris;
  for (let i = 2; i < t.length; i += 3) z = Math.min(z, t[i]!);
  return z;
}

/**
 * Elemento genérico a partir do corpo de um produto que não virou nativo. Preserva a classe IFC de origem, a malha
 * triangular (com a cor e as propriedades), e devolve `null` quando não há triângulo para desenhar.
 */
export function makeGeneric(src: GenericSource, e: StepEntity, body: Body, levelId: Id): Omit<Generic, 'order'> | null {
  if (!body.tris.length) return null;
  // Os triângulos já vêm achatados (x, y, z por vértice); cada um tem vértices próprios, então os índices são 0,1,2...
  const positions = body.tris.slice();
  const total = positions.length / 3;
  const indices = new Array<number>(total);
  for (let i = 0; i < total; i++) indices[i] = i;
  if (!positions.length) return null;
  const outline = hull2(bodyPoints(body).map((p) => ({ x: p.x, y: p.y })));
  const props = propertiesOf(src.f, e, src.typeOf.get(e.id));
  const style = styleOfWithMaterial(src, src.f, e);
  return {
    id: `g_${src.f.text(e, 0) || `#${e.id}`}`,
    kind: 'generic',
    levelId,
    name: src.f.text(e, 2).trim() || src.f.text(src.typeOf.get(e.id), 2).trim() || e.type,
    sourceClass: e.type,
    predefinedType: src.f.enum(e, 8) || undefined,
    objectType: src.f.text(e, 4) || undefined,
    mesh: { positions, indices },
    outline: outline.length >= 3 ? outline : undefined,
    color: style?.color,
    ...(style && style.opacity < 0.999 ? { opacity: Math.round(style.opacity * 100) / 100 } : {}),
    ...(props.length ? { ifcProperties: props } : {}),
  };
}
