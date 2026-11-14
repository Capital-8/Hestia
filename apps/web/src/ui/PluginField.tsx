import { useState, type ReactElement } from 'react';
import type { DialogField, FieldErrorCode, FieldValue, PluginText } from '@hestia/plugin-api';
import type { ResolvedUnits } from '@hestia/model';
import { useT, type Lang } from '../editor/i18n.ts';
import { fieldToText, fieldUnitSymbol, textToField } from '../plugins/fieldUnits.ts';
import { txt } from './ribbon/model.ts';

/**
 * Campo de entrada declarativo de suplemento (spec 08 §4, fase H): número, texto, seleção, caixa de marcação, comprimento
 * e ângulo. Comprimento e ângulo são exibidos e editados nas unidades do projeto (separador decimal e unidade dele);
 * `onChange` entrega sempre o valor da API (metro e radiano) ou `undefined` enquanto o texto digitado não é um número.
 */
export function PluginField({ f, value, units, lang, error, onChange }: {
  f: DialogField;
  /** Valor atual da API. */
  value: FieldValue;
  units: ResolvedUnits;
  lang: Lang;
  error?: FieldErrorCode | 'invalid' | undefined;
  onChange: (v: FieldValue | undefined) => void;
}): ReactElement {
  const { t } = useT();
  const label = txt(f.label as PluginText, lang);
  // Campo numérico: o texto digitado é guardado à parte, para o usuário poder digitar "1," sem o valor "pular".
  const [text, setText] = useState(() => (typeof value === 'number' ? fieldToText(f, value, units) : ''));
  const msg = error === undefined ? null : error === 'below_min' ? t('supui_field_min', { min: shown(f, f.min, units) })
    : error === 'above_max' ? t('supui_field_max', { max: shown(f, f.max, units) })
    : error === 'text_too_long' ? t('supui_field_text_long', { max: 200 })
    : error === 'bad_option' ? t('supui_field_option') : t('supui_field_invalid');
  const note = msg ? <span className="plugin-field-error" role="alert">{msg}</span> : null;

  if (f.type === 'bool') {
    return <label className="field"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {label}{note}</label>;
  }
  if (f.type === 'choice') {
    return (
      <label className="field">{label}
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
        {note}
      </label>
    );
  }
  if (f.type === 'text') {
    return <label className="field">{label}<input type="text" value={String(value)} maxLength={200} onChange={(e) => onChange(e.target.value)} />{note}</label>;
  }
  const un = fieldUnitSymbol(f, units);
  return (
    <label className="field">{label}{un ? ` (${un})` : ''}
      <input
        type="text" inputMode="decimal" value={text} aria-invalid={error !== undefined}
        onChange={(e) => { setText(e.target.value); onChange(textToField(f, e.target.value, units) ?? undefined); }}
      />
      {note}
    </label>
  );
}

/** Limite do campo (min/max da API) como texto nas unidades do projeto, com o símbolo. */
function shown(f: DialogField, v: number | undefined, u: ResolvedUnits): string {
  if (v === undefined) return '';
  const un = fieldUnitSymbol(f, u);
  return `${fieldToText(f, v, u)}${un ? ` ${un}` : ''}`;
}
