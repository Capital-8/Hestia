import type { ReactElement } from 'react';
import {
  STRUCTURAL_PRESETS,
  footingPresetOffset,
  matchingFootingPreset,
  type StructuralAnchorPreset,
  type StructuralPresetDef,
} from '@hestia/tools';
import type { Dict } from '../editor/i18n.ts';
import { useT } from '../editor/i18n.ts';
import { NumField, Row } from './fields.tsx';

export type FootingAlignPreset = StructuralAnchorPreset;

export interface PresetDef extends StructuralPresetDef {
  readonly titleKey: keyof Dict;
}

export const PRESET_TITLE_KEY: Readonly<Record<StructuralAnchorPreset, keyof Dict>> = {
  tl: 'str_preset_corner_tl',
  top: 'str_preset_edge_top',
  tr: 'str_preset_corner_tr',
  left: 'str_preset_edge_left',
  center: 'str_preset_center',
  right: 'str_preset_edge_right',
  bl: 'str_preset_corner_bl',
  bottom: 'str_preset_edge_bottom',
  br: 'str_preset_corner_br',
};

/** Grade 3x3 em ordem numérica 7-8-9 / 4-5-6 / 1-2-3 para alinhamento rápido em planta. */
export const FOOTING_PRESETS: readonly PresetDef[] = STRUCTURAL_PRESETS.map((p) => ({
  ...p,
  titleKey: PRESET_TITLE_KEY[p.id],
}));

export { footingPresetOffset, matchingFootingPreset };

export interface StructuralAnchorCardProps {
  activePreset?: StructuralAnchorPreset | null;
  mixed?: boolean;
  kind?: 'footing' | 'column';
  onSelect: (preset: StructuralAnchorPreset) => void;
}

/** Seletor compacto 3x3 de ponto de inserção / excentricidade com atalhos 1–9 em tooltip. */
export function StructuralAnchorCard({
  activePreset = 'center',
  mixed = false,
  onSelect,
}: StructuralAnchorCardProps): ReactElement {
  const { t } = useT();

  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, 26px)', gap: 2 }}>
      {FOOTING_PRESETS.map((preset) => {
        const isActive = !mixed && activePreset === preset.id;
        const title = `${t(preset.titleKey)} (${t('str_key_short', { key: preset.numKey })})`;
        return (
          <button
            key={preset.id}
            type="button"
            className={`btn small${isActive ? ' on' : ''}`}
            title={title}
            aria-label={title}
            aria-pressed={isActive}
            onClick={(e) => {
              onSelect(preset.id);
              e.currentTarget.blur();
            }}
            style={{
              padding: 0,
              minWidth: 26,
              width: 26,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: isActive ? 'var(--accent)' : undefined,
              background: isActive ? 'var(--accent-soft)' : undefined,
              fontWeight: isActive ? 700 : undefined,
            }}
          >
            <span style={{ fontSize: 11, lineHeight: 1 }}>{preset.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface FootingEccentricityRowsProps {
  idPrefix: string;
  eccentric: boolean;
  modeMixed?: boolean;
  ex: number;
  ey: number;
  exMixed?: boolean;
  eyMixed?: boolean;
  activePreset?: StructuralAnchorPreset | null;
  onModeChange: (eccentric: boolean) => void;
  onExChange: (v: number) => void;
  onEyChange: (v: number) => void;
  onPreset: (preset: FootingAlignPreset) => void;
}

/** Blocos de propriedades compartilhados para sapata centralizada/excêntrica e card visual 3x3. */
export function FootingEccentricityRows(props: FootingEccentricityRowsProps): ReactElement {
  const { t } = useT();
  const modeVal = props.modeMixed ? '' : (props.eccentric ? 'eccentric' : 'centered');
  const showFields = props.eccentric || props.modeMixed || Math.hypot(props.ex, props.ey) > 1e-6;
  const resolvedPreset = props.activePreset !== undefined
    ? props.activePreset
    : (!showFields ? 'center' : null);

  return (
    <>
      <Row label={t('str_fld_foot_pos_mode')} htmlFor={`${props.idPrefix}-ecc-mode`}>
        <select
          id={`${props.idPrefix}-ecc-mode`}
          className="select"
          value={modeVal}
          onChange={(e) => {
            if (e.target.value === 'centered') props.onModeChange(false);
            else if (e.target.value === 'eccentric') props.onModeChange(true);
            e.currentTarget.blur();
          }}
        >
          {props.modeMixed && <option value="" disabled>—</option>}
          <option value="centered">{t('str_opt_foot_centered')}</option>
          <option value="eccentric">{t('str_opt_foot_eccentric')}</option>
        </select>
      </Row>
      {showFields && (
        <>
          <Row label={t('str_fld_eccentricity_x')} htmlFor={`${props.idPrefix}-ex`}>
            <NumField id={`${props.idPrefix}-ex`} value={props.ex} mixed={props.exMixed} quantity="length" onCommit={props.onExChange} />
          </Row>
          <Row label={t('str_fld_eccentricity_y')} htmlFor={`${props.idPrefix}-ey`}>
            <NumField id={`${props.idPrefix}-ey`} value={props.ey} mixed={props.eyMixed} quantity="length" onCommit={props.onEyChange} />
          </Row>
        </>
      )}
      <Row label={t('str_fld_eccentric_presets')}>
        <StructuralAnchorCard
          kind="footing"
          mixed={props.modeMixed || props.exMixed || props.eyMixed}
          activePreset={resolvedPreset}
          onSelect={props.onPreset}
        />
      </Row>
    </>
  );
}
