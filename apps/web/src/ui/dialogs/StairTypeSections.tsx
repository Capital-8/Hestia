import { useState, type ReactElement } from 'react';
import { DEFAULT_STAIR_FINISH, stairFinishOf, type StairRunStyle, type StairType, type StairUndersideStyle } from '@hestia/model';
import { dictOf, fmtNum, I18N, useI18n } from '../../editor/i18n.ts';
import { NumField, TextField } from '../fields.tsx';
import { applyPreset, matchPreset, STAIR_DIALOG_PRESETS, type StairPresetId } from './stairTypeCalc.ts';
import { STAIR_FIELD_LIMITS, type StairFieldName, type StairTypeIssue } from './stairTypeForm.ts';
import { fieldLabelOverride, isStairFieldVisible } from './stairFieldVisibility.ts';
import { FamilyActions, FamilyCheck, FamilyHint, FamilyPair, FamilyRow, FamilySection } from './familia/index.ts';

type Dict = Record<keyof typeof I18N.pt, string>;

/** Campos de material (estrutura e acabamentos) escolhidos pelo mesmo seletor. */
type MatField = 'materialId' | 'postMaterialId' | 'treadFinishMaterialId' | 'riserFinishMaterialId';
const matDefault = (f: MatField): string =>
  f === 'treadFinishMaterialId' ? DEFAULT_STAIR_FINISH.treadFinishMaterialId : f === 'riserFinishMaterialId' ? DEFAULT_STAIR_FINISH.riserFinishMaterialId : '';

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/** Texto traduzido de um problema estruturado de validação. */
export function stairIssueText(i: StairTypeIssue, t: Dict): string {
  switch (i.code) {
    case 'stt-name-empty': return t.stt_err_name;
    case 'stt-riser': return t.stt_err_riser;
    case 'stt-riser-min': return t.stt_err_riser_min;
    case 'stt-riser-min-range': return t.stt_err_riser_min_range;
    case 'stt-tread': return t.stt_err_tread;
    case 'stt-width': return t.stt_err_width;
    case 'stt-headroom': return t.stt_err_headroom;
    case 'stt-landing': return t.stt_err_landing;
    case 'stt-nosing-negative': return t.stt_err_nosing_negative;
    case 'stt-cost': return t.stt_err_cost;
    case 'stt-mono-depth': return t.stt_err_mono_depth;
    case 'stt-assembled': return t.stt_err_assembled;
    case 'stt-post-tread': return t.stt_err_post_tread;
    case 'stt-tread-range': return t.stt_err_tread_range;
    case 'stt-calc-range': return t.stt_err_calc_range;
    case 'stt-factor': return i.params.factor === 'a' ? t.stt_err_factor_riser : t.stt_err_factor_tread;
    case 'stt-nosing': return t.stt_err_nosing;
    case 'stt-overlap': return t.stt_err_overlap;
    case 'stt-overlap-negative': return t.stt_err_overlap_negative;
    case 'stt-material': return i.params.slot === 'post' ? t.stt_err_material_post : t.stt_err_material;
    case 'stt-warn-sum': return t.stt_warn_sum;
    case 'stt-warn-riser': return t.stt_warn_riser;
    case 'stt-warn-tread': return t.stt_warn_tread;
    default: return i.code;
  }
}

const FIELD_LABEL: Record<StairFieldName, keyof Dict> = {
  maxRiser: 'stt_f_maxRiser',
  minRiser: 'stt_f_minRiser',
  minTread: 'stt_f_minTread',
  minRunWidth: 'stt_f_minRunWidth',
  minHeadroom: 'stt_f_minHeadroom',
  nosing: 'stt_f_nosing',
  calcRiserFactor: 'stt_f_calcRiserFactor',
  calcTreadFactor: 'stt_f_calcTreadFactor',
  calcTarget: 'stt_f_calcTarget',
  calcMin: 'stt_f_calcMin',
  calcMax: 'stt_f_calcMax',
  maxTread: 'stt_f_maxTread',
  structuralDepth: 'stt_f_structuralDepth',
  treadThickness: 'stt_f_treadThickness',
  riserThickness: 'stt_f_riserThickness',
  treadOverlap: 'stt_f_treadOverlap',
  landingThickness: 'stt_f_landingThickness',
  cost: 'stt_f_cost',
};

