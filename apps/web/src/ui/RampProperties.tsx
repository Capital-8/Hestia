import { useState, type ReactElement } from 'react';
import { rampQuantities, rampValidationIssues, regenRamp, resolveRampsOnLevel } from '@hestia/engine';
import { levelAbove, validateProject, type Id, type Project, type Ramp, type RampInputMode, type RampShape, type StairOpeningMode, type ValidationIssue } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { goToIssue } from '../editor/goToIssue.ts';
import { useT, type Dict, type Lang } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { adjustRamp, applyRegen, patchRamps } from '../editor/rampActions.ts';
import { commonOf } from '../editor/stairActions.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { rampOptions } from './typeOptions.ts';
import { rampSummaryLines } from './rampFormat.ts';
import { useAdiado } from './useAdiado.ts';
import { useFormat } from './useUnits.ts';

const SHAPE_LABEL_KEY: Record<RampShape, keyof Dict> = {
  straight: 'prb_opt_shape_straight',
  lshape: 'prb_opt_shape_l',
  ushape: 'prb_opt_shape_u',
  free: 'ramp_shape_free',
};
const TURN_LABEL_KEY: Record<'left' | 'right', keyof Dict> = { left: 'prb_opt_turn_left', right: 'prb_opt_turn_right' };

/** Avisos e erros de uma rampa: os de norma e de croqui (engine) e os de referência do modelo (tipo, nível, topo). */
function issuesOf(p: Project, id: Id, lang: Lang): ValidationIssue[] {
  return [...validateProject(p), ...rampValidationIssues(p, lang)].filter((i) => i.elementId === id);
}

/**
 * Propriedades de uma ou mais rampas: tipo, níveis, deslocamentos e abertura da laje (editáveis), largura/inclinação/
 * comprimento (regeram o croqui em UM passo de desfazer) e resultados só leitura de uma rampa.
 */
