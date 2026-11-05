import type { ReactElement } from 'react';
import {
  SECTION_ARROW_MM,
  SECTION_LABEL_OFFSET_MM,
  SECTION_TEXT_MM,
  sectionInvertPatch,
  type SectionMarkLineStyle,
  type SectionMarkPlacement,
  type SectionMarkStyle,
  type SectionRole,
  type SectionView,
} from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';

const optional = (text: string): string | undefined => text.trim() || undefined;

const SECTION_ROLE_KEY: Record<SectionRole, keyof Dict> = {
  north: 'prb_role_north',
  south: 'prb_role_south',
  east: 'prb_role_east',
  west: 'prb_role_west',
};

/** Vista selecionada (uma só), ou null. A seleção de vistas usa o mesmo `Id[]` dos elementos. */
export function selectedView(p: { views: SectionView[] }, ids: string[]): SectionView | null {
  if (ids.length !== 1) return null;
  return p.views.find((v) => v.id === ids[0]) ?? null;
}

/** Propriedades de uma marca de corte/elevação: identidade, geometria, aparência e associação com paredes. */
export function SectionViewProps({ view }: { view: SectionView }): ReactElement {
  const { t } = useT();
  const update = (patch: Partial<Omit<SectionView, 'id'>>): void => {
    const err = editor.updateView(view.id, patch);
    if (err) useUi.setState({ status: err });
  };
  const setMark = (patch: Partial<SectionMarkStyle>): void => update({ mark: { ...view.mark, ...patch } });
  const kind = view.kind === 'elevation' ? t('prb_view_elevation') : t('prb_view_section');
  const lineStyle: SectionMarkLineStyle = view.mark?.lineStyle ?? (view.kind === 'elevation' ? 'continuous' : 'dash-dot');
  const placement: SectionMarkPlacement = view.mark?.placement ?? 'both';
  const offset = view.mark?.labelOffsetMm ?? SECTION_LABEL_OFFSET_MM;
  const refs = view.refs?.a || view.refs?.b;
  const setA = (x: number, y: number): void => update({ a: { x, y }, refs: view.refs ? { ...view.refs, a: undefined } : undefined });
  const setB = (x: number, y: number): void => update({ b: { x, y }, refs: view.refs ? { ...view.refs, b: undefined } : undefined });

  return (
    <>
      <Group title={t('prb_pgrp_identity')}>
        <Row label={t('prb_fld_type')}><span className="val">{kind}</span></Row>
        {view.kind === 'elevation' && view.role ? <Row label={t('prb_fld_role')}><span className="val">{t(SECTION_ROLE_KEY[view.role])}</span></Row> : null}
        <Row label={t('prb_fld_name')} htmlFor="sv-name">
          <TextField id="sv-name" value={view.name} onCommit={(v) => update({ name: v.trim() })} />
        </Row>
        <Row label={t('prb_fld_number')} htmlFor="sv-number">
          <TextField id="sv-number" value={view.number ?? ''} placeholder={t('prb_ph_example_a')} onCommit={(v) => update({ number: optional(v) })} />
        </Row>
        <Row label={t('prb_fld_title')} htmlFor="sv-title">
          <TextField id="sv-title" value={view.title ?? ''} placeholder={t('prb_ph_title_on_sheet')} onCommit={(v) => update({ title: optional(v) })} />
        </Row>
        <Row label={t('prb_fld_label')} htmlFor="sv-label">
          <TextField id="sv-label" value={view.label ?? ''} placeholder={t('prb_ph_mark_text')} onCommit={(v) => update({ label: optional(v) })} />
        </Row>
      </Group>

      <Group title={t('prb_pgrp_geometry')}>
        <Row label={t('prb_fld_depth')} htmlFor="sv-depth">
          <NumField id="sv-depth" value={view.depth} min={0.01} quantity="length" onCommit={(v) => update({ depth: v })} />
        </Row>
        <Row label={t('prb_fld_start_x')} htmlFor="sv-ax">
          <NumField id="sv-ax" value={view.a.x} quantity="length" onCommit={(v) => setA(v, view.a.y)} />
        </Row>
        <Row label={t('prb_fld_start_y')} htmlFor="sv-ay">
          <NumField id="sv-ay" value={view.a.y} quantity="length" onCommit={(v) => setA(view.a.x, v)} />
        </Row>
        <Row label={t('prb_fld_end_x')} htmlFor="sv-bx">
          <NumField id="sv-bx" value={view.b.x} quantity="length" onCommit={(v) => setB(v, view.b.y)} />
        </Row>
        <Row label={t('prb_fld_end_y')} htmlFor="sv-by">
          <NumField id="sv-by" value={view.b.y} quantity="length" onCommit={(v) => setB(view.b.x, v)} />
        </Row>
        <Row label={t('prb_fld_direction')}>
          <button className="btn" type="button" onClick={() => update(sectionInvertPatch(view))}>{t('prb_btn_invert_direction')}</button>
        </Row>
      </Group>

      <Group title={t('prb_pgrp_mark')}>
        <Row label={t('prb_fld_visible')} htmlFor="sv-visible">
          <Check id="sv-visible" checked={view.mark?.visible !== false} onChange={(v) => setMark({ visible: v })} />
        </Row>
        <Row label={t('prb_fld_arrows')} htmlFor="sv-arrows">
          <Check id="sv-arrows" checked={view.mark?.showArrow !== false} onChange={(v) => setMark({ showArrow: v })} />
        </Row>
        <Row label={t('prb_fld_label_on_mark')} htmlFor="sv-showlabel">
          <Check id="sv-showlabel" checked={view.mark?.showLabel !== false} onChange={(v) => setMark({ showLabel: v })} />
        </Row>
        <Row label={t('prb_fld_position')} htmlFor="sv-placement">
          <select id="sv-placement" className="select" value={placement} onChange={(e) => setMark({ placement: e.target.value as SectionMarkPlacement })}>
            <option value="both">{t('prb_opt_both_ends')}</option>
            <option value="start">{t('prb_opt_start_only')}</option>
            <option value="end">{t('prb_opt_end_only')}</option>
            <option value="middle">{t('prb_opt_middle')}</option>
          </select>
        </Row>
        <Row label={t('prb_fld_line_style')} htmlFor="sv-linestyle">
          <select id="sv-linestyle" className="select" value={lineStyle} onChange={(e) => setMark({ lineStyle: e.target.value as SectionMarkLineStyle })}>
            <option value="dash-dot">{t('prb_opt_dash_dot')}</option>
            <option value="continuous">{t('prb_opt_continuous')}</option>
            <option value="dashed">{t('prb_opt_dashed')}</option>
          </select>
        </Row>
        <Row label={t('prb_fld_arrow_mm')} htmlFor="sv-arrow">
          <NumField id="sv-arrow" value={(view.mark?.arrowMm ?? SECTION_ARROW_MM) / 1000} min={0.0005} max={0.02} quantity="smallLength" onCommit={(v) => setMark({ arrowMm: v * 1000 })} />
        </Row>
        <Row label={t('prb_fld_text_mm')} htmlFor="sv-text">
          <NumField id="sv-text" value={(view.mark?.textMm ?? SECTION_TEXT_MM) / 1000} min={0.001} max={0.02} quantity="smallLength" onCommit={(v) => setMark({ textMm: v * 1000 })} />
        </Row>
        <Row label={t('prb_fld_offset_x')} htmlFor="sv-offx">
          <NumField id="sv-offx" value={offset.x / 1000} quantity="smallLength" onCommit={(v) => setMark({ labelOffsetMm: { ...offset, x: v * 1000 } })} />
        </Row>
        <Row label={t('prb_fld_offset_y')} htmlFor="sv-offy">
          <NumField id="sv-offy" value={offset.y / 1000} quantity="smallLength" onCommit={(v) => setMark({ labelOffsetMm: { ...offset, y: v * 1000 } })} />
        </Row>
      </Group>

      <Group title={t('prb_pgrp_association')}>
        <Row label={t('prb_fld_end_a')}><span className="val">{view.refs?.a ? t('prb_opt_attached_to_wall') : t('ramp_shape_free')}</span></Row>
        <Row label={t('prb_fld_end_b')}><span className="val">{view.refs?.b ? t('prb_opt_attached_to_wall') : t('ramp_shape_free')}</span></Row>
        {refs ? (
          <Row label={t('prb_fld_references')}>
            <button className="btn" type="button" onClick={() => update({ refs: undefined })}>{t('prb_btn_detach_refs')}</button>
          </Row>
        ) : null}
      </Group>
    </>
  );
}
