import type { ReactElement } from 'react';
import type { WallType } from '@hestia/model';
import { NumField, TextField } from '../fields.tsx';
import { useT } from '../../editor/i18n.ts';
import { FamilyRow, FamilySection } from './familia/index.ts';

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
    <FamilyRow label={label} htmlFor={id}>
      <input type="checkbox" aria-label={t('dlt_a11y_value_informed', { label })} checked={value !== null} onChange={(e) => onChange(e.target.checked ? 0 : null)} />
      {value !== null ? (
        <NumField id={id} value={value} decimals={decimals} suffix={suffix} min={min} onCommit={(v) => onChange(v)} />
      ) : (
        <span className="hint">{t('dlt_value_not_set')}</span>
      )}
    </FamilyRow>
  );
}

/** Parâmetros de desempenho e custo do tipo de parede (G3). Campos ausentes em arquivos antigos contam como não informados. */
export function TypeParams({ type, onChange }: { type: WallType; onChange: (patch: Partial<WallType>) => void }): ReactElement {
  const { t } = useT();
  return (
    <FamilySection title={t('dlt_type_params_legend')} collapsible={false}>
      <FamilyRow label={t('dlt_cost')} htmlFor="wt-cost" title={t('dlt_tt_cost_face')}>
        <NumField id="wt-cost" value={type.cost ?? 0} quantity="currency" min={0} onCommit={(v) => onChange({ cost: v })} />
      </FamilyRow>
      {/* units-ok: unidade técnica de transmitância (fixa, não é medida do projeto) */}
      <OptionalNum id="wt-u" label={t('dlt_fld_thermal_u')} value={type.thermalU ?? null} decimals={2} suffix="W/m²K" min={0} onChange={(v) => onChange({ thermalU: v })} />
      <OptionalNum id="wt-rw" label={t('dlt_fld_acoustic_rw')} value={type.acousticRw ?? null} decimals={0} suffix="dB" min={0} onChange={(v) => onChange({ acousticRw: v })} />
      <OptionalNum id="wt-fire" label={t('dlt_fld_fire_rating')} value={type.fireRating ?? null} decimals={0} suffix="min" min={0} onChange={(v) => onChange({ fireRating: v })} />
      <FamilyRow label={t('dlt_fld_manufacturer')} htmlFor="wt-mfr">
        <TextField id="wt-mfr" value={type.manufacturer ?? ''} placeholder={t('dlt_ph_manufacturer')} onCommit={(v) => onChange({ manufacturer: v })} />
      </FamilyRow>
    </FamilySection>
  );
}
