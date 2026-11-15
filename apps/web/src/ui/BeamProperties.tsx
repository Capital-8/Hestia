import { useMemo, type ReactElement } from 'react';
import { resolveBeamsOnLevel, type ResolvedBeam } from '@hestia/engine';
import { type Beam, type BeamJustify, type Id } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { beamOptions } from './typeOptions.ts';
import { useFormat } from './useUnits.ts';

function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Beam>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

export function BeamProperties({ items }: { items: Beam[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const p = useProject();
  const ids = items.map((b) => b.id);
  const typeId = common(items, (b) => b.typeId);
  const zOffset = common(items, (b) => b.zOffset);
  const justify = common(items, (b) => b.justify);
  const mark = common(items, (b) => b.mark);
  const comments = common(items, (b) => b.comments);
  const single = items.length === 1 ? items[0]! : null;

  const resolved = useMemo(() => {
    const map = new Map<Id, ResolvedBeam>();
    const levelIds = [...new Set(items.map((b) => b.levelId))];
    for (const lid of levelIds) {
      for (const rb of resolveBeamsOnLevel(p, lid)) {
        if (items.some((b) => b.id === rb.id)) map.set(rb.id, rb);
      }
    }
    return map;
  }, [p, items]);

  const singleResolved = single ? resolved.get(single.id) : null;
  const totalLength = items.reduce((acc, b) => acc + (resolved.get(b.id)?.length ?? 0), 0);
  const totalVolume = items.reduce((acc, b) => acc + (resolved.get(b.id)?.volume ?? 0), 0);
  const totalFormwork = items.reduce((acc, b) => acc + (resolved.get(b.id)?.areaFormwork ?? 0), 0);
  const totalCost = items.reduce((acc, b) => acc + (resolved.get(b.id)?.cost ?? 0), 0);

  return (
    <>
      <TypeSelector
        triggerId="prop-beamtype"
        label={t('str_prop_type_beam')}
        categoryLabel={t('str_cat_beams', { n: items.length })}
        options={beamOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'beamType', dialogArg: typeId.value })}
      />
      <Group title={t('prd_pgrp_constraints')}>
        <LevelField ids={ids} label={t('egs_csv_col_nivel')} />
        <Row label={t('str_fld_z_offset')} htmlFor="bm-zoff">
          <NumField id="bm-zoff" value={zOffset.value} mixed={zOffset.mixed} onCommit={(v) => patch(ids, { zOffset: v })} quantity="length" />
        </Row>
        <Row label={t('str_fld_justify')} htmlFor="bm-just">
          <select
            id="bm-just"
            className="select"
            value={justify.mixed ? '' : justify.value}
            onChange={(e) => patch(ids, { justify: e.target.value as BeamJustify })}
          >
            {justify.mixed && <option value="" disabled>—</option>}
            <option value="center">{t('str_just_center')}</option>
            <option value="left">{t('str_just_left')}</option>
            <option value="right">{t('str_just_right')}</option>
          </select>
        </Row>
      </Group>
      <Group title={t('prd_pgrp_dimensions')}>
        {singleResolved ? (
          <>
            <Row label={t('egs_csv_col_comprimento')}><span className="val">{fmt('length', singleResolved.length)}</span></Row>
            <Row label={t('str_fld_formwork_area')}><span className="val">{fmt('area', singleResolved.areaFormwork)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', singleResolved.volume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', singleResolved.cost)}</span></Row>
          </>
        ) : (
          <>
            <Row label={t('egs_csv_col_comprimento')}><span className="val">{fmt('length', totalLength)}</span></Row>
            <Row label={t('str_fld_formwork_area')}><span className="val">{fmt('area', totalFormwork)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', totalVolume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', totalCost)}</span></Row>
          </>
        )}
      </Group>
      <Group title={t('prd_pgrp_identity')} open={false}>
        <Row label={t('prd_fld_mark')} htmlFor="bm-mark"><TextField id="bm-mark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prd_fld_comments')} htmlFor="bm-comm"><TextField id="bm-comm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
