import { useEffect, useState, type ReactElement } from 'react';
import { GRAPHICS_CATEGORIES, floorViewId, planViewOf, graphicsOf, sectionGraphicsOf, view3dOf, viewGraphicsOf, type CategoryOverride, type GraphicsCategory } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { editViewGraphics, editSectionGraphics, editView3D, type GraphicsEdit } from '../../editor/graphicsActions.ts';
import { useUi } from '../../editor/state.ts';
import { categoryLabel, WEIGHTS } from '../graphicsLabels.ts';
import { Check, NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { useT } from '../../editor/i18n.ts';

type Override = Partial<CategoryOverride>;
const one = (c: GraphicsCategory, o: Override): { overrides: Partial<Record<GraphicsCategory, Override>> } => ({ overrides: { [c]: o } });

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
 * Visibilidade e gráficos por categoria da vista ativa (decisão 0015 §3): `target` é o id do nível (planta), '3d' ou
 * 'section' (corte/elevação).
 * Cada linha grava o próprio comando (um passo de desfazer por alteração); recusa aparece na linha, nada é gravado.
 * Vazio em peso e cor = o valor do projeto (sem substituição na vista).
 */
export function GraphicsVisibilityDialog({ target }: { target: string }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const planViewId = useUi((s) => s.planViewId);
  const is3d = target === '3d';
  const isSection = target === 'section';
  // Vista de planta ativa (a do nível do diálogo); sem ela, a planta de piso. Grava só nela, não no nível inteiro.
  const viewId = planViewId && planViewOf(p, planViewId)?.levelId === target ? planViewId : floorViewId(target);
  const lvl = is3d || isSection ? undefined : p.levels.find((l) => l.id === target);
  const [errors, setErrors] = useState<Partial<Record<GraphicsCategory, string>>>({});
  if (!is3d && !isSection && !lvl) return null;
  const g = is3d ? view3dOf(p) : isSection ? sectionGraphicsOf(p) : viewGraphicsOf(p, viewId);
  const pg = graphicsOf(p);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const run = (c: GraphicsCategory, o: Override): void => {
    const r: GraphicsEdit = is3d ? editView3D(editor.store, one(c, o)) : isSection ? editSectionGraphics(editor.store, one(c, o)) : editViewGraphics(editor.store, viewId, one(c, o));
    setErrors((prev) => ({ ...prev, [c]: r.error ?? undefined }));
  };
  const failed = GRAPHICS_CATEGORIES.filter((c) => errors[c]);
  return (
    <Dialog
      title={t('dlt_vis_title')}
      sub={is3d ? t('dlt_vis_sub_3d') : isSection ? t('dlt_vis_sub_section') : t('dlt_vis_sub_plan', { level: lvl!.name })}
      onClose={close}
      size="mid"
      footer={<button className="btn primary" onClick={close}>{t('stt_close')}</button>}
    >
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
          {GRAPHICS_CATEGORIES.map((c) => {
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
              <tr key={c}>
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
        </tbody>
      </table>
      {failed.length > 0 && (
        <div className="vr-error" role="alert">
          {failed.map((c) => <div key={c}>{categoryLabel(c, lang)}: {errors[c]}</div>)}
        </div>
      )}
      <p className="hint">{t('dlt_vis_help')}</p>
    </Dialog>
  );
}
