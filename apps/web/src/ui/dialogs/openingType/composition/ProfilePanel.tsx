import { useMemo, type ReactElement } from 'react';
import {
  DIVIDER_WIDTH_DEFAULT,
  STOP_WIDTH_DEFAULT,
  compositionIssue,
  formatQuantity,
  openingCompositionOf,
  openingProfilesOf,
  resolveProfile,
  type OpeningComposition,
  type ProfileMaterial,
  type ProfileRef,
  type ProfileRole,
  type ProfileSection,
  type ResolvedUnits,
} from '@hestia/model';
import { useProject } from '../../../../editor/controller.ts';
import { useT, type Dict } from '../../../../editor/i18n.ts';
import { useUnits } from '../../../useUnits.ts';
import { NumField } from '../../../fields.tsx';
import type { PanelProps } from '../panels/panelKit.tsx';
import { ajustarCampo, aValidar, comBatente, comDivisor, divisores, fonteDaRef, presetsParaPapel, trocarPreset, type Profiles } from './profileControls.ts';

const MATERIAIS: Record<ProfileMaterial, keyof Dict> = { wood: 'dlo_prof_material_wood', aluminum: 'dlo_prof_material_aluminum', pvc: 'dlo_prof_material_pvc', glass: 'dlo_prof_material_glass' };
const SECOES: Record<ProfileSection, keyof Dict> = {
  rect: 'dlo_prof_section_rect',
  rect_rebate: 'dlo_prof_section_rect_rebate',
  L: 'dlo_prof_section_l',
  T: 'dlo_prof_section_t',
  chambered: 'dlo_prof_section_chambered',
  none: 'dlo_prof_section_none',
};

/** Presets do projeto, com o mapa recalculado só quando o projeto muda. */
export function useOpeningProfiles(): Profiles {
  const projeto = useProject();
  return useMemo(() => openingProfilesOf(projeto), [projeto]);
}

/** Marca "a validar" ao lado do campo que o preset não confirma (R2). */
export function Validar({ on }: { on: boolean }): ReactElement | null {
  const { t } = useT();
  return on ? <span className="hint">{t('dlo_to_validate')}</span> : null;
}

interface PerfilRowsProps {
  id: string;
  /** Título já traduzido (Batente ou Divisor N). */
  titulo: string;
  papel: ProfileRole;
  /** Referência do perfil; ausente = divisor no padrão (sem campos para editar). */
  valor: ProfileRef | undefined;
  perfis: Profiles;
  units: ResolvedUnits;
  onChange: (next: ProfileRef | undefined) => void;
  /** O divisor pode voltar ao padrão do modelo. */
  comPadrao?: boolean;
}

/** Um perfil do quadro: preset, campos de sobreposição (`override`) e leitura de material, seção e fonte. */
function PerfilRows({ id, titulo, papel, valor, perfis, units, onChange, comPadrao }: PerfilRowsProps): ReactElement {
  const { t, lang } = useT();
  const presets = presetsParaPapel(papel, perfis);
  const select = valor === undefined ? '' : 'presetId' in valor ? valor.presetId : 'inline';
  return (
    <>
      <div className="field-row">
        <label htmlFor={`${id}-preset`} title={t('dlo_prof_tip', { title: titulo.toLowerCase() })}>{titulo}</label>
        <select
          id={`${id}-preset`}
          className="select"
          value={select}
          onChange={(e) => onChange(e.target.value === '' ? undefined : trocarPreset(e.target.value))}
        >
          {comPadrao ? <option value="">{t('dlo_prof_divider_default')}</option> : null}
          {valor && 'inline' in valor ? <option value="inline">{t('dlo_prof_inline')}</option> : null}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {valor === undefined ? (
        <p className="hint">{t('dlo_h_divider_default', { w: formatQuantity(units, 'smallLength', DIVIDER_WIDTH_DEFAULT, { decimals: 1, trim: true }) })}</p>
      ) : (
        <>
          <div className="field-row">
            <label htmlFor={`${id}-w`} title={t('dlo_prof_visible_width_tip')}>{t('dlo_prof_visible_width')}<Validar on={aValidar(valor, perfis, 'visibleWidth')} /></label>
            <NumField id={`${id}-w`} value={resolveProfile(valor, perfis).visibleWidth} quantity="smallLength" min={0} onCommit={(v) => onChange(ajustarCampo(valor, perfis, 'visibleWidth', v))} />
          </div>
          <div className="field-row">
            <label htmlFor={`${id}-d`} title={t('dlo_prof_depth_tip')}>{t('dlo_prof_depth')}<Validar on={aValidar(valor, perfis, 'depth')} /></label>
            <NumField id={`${id}-d`} value={resolveProfile(valor, perfis).depth} quantity="smallLength" min={0} onCommit={(v) => onChange(ajustarCampo(valor, perfis, 'depth', v))} />
          </div>
          <div className="field-row">
            <label htmlFor={`${id}-s`} title={t('dlo_prof_stop_tip')}>{t('dlo_prof_stop')}<Validar on={aValidar(valor, perfis, 'stopWidth')} /></label>
            <NumField id={`${id}-s`} value={resolveProfile(valor, perfis).stopWidth ?? STOP_WIDTH_DEFAULT} quantity="smallLength" min={0} onCommit={(v) => onChange(ajustarCampo(valor, perfis, 'stopWidth', v))} />
          </div>
          <div className="field-row">
            <label>{t('dlo_prof_material_section')}</label>
            <span>
              {t(MATERIAIS[resolveProfile(valor, perfis).material])} · {t(SECOES[resolveProfile(valor, perfis).section])}
              <Validar on={aValidar(valor, perfis, 'section')} />
            </span>
          </div>
          <p className="hint">{t('dlo_prof_source', { source: fonteDaRef(valor, perfis, lang) })}</p>
        </>
      )}
    </>
  );
}

/** Perfis do quadro: batente e divisores (cada divisão interna da composição). Escreve em `composition` do tipo. */
export function ProfilePanel({ d, onChange }: PanelProps): ReactElement {
  const units = useUnits();
  const { t } = useT();
  const perfis = useOpeningProfiles();
  const c: OpeningComposition = openingCompositionOf(d);
  const grava = (next: OpeningComposition): void => onChange({ ...d, composition: next });
  const erro = compositionIssue(c, perfis);
  return (
    <>
      <PerfilRows id="op-pf-batente" titulo={t('oc_frame')} papel="frame" valor={c.frame.profile} perfis={perfis} units={units} onChange={(r) => r && grava(comBatente(c, r))} />
      {divisores(c.layout).map((s, i) => (
        <PerfilRows
          key={s.id}
          id={`op-pf-div-${s.id}`}
          titulo={t('dlo_prof_divider', { i: i + 1, kind: t(s.axis === 'cols' ? 'dlo_prof_divider_mullion' : 'dlo_prof_divider_transom') })}
          papel="divider"
          valor={s.divider}
          perfis={perfis}
          units={units}
          comPadrao
          onChange={(r) => grava(comDivisor(c, s.id, r))}
        />
      ))}
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </>
  );
}
