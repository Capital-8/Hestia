import type { ReactElement } from 'react';
import type { WallType } from '@hestia/model';
import { NumField, TextField } from '../fields.tsx';
import { useT } from '../../editor/i18n.ts';

interface OptionalProps {
  id: string;
  label: string;
  value: number | null;
  decimals: number;
  suffix: string;
  min?: number;
  onChange: (v: number | null) => void;
}

/** Campo numérico opcional: a caixa marca se o valor foi informado (null = não informado). */
function OptionalNum({ id, label, value, decimals, suffix, min, onChange }: OptionalProps): ReactElement {
  const { t } = useT();
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" aria-label={t('dlt_a11y_value_informed', { label })} checked={value !== null} onChange={(e) => onChange(e.target.checked ? 0 : null)} />
        {value !== null ? (
          <NumField id={id} value={value} decimals={decimals} suffix={suffix} min={min} onCommit={(v) => onChange(v)} />
        ) : (
          <span className="hint">{t('dlt_value_not_set')}</span>
        )}
      </span>
    </div>
  );
}

/** Parâmetros de desempenho e custo do tipo de parede (G3). Campos ausentes em arquivos antigos contam como não informados. */
export function TypeParams({ type, onChange }: { type: WallType; onChange: (patch: Partial<WallType>) => void }): ReactElement {
  const { t } = useT();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
      <legend style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_type_params_legend')}</legend>
      <div className="field-row">
        <label htmlFor="wt-cost" title={t('dlt_tt_cost_face')}>{t('dlt_cost')}</label>
        <NumField id="wt-cost" value={type.cost ?? 0} quantity="currency" min={0} onCommit={(v) => onChange({ cost: v })} />
      </div>
      {/* units-ok: unidade técnica de transmitância (fixa, não é medida do projeto) */}
      <OptionalNum id="wt-u" label={t('dlt_fld_thermal_u')} value={type.thermalU ?? null} decimals={2} suffix="W/m²K" min={0} onChange={(v) => onChange({ thermalU: v })} />
      <OptionalNum id="wt-rw" label={t('dlt_fld_acoustic_rw')} value={type.acousticRw ?? null} decimals={0} suffix="dB" min={0} onChange={(v) => onChange({ acousticRw: v })} />
      <OptionalNum id="wt-fire" label={t('dlt_fld_fire_rating')} value={type.fireRating ?? null} decimals={0} suffix="min" min={0} onChange={(v) => onChange({ fireRating: v })} />
      <div className="field-row">
        <label htmlFor="wt-mfr">{t('dlt_fld_manufacturer')}</label>
        <TextField id="wt-mfr" value={type.manufacturer ?? ''} placeholder={t('dlt_ph_manufacturer')} onCommit={(v) => onChange({ manufacturer: v })} />
      </div>
    </fieldset>
  );
}
