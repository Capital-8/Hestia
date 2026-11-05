import type { Body } from './geometry.ts';
import { bodyOf } from './geometry.ts';
import { makeGeneric, minZOf } from './genericElement.ts';
import type { IfcFile } from './ifc.ts';
import type { LevelRef } from './levels.ts';
import type { Aviso, Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';

/**
 * Fallback de tudo que não virou elemento nativo: o produto vira um objeto genérico com a malha triangular.
 * Fica fora de `mapping.ts` para o arquivo não crescer além do limite de linhas do projeto.
 */

/** Entidades que nunca viram objeto: vazios, anotações e a estrutura espacial. */
export function isSpatialOrVoid(type: string): boolean {
  return type === 'IFCOPENINGELEMENT' || type === 'IFCANNOTATION' || type === 'IFCPROJECT' || type === 'IFCSITE' || type === 'IFCBUILDING' || type === 'IFCBUILDINGSTOREY' || type === 'IFCGRID';
}

/** Corpo do produto, lido uma vez (a inferência de níveis e o mapeamento reaproveitam). */
export function bodyFor(ctx: Ctx, e: StepEntity): Body {
  const hit = ctx.bodies.get(e.id);
  if (hit) return hit;
  const body = bodyOf(ctx.f, e);
  ctx.bodies.set(e.id, body);
  return body;
}

/** Nível mais próximo abaixo de uma cota `z` (1 cm de folga). */
function levelAt(ctx: Ctx, z: number): LevelRef {
  let best = ctx.levels[0]!;
  for (const l of ctx.levels) if (l.elevation <= z + 0.01) best = l;
  return best;
}

/** Converte o produto em objeto genérico: é o fallback de tudo que não virou elemento nativo. */
export function toGeneric(ctx: Ctx, e: StepEntity, body: Body): boolean {
  if (ctx.handled.has(e.id)) return false;
  const g = makeGeneric(ctx, e, body, levelAt(ctx, minZOf(body)).id);
  // A malha já foi copiada para o elemento (ou descartada): o corpo não é mais necessário.
  ctx.bodies.delete(e.id);
  if (!g) return false;
  ctx.p.elements[g.id] = { ...g, order: ctx.order++ };
  ctx.handled.add(e.id);
  ctx.report.generic[e.type] = (ctx.report.generic[e.type] ?? 0) + 1;
  ctx.count('objetos');
  return true;
}

/** Produtos que sobraram entram como genérico; os sem triângulo ficam para o relatório. */
export function addGenericObjects(file: IfcFile, ctx: Ctx, aviso?: Aviso): void {
  const total = file.step.entities.size;
  let i = 0;
  for (const e of file.step.entities.values()) {
    i++;
    // Cada 2 mil entidades a barra anda; o resto do laço não paga o custo da notificação.
    if (aviso && i % 2000 === 0) aviso('generic', i, total);
    if (ctx.handled.has(e.id) || isSpatialOrVoid(e.type)) continue;
    if (!file.ref(e, 5) || file.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    toGeneric(ctx, e, bodyFor(ctx, e));
  }
  aviso?.('generic', total, total);
}

/** Produtos que não entraram nem como genérico (sem triângulo) entram no relatório por classe. */
export function countUnhandledProducts(f: IfcFile, report: { skipped: Record<string, number> }, handled: Set<number>): void {
  for (const e of f.step.entities.values()) {
    if (handled.has(e.id) || isSpatialOrVoid(e.type)) continue;
    if (!f.ref(e, 5) || f.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    report.skipped[e.type] = (report.skipped[e.type] ?? 0) + 1;
  }
}
