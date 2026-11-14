/**
 * Valores de campos de diálogo/painel declarativos (spec 08 §4, fase H). O host mostra e edita `length` e `angle` nas
 * unidades do projeto, mas entrega ao handler SEMPRE metro e radiano; esta validação roda no host, sobre valores já
 * convertidos para essas unidades de API, antes de qualquer ação do suplemento.
 */
import type { DialogField } from './contributesTypes.ts';

export type FieldValue = number | string | boolean;

export type FieldErrorCode = 'not_number' | 'below_min' | 'above_max' | 'not_text' | 'text_too_long' | 'bad_option' | 'not_bool';
export interface FieldError { key: string; code: FieldErrorCode }

/** Texto livre: até 200 caracteres (mesmo teto do `default` do manifesto). */
export const MAX_TEXT_FIELD_CHARS = 200;

/** Valor inicial de um campo: o `default` do manifesto ou um vazio do tipo certo (limitado por `min`). */
export function initialFieldValue(f: DialogField): FieldValue {
  if (f.default !== undefined) return f.default;
  return f.type === 'bool' ? false : f.type === 'text' ? '' : f.type === 'choice' ? (f.options?.[0] ?? '') : (f.min ?? 0);
}

/** Valores iniciais de todos os campos, por `key`. */
export const initialFieldValues = (fields: readonly DialogField[]): Record<string, FieldValue> =>
  Object.fromEntries(fields.map((f) => [f.key, initialFieldValue(f)]));

/** Valida um campo. Devolve o valor normalizado ou o código do erro. */
export function validateFieldValue(f: DialogField, v: unknown): { ok: true; value: FieldValue } | { ok: false; code: FieldErrorCode } {
  switch (f.type) {
    case 'bool': return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, code: 'not_bool' };
    case 'text':
      if (typeof v !== 'string') return { ok: false, code: 'not_text' };
      return v.length <= MAX_TEXT_FIELD_CHARS ? { ok: true, value: v } : { ok: false, code: 'text_too_long' };
    case 'choice': return typeof v === 'string' && (f.options ?? []).includes(v) ? { ok: true, value: v } : { ok: false, code: 'bad_option' };
    default:
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, code: 'not_number' };
      if (f.min !== undefined && v < f.min) return { ok: false, code: 'below_min' };
      if (f.max !== undefined && v > f.max) return { ok: false, code: 'above_max' };
      return { ok: true, value: v };
  }
}

/** Valida todos os campos; chave ausente usa o valor inicial, chave desconhecida é descartada. */
export function validateFieldValues(fields: readonly DialogField[], raw: Record<string, unknown>): { ok: true; values: Record<string, FieldValue> } | { ok: false; errors: FieldError[] } {
  const values: Record<string, FieldValue> = {};
  const errors: FieldError[] = [];
  for (const f of fields) {
    const r = validateFieldValue(f, Object.prototype.hasOwnProperty.call(raw, f.key) ? raw[f.key] : initialFieldValue(f));
    if (r.ok) values[f.key] = r.value;
    else errors.push({ key: f.key, code: r.code });
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}