const STYLE_LABEL: Record<StairRunStyle, keyof Dict> = {
  monolithic: 'stt_style_monolithic',
  assembled: 'stt_style_assembled',
  post: 'stt_style_post',
};
const STYLE_DESC: Record<StairRunStyle, keyof Dict> = {
  monolithic: 'stt_style_desc_monolithic',
  assembled: 'stt_style_desc_assembled',
  post: 'stt_style_desc_post',
};
const UNDER_LABEL: Record<StairUndersideStyle, keyof Dict> = { smooth: 'stt_under_smooth', stepped: 'stt_under_stepped' };
const PRESET_LABEL: Record<Exclude<StairPresetId, 'custom'>, keyof Dict> = {
  hestia: 'stt_preset_hestia',
  nbr9050: 'stt_preset_nbr9050',
  nbr9077: 'stt_preset_nbr9077',
  ibc: 'stt_preset_ibc',
};

interface SectionProps {
  draft: StairType;
  set: (patch: Partial<StairType>) => void;
  onStyle: (style: StairRunStyle) => void;
  materials: Readonly<Record<string, { id: string; name: string }>>;
  issues: StairTypeIssue[];
  canGoProps: boolean;
  onGoProps: () => void;
}

/** Seções 1 a 5 do modal do tipo de escada (dimensões, cálculo, construção, abertura e identificação). */
export function StairTypeSections({ draft, set, onStyle, materials, issues, canGoProps, onGoProps }: SectionProps): ReactElement {
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [lastPreset, setLastPreset] = useState<StairPresetId>(() => matchPreset(draft));
  const [applied, setApplied] = useState(false);
  const presetId = matchPreset(draft);
  const mats = Object.values(materials);
  // Acabamentos: o valor digitado vale só com o campo ligado; o efetivo (stairFinishOf) é o que o modelo usa.
  const treadFlag = draft.treadFinishEnabled ?? DEFAULT_STAIR_FINISH.treadFinishEnabled;
  const riserFlag = draft.riserFinishEnabled ?? DEFAULT_STAIR_FINISH.riserFinishEnabled;
  const bocelFlag = draft.bocelEnabled ?? DEFAULT_STAIR_FINISH.bocelEnabled;
  const treadOn = stairFinishOf(draft).treadOn;
  const bocelDimmed = !treadOn || !bocelFlag;
  const noMats = mats.length === 0;

  const limitFor = (field: StairFieldName): { min: number; max: number; decimals: number; unit: string; scale: number } => {
    const base = STAIR_FIELD_LIMITS[field];
    let min: number = base.min;
    let max: number = base.max;
    if (field === 'minRiser') max = Math.max(base.min, draft.maxRiser - 0.001);
    if (field === 'nosing') max = Math.max(0, draft.minTread - 0.01);
    if (field === 'calcMin') max = Math.max(base.min, draft.calcMax);
    if (field === 'calcMax') min = Math.min(base.max, draft.calcMin);
    if (field === 'maxTread') min = draft.minTread;
    if (field === 'treadOverlap') max = Math.max(0, draft.treadThickness - 0.001);
    return { min, max, decimals: base.decimals, unit: base.unit, scale: base.scale };
  };

  const rangeText = (lim: { min: number; max: number; decimals: number; unit: string; scale: number }): string => {
    const params = {
      min: fmtNum(lim.min * lim.scale, lim.decimals, lang),
      max: fmtNum(lim.max * lim.scale, lim.decimals, lang),
      unit: lim.unit,
    };
    return fill(lim.unit ? t.stt_err_range : t.stt_err_range_nounit, params);
  };

  const messages = (field: StairFieldName): { text: string; error: boolean }[] => {
    const out: { text: string; error: boolean }[] = [];
    const range = ranges[field];
    if (range) out.push({ text: range, error: true });
    const list = issues.filter((i) => i.field === field);
    const error = list.find((i) => i.severity === 'error');
    const warning = list.find((i) => i.severity === 'warning');
    if (error) out.push({ text: stairIssueText(error, t), error: true });
    else if (warning) out.push({ text: stairIssueText(warning, t), error: false });
    return out;
  };

  const setNum = (field: StairFieldName, v: number): void => set({ [field]: v } as Partial<StairType>);

  const row = (field: StairFieldName): ReactElement | null => {
    if (!isStairFieldVisible(draft.runStyle, field)) return null;
    const lim = limitFor(field);
    const msgs = messages(field);
    const override = fieldLabelOverride(draft.runStyle, field);
    const label = override ? t[override] : t[FIELD_LABEL[field]];
    return (
      <FamilyRow
        key={field}
        label={label}
        htmlFor={`stt-${field}`}
        message={msgs.length > 0 ? msgs.map((m) => m.text).join(' ') : undefined}
        messageId={`stt-${field}-err`}
        messageWarn={msgs.length > 0 && !msgs[0]!.error}
      >
        <NumField
          id={`stt-${field}`}
          value={draft[field]}
          scale={lim.scale}
          decimals={lim.decimals}
          unit={lim.unit || undefined}
          min={lim.min}
          max={Number.isFinite(lim.max) ? lim.max : undefined}
          strictRange
          onCommit={(v) => setNum(field, v)}
          onInvalid={() => setRanges((r) => ({ ...r, [field]: rangeText(lim) }))}
          onValid={() => setRanges((r) => {
            if (!(field in r)) return r;
            const next = { ...r };
            delete next[field];
            return next;
          })}
          invalid={msgs.length > 0}
          describedBy={msgs.length ? `stt-${field}-err` : undefined}
        />
      </FamilyRow>
    );
  };

  const applyPresetId = (id: StairPresetId): void => {
    if (id === 'custom') return;
    set(applyPreset(draft, id));
    setRanges({});
    setLastPreset(id);
    setApplied(true);
    window.setTimeout(() => setApplied(false), 2000);
  };
  const diverged = lastPreset !== 'custom' && presetId !== lastPreset;

  const materialSelect = (id: string, field: MatField): ReactElement => {
    const value = draft[field] ?? matDefault(field);
    const known = mats.some((m) => m.id === value);
    return (
      <select
        id={id}
        className="select"
        value={noMats ? '' : value}
        disabled={noMats}
        onChange={(e) => set({ [field]: e.target.value } as Partial<StairType>)}
      >
        {noMats ? <option value="">{t.stt_none_material}</option> : null}
        {!noMats && !known ? <option value={value}>{value || t.stt_none_material}</option> : null}
        {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  };

  const finishGroup = (on: boolean, flagId: string, flagLabel: string, onFlag: (v: boolean) => void, matId: string, matField: MatField, thickId: string, thickValue: number, onThick: (v: number) => void): ReactElement => (
    <>
      <FamilyCheck id={flagId} checked={on} onChange={onFlag}>{flagLabel}</FamilyCheck>
      <FamilyRow label={t.stt_finish_material} htmlFor={matId} dim={!on}>{materialSelect(matId, matField)}</FamilyRow>
      <FamilyRow label={t.stt_finish_thickness} htmlFor={thickId} dim={!on}>
        <NumField id={thickId} value={thickValue} scale={100} decimals={1} unit="cm" min={0.001} max={0.1} disabled={!on} onCommit={onThick} />
      </FamilyRow>
    </>
  );

  return (
    <>
      <FamilySection id="stt-sec-1" title={t.stt_sec_dims}>
        <FamilyPair>{row('maxRiser')}{row('minRiser')}</FamilyPair>
        <FamilyPair>{row('minTread')}{row('minRunWidth')}</FamilyPair>
        <FamilyPair>{row('minHeadroom')}{row('nosing')}</FamilyPair>
      </FamilySection>

      <FamilySection id="stt-sec-2" title={t.stt_sec_calc} defaultOpen={false}>
        <FamilyHint>{t.stt_calc_help_blondel}</FamilyHint>
        <FamilyRow label={t.stt_f_preset} htmlFor="stt-preset">
          <select id="stt-preset" className="select" value={presetId} onChange={(e) => applyPresetId(e.target.value as StairPresetId)}>
            {STAIR_DIALOG_PRESETS.map((p) => <option key={p.id} value={p.id}>{t[PRESET_LABEL[p.id]]}</option>)}
            {presetId === 'custom' ? <option value="custom">{t.stt_preset_custom}</option> : null}
          </select>
          {diverged ? <button className="btn small" type="button" onClick={() => applyPresetId(lastPreset)}>{t.stt_restore_preset}</button> : null}
        </FamilyRow>
        {applied ? <FamilyHint tone="faint" role="status">{t.stt_preset_applied}</FamilyHint> : null}
        <FamilyHint>{t.stt_calc_help}</FamilyHint>
        {draft.runStyle === 'post' ? <FamilyHint>{t.stt_note_post_calc}</FamilyHint> : null}
        <FamilyPair>{row('calcRiserFactor')}{row('calcTreadFactor')}</FamilyPair>
        <FamilyPair>{row('calcTarget')}{row('maxTread')}</FamilyPair>
        <FamilyPair>{row('calcMin')}{row('calcMax')}</FamilyPair>
        <FamilyHint tone="faint">{t.stt_reference}</FamilyHint>
      </FamilySection>

      <FamilySection id="stt-sec-3" title={t.stt_sec_build}>
        <FamilyRow label={t.stt_f_runStyle} htmlFor="stt-runStyle">
          <select id="stt-runStyle" className="select" value={draft.runStyle} onChange={(e) => onStyle(e.target.value as StairRunStyle)}>
            {(Object.keys(STYLE_LABEL) as StairRunStyle[]).map((k) => <option key={k} value={k}>{t[STYLE_LABEL[k]]}</option>)}
          </select>
        </FamilyRow>
        <FamilyHint>{t[STYLE_DESC[draft.runStyle]]}</FamilyHint>
        {isStairFieldVisible(draft.runStyle, 'materialId') ? (
          <FamilyRow label={t[fieldLabelOverride(draft.runStyle, 'materialId') ?? 'stt_f_materialId']} htmlFor="stt-materialId">
            {materialSelect('stt-materialId', 'materialId')}
          </FamilyRow>
        ) : null}
        {noMats ? <div className="vr-error" id="stt-materialId-err">{t.stt_err_no_materials}</div> : null}
        <FamilyPair>
          {row('structuralDepth')}
          {isStairFieldVisible(draft.runStyle, 'undersideStyle') ? (
            <FamilyRow label={t.stt_f_undersideStyle} htmlFor="stt-undersideStyle">
              <select id="stt-undersideStyle" className="select" value={draft.undersideStyle} onChange={(e) => set({ undersideStyle: e.target.value as StairUndersideStyle })}>
                {(Object.keys(UNDER_LABEL) as StairUndersideStyle[]).map((k) => <option key={k} value={k}>{t[UNDER_LABEL[k]]}</option>)}
              </select>
            </FamilyRow>
          ) : null}
        </FamilyPair>
        <FamilyPair>{row('treadThickness')}{row('riserThickness')}</FamilyPair>
        <FamilyPair>{row('treadOverlap')}{row('landingThickness')}</FamilyPair>
        {isStairFieldVisible(draft.runStyle, 'postMaterialId') ? (
          <FamilyRow label={t[fieldLabelOverride(draft.runStyle, 'postMaterialId') ?? 'stt_f_postMaterialId']} htmlFor="stt-postMaterialId">
            {materialSelect('stt-postMaterialId', 'postMaterialId')}
          </FamilyRow>
        ) : null}
      </FamilySection>

      {draft.runStyle !== 'assembled' ? (
        <FamilySection id="stt-sec-finish" title={t.stt_sec_finish}>
          {finishGroup(treadFlag, 'stt-treadFinishEnabled', t.stt_finish_tread, (v) => set({ treadFinishEnabled: v }), 'stt-treadFinishMaterialId', 'treadFinishMaterialId', 'stt-treadFinishThickness', draft.treadFinishThickness ?? DEFAULT_STAIR_FINISH.treadFinishThickness, (v) => set({ treadFinishThickness: v }))}
          {draft.runStyle !== 'post'
            ? finishGroup(riserFlag, 'stt-riserFinishEnabled', t.stt_finish_riser, (v) => set({ riserFinishEnabled: v }), 'stt-riserFinishMaterialId', 'riserFinishMaterialId', 'stt-riserFinishThickness', draft.riserFinishThickness ?? DEFAULT_STAIR_FINISH.riserFinishThickness, (v) => set({ riserFinishThickness: v }))
            : null}
          <FamilyCheck id="stt-bocelEnabled" checked={bocelFlag} disabled={!treadOn} onChange={(v) => set({ bocelEnabled: v })}>{t.stt_finish_bocel}</FamilyCheck>
          <FamilyRow label={t.stt_bocel_projection} htmlFor="stt-bocelProjection" dim={bocelDimmed}>
            <NumField id="stt-bocelProjection" value={draft.bocelProjection ?? DEFAULT_STAIR_FINISH.bocelProjection} scale={100} decimals={1} unit="cm" min={0} max={0.1} disabled={bocelDimmed} onCommit={(v) => set({ bocelProjection: v })} />
          </FamilyRow>
          {!treadOn ? <FamilyHint>{t.stt_bocel_hint}</FamilyHint> : null}
        </FamilySection>
      ) : null}

      <FamilySection id="stt-sec-4" title={t.stt_sec_opening} defaultOpen={false}>
        <FamilyHint>{t.stt_opening_text}</FamilyHint>
        <FamilyActions>
          <button className="btn small" type="button" disabled={!canGoProps} onClick={onGoProps}>{t.stt_opening_btn}</button>
        </FamilyActions>
      </FamilySection>

      <FamilySection id="stt-sec-5" title={t.stt_sec_id} defaultOpen={false}>
        <FamilyRow label={t.stt_f_code} htmlFor="stt-code"><TextField id="stt-code" value={draft.code} onCommit={(v) => set({ code: v })} /></FamilyRow>
        <FamilyRow label={t.stt_f_description} htmlFor="stt-description"><TextField id="stt-description" value={draft.description} onCommit={(v) => set({ description: v })} /></FamilyRow>
        {row('cost')}
      </FamilySection>
    </>
  );
}
