import { useMemo, type ReactElement } from 'react';
import { resolveFootingsOnLevel, type ResolvedFooting } from '@hestia/engine';
import { isColumn, type Footing, type Id } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { FootingEccentricityRows, footingPresetOffset, matchingFootingPreset } from './footingEccentricity.tsx';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { footingOptions } from './typeOptions.ts';
import { useFormat } from './useUnits.ts';

function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Footing>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

export function FootingProperties({ items }: { items: Footing[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const p = useProject();
  const ids = items.map((f) => f.id);
  const typeId = common(items, (f) => f.typeId);
  const heightOffset = common(items, (f) => f.heightOffset);
  const rotation = common(items, (f) => f.rotation);
  const ex = common(items, (f) => f.eccentricityX ?? 0);
  const ey = common(items, (f) => f.eccentricityY ?? 0);
  const eccentric = common(items, (f) => Math.hypot(f.eccentricityX ?? 0, f.eccentricityY ?? 0) > 1e-6);
  const columnId = common(items, (f) => f.columnId ?? null);
  const mark = common(items, (f) => f.mark);
  const comments = common(items, (f) => f.comments);
  const single = items.length === 1 ? items[0]! : null;

  const columns = useMemo(() => {
    return Object.values(p.elements).filter(isColumn);
  }, [p.elements]);

  const resolved = useMemo(() => {
    const map = new Map<Id, ResolvedFooting>();
    const levelIds = [...new Set(items.map((f) => f.levelId))];
    for (const lid of levelIds) {
      for (const rf of resolveFootingsOnLevel(p, lid)) {
        if (items.some((f) => f.id === rf.id)) map.set(rf.id, rf);
      }
    }
    return map;
  }, [p, items]);

  const singleResolved = single ? resolved.get(single.id) : null;
  const totalArea = items.reduce((acc, f) => acc + (resolved.get(f.id)?.area ?? 0), 0);
  const totalVolume = items.reduce((acc, f) => acc + (resolved.get(f.id)?.volume ?? 0), 0);
  const totalCost = items.reduce((acc, f) => acc + (resolved.get(f.id)?.cost ?? 0), 0);
  const rotDeg = Math.round(((rotation.value * 180) / Math.PI) * 10) / 10;

  return (
    <>
      <TypeSelector
        triggerId="prop-footingtype"
        label={t('str_prop_type_footing')}
        categoryLabel={t('str_cat_footings', { n: items.length })}
        options={footingOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'footingType', dialogArg: typeId.value })}
      />
      <Group title={t('prd_pgrp_constraints')}>
        <LevelField ids={ids} label={t('egs_csv_col_nivel')} />
        <Row label={t('str_fld_height_offset')} htmlFor="ft-hoff">
          <NumField id="ft-hoff" value={heightOffset.value} mixed={heightOffset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
        <Row label={t('str_fld_rotation')} htmlFor="ft-rot">
          <NumField id="ft-rot" value={rotDeg} mixed={rotation.mixed} suffix="°" decimals={1} onCommit={(deg) => patch(ids, { rotation: (deg * Math.PI) / 180 })} />
        </Row>
        <FootingEccentricityRows
          idPrefix="ft"
          eccentric={eccentric.value}
          modeMixed={eccentric.mixed}
          ex={ex.value}
          ey={ey.value}
          exMixed={ex.mixed}
          eyMixed={ey.mixed}
          activePreset={!ex.mixed && !ey.mixed && items[0]
            ? matchingFootingPreset(p, items[0].typeId, items[0].columnId ?? null, items[0].rotation, ex.value, ey.value)
            : null}
          onModeChange={(isEcc) => {
            if (!isEcc) { patch(ids, { eccentricityX: 0, eccentricityY: 0 }); return; }
            if (Math.hypot(ex.value, ey.value) > 1e-6) return;
            editor.store.transaction('str_fld_foot_pos_mode', () => {
              for (const f of items) {
                editor.store.exec({ type: 'updateElements', ids: [f.id], patch: footingPresetOffset(p, f.typeId, f.columnId ?? null, f.rotation, 'left') });
              }
            });
          }}
          onExChange={(v) => patch(ids, { eccentricityX: v })}
          onEyChange={(v) => patch(ids, { eccentricityY: v })}
          onPreset={(preset) => {
            if (items.length === 1) {
              const f = items[0]!;
              patch([f.id], footingPresetOffset(p, f.typeId, f.columnId ?? null, f.rotation, preset));
              return;
            }
            editor.store.transaction('str_fld_eccentric_presets', () => {
              for (const f of items) {
                editor.store.exec({ type: 'updateElements', ids: [f.id], patch: footingPresetOffset(p, f.typeId, f.columnId ?? null, f.rotation, preset) });
              }
            });
          }}
        />
        <Row label={t('str_fld_linked_column')} htmlFor="ft-col">
          <select
            id="ft-col"
            className="select"
            value={columnId.mixed ? '' : (columnId.value ?? '')}
            onChange={(e) => patch(ids, { columnId: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">{t('str_fld_none')}</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.mark ? `${c.mark} (${c.id})` : c.id}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group title={t('prd_pgrp_dimensions')}>
        {singleResolved ? (
          <>
            <Row label={t('str_fld_foot_area')}><span className="val">{fmt('area', singleResolved.area)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', singleResolved.volume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', singleResolved.cost)}</span></Row>
          </>
        ) : (
          <>
            <Row label={t('str_fld_foot_area')}><span className="val">{fmt('area', totalArea)}</span></Row>
            <Row label={t('egs_csv_col_volume')}><span className="val">{fmt('volume', totalVolume)}</span></Row>
            <Row label={t('str_fld_estimated_cost')}><span className="val">{fmt('currency', totalCost)}</span></Row>
          </>
        )}
      </Group>
      <Group title={t('prd_pgrp_identity')} open={false}>
        <Row label={t('prd_fld_mark')} htmlFor="ft-mark"><TextField id="ft-mark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prd_fld_comments')} htmlFor="ft-comm"><TextField id="ft-comm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
