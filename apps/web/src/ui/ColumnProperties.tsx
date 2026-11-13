import type { ReactElement } from 'react';
import { columnTypesOf, type Column } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { aplicarEstr, HospedeiroRow, LeiturasEstr, MarcaEComentarios } from './EstrPropsCommon.tsx';
import { LevelField } from './LevelField.tsx';
import { NumField, Row } from './fields.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { estrOptions } from './typeOptions.ts';

type Patch = Partial<Omit<Column, 'id' | 'kind' | 'order'>>;

/**
 * Propriedades do pilar (arquitetônico ou estrutural; ficha U1, A.6): tipo, nível base e deslocamento, topo (nível +
 * deslocamento, ou altura), rotação, parede hospedeira (só arquitetônico), marca e comentários, e as quantidades do kernel.
 * Cada edição vale para todos os selecionados, num passo de desfazer.
 */
export function ColumnProperties({ columns }: { columns: Column[] }): ReactElement {
  const p = useProject();
  const { t } = useT();
  const first = columns[0]!;
  const ids = columns.map((c) => c.id);
  const tipoMisto = new Set(columns.map((c) => c.typeId)).size > 1;
  const todosArq = columns.every((c) => c.disciplina === 'arquitetonico');
  const mixed = <K extends keyof Column>(k: K): boolean => columns.some((c) => c[k] !== first[k]);
  const apply = (patch: Patch): void => aplicarEstr(ids, t('estr_undo_edit_column'), (id) => ({ type: 'updateColumn', id, patch }));
  const porAltura = first.topLevelId === null;
  return (
    <div className="props-estr">
      <TypeSelector
        triggerId="prop-columntype"
        label={t('estr_type_column')}
        categoryLabel={`${t('cvn_cat_columns')} (${columns.length})`}
        options={estrOptions(Object.values(columnTypesOf(p)), (tp) => t(tp.disciplina === 'arquitetonico' ? 'estr_fam_column_arq' : 'estr_fam_column_est'))}
        selectedId={tipoMisto ? null : first.typeId}
        editDisabled={tipoMisto}
        onSelect={(id) => aplicarEstr(ids, t('estr_undo_type_column'), () => ({ type: 'setColumnType', ids, typeId: id }))}
        onEdit={() => useUi.setState({ dialog: 'columnType', dialogArg: first.typeId })}
      />
      <Row label={t('estr_fld_discipline')} readOnly>
        <span>{tipoMisto && !columns.every((c) => c.disciplina === first.disciplina) ? t('prc_opt_varied') : t(first.disciplina === 'arquitetonico' ? 'estr_disc_arquitetonico' : 'estr_disc_estrutural')}</span>
      </Row>
      <LevelField ids={ids} label={t('estr_fld_base_level')} />
      <Row label={t('estr_fld_base_offset')} htmlFor="col-base"><NumField id="col-base" value={first.baseOffset} mixed={mixed('baseOffset')} quantity="length" onCommit={(v) => apply({ baseOffset: v })} /></Row>
      <Row label={t('estr_fld_top_level')} htmlFor="col-top">
        <select id="col-top" className="select" value={mixed('topLevelId') ? '' : (first.topLevelId ?? '')} onChange={(e) => apply(e.target.value === '' ? { topLevelId: null, height: first.height ?? 3 } : { topLevelId: e.target.value })}>
          {mixed('topLevelId') ? <option value="">{t('prc_opt_varied')}</option> : <option value="">{t('estr_top_by_height')}</option>}
          {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Row>
      {porAltura ? (
        <Row label={t('estr_fld_height')} htmlFor="col-height"><NumField id="col-height" value={first.height ?? 3} mixed={mixed('height')} quantity="length" min={0.001} onCommit={(v) => apply({ height: v })} /></Row>
      ) : (
        <Row label={t('estr_fld_top_offset')} htmlFor="col-topoff"><NumField id="col-topoff" value={first.topOffset} mixed={mixed('topOffset')} quantity="length" onCommit={(v) => apply({ topOffset: v })} /></Row>
      )}
      <Row label={t('estr_fld_rotation')} htmlFor="col-rot"><NumField id="col-rot" value={first.rotation} mixed={mixed('rotation')} quantity="angle" onCommit={(v) => apply({ rotation: v })} /></Row>
      {todosArq && <HospedeiroRow levelId={first.levelId} value={first.hostWallId} mixed={mixed('hostWallId')} idBase="col" onChange={(id) => apply({ hostWallId: id })} />}
      <MarcaEComentarios els={columns} idBase="col" onMark={(v) => apply({ mark: v })} onComments={(v) => apply({ comments: v })} />
      <LeiturasEstr ids={ids} />
    </div>
  );
}