export function RampProperties({ ramps }: { ramps: Ramp[] }): ReactElement {
  const p = useProject();
  const fmt = useFormat();
  const { t, lang } = useT();
  const ids = ramps.map((r) => r.id);
  const typeId = commonOf(ramps, (r) => r.typeId);
  const base = commonOf(ramps, (r) => r.baseOffset);
  const top = commonOf(ramps, (r) => r.topLevelId ?? '');
  const topOff = commonOf(ramps, (r) => r.topOffset);
  const height = commonOf(ramps, (r) => r.height);
  const openingMode = commonOf(ramps, (r) => r.openingMode);
  const openingHeadroom = commonOf(ramps, (r) => r.openingHeadroom);
  const openingMargin = commonOf(ramps, (r) => r.openingMargin);
  const openingRect = commonOf(ramps, (r) => r.openingRect);
  const mark = commonOf(ramps, (r) => r.mark);
  const comments = commonOf(ramps, (r) => r.comments);
  const single = ramps.length === 1 ? ramps[0]! : null;
  const type = typeId.mixed ? null : p.rampTypes[typeId.value];
  const noLevelAbove = single ? levelAbove(p, single.levelId) === null : false;
  const noOpening = !openingMode.mixed && openingMode.value === 'none';
  const headroomOff = !openingMode.mixed && openingMode.value !== 'headroom';
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [adjustMsg, setAdjustMsg] = useState('');

  // Resolver o nível e validar o projeto custam segundos num prédio grande: saem do clique e ficam em cache por projeto.
  const quantities =
    useAdiado(p, `rampa-quant|${single?.id ?? ''}`, () => {
      if (!single) return null;
      const rr = resolveRampsOnLevel(p, single.levelId, lang).find((x) => x.id === single.id);
      return rr ? { rr, q: rampQuantities(rr) } : null;
    }, 150) ?? null;
  const issues = useAdiado(p, `rampa-avisos|${single?.id ?? ''}`, () => (single ? issuesOf(p, single.id, lang) : []), 150) ?? [];

  const patch = (targets: Id[], value: Partial<Ramp>): void => patchRamps(editor.store, targets, value);

  /** Regenera o croqui com a mudança de um campo e grava os componentes em UMA transação. Erro vai para o campo. */
  const editGeometry = (field: string, changes: { width?: number; mode?: RampInputMode; slope?: number; length?: number; landingDepth?: number }): void => {
    if (!single) return;
    const r = regenRamp(single, p, changes, lang);
    if ('error' in r) {
      setFieldErrors((e) => ({ ...e, [field]: r.error }));
      return;
    }
    setFieldErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
    applyRegen(editor.store, single.id, r);
  };

  /** Botão "Ajustar": otimiza a rampa selecionada à norma do tipo em UMA transação "Ajustar rampa". */
  const adjust = (): void => {
    if (!single) return;
    const r = adjustRamp(editor.store, single.id);
    setAdjustMsg('error' in r ? r.error : r.message);
  };

  const fieldError = (field: string): ReactElement | null => {
    const msg = fieldErrors[field];
    return msg ? <div className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 4 }}>{msg}</div> : null;
  };

  const mode = single?.inputMode ?? 'length';
  const slope = single ? (single.slopeTarget ?? type?.defaultSlope ?? 0) : 0;

  return (
    <>
      <TypeSelector
        triggerId="prop-ramptype"
        label={t('prb_prop_type_ramp')}
        categoryLabel={t('prb_cat_ramps', { n: ramps.length })}
        options={rampOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'rampType', dialogArg: typeId.value })}
      />
      <Group title={t('prb_pgrp_constraints')}>
        <LevelField ids={ids} label={t('ramp_levels_base')} />
        <Row label={t('ramp_levels_top')} htmlFor="p-rtop">
          <select id="p-rtop" className="select" value={top.mixed ? '' : top.value} onChange={(e) => patch(ids, { topLevelId: e.target.value || null })}>
            {top.mixed && <option value="">{t('prb_opt_varied')}</option>}
            <option value="">{t('ramp_levels_auto')}</option>
            {p.levels.map((l) => <option key={l.id} value={l.id}>{`${t('ramp_levels_until')} ${l.name}`}</option>)}
          </select>
        </Row>
        <Row label={t('ramp_levels_base_offset')} htmlFor="p-rbase"><NumField id="p-rbase" value={base.value} mixed={base.mixed} onCommit={(v) => patch(ids, { baseOffset: v })} quantity="length" /></Row>
        <Row label={t('ramp_levels_top_offset')} htmlFor="p-rtopoff"><NumField id="p-rtopoff" value={topOff.value} mixed={topOff.mixed} onCommit={(v) => patch(ids, { topOffset: v })} quantity="length" /></Row>
        {!top.mixed && top.value === '' && noLevelAbove && (
          <Row label={t('ramp_levels_height')} htmlFor="p-rheight"><NumField id="p-rheight" value={height.value} mixed={height.mixed} min={0.1} onCommit={(v) => patch(ids, { height: Math.max(0.1, v) })} quantity="length" /></Row>
        )}
        <Row label={t('prb_fld_slab_opening')} htmlFor="p-ropenmode">
          <select id="p-ropenmode" className="select" value={openingMode.mixed ? '' : openingMode.value} onChange={(e) => e.target.value && patch(ids, { openingMode: e.target.value as StairOpeningMode })}>
            {openingMode.mixed && <option value="">{t('prb_opt_varied')}</option>}
            <option value="headroom">{t('prb_opt_headroom')}</option>
            <option value="full">{t('prb_opt_full_outline')}</option>
            <option value="none">{t('prb_opt_no_opening')}</option>
          </select>
        </Row>
        <Row label={t('prb_opt_headroom')} htmlFor="p-ropenh">
          <NumField
            id="p-ropenh"
            value={openingHeadroom.value}
            mixed={openingHeadroom.mixed}
            disabled={headroomOff}
            placeholder={type ? fmt('length', type.minHeadroom, { withUnit: false }) : undefined}
            min={0}
            onCommit={(v) => patch(ids, { openingHeadroom: v })}
            onClear={() => patch(ids, { openingHeadroom: null })}
          />
        </Row>
        <Row label={t('prb_fld_side_clearance')} htmlFor="p-ropenm"><NumField id="p-ropenm" value={openingMargin.value} mixed={openingMargin.mixed} disabled={noOpening} min={0} quantity="length" onCommit={(v) => patch(ids, { openingMargin: v })} /></Row>
        <Row label={t('prb_fld_rectangular_opening')} htmlFor="p-ropenrect"><Check id="p-ropenrect" checked={openingRect.value} mixed={openingRect.mixed} disabled={noOpening} onChange={(v) => patch(ids, { openingRect: v })} /></Row>
      </Group>
      <Group title={t('prb_pgrp_ramp')} open={!!single}>
        {single ? (
          <>
            <Row label={t('prb_fld_mode')} htmlFor="p-rmode">
              <select id="p-rmode" className="select" value={mode} onChange={(e) => editGeometry('mode', { mode: e.target.value as RampInputMode })}>
                <option value="length">{t('ramp_mode_length')}</option>
                <option value="slope">{t('ramp_mode_slope')}</option>
              </select>
            </Row>
            <Row label={t('prb_fld_width')} htmlFor="p-rwidth">
              <NumField id="p-rwidth" value={quantities?.q.width ?? null} min={0.1} quantity="length" onCommit={(v) => editGeometry('width', { width: v })} />
            </Row>
            {fieldError('width')}
            {mode === 'slope' ? (
              <>
                <Row label={t('ramp_prop_slope_target')} htmlFor="p-rslope">
                  <NumField id="p-rslope" value={slope} scale={100} unit="%" decimals={2} min={0.1} onCommit={(v) => editGeometry('slope', { slope: v })} />
                </Row>
                {fieldError('slope')}
              </>
            ) : (
              <>
                <Row label={t('ramp_prop_path_length')} htmlFor="p-rlength">
                  <NumField id="p-rlength" value={quantities?.q.pathLength ?? null} min={0.1} quantity="length" onCommit={(v) => editGeometry('length', { length: v })} />
                </Row>
                {fieldError('length')}
              </>
            )}
            <Row label={t('prb_fld_form')}><span className="val">{t(SHAPE_LABEL_KEY[single.shape])}</span></Row>
            <Row label={t('prb_fld_turn')}><span className="val">{t(TURN_LABEL_KEY[single.turn])}</span></Row>
            <Row label={t('ramp_adjust')}>
              <button id="p-radjust" className="chiplink" title={t('ramp_adjust_title')} onClick={adjust}>{t('ramp_adjust')}</button>
            </Row>
            {adjustMsg && <div className="hint" role="status">{adjustMsg}</div>}
          </>
        ) : (
          <div className="hint">{t('prb_msg_select_ramp_geometry')}</div>
        )}
      </Group>
      <Group title={t('prb_pgrp_results')} open={!!quantities}>
        {single && quantities ? (
          rampSummaryLines(quantities.rr, quantities.q, lang).map((line) => (
            <Row key={line.label} label={line.label}><span className="val">{line.value}</span></Row>
          ))
        ) : (
          <div className="hint">{single ? t('prb_msg_invalid_ramp_geometry') : t('prb_msg_select_ramp_quantities')}</div>
        )}
      </Group>
      <Group title={t('prb_pgrp_warnings', { n: issues.length })} open={issues.length > 0}>
        {issues.length === 0 ? (
          <div className="hint">{t('prb_msg_no_warnings')}</div>
        ) : (
          issues.map((i, k) => (
            <div className="prow" key={`${i.code}-${k}`} style={{ alignItems: 'start' }}>
              <span className="lbl" style={{ color: i.severity === 'error' ? 'var(--danger, #b42318)' : undefined }}>{i.message}</span>
              <button className="chiplink" onClick={() => goToIssue(i)}>{t('prb_btn_go_to')}</button>
            </div>
          ))
        )}
      </Group>
      <Group title={t('prb_pgrp_identity')} open={false}>
        <Row label={t('prb_fld_mark')} htmlFor="p-rmk"><TextField id="p-rmk" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prb_fld_comments')} htmlFor="p-rcm"><TextField id="p-rcm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
