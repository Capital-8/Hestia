import type { Generic, Id, Project } from '@hestia/model';
import { hull2, type Body } from './geometry.ts';
import type { Pt2 } from './ifc.ts';
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

/** Tamanho da célula de soldagem: vértices a menos de 1e-6 m um do outro viram um só (em metros). */
const WELD_SCALE = 1e6;

/**
 * Solda os vértices idênticos (chave: coordenadas arredondadas à célula de soldagem) e monta os índices. Triângulos
 * degenerados (dois vértices soldados iguais) saem da lista. Os vértices de triângulos descartados continuam em
 * `positions`, para o contorno em planta não mudar.
 */
export function weldTris(tris: number[]): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const seen = new Map<string, number>();
  const vertex = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x * WELD_SCALE)},${Math.round(y * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`;
    let i = seen.get(key);
    if (i === undefined) {
      i = positions.length / 3;
      seen.set(key, i);
      positions.push(x, y, z);
    }
    return i;
  };
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const a = vertex(tris[t]!, tris[t + 1]!, tris[t + 2]!);
    const b = vertex(tris[t + 3]!, tris[t + 4]!, tris[t + 5]!);
    const c = vertex(tris[t + 6]!, tris[t + 7]!, tris[t + 8]!);
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  return { positions, indices };
}

/** Contorno em planta (hull convexo) a partir dos vértices soldados, achatados em x, y, z. */
export function outlineOf(positions: number[]): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i + 2 < positions.length; i += 3) pts.push({ x: positions[i]!, y: positions[i + 1]! });
  return hull2(pts);
}

/**
 * Elemento genérico a partir do corpo de um produto que não virou nativo. Preserva a classe IFC de origem, a malha
 * triangular (com a cor e as propriedades), e devolve `null` quando não há triângulo para desenhar.
 */
export function makeGeneric(src: GenericSource, e: StepEntity, body: Body, levelId: Id): Omit<Generic, 'order'> | null {
  if (!body.tris.length) return null;
  const { positions, indices } = weldTris(body.tris);
  if (!indices.length) return null;
  const outline = outlineOf(positions);
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
