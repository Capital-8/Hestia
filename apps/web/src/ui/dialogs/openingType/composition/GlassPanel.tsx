import { useState, type ReactElement } from 'react';
import {
  FRAMELESS_CLEARANCE_DEFAULT,
  GLASS_REBATE_DEFAULTS,
  compositionIssue,
  openingCompositionOf,
  resolveProfile,
  type GlassSpec,
  type OpeningComposition,
  type OpeningGlassKind,
} from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { GLASS_KINDS } from '../openingTypeControls.ts';
import type { PanelProps } from '../panels/panelKit.tsx';
import { aValidar, ajustarRebaixo, comBatente, comVidro, vidros } from './profileControls.ts';
import { Validar, useOpeningProfiles } from './ProfilePanel.tsx';

/**
 * Vidro das células de vidro da composição: tipo, espessura e montagem. O rebaixo é do perfil do batente (a validar);
 * sem perfil (frameless) a folga é a do modelo, sem campo no contrato.
 */
export function GlassPanel({ d, onChange }: PanelProps): ReactElement {
  const { t } = useT();
  const perfis = useOpeningProfiles();
  const c: OpeningComposition = openingCompositionOf(d);
  const grava = (next: OpeningComposition): void => onChange({ ...d, composition: next });
  const celulas = vidros(c);
  const [escolhida, setEscolhida] = useState<string | undefined>(undefined);
  const cel = celulas.find((x) => x.id === escolhida) ?? celulas[0];
  const vidro: GlassSpec | undefined = cel && cel.content.kind === 'glass' ? cel.content.glass : undefined;
  const erro = compositionIssue(c, perfis);
  if (!cel || !vidro) {
    return (
      <>
        <p className="hint">{t('dlo_glass_no_cell')}</p>
        {erro ? <p className="error" role="alert">{erro}</p> : null}
      </>
    );
  }
  const batente = c.frame.profile;
  const rebaixo = resolveProfile(batente, perfis).glassRebate ?? GLASS_REBATE_DEFAULTS;
  const semPerfil = vidro.mounting === 'frameless';
  const comRebaixo = (patch: Parameters<typeof ajustarRebaixo>[2]): void => grava(comBatente(c, ajustarRebaixo(batente, perfis, patch)));
  return (
    <>
      {celulas.length > 1 ? (
        <div className="field-row">
          <label htmlFor="op-gl-cell">{t('dlo_glass_cell')}</label>
          <select id="op-gl-cell" className="select" value={cel.id} onChange={(e) => setEscolhida(e.target.value)}>
            {celulas.map((x, i) => <option key={x.id} value={x.id}>{t('dlo_glass_cell_n', { i: i + 1 })}</option>)}
          </select>
        </div>
      ) : null}
      <div className="field-row">
        <label htmlFor="op-gl-kind">{t('dlo_f_glass_kind')}</label>
        <select id="op-gl-kind" className="select" value={vidro.kind} onChange={(e) => grava(comVidro(c, cel.id, { kind: e.target.value as OpeningGlassKind }))}>
          {GLASS_KINDS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
        </select>
      </div>
      <div className="field-row">
        <label htmlFor="op-gl-t">{t('dlo_f_glass_thickness')}</label>
        <NumField id="op-gl-t" value={vidro.thickness} quantity="smallLength" min={0.001} onCommit={(v) => grava(comVidro(c, cel.id, { thickness: v }))} />
      </div>
      <div className="field-row">
        <label htmlFor="op-gl-mount" title={t('dlo_glass_mounting_tip')}>{t('dlo_glass_mounting')}</label>
        <select id="op-gl-mount" className="select" value={vidro.mounting} onChange={(e) => grava(comVidro(c, cel.id, { mounting: e.target.value as GlassSpec['mounting'] }))}>
          <option value="rebate">{t('dlo_o_glass_rebate')}</option>
          <option value="frameless">{t('dlo_o_glass_frameless')}</option>
        </select>
      </div>
      <h4 className="op-subtitle">{t('dlo_glass_rebate_title')}</h4>
      <div className="field-row">
        <label htmlFor="op-gl-rd" title={t('dlo_glass_rebate_depth_tip')}>{t('dlo_glass_rebate_depth')}<Validar on={aValidar(batente, perfis, 'glassRebate')} /></label>
        <NumField id="op-gl-rd" value={rebaixo.depth} quantity="smallLength" min={0} disabled={semPerfil} onCommit={(v) => comRebaixo({ depth: v })} />
      </div>
      <div className="field-row">
        <label htmlFor="op-gl-rc" title={t('dlo_glass_rebate_clearance_tip')}>{t('dlo_glass_rebate_clearance')}<Validar on={aValidar(batente, perfis, 'glassRebate')} /></label>
        <NumField id="op-gl-rc" value={rebaixo.clearance} quantity="smallLength" min={0} disabled={semPerfil} onCommit={(v) => comRebaixo({ clearance: v })} />
      </div>
      <div className="field-row">
        <label htmlFor="op-gl-bead" title={t('dlo_glass_bead_tip')}>{t('dlo_glass_bead')}<Validar on={aValidar(batente, perfis, 'glassRebate')} /></label>
        <NumField id="op-gl-bead" value={rebaixo.bead} quantity="smallLength" min={0} disabled={semPerfil} onCommit={(v) => comRebaixo({ bead: v })} />
      </div>
      <div className="field-row">
        <label htmlFor="op-gl-free" title={t('dlo_glass_frameless_clearance_tip')}>{t('dlo_glass_frameless_clearance')}</label>
        <NumField id="op-gl-free" value={FRAMELESS_CLEARANCE_DEFAULT} quantity="smallLength" disabled onCommit={() => undefined} />
      </div>
      <p className="hint">{t('dlo_h_glass_to_validate')}</p>
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </>
  );
}
