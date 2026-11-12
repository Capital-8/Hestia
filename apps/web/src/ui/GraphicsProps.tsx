import { useState, type ReactElement } from 'react';
import { GRAPHICS_CATEGORIES, PARTIAL_STRUCTURES, PLAN_VISUAL_STYLES, VISUAL_STYLES, floorViewId, sectionGraphicsOf, view3dOf, viewGraphicsOf, type DetailLevel, type Id, type View3DSettings, type ViewGraphics } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { editViewGraphics, editSectionGraphics, editView3D, restoreViewGraphicsDefault, restoreSectionGraphicsDefault, restoreView3DDefault, type LevelGraphicsPatch, type SectionGraphicsPatch, type View3DPatch } from '../editor/graphicsActions.ts';
import { useUi } from '../editor/state.ts';
import { Check, Group, NumField, Row } from './fields.tsx';
import { categoryLabel, detailLabel, partialLabel, PLAN_SCALES, visualStyleLabel } from './graphicsLabels.ts';

/** Ordem dos níveis de detalhe na lista (do automático ao fino). */
const DETAILS: readonly (DetailLevel | 'byScale')[] = ['byScale', 'coarse', 'medium', 'fine'];

/** Gráficos da planta do nível (decisão 0015 §3): escala, detalhe, estilo visual e exibição parcial. Recusas aparecem aqui. */
export function LevelGraphicsGroup({ levelId, viewId }: { levelId: Id; viewId?: Id }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const vid = viewId || floorViewId(levelId);
  const g = viewGraphicsOf(p, vid);
  const [error, setError] = useState<string | null>(null);
  const edit = (patch: LevelGraphicsPatch): void => setError(editViewGraphics(editor.store, vid, patch).error);
  const hidden = GRAPHICS_CATEGORIES.filter((c) => !g.overrides[c].visible);
  const isPreset = PLAN_SCALES.includes(g.scale);
  return (
    <Group title={t('prd_pgrp_view_graphics')} open={false}>
      <Row label={t('scale')} htmlFor="lg-scale">
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select id="lg-scale" className="select" value={isPreset ? String(g.scale) : ''} onChange={(e) => e.target.value && edit({ scale: Number(e.target.value) })} aria-label={t('prd_aria_plan_scale')}>
            {!isPreset && <option value="">{t('prd_opt_other_scale')}</option>}
            {PLAN_SCALES.map((n) => <option key={n} value={n}>{`1:${n}`}</option>)}
          </select>
          <span className="val soft">1:</span>
          <NumField id="lg-scale-free" value={g.scale} decimals={0} min={1} width={64} onCommit={(v) => edit({ scale: v })} />
        </span>
      </Row>
      <Row label={t('prd_fld_detail')} htmlFor="lg-detail">
        <select id="lg-detail" className="select" value={g.detail} onChange={(e) => edit({ detail: e.target.value as ViewGraphics['detail'] })}>
          {DETAILS.map((k) => <option key={k} value={k}>{detailLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_visual_style')} htmlFor="lg-style">
        <select id="lg-style" className="select" value={g.style} onChange={(e) => edit({ style: e.target.value as ViewGraphics['style'] })}>
          {PLAN_VISUAL_STYLES.map((k) => <option key={k} value={k}>{visualStyleLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_partial_structure')} htmlFor="lg-partial">
        <select id="lg-partial" className="select" value={g.partialStructure} onChange={(e) => edit({ partialStructure: e.target.value as ViewGraphics['partialStructure'] })}>
          {PARTIAL_STRUCTURES.map((k) => <option key={k} value={k}>{partialLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_thin_lines_screen')}><Check id="lg-thin" checked={g.thinLines === true} onChange={(x) => edit({ thinLines: x })} /></Row>
      <div className="hint">{t('prd_msg_plot_keeps_line_weights')}</div>
      {error && <div className="vr-error" role="alert">{error}</div>}
      <div className="prow"><span /><button className="btn small" onClick={() => useUi.setState({ dialog: 'graphicsVisibility', dialogArg: levelId })}>{t('prd_btn_visibility_graphics')}</button></div>
      <div className="prow"><span /><button className="btn small" onClick={() => setError(restoreViewGraphicsDefault(editor.store, vid).error)}>{t('prd_btn_restore_default')}</button></div>
      {hidden.length > 0 ? (
        <div className="hint">{t('prd_msg_hidden_in_view', { list: hidden.map((c) => categoryLabel(c, lang).toLowerCase()).join(', ') })}</div>
      ) : null}
    </Group>
  );
}

/** Gráficos do corte/elevação (decisão 0015 §3): os mesmos controles da planta, guardados no projeto. */
export function SectionGraphicsGroup(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const g = sectionGraphicsOf(p);
  const [error, setError] = useState<string | null>(null);
  const edit = (patch: SectionGraphicsPatch): void => setError(editSectionGraphics(editor.store, patch).error);
  const hidden = GRAPHICS_CATEGORIES.filter((c) => !g.overrides[c].visible);
  const isPreset = PLAN_SCALES.includes(g.scale);
  return (
    <Group title={t('prd_pgrp_view_graphics')} open={false}>
      <Row label={t('scale')} htmlFor="sg-scale">
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select id="sg-scale" className="select" value={isPreset ? String(g.scale) : ''} onChange={(e) => e.target.value && edit({ scale: Number(e.target.value) })} aria-label={t('prd_aria_section_scale')}>
            {!isPreset && <option value="">{t('prd_opt_other_scale')}</option>}
            {PLAN_SCALES.map((n) => <option key={n} value={n}>{`1:${n}`}</option>)}
          </select>
          <span className="val soft">1:</span>
          <NumField id="sg-scale-free" value={g.scale} decimals={0} min={1} width={64} onCommit={(v) => edit({ scale: v })} />
        </span>
      </Row>
      <Row label={t('prd_fld_detail')} htmlFor="sg-detail">
        <select id="sg-detail" className="select" value={g.detail} onChange={(e) => edit({ detail: e.target.value as ViewGraphics['detail'] })}>
          {DETAILS.map((k) => <option key={k} value={k}>{detailLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_visual_style')} htmlFor="sg-style">
        <select id="sg-style" className="select" value={g.style} onChange={(e) => edit({ style: e.target.value as ViewGraphics['style'] })}>
          {PLAN_VISUAL_STYLES.map((k) => <option key={k} value={k}>{visualStyleLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_partial_structure')} htmlFor="sg-partial">
        <select id="sg-partial" className="select" value={g.partialStructure} onChange={(e) => edit({ partialStructure: e.target.value as ViewGraphics['partialStructure'] })}>
          {PARTIAL_STRUCTURES.map((k) => <option key={k} value={k}>{partialLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_thin_lines_screen')}><Check id="sg-thin" checked={g.thinLines === true} onChange={(x) => edit({ thinLines: x })} /></Row>
      <div className="hint">{t('prd_msg_plot_keeps_line_weights')}</div>
      {error && <div className="vr-error" role="alert">{error}</div>}
      <div className="prow"><span /><button className="btn small" onClick={() => useUi.setState({ dialog: 'graphicsVisibility', dialogArg: 'section' })}>{t('prd_btn_visibility_graphics')}</button></div>
      <div className="prow"><span /><button className="btn small" onClick={() => setError(restoreSectionGraphicsDefault(editor.store).error)}>{t('prd_btn_restore_default')}</button></div>
      {hidden.length > 0 ? (
        <div className="hint">{t('prd_msg_hidden_in_view', { list: hidden.map((c) => categoryLabel(c, lang).toLowerCase()).join(', ') })}</div>
      ) : null}
    </Group>
  );
}

/** Cor de fundo do 3D: campo de cor que grava ao sair (cada escolha de cor seria um passo de desfazer). */
function BackgroundField({ value, onCommit }: { value: string; onCommit: (v: string) => void }): ReactElement {
  const { t } = useT();
  const [draft, setDraft] = useState(value);
  return (
    <input
      id="v3-bg"
      type="color"
      className="input"
      value={draft}
      aria-label={t('prd_aria_3d_background')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
    />
  );
}

/** Gráficos do modelo 3D (decisão 0015 §3): estilo, parcial, sombras, arestas, sol e fundo. Sombras e arestas são do projeto. */
export function View3DGroup(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const v = view3dOf(p);
  const [error, setError] = useState<string | null>(null);
  const edit = (patch: View3DPatch): void => setError(editView3D(editor.store, patch).error);
  const hidden = GRAPHICS_CATEGORIES.filter((c) => !v.overrides[c].visible);
  return (
    <Group title={t('prd_pgrp_3d_graphics')}>
      <Row label={t('prd_fld_visual_style')} htmlFor="v3-style">
        <select id="v3-style" className="select" value={v.style} onChange={(e) => edit({ style: e.target.value as View3DSettings['style'] })}>
          {VISUAL_STYLES.map((k) => <option key={k} value={k}>{visualStyleLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_partial_display')} htmlFor="v3-partial">
        <select id="v3-partial" className="select" value={v.partialStructure} onChange={(e) => edit({ partialStructure: e.target.value as View3DSettings['partialStructure'] })}>
          {PARTIAL_STRUCTURES.map((k) => <option key={k} value={k}>{partialLabel(k, lang)}</option>)}
        </select>
      </Row>
      <Row label={t('prd_fld_shadows')}><Check id="v3-shadows" checked={v.shadows} onChange={(x) => edit({ shadows: x })} /></Row>
      <Row label={t('prd_fld_edges')}><Check id="v3-edges" checked={v.edges} onChange={(x) => edit({ edges: x })} /></Row>
      <Row label={t('prd_fld_show_levels')}><Check id="v3-levels" checked={v.showLevels !== false} onChange={(x) => edit({ showLevels: x })} /></Row>
      <Row label={t('prd_fld_sun_azimuth')} htmlFor="v3-az"><NumField id="v3-az" value={(v.sunAzimuth * Math.PI) / 180} quantity="angle" min={0} max={2 * Math.PI} onCommit={(x) => edit({ sunAzimuth: (x * 180) / Math.PI })} /></Row>
      <Row label={t('prd_fld_sun_elevation')} htmlFor="v3-el"><NumField id="v3-el" value={(v.sunElevation * Math.PI) / 180} quantity="angle" min={0} max={Math.PI / 2} onCommit={(x) => edit({ sunElevation: (x * 180) / Math.PI })} /></Row>
      <Row label={t('prd_fld_background')}>
        <span className="numwrap">
          <Check id="v3-bg-theme" checked={v.background === null} onChange={(x) => edit({ background: x ? null : '#f4f6f8' })}>{t('prd_opt_theme_default')}</Check>
          {v.background !== null && <BackgroundField key={v.background} value={v.background} onCommit={(x) => edit({ background: x })} />}
        </span>
      </Row>
      {error && <div className="vr-error" role="alert">{error}</div>}
      <div className="prow"><span /><button className="btn small" onClick={() => useUi.setState({ dialog: 'graphicsVisibility', dialogArg: '3d' })}>{t('prd_btn_visibility_graphics')}</button></div>
      <div className="prow"><span /><button className="btn small" onClick={() => setError(restoreView3DDefault(editor.store).error)}>{t('prd_btn_restore_default')}</button></div>
      {hidden.length > 0 ? (
        <div className="hint">{t('prd_msg_hidden_in_3d', { list: hidden.map((c) => categoryLabel(c, lang).toLowerCase()).join(', ') })}</div>
      ) : null}
    </Group>
  );
}
