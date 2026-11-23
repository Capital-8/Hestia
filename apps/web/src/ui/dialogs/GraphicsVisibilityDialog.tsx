import { useEffect, useState, Fragment, type ReactElement } from 'react';
import {
  DISCIPLINES,
  GRAPHICS_CATEGORIES,
  disciplineLabel,
  graphicsOf,
  planGraphicsOf,
  planOf,
  planTonesOf,
  planViewById,
  presetTone,
  sectionGraphicsOf,
  tDoModelo,
  view3dOf,
  type CategoryOverride,
  type ChaveModelo,
  type Discipline,
  type GraphicsCategory,
  type Tone,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { editPlanGraphics, editPlanTone, editSectionGraphics, editView3D, restorePlanTones, type GraphicsEdit } from '../../editor/graphicsActions.ts';
import { dialogTargetWithoutTab, graphicsDialogTabOfTarget, planViewIdOfDialogTarget, type GraphicsDialogTab } from '../../editor/viewIdentity.ts';
import { useUi } from '../../editor/state.ts';
import { CATEGORY_GROUPS, categoryGroupLabel, categoryLabel, WEIGHTS } from '../graphicsLabels.ts';
import { Check, NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { useT, type Lang } from '../../editor/i18n.ts';

type Override = Partial<CategoryOverride>;
const one = (c: GraphicsCategory, o: Override): { overrides: Partial<Record<GraphicsCategory, Override>> } => ({ overrides: { [c]: o } });

/** Ordem dos tons na lista (do normal ao oculto, como na tabela do ADR 0060 §4.2). */
const TONE_ORDER: readonly Tone[] = ['normal', 'halftone', 'hidden'];
const toneLabel = (lang: Lang, tone: Tone): string => tDoModelo(lang, `md_tone_${tone}` as ChaveModelo);

/** Cor de uma categoria: vazia = do projeto. Grava ao sair do seletor (cada movimento seria um passo de desfazer). */
function ColorCell({ id, label, value, onCommit }: { id: string; label: string; value: string | undefined; onCommit: (v: string | undefined) => void }): ReactElement {
  const { t } = useT();
  const [draft, setDraft] = useState(value ?? '#808080');
  useEffect(() => setDraft(value ?? '#808080'), [value]);
  if (value === undefined) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="val soft">{t('dlt_vis_project')}</span>
        <button className="chiplink" aria-label={t('dlt_a11y_set_color_of', { name: label })} onClick={() => onCommit(draft)}>{t('dlt_vis_set')}</button>
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input id={id} type="color" value={draft} aria-label={t('dlt_a11y_color_of', { name: label })} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} />
      <button className="chiplink" onClick={() => onCommit(undefined)}>{t('dlt_vis_from_project')}</button>
    </span>
  );
}

/**
 * Visibilidade e gráficos da vista ativa (decisão 0015 §3): `target` é o id do nível (planta), '3d', 'section'
 * (corte/elevação) ou `pv:<planViewId>` (planta de disciplina, decisão 0060: grava na própria cópia). O alvo do
 * atalho da barra de vista leva o sufixo `#tones` e abre direto na aba de tons.
 * Cada linha grava o próprio comando (um passo de desfazer por alteração); recusa aparece na linha, nada é gravado.
 * Vazio em peso e cor = o valor do projeto (sem substituição na vista).
 */
