import type { ReactElement } from 'react';
import type { HatchKind } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { HatchSwatch } from './HatchSwatch.tsx';
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

/** Seletor de padrão de hachura entre os 21 padrões do editor. */
export function PadraoSelect({ id, label, value, onChange }: { id: string; label: string; value: HatchKind; onChange: (v: HatchKind) => void }): ReactElement {
  const { t } = useT();
  const rotulo: Record<string, string> = {
    none: t('dlt_hatch_none'),
    diagonal: t('dlt_hatch_diagonal'),
    cross: t('dlt_hatch_cross'),
    dots: t('dlt_hatch_dots'),
    solid: t('dlt_hatch_solid'),
    brick: t('dlt_hatch_brick'),
    concrete: t('dlt_hatch_concrete'),
    timber: t('dlt_hatch_timber'),
    insulation: t('dlt_hatch_insulation'),
    earth: t('dlt_hatch_earth'),
    cmu: t('dlt_hatch_cmu'),
    exposedBrick: t('dlt_hatch_exposedBrick'),
    rcConcrete: t('dlt_hatch_rcConcrete'),
    stone: t('dlt_hatch_stone'),
    gravel: t('dlt_hatch_gravel'),
    sand: t('dlt_hatch_sand'),
    eps: t('dlt_hatch_eps'),
    woolZigzag: t('dlt_hatch_woolZigzag'),
    gypsum: t('dlt_hatch_gypsum'),
    timberEnd: t('dlt_hatch_timberEnd'),
    steel: t('dlt_hatch_steel'),
  };
  const rotuloId = `${id}-rotulo`;
  return (
    <div className="field-row">
      <label id={rotuloId}>{label}</label>
      <div id={id} role="radiogroup" aria-labelledby={rotuloId} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
        {PADROES.map((k) => {
          const selecionado = k === value;
          const texto = rotulo[k] ?? k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={selecionado}
              title={texto}
              className={selecionado ? 'selected' : undefined}
              onClick={() => onChange(k)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: 3,
                background: 'var(--sheet)',
                color: 'var(--fg)',
                border: `1px solid ${selecionado ? 'var(--accent)' : 'var(--line-strong)'}`,
                borderRadius: 3,
                cursor: 'pointer',
                minWidth: 0,
              }}
            >
              <HatchSwatch kind={k} label={texto} />
              <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: 'center' }}>{texto}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
