import { useMemo, type ReactElement } from 'react';
import { quantifyFloors } from '@hestia/engine';
import { FUNCTION_LABEL, floorArea, floorTypeThickness, type Floor, type Id, type Project } from '@hestia/model';
import { ringPerimeter } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { LevelField } from './LevelField.tsx';
import { OutlineGroup } from './OutlineGroup.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { floorOptions } from './typeOptions.ts';



/** Valor comum a todos os selecionados, ou `mixed` quando divergem. */
function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Floor>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

/** Área líquida resolvida (com as aberturas de escada) de cada piso; o que não resolve cai na área crua. */
function resolvedAreas(p: Project, floors: Floor[]): Map<Id, number> {
  const levels = [...new Set(floors.map((f) => f.levelId))];
  return new Map(levels.flatMap((levelId) => quantifyFloors(p, levelId).floors.map((q) => [q.floorId, q.area] as const)));
}

/** Propriedades de um ou mais pisos selecionados (tipo, deslocamento, marca, área e perímetro). */
export function FloorProperties({ floors }: { floors: Floor[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const p = useProject();
  const ids = floors.map((f) => f.id);
  const typeId = common(floors, (f) => f.typeId);
  const offset = common(floors, (f) => f.heightOffset);
  const mark = common(floors, (f) => f.mark);
  const comments = common(floors, (f) => f.comments);
  const single = floors.length === 1 ? floors[0]! : null;
  const type = typeId.mixed ? null : p.floorTypes[typeId.value];
  const floorKey = floors.map((f) => `${f.id}:${f.levelId}`).join(',');
  // A lista `floors` é nova a cada render do painel; a chave por ids/níveis é o que identifica a seleção (senão o memo nunca valeria).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolved = useMemo(() => resolvedAreas(p, floors), [p, floorKey]);
  const areaOf = (f: Floor): number => resolved.get(f.id) ?? floorArea(f);
  const area = floors.reduce((s, f) => s + areaOf(f), 0);
  const perimeter = floors.reduce((s, f) => s + ringPerimeter(f.boundary), 0);

  return (
    <>
      <TypeSelector
        triggerId="prop-floortype"
        label={t('prd_prop_type_floor')}
        categoryLabel={t('prd_cat_floors', { n: floors.length })}
        options={floorOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'floorType', dialogArg: typeId.value })}
      />
      <Group title={t('prd_pgrp_constraints')}>
        <LevelField ids={ids} />
        <Row label={t('prd_fld_top_offset')} htmlFor="p-foff">
          <NumField id="p-foff" value={offset.value} mixed={offset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
      </Group>
      <OutlineGroup elements={floors} />
      <Group title={t('prd_pgrp_construction')} open={false}>
        {type ? (
          <>
            <Row label={t('prd_fld_total_thickness')} readOnly fromType><span className="val">{fmt('smallLength', floorTypeThickness(type))}</span></Row>
            {type.layers.map((l, i) => (
              <div className="prow ro" key={i}>
                <span className="lbl" title={FUNCTION_LABEL[l.function]}>{FUNCTION_LABEL[l.function]}</span>
                <span className="val soft" title={p.materials[l.materialId]?.name}>{fmt('smallLength', l.thickness)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="hint">{t('prd_msg_select_floors_layers')}</div>
        )}
      </Group>
      <Group title={t('prd_pgrp_dimensions')}>
        {single ? (
          <>
            <Row label={t('prd_fld_net_area')}><span className="val">{fmt('area', areaOf(single))}</span></Row>
            <Row label={t('prd_fld_perimeter')}><span className="val">{fmt('length', ringPerimeter(single.boundary))}</span></Row>
            <Row label={t('prd_fld_holes')}><span className="val">{single.holes.length}</span></Row>
          </>
        ) : (
          <>
            <Row label={t('prd_fld_net_area_total')}><span className="val">{fmt('area', area)}</span></Row>
            <Row label={t('prd_fld_perimeter_total')}><span className="val">{fmt('length', perimeter)}</span></Row>
          </>
        )}
      </Group>
      <Group title={t('prd_pgrp_identity')} open={false}>
        <Row label={t('prd_fld_mark')} htmlFor="p-fmark"><TextField id="p-fmark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prd_fld_comments')} htmlFor="p-fcomm"><TextField id="p-fcomm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
