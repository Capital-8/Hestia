import type { ReactElement } from 'react';
import { ceilingArea, ceilingTypeThickness, FUNCTION_LABEL, type Ceiling, type Id, type Project } from '@hestia/model';
import { ceilingOutline } from '@hestia/engine';
import { ringPerimeter } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { CeilingOutlineGroup } from './CeilingOutlineGroup.tsx';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { ceilingOptions } from './typeOptions.ts';



/** Valor comum a todos os selecionados, ou `mixed` quando divergem. */
function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Ceiling>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

/** Nome do ambiente de origem (número e nome), ou vazio quando o forro foi desenhado livremente. */
function roomLabel(p: Project, c: Ceiling): string {
  const r = c.roomId ? p.elements[c.roomId] : undefined;
  return r && r.kind === 'room' ? [r.number, r.name].filter(Boolean).join(' · ') : '';
}

/** Propriedades de um ou mais forros selecionados (tipo, cota do topo, ambiente, construção, dimensões e marca). */
export function CeilingProperties({ ceilings }: { ceilings: Ceiling[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const p = useProject();
  const ids = ceilings.map((c) => c.id);
  const typeId = common(ceilings, (c) => c.typeId);
  const offset = common(ceilings, (c) => c.heightOffset);
  const mark = common(ceilings, (c) => c.mark);
  const comments = common(ceilings, (c) => c.comments);
  const single = ceilings.length === 1 ? ceilings[0]! : null;
  const type = typeId.mixed ? null : p.ceilingTypes[typeId.value];
  /** Contorno efetivo: o do ambiente quando o forro acompanha (o gravado, caso contrário). */
  const eff = (c: Ceiling) => ceilingOutline(p, c);
  const area = ceilings.reduce((s, c) => s + ceilingArea(eff(c)), 0);
  const perimeter = ceilings.reduce((s, c) => s + ringPerimeter(eff(c).boundary), 0);

  return (
    <>
      <TypeSelector
        triggerId="prop-ceilingtype"
        label={t('prd_prop_type_ceiling')}
        categoryLabel={t('prd_cat_ceilings', { n: ceilings.length })}
        options={ceilingOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'ceilingType', dialogArg: typeId.value })}
      />
      <Group title={t('prd_pgrp_constraints')}>
        <LevelField ids={ids} />
        <Row label={t('prd_fld_top_elevation')} htmlFor="p-ctop">
          <NumField id="p-ctop" value={offset.value} mixed={offset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
        {single ? <Row label={t('prd_fld_bottom_face')}><span className="val">{fmt('length', single.heightOffset - (p.ceilingTypes[single.typeId] ? ceilingTypeThickness(p.ceilingTypes[single.typeId]!) : 0))}</span></Row> : null}
      </Group>
      <CeilingOutlineGroup ceilings={ceilings} />
      <Group title={t('prd_pgrp_construction')} open={false}>
        {type ? (
          <>
            <Row label={t('prd_fld_total_thickness')} readOnly fromType><span className="val">{fmt('smallLength', ceilingTypeThickness(type))}</span></Row>
            {type.layers.map((l, i) => (
              <div className="prow ro" key={i}>
                <span className="lbl" title={FUNCTION_LABEL[l.function]}>{FUNCTION_LABEL[l.function]}</span>
                <span className="val soft" title={p.materials[l.materialId]?.name}>{fmt('smallLength', l.thickness)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="hint">{t('prd_msg_select_ceilings_layers')}</div>
        )}
      </Group>
      <Group title={t('prd_pgrp_dimensions')}>
        {single ? (
          <>
            <Row label={t('prd_fld_area')}><span className="val">{fmt('area', ceilingArea(eff(single)))}</span></Row>
            <Row label={t('prd_fld_perimeter')}><span className="val">{fmt('length', ringPerimeter(eff(single).boundary))}</span></Row>
            <Row label={t('prd_fld_holes')}><span className="val">{eff(single).holes.length}</span></Row>
            {roomLabel(p, single) ? <Row label={t('tool_room')}><span className="val">{roomLabel(p, single)}</span></Row> : null}
          </>
        ) : (
          <>
            <Row label={t('prd_fld_area_total')}><span className="val">{fmt('area', area)}</span></Row>
            <Row label={t('prd_fld_perimeter_total')}><span className="val">{fmt('length', perimeter)}</span></Row>
          </>
        )}
      </Group>
      <Group title={t('prd_pgrp_identity')} open={false}>
        <Row label={t('prd_fld_mark')} htmlFor="p-cmark"><TextField id="p-cmark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prd_fld_comments')} htmlFor="p-ccomm"><TextField id="p-ccomm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
