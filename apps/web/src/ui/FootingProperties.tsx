import type { ReactElement } from 'react';
import { footingTypesOf, type Footing } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { aplicarEstr, HospedeiroRow, LeiturasEstr, MarcaEComentarios } from './EstrPropsCommon.tsx';
import { LevelField } from './LevelField.tsx';
import { NumField, Row } from './fields.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { estrOptions } from './typeOptions.ts';

type Patch = Partial<Omit<Footing, 'id' | 'kind' | 'order'>>;

/**
 * Propriedades da fundação (isolada, corrida ou estaca; ficha U1, A.6): tipo (só os do mesmo modo), nível, cota do topo,
 * rotação (isolada), parede hospedeira (corrida), marca e comentários, e as quantidades do kernel. Cada edição vale para
 * todos os selecionados, num passo de desfazer.
 */
export function FootingProperties({ footings }: { footings: Footing[] }): ReactElement {
  const p = useProject();
  const { t } = useT();
  const tipos = footingTypesOf(p);
  const first = footings[0]!;
  const ids = footings.map((f) => f.id);
  const tipoMisto = new Set(footings.map((f) => f.typeId)).size > 1;
  const modo = tipos[first.typeId]?.modo;
  const todasIsoladas = footings.every((f) => f.pos !== undefined);
  const todasCorridas = footings.every((f) => f.a !== undefined);
  const mixed = <K extends keyof Footing>(k: K): boolean => footings.some((f) => f[k] !== first[k]);
  const apply = (patch: Patch): void => aplicarEstr(ids, t('estr_undo_edit_footing'), (id) => ({ type: 'updateFooting', id, patch }));
  return (
    <div className="props-estr">
      <TypeSelector
        triggerId="prop-footingtype"
        label={t('estr_type_footing')}
        categoryLabel={`${t('cvn_cat_footings')} (${footings.length})`}
        options={estrOptions(Object.values(tipos).filter((tp) => modo === undefined || tp.modo === modo), () => t('estr_fam_footing'))}
        selectedId={tipoMisto ? null : first.typeId}
        editDisabled={tipoMisto}
        onSelect={(id) => aplicarEstr(ids, t('estr_undo_type_footing'), () => ({ type: 'setFootingType', ids, typeId: id }))}
        onEdit={() => useUi.setState({ dialog: 'footingType', dialogArg: first.typeId })}
      />
      <LevelField ids={ids} />
      <Row label={t('estr_fld_footing_top')} htmlFor="fun-top"><NumField id="fun-top" value={first.topOffset} mixed={mixed('topOffset')} quantity="length" onCommit={(v) => apply({ topOffset: v })} /></Row>
      {todasIsoladas && <Row label={t('estr_fld_rotation')} htmlFor="fun-rot"><NumField id="fun-rot" value={first.rotation} mixed={mixed('rotation')} quantity="angle" onCommit={(v) => apply({ rotation: v })} /></Row>}
      {todasCorridas && <HospedeiroRow levelId={first.levelId} value={first.hostWallId} mixed={mixed('hostWallId')} idBase="fun" onChange={(id) => apply({ hostWallId: id })} />}
      <MarcaEComentarios els={footings} idBase="fun" onMark={(v) => apply({ mark: v })} onComments={(v) => apply({ comments: v })} />
      <LeiturasEstr ids={ids} />
    </div>
  );
}
