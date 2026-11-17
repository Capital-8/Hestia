import type { IfcCtx } from './ifcCtx.ts';
import { gid } from './ifcCtx.ts';
import { int, list, num, OMIT, ref, StepWriter, stepString } from './ifcStep.ts';

/** Valor de uma propriedade no `IfcValue`: booleano, inteiro, real ou texto. */
export type PropValue = string | number | boolean;

/**
 * Valor com o tipo de medida IFC explícito (ex.: `IFCTHERMALTRANSMITTANCEMEASURE`). Usado quando o tipo do conjunto
 * (`IfcPropertySetTemplate`) não é o que o tipo do valor sugere: `IFCREAL` para U ou `IFCLABEL` para `Reference` falham
 * na validação de IDS. `value` é texto para `IFCIDENTIFIER` e número para os demais.
 */
export interface TypedPropValue {
  readonly ifc: 'IFCIDENTIFIER' | 'IFCTHERMALTRANSMITTANCEMEASURE' | 'IFCPOSITIVERATIOMEASURE' | 'IFCNORMALISEDRATIOMEASURE';
  readonly value: string | number;
}

/** Entrada de `addPropertySet`: valor simples (tipo inferido) ou com tipo de medida explícito. */
export type PropInput = PropValue | TypedPropValue;

/** `IFCPROPERTYSINGLEVALUE` com o valor no tipo IFC mais próximo (`IFCBOOLEAN`, `IFCINTEGER`, `IFCREAL` ou `IFCLABEL`). */
export function singleValue(w: StepWriter, name: string, value: PropInput): number {
  const nominal =
    typeof value === 'object'
      ? typedNominal(value)
      : typeof value === 'boolean'
        ? `IFCBOOLEAN(${value ? '.T.' : '.F.'})`
        : typeof value === 'number'
          ? Number.isInteger(value)
            ? `IFCINTEGER(${int(value)})`
            : `IFCREAL(${num(value)})`
          : `IFCLABEL(${stepString(value)})`;
  return w.add('IFCPROPERTYSINGLEVALUE', [stepString(name), OMIT, nominal, OMIT]);
}

function typedNominal(value: TypedPropValue): string {
  const v = typeof value.value === 'string' ? stepString(value.value) : num(value.value);
  return `${value.ifc}(${v})`;
}

/**
 * `IFCPROPERTYSET` com as propriedades na ordem dada e `IFCRELDEFINESBYPROPERTIES` ligando o conjunto ao objeto. O
 * GlobalId é determinístico pela `key` (`pset:wall:<id>`, `pset:door:<id>`...), então o mesmo projeto gera o mesmo texto.
 */
export function addPropertySet(
  c: IfcCtx,
  key: string,
  name: string,
  props: ReadonlyArray<readonly [string, PropInput]>,
  object: number,
): void {
  if (props.length === 0) return;
  const singles = props.map(([n, v]) => ref(singleValue(c.w, n, v)));
  const set = c.w.add('IFCPROPERTYSET', [gid(key), OMIT, stepString(name), OMIT, list(singles)]);
  c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`${key}:rel`), OMIT, OMIT, OMIT, list([ref(object)]), ref(set)]);
}