export function GraphicsVisibilityDialog({ target }: { target: string }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const is3d = target === '3d';
  const isSection = target === 'section';
  const tabOfTarget = graphicsDialogTabOfTarget(target);
  const [tab, setTab] = useState<GraphicsDialogTab>(tabOfTarget);
  useEffect(() => setTab(tabOfTarget), [tabOfTarget]);
  const planId = planViewIdOfDialogTarget(target);
  const baseTarget = dialogTargetWithoutTab(target);
  const levelId = is3d || isSection ? undefined : planId ? planViewById(p, planId)?.levelId : baseTarget;
  const lvl = levelId === undefined ? undefined : p.levels.find((l) => l.id === levelId);
  const [errors, setErrors] = useState<Partial<Record<GraphicsCategory, string>>>({});
  const [toneErrors, setToneErrors] = useState<Partial<Record<Discipline, string>>>({});
  const [toneError, setToneError] = useState<string | null>(null);
  if (!is3d && !isSection && !lvl) return null;
  const plan = !is3d && !isSection && lvl ? planOf(p, lvl.id, planId) : undefined;
  const g = is3d ? view3dOf(p) : isSection ? sectionGraphicsOf(p) : planGraphicsOf(p, lvl!.id, planId);
  const pg = graphicsOf(p);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const run = (c: GraphicsCategory, o: Override): void => {
    const r: GraphicsEdit = is3d ? editView3D(editor.store, one(c, o)) : isSection ? editSectionGraphics(editor.store, one(c, o)) : editPlanGraphics(editor.store, { levelId: lvl!.id, planId }, one(c, o));
    setErrors((prev) => ({ ...prev, [c]: r.error ?? undefined }));
  };
  const failed = GRAPHICS_CATEGORIES.filter((c) => errors[c]);
  // Sem plantas de disciplina no projeto, o diálogo fica idêntico ao de hoje (sem abas); a aba entra quando o recurso existe.
  const showPlanTabs = !is3d && !isSection && plan !== undefined && (p.planViews?.length ?? 0) > 0;
  const tones = plan ? planTonesOf(plan) : null;
  const presets: Record<string, Tone> | null = plan
    ? Object.fromEntries(DISCIPLINES.map((d): [string, Tone] => [d, presetTone(plan.discipline, d)]))
    : null;
  const readOnly = plan?.isDefault === true;
  const deviations = plan && presets ? DISCIPLINES.filter((d) => plan.tones[d] !== undefined && tones![d] !== presets[d]) : [];
  const failedTones = plan && presets ? DISCIPLINES.filter((d) => toneErrors[d]) : [];
  const runTone = (discipline: Discipline, tone: Tone): void => {
    if (!plan?.planId) return;
    const r = editPlanTone(editor.store, plan.planId, discipline, tone);
    setToneErrors((prev) => ({ ...prev, [discipline]: r.error ?? undefined }));
  };
  const restoreTone = (discipline?: Discipline): void => {
    if (!plan?.planId) return;
    const r = restorePlanTones(editor.store, plan.planId, discipline);
    setToneError(r.error);
    if (!r.error) setToneErrors((prev) => (discipline ? { ...prev, [discipline]: undefined } : {}));
  };
  return (
    <Dialog
      title={t('dlt_vis_title')}
      sub={is3d ? t('dlt_vis_sub_3d') : isSection ? t('dlt_vis_sub_section') : t('dlt_vis_sub_plan', { level: plan && !plan.isDefault ? plan.name : lvl!.name })}
      onClose={close}
      size="mid"
      footer={<button className="btn primary" onClick={close}>{t('stt_close')}</button>}
    >
      {showPlanTabs && (
        <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button role="tab" data-tab="categories" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'btn primary' : 'btn'} onClick={() => setTab('categories')}>
            {t('dlt_vis_tab_categories')}
          </button>
          <button role="tab" data-tab="tones" aria-selected={tab === 'tones'} className={tab === 'tones' ? 'btn primary' : 'btn'} onClick={() => setTab('tones')}>
            {t('dlt_vis_tab_tones')}
          </button>
        </div>
      )}
      {showPlanTabs && tab === 'tones' ? (
        <>
          <table className="layers" aria-label={t('dlt_a11y_tones_table')} data-readonly={readOnly ? 'true' : 'false'}>
            <thead>
              <tr>
                <th>{t('dlt_ton_col_discipline')}</th>
                <th>{t('dlt_ton_col_tone')}</th>
                <th>{t('dlt_ton_col_preset')}</th>
                <th>{t('dlt_ton_col_state')}</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {DISCIPLINES.map((d) => {
                const deviation = !readOnly && plan!.tones[d] !== undefined && tones![d] !== presets![d];
                return (
                  <tr key={d} data-disc={d} data-deviation={deviation ? 'true' : 'false'}>
                    <td>{disciplineLabel(lang, d)}</td>
                    <td>
                      {readOnly ? (
                        <span className="val">{toneLabel(lang, tones![d]!)}</span>
                      ) : (
                        <select
                          id={`gv-tone-${d}`}
                          className="select"
                          aria-label={t('dlt_a11y_tone_of', { discipline: disciplineLabel(lang, d) })}
                          value={tones![d]}
                          onChange={(e) => runTone(d, e.target.value as Tone)}
                        >
                          {TONE_ORDER.map((tone) => <option key={tone} value={tone}>{toneLabel(lang, tone)}</option>)}
                        </select>
                      )}
                    </td>
                    <td><span className="val soft">{toneLabel(lang, presets![d]!)}</span></td>
                    <td>{deviation ? <span className="vr-msg">{t('dlt_ton_changed')}</span> : <span className="val soft">{t('dlt_ton_default')}</span>}</td>
                    {!readOnly && (
                      <td>
                        <button
                          className="chiplink"
                          disabled={!deviation}
                          aria-label={t('dlt_a11y_restore_tone_of', { discipline: disciplineLabel(lang, d) })}
                          onClick={() => restoreTone(d)}
                        >
                          {t('dlt_ton_restore_one')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {failedTones.length > 0 && (
            <div className="vr-error" role="alert">
              {failedTones.map((d) => <div key={d}>{disciplineLabel(lang, d)}: {toneErrors[d]}</div>)}
            </div>
          )}
          {toneError && <div className="vr-error" role="alert">{toneError}</div>}
          {readOnly ? (
            <p className="hint">{t('dlt_ton_readonly')}</p>
          ) : (
            <>
              <p className="hint">{t('dlt_ton_help')}</p>
              <div className="prow"><span /><button className="btn small" disabled={deviations.length === 0} onClick={() => restoreTone()}>{t('dlt_ton_restore_all')}</button></div>
            </>
          )}
        </>
      ) : (
        <>
          <table className="layers" aria-label={t('dlt_a11y_vis_table')}>
            <thead>
              <tr>
                <th>{t('dlt_col_category')}</th>
                <th>{t('dlt_col_visible')}</th>
                <th>{t('dlt_col_transparency')}</th>
                <th>{t('dlt_col_halftone')}</th>
                <th>{t('dlt_col_cut_weight')}</th>
                <th>{t('dlt_col_projection_weight')}</th>
                <th>{t('dlt_col_color')}</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_GROUPS.map((group) => (
                <Fragment key={group.id}>
                  <tr className="cat-group" data-category-group={group.id}>
                    <th colSpan={7} scope="colgroup" style={{ textAlign: 'left', fontWeight: 600 }}>{categoryGroupLabel(group, lang)}</th>
                  </tr>
                  {group.categories.map((c) => {
                    const o = g.overrides[c];
                    const id = `gv-${c}`;
                    const weightOptions = (key: 'cutWeight' | 'projectionWeight'): ReactElement => (
                      <select
                        id={`${id}-${key === 'cutWeight' ? 'cut' : 'proj'}`}
                        className="select"
                        aria-label={key === 'cutWeight' ? t('dlt_a11y_cut_weight_of', { category: categoryLabel(c, lang) }) : t('dlt_a11y_projection_weight_of', { category: categoryLabel(c, lang) })}
                        value={o[key] ?? ''}
                        onChange={(e) => run(c, { [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                      >
                        <option value="">{t('dlt_vis_project_value', { value: pg.categories[c][key] })}</option>
                        {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    );
                    return (
                      <tr key={c} data-category={c}>
                        <td>{categoryLabel(c, lang)}</td>
                        <td><Check id={`${id}-vis`} checked={o.visible} onChange={(v) => run(c, { visible: v })} /></td>
                        <td>
                          {/* units-ok: porcentagem de transparência */}
                          <NumField id={`${id}-tr`} value={o.transparency * 100} decimals={0} suffix="%" min={0} max={100} width={64} onCommit={(v) => run(c, { transparency: v / 100 })} />
                        </td>
                        <td><Check id={`${id}-half`} checked={o.halftone} onChange={(v) => run(c, { halftone: v })} /></td>
                        <td>{weightOptions('cutWeight')}</td>
                        <td>{weightOptions('projectionWeight')}</td>
                        <td><ColorCell id={`${id}-color`} label={categoryLabel(c, lang)} value={o.color} onCommit={(v) => run(c, { color: v })} /></td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
          {failed.length > 0 && (
            <div className="vr-error" role="alert">
              {failed.map((c) => <div key={c}>{categoryLabel(c, lang)}: {errors[c]}</div>)}
            </div>
          )}
          <p className="hint">{t('dlt_vis_help')}</p>
        </>
      )}
      <div className="prow">
        <span />
        <button className="btn small" onClick={() => useUi.setState({ dialog: 'disciplineConfig' })}>{t('dsc_title')}</button>
      </div>
    </Dialog>
  );
}
