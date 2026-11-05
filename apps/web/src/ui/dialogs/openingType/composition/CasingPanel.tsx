import type { ReactElement } from 'react';
import { CASING_RULES, compositionIssue, openingCompositionOf, type CasingFaces, type OpeningComposition } from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import type { PanelProps } from '../panels/panelKit.tsx';
import { ALIZAR_FACES, alizarLigado, comAlizar } from './profileControls.ts';
import { useOpeningProfiles } from './ProfilePanel.tsx';

/**
 * Alizar do conjunto: faces, largura, espessura e recuo. Contorna a envoltória do conjunto (não os divisores internos).
 * Com alizar ligado, o retorno do acabamento (`closure`) fica desabilitado: o alizar cobre a face.
 */
export function CasingPanel({ d, onChange }: PanelProps): ReactElement {
  const { t } = useT();
  const perfis = useOpeningProfiles();
  const c: OpeningComposition = openingCompositionOf(d);
  const grava = (next: OpeningComposition): void => onChange({ ...d, composition: next });
  const k = c.casing;
  const ligado = alizarLigado(c);
  const erro = compositionIssue(c, perfis);
  return (
    <>
      <div className="field-row">
        <label htmlFor="op-cas-faces" title={t('dlo_f_casing_faces_tip')}>{t('dlo_f_casing_faces')}</label>
        <select id="op-cas-faces" className="select" value={k?.faces ?? 'none'} onChange={(e) => grava(comAlizar(c, { faces: e.target.value as CasingFaces }))}>
          {ALIZAR_FACES.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
        </select>
      </div>
      <div className="field-row">
        <label htmlFor="op-cas-w" title={t('dlo_tip_casing_width')}>{t('col_width')}</label>
        <NumField id="op-cas-w" value={k?.width ?? CASING_RULES.defaultWidth} quantity="smallLength" min={0.001} disabled={!ligado} onCommit={(v) => grava(comAlizar(c, { width: v }))} />
      </div>
      <div className="field-row">
        <label htmlFor="op-cas-t" title={t('dlo_tip_casing_thickness')}>{t('col_thickness')}</label>
        <NumField id="op-cas-t" value={k?.thickness ?? CASING_RULES.defaultThickness} quantity="smallLength" min={0.001} disabled={!ligado} onCommit={(v) => grava(comAlizar(c, { thickness: v }))} />
      </div>
      <div className="field-row">
        <label htmlFor="op-cas-sb" title={t('dlo_f_casing_setback_tip')}>{t('dlo_f_casing_setback')}</label>
        <NumField id="op-cas-sb" value={k?.setback ?? CASING_RULES.defaultSetback} quantity="smallLength" min={0} disabled={!ligado} onCommit={(v) => grava(comAlizar(c, { setback: v }))} />
      </div>
      {ligado ? (
        <>
          <div className="field-row">
            <label htmlFor="op-cas-closure" title={t('dlo_f_casing_closure_tip')}>{t('dlo_f_closure')}</label>
            <select id="op-cas-closure" className="select" value="off" disabled>
              <option value="off">{t('dlo_o_closure_off')}</option>
            </select>
          </div>
          <p className="hint">{t('dlo_h_casing_no_closure')}</p>
        </>
      ) : null}
      <p className="hint">{t('dlo_h_casing_outline')}</p>
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </>
  );
}
