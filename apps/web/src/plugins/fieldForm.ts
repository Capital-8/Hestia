/**
 * Validação de um formulário de campos de suplemento (diálogo ou painel) antes de entregar os valores ao handler.
 * Os valores entram já em unidades de API (metro e radiano); `undefined` marca um campo numérico digitado inválido.
 */
import { validateFieldValues, type DialogField, type FieldErrorCode, type FieldValue } from '@hestia/plugin-api';

export type FormErrors = Record<string, FieldErrorCode | 'invalid'>;
export type FormCheck = { ok: true; values: Record<string, FieldValue> } | { ok: false; errors: FormErrors };

export function checkForm(fields: readonly DialogField[], values: Record<string, FieldValue | undefined>): FormCheck {
  const errors: FormErrors = {};
  const clean: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined) errors[f.key] = 'invalid';
    else clean[f.key] = v;
  }
  const r = validateFieldValues(fields.filter((f) => !(f.key in errors)), clean);
  if (!r.ok) for (const e of r.errors) errors[e.key] = e.code;
  return Object.keys(errors).length > 0 || !r.ok ? { ok: false, errors } : { ok: true, values: r.values };
}
