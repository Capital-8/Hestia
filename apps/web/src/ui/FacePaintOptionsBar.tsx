import type { ReactElement } from 'react';
import { isFacePaintableElement, isWall } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { openFaceStudioTab } from '../editor/viewTabActions.ts';

/** Barra de opções da pintura direta de faces na vista 3D. */
export function FacePaintOptionsBar(): ReactElement {
  const p = useProject();
  const sel = useUi((s) => s.selection);
  const facePaint = useUi((s) => s.facePaint);
  const { t } = useT();
  const materialsList = Object.values(p.materials);
  const activeMatId = p.materials[facePaint.materialId] ? facePaint.materialId : (materialsList[0]?.id ?? '');

  const studioTarget = (() => {
    if (facePaint.hoverHit) {
      return {
        elementId: facePaint.hoverHit.elementId,
        face: facePaint.hoverHit.face,
        layer: facePaint.layerMode === 'layer' ? facePaint.hoverHit.layerIndex : ('all' as const),
      };
    }
    if (sel.length === 1) {
      const el = p.elements[sel[0]!];
      if (isFacePaintableElement(el)) {
        return {
          elementId: el.id,
          face: isWall(el) ? ('sideExt' as const) : ('top' as const),
          layer: 'all' as const,
        };
      }
    }
    return null;
  })();

  if (facePaint.mode === 'studioPick') {
    return (
      <div className="optbar" role="group" aria-label={t('pro_fp_studio_pick_title')}>
        <span className="tool-name">{t('pro_fp_studio_pick_title')}</span>
        <span className="hint" style={{ margin: 0 }}>{t('pro_fp_studio_pick_hint')}</span>
        <label>
          {t('pro_fp_target')}
          <select
            id="opt-fp-layermode"
            className="select"
            value={facePaint.layerMode}
            onChange={(e) => useUi.setState((s) => ({ facePaint: { ...s.facePaint, layerMode: e.target.value as 'all' | 'layer' } }))}
          >
            <option value="all">{t('pro_fp_all_layers')}</option>
            <option value="layer">{t('pro_fp_clicked_layer')}</option>
          </select>
        </label>
        <button
          type="button"
          id="opt-fp-cancel"
          className="btn small"
          onClick={() => useUi.setState((s) => ({ facePaint: { ...s.facePaint, active: false, mode: 'paint', hoverHit: null } }))}
        >
          {t('pro_fp_cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="optbar" role="group" aria-label={t('pro_fp_title')}>
      <span className="tool-name">{t('pro_fp_title')}</span>
      <label>
        {t('pro_fp_material')}
        <select
          id="opt-fp-material"
          className="select"
          value={activeMatId}
          onChange={(e) => useUi.setState((s) => ({ facePaint: { ...s.facePaint, materialId: e.target.value, eraseMode: false } }))}
        >
          {materialsList.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <label>
        {t('pro_fp_target')}
        <select
          id="opt-fp-layermode"
          className="select"
          value={facePaint.layerMode}
          onChange={(e) => useUi.setState((s) => ({ facePaint: { ...s.facePaint, layerMode: e.target.value as 'all' | 'layer' } }))}
        >
          <option value="all">{t('pro_fp_all_layers')}</option>
          <option value="layer">{t('pro_fp_clicked_layer')}</option>
        </select>
      </label>
      <button
        type="button"
        id="opt-fp-paint"
        className="btn small"
        aria-pressed={!facePaint.eraseMode}
        onClick={() => useUi.setState((s) => ({ facePaint: { ...s.facePaint, eraseMode: false } }))}
      >
        {t('pro_fp_paint')}
      </button>
      <button
        type="button"
        id="opt-fp-erase"
        className="btn small"
        aria-pressed={facePaint.eraseMode}
        onClick={() => useUi.setState((s) => ({ facePaint: { ...s.facePaint, eraseMode: true } }))}
      >
        {t('pro_fp_erase')}
      </button>
      <button
        type="button"
        id="opt-fp-studio"
        className="btn small"
        disabled={!studioTarget}
        onClick={() => {
          if (studioTarget) {
            openFaceStudioTab(studioTarget.elementId, studioTarget.face, studioTarget.layer);
            useUi.setState((s) => ({ facePaint: { ...s.facePaint, active: false, mode: 'paint', hoverHit: null } }));
          }
        }}
      >
        {t('pro_fp_open_studio')}
      </button>
      <button
        type="button"
        id="opt-fp-finish"
        className="btn small primary"
        onClick={() => useUi.setState((s) => ({ facePaint: { ...s.facePaint, active: false, mode: 'paint', hoverHit: null } }))}
      >
        {t('pro_fp_finish')}
      </button>
    </div>
  );
}
