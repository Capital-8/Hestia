import { useMemo, type ReactElement } from 'react';
import { resolveColumnsOnLevel, type ResolvedColumn } from '@hestia/engine';
import { type Column, type Id } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { columnOptions } from './typeOptions.ts';
import { useFormat } from './useUnits.ts';

function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Column>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

export function ColumnProperties({ items }: { items: Column[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const p = useProject();
  const ids = items.map((c) => c.id);
  const typeId = common(items, (c) => c.typeId);
  const baseOffset = common(items, (c) => c.baseOffset);
  const topLevelId = common(items, (c) => c.topLevelId);
  const topOffset = common(items, (c) => c.topOffset);
  const height = common(items, (c) => c.height);
  const mark = common(items, (c) => c.mark);
  const comments = common(items, (c) => c.comments);
  const rotation = common(items, (c) => c.rotation);
  const hasTopLevel = topLevelId.value !== null;
  const single = items.length === 1 ? items[0]! : null;

  const resolved = useMemo(() => {
    const map = new Map<Id, ResolvedColumn>();
    const levelIds = [...new Set(items.map((c) => c.levelId))];
    for (const lid of levelIds) {
      for (const rc of resolveColumnsOnLevel(p, lid)) {
        if (items.some((c) => c.id === rc.id)) map.set(rc.id, rc);
      }
    }
    return map;
  }, [p, items]);

  const singleResolved = single ? resolved.get(single.id) : null;
  const totalVolume = items.reduce((acc, c) => acc + (resolved.get(c.id)?.volume ?? 0), 0);
  const totalFormwork = items.reduce((acc, c) => acc + (resolved.get(c.id)?.areaFormwork ?? 0), 0);
  const totalCost = items.reduce((acc, c) => acc + (resolved.get(c.id)?.cost ?? 0), 0);
  const rotDeg = Math.round(((rotation.value * 180) / Math.PI) * 10) / 10;

  return (
    <>
      <TypeSelector
        triggerId="prop-columntype"
        label={t('str_prop_type_column')}
        categoryLabel={t('str_cat_columns', { n: items.length })}
        options={columnOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'columnType', dialogArg: typeId.value })}
      />
      <Group title={t('prd_pgrp_constraints')}>
        <LevelField ids={ids} label={t('egs_csv_col_nivel_base')} />
        <Row label={t('pra_fld_base_offset')} htmlFor="col-boff">
          <NumField id="col-boff" value={baseOffset.value} mixed={baseOffset.mixed} onCommit={(v) => patch(ids, { baseOffset: v })} quantity="length" />
        </Row>
        <Row label={t('egs_csv_col_nivel_topo')} htmlFor="col-tlevel">
          <select
            id="col-tlevel"
            className="select"
            value={topLevelId.mixed ? '' : (topLevelId.value ?? '')}
            onChange={(e) => patch(ids, { topLevelId: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">{t('str_fld_none')}</option>
            {p.levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Row>
        <Row label={t('prd_fld_top_offset')} htmlFor="col-toff">
          <NumField id="col-toff" value={topOffset.value} mixed={topOffset.mixed} disabled={!hasTopLevel} onCommit={(v) => patch(ids, { topOffset: v })} quantity="length" />
        </Row>
        <Row label={t('egs_csv_col_altura')} htmlFor="col-h">
          <NumField id="col-h" value={height.value} mixed={height.mixed} disabled={hasTopLevel} onCommit={(v) => patch(ids, { height: v })} quantity="length" min={0.05} />
        </Row>
        <Row label={t('str_fld_rotation')} htmlFor="col-rot">
          <NumField id="col-rot" value={rotDeg} mixed={rotation.mixed} suffix="°" decimals={1} onCommit={(deg) => patch(ids, { rotation: (deg * Math.PI) / 180 })} />
        </Row>
      </Group>
      <Group title={t('prd_pgrp_dimensions')}>
        {singleResolved ? (
          <>
            <Row label={t('str_fld_section_area')}><span className="val">{fmt('area', singleResolved.sectionArea)}</span></Row>
            <Row label={t('str_fld_formwork_area')}><span className="val">{fmt('area', singleResolved.areaFormwork)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', singleResolved.volume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', singleResolved.cost)}</span></Row>
          </>
        ) : (
          <>
            <Row label={t('str_fld_formwork_area')}><span className="val">{fmt('area', totalFormwork)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', totalVolume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', totalCost)}</span></Row>
          </>
        )}
      </Group>
      <Group title={t('prd_pgrp_identity')} open={false}>
        <Row label={t('prd_fld_mark')} htmlFor="col-mark"><TextField id="col-mark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prd_fld_comments')} htmlFor="col-comm"><TextField id="col-comm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
