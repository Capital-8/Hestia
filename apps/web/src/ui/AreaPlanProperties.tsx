import type { ReactElement } from 'react';
import { areaPlanOf, viewAnnotationsOf, type AreaPlan, type Project } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { applyColorSchemeAction, clearColorSchemeAction, recenterTagsAction, seedPlanAnnotationsAction, setPlanGraphicsAction } from '../editor/areaPlanActions.ts';
import { useUi } from '../editor/state.ts';
import { fmtNum, useT } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';

const say = (status: string): void => useUi.setState({ status });

/**
 * Controles do perfil da vista de área (escala, visibilidade, estilo, rótulos, legenda/prancha),
 * mostrados dentro do painel comum de propriedades de vista como sobrescritas da vista.
 */
export function AreaProfileGroups({ plan }: { plan: AreaPlan }): ReactElement {
  const p: Project = useProject();
  const { t, lang } = useT();
  // `showGrids`/`showSectionMarks` são opcionais no modelo; ausentes valem desligados.
  const g = plan.graphics;
  const a = viewAnnotationsOf(p, plan.id);
  const annotationTotal = a.dimensions.length + a.texts.length + a.detailLines.length + a.detailRegions.length + a.tags.length;
  const rooms = Object.values(p.elements).filter((e) => e.kind === 'room' && e.levelId === plan.levelId).length;
  return (
    <>
      <Group title={t('prb_pgrp_area_plan_profile')}>
        <Row label={t('prb_fld_name')} htmlFor="ap-name">
          <TextField id="ap-name" value={plan.name} onCommit={(v) => editor.store.exec({ type: 'updateAreaPlan', id: plan.id, patch: { name: v } }, t('prb_undo_rename_area_plan'))} />
        </Row>
        <Row label={t('scale')} htmlFor="ap-scale">
          <NumField id="ap-scale" value={plan.scale} min={1} unit="1:" onCommit={(v) => editor.store.exec({ type: 'updateAreaPlan', id: plan.id, patch: { scale: v } }, t('prb_undo_change_plan_scale'))} />
        </Row>
        <Row label={t('prb_fld_rooms')}><span className="val">{t('prb_msg_n_in_level', { n: fmtNum(rooms, 0, lang) })}</span></Row>
      </Group>

      <Group title={t('prb_pgrp_drawing')}>
        <Row label={t('prb_fld_walls_display')} htmlFor="ap-walls">
          <select id="ap-walls" className="select" value={g.showWalls} onChange={(e) => setPlanGraphicsAction(editor.store, plan.id, { showWalls: e.target.value as typeof g.showWalls })}>
            <option value="light">{t('prb_opt_walls_light')}</option>
            <option value="normal">{t('prb_opt_walls_normal')}</option>
            <option value="hidden">{t('prb_opt_walls_hidden')}</option>
          </select>
        </Row>
        <Row label={t('prb_fld_reference_lines')} htmlFor="ap-ref">
          <select id="ap-ref" className="select" value={g.referenceLines} onChange={(e) => setPlanGraphicsAction(editor.store, plan.id, { referenceLines: e.target.value as typeof g.referenceLines })}>
            <option value="always">{t('prb_opt_always')}</option>
            <option value="selected">{t('prb_opt_selected_only')}</option>
            <option value="never">{t('prb_opt_never')}</option>
          </select>
        </Row>
        <Row label={t('prb_fld_outline')} htmlFor="ap-outline">
          <select id="ap-outline" className="select" value={g.outline} onChange={(e) => setPlanGraphicsAction(editor.store, plan.id, { outline: e.target.value as typeof g.outline })}>
            <option value="none">{t('prb_opt_no_outline')}</option>
            <option value="thin">{t('prb_opt_thin')}</option>
            <option value="dashed">{t('prb_opt_dashed')}</option>
          </select>
        </Row>
        <Row label={t('prb_fld_tag_content')} htmlFor="ap-tagfields">
          <select
            id="ap-tagfields"
            className="select"
            value={g.tagDefault.fields.join(',')}
            onChange={(e) => {
              const fields = e.target.value.split(',') as typeof g.tagDefault.fields;
              setPlanGraphicsAction(editor.store, plan.id, { tagDefault: { ...g.tagDefault, fields } });
            }}
          >
            <option value="name,number,area">{t('prb_opt_tag_name_number_area')}</option>
            <option value="name,area">{t('prb_opt_tag_name_area')}</option>
            <option value="name,number">{t('prb_opt_tag_name_number')}</option>
            <option value="name">{t('prb_opt_tag_name_only')}</option>
            <option value="name,area,perimeter">{t('prb_opt_tag_name_area_perimeter')}</option>
          </select>
        </Row>
      </Group>

      <Group title={t('prb_pgrp_view_annotations')}>
        <Row label={t('prb_fld_show_openings')}><Check id="ap-openings" checked={g.showOpenings} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showOpenings: v })} /></Row>
        <Row label={t('prb_fld_show_grids')}><Check id="ap-grids" checked={g.showGrids ?? false} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showGrids: v })} /></Row>
        <Row label={t('prb_fld_show_section_marks')}><Check id="ap-sectionmarks" checked={g.showSectionMarks ?? false} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showSectionMarks: v })} /></Row>
        <Row label={t('prb_fld_show_dimensions')}><Check id="ap-dims" checked={g.showDimensions} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showDimensions: v })} /></Row>
        <Row label={t('prb_fld_show_level_annotations')}><Check id="ap-annotations" checked={g.showAnnotations} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showAnnotations: v })} /></Row>
        <Row label={t('prb_fld_show_floors')}><Check id="ap-floors" checked={g.showFloors} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showFloors: v })} /></Row>
        <Row label={t('prb_fld_show_stairs_ramps')}><Check id="ap-stairs" checked={g.showStairs ?? true} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showStairs: v })} /></Row>
        <Row label={t('prb_fld_show_roofs_projection')}><Check id="ap-roofs" checked={g.showRoofs ?? true} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showRoofs: v })} /></Row>
        <Row label={t('prb_fld_show_imported_objects')}><Check id="ap-generic" checked={g.showGeneric ?? false} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showGeneric: v })} /></Row>
        <Row label={t('prb_fld_underlay')}><Check id="ap-below" checked={g.showBelowLevel} onChange={(v) => setPlanGraphicsAction(editor.store, plan.id, { showBelowLevel: v })} /></Row>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => useUi.setState({ dialog: 'cotasAuto' })}>{t('prb_btn_auto_dimensions')}</button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const n = seedPlanAnnotationsAction(editor.store, plan.id);
              say(
                n
                  ? t(n === 1 ? 'prb_msg_annotations_copied_one' : 'prb_msg_annotations_copied_many', { n: fmtNum(n, 0, lang) })
                  : t('prb_msg_no_level_annotations'),
              );
            }}
          >
            {t('prb_btn_copy_level_annotations')}
          </button>
        </div>
        <div className="hint">
          {annotationTotal > 0
            ? t(annotationTotal === 1 ? 'prb_msg_annotations_in_view_one' : 'prb_msg_annotations_in_view_many', { n: fmtNum(annotationTotal, 0, lang) })
            : g.showAnnotations
              ? t('prb_msg_no_own_annotations')
              : t('prb_msg_no_annotations_in_view')}
          {' '}{t('prb_msg_annotation_scope')}
        </div>
      </Group>

      <Group title={t('prb_pgrp_color_optional')}>
        <div className="hint">{t('prb_msg_no_color_scheme')}</div>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => applyColorSchemeAction(editor.store, plan.id, 'category')}>{t('prb_btn_by_category')}</button>
          <button type="button" className="btn small" onClick={() => applyColorSchemeAction(editor.store, plan.id, 'level')}>{t('prb_btn_by_level')}</button>
          <button type="button" className="btn small" onClick={() => applyColorSchemeAction(editor.store, plan.id, 'areaRange')}>{t('prb_btn_by_range')}</button>
          <button type="button" className="btn small" disabled={!plan.schemeId} onClick={() => clearColorSchemeAction(editor.store, plan.id)}>{t('prb_btn_no_color')}</button>
        </div>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => useUi.setState({ dialog: 'roomCategories' })}>{t('prb_btn_manage_categories')}</button>
        </div>
        {plan.schemeId ? (
          <Row label={t('prb_fld_fill')} htmlFor="ap-fill">
            <select id="ap-fill" className="select" value={g.fill} onChange={(e) => setPlanGraphicsAction(editor.store, plan.id, { fill: e.target.value as typeof g.fill })}>
              <option value="none">{t('prb_opt_no_fill')}</option>
              <option value="scheme">{t('prb_opt_scheme_color')}</option>
              <option value="hatch">{t('prb_opt_hatch_bw')}</option>
            </select>
          </Row>
        ) : null}
      </Group>

      <Group title={t('prb_pgrp_labels')}>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => { const n = recenterTagsAction(editor.store, plan.id); say(n ? t(n === 1 ? 'prb_msg_labels_recentered_one' : 'prb_msg_labels_recentered_many', { n: fmtNum(n, 0, lang) }) : t('prb_msg_no_labels_to_recenter')); }}>{t('prb_btn_recenter_labels')}</button>
        </div>
        <div className="hint">{t('prb_msg_room_label_hint')}</div>
      </Group>
    </>
  );
}

/** Planta de área ativa, ou undefined. */
export const activeAreaPlan = (p: Project, id: string | null | undefined): AreaPlan | undefined => (id ? areaPlanOf(p, id) : undefined);
