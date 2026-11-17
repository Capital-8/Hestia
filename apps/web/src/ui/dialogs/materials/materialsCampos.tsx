import type { ReactElement } from 'react';
import type { HatchKind } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { COR_PADRAO_PERSONALIZADA, PADROES } from './materialsLogic.ts';

/** Cor opcional: "automática" grava `undefined` (o render escolhe o padrão); "personalizada" mostra o seletor de cor. */
export function CorOpcional({ id, label, value, reserva, onChange }: { id: string; label: string; value: string | undefined; reserva: string; onChange: (v: string | undefined) => void }): ReactElement {
  const { t } = useT();
  const personalizada = value !== undefined;
  return (
    <div className="field-row">
      <label htmlFor={`${id}-modo`}>{label}</label>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          id={`${id}-modo`}
          aria-label={`${label}: ${t('dlt_mat_color_mode')}`}
          className="select"
          value={personalizada ? 'custom' : 'auto'}
          onChange={(e) => onChange(e.target.value === 'custom' ? reserva || COR_PADRAO_PERSONALIZADA : undefined)}
        >
          <option value="auto">{t('dlt_mat_color_auto')}</option>
          <option value="custom">{t('dlt_mat_color_custom')}</option>
        </select>
        {personalizada ? (
          <input id={id} type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 54, height: 28, padding: 0, border: '1px solid var(--line-strong)', background: 'none' }} />
        ) : null}
      </span>
    </div>
  );
}

/** Seletor de padrão de hachura entre os 5 padrões do editor. */
export function PadraoSelect({ id, label, value, onChange }: { id: string; label: string; value: HatchKind; onChange: (v: HatchKind) => void }): ReactElement {
  const { t } = useT();
  const rotulo: Record<string, string> = {
    none: t('dlt_hatch_none'),
    diagonal: t('dlt_hatch_diagonal'),
    cross: t('dlt_hatch_cross'),
    dots: t('dlt_hatch_dots'),
    solid: t('dlt_hatch_solid'),
  };
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as HatchKind)}>
        {PADROES.map((k) => (
          <option key={k} value={k}>{rotulo[k]}</option>
        ))}
      </select>
    </div>
  );
}
