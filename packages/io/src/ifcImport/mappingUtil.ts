import type { IfcProperty } from '@hestia/model';
import type { Body } from './geometry.ts';
import type { IfcFile } from './ifc.ts';
import { withoutHestiaProperties } from './hestia.ts';
import { propertiesOf } from './psets.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';

export const guid = (f: IfcFile, e: StepEntity | undefined): string => f.text(e, 0) || `#${e?.id ?? 0}`;

/** Campo opcional `ifcProperties`: só entra no elemento quando há propriedade lida (instância + tipo). */
export function psetOf(ctx: Ctx, e: StepEntity): { ifcProperties?: IfcProperty[] } {
  const props = withoutHestiaProperties(propertiesOf(ctx.f, e, ctx.typeOf.get(e.id)));
  return props.length ? { ifcProperties: props } : {};
}

/** Soma ao relatório os itens de geometria que o leitor não representou (corte, extrusão inclinada...). */
export function noteGeometry(ctx: Ctx, body: Body | null): void {
  if (!body) return;
  for (const motivo of body.unsupported) ctx.report.geometry[motivo] = (ctx.report.geometry[motivo] ?? 0) + 1;
}
