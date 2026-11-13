import type { ReactElement } from 'react';
import { ALINHAMENTOS_VIGA, EXTREMIDADES_VIGA, beamPlanLength, beamTypesOf, formatQuantity, type Beam, type BeamAlinhamento, type BeamExtremidade } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { aplicarEstr, LeiturasEstr, MarcaEComentarios } from './EstrPropsCommon.tsx';
import { LevelField } from './LevelField.tsx';
import { NumField, Row } from './fields.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { estrOptions } from './typeOptions.ts';
import { useUnits } from './useUnits.ts';

type Patch = Partial<Omit<Beam, 'id' | 'kind' | 'order'>>;

const ALINHAMENTO_KEY = { topo: 'estr_align_top', centro: 'estr_align_center', base: 'estr_align_base' } as const satisfies Record<BeamAlinhamento, string>;
const EXTREMIDADE_KEY = { rigida: 'estr_end_rigid', articulada: 'estr_end_pinned' } as const satisfies Record<BeamExtremidade, string>;

/**
 * Propriedades da viga (ficha U1, A.6): tipo, nível, cotas das duas pontas (`zOffsetA`/`B`), alinhamento do eixo, giro da
 * seção, extremidades (rígida ou articulada, reservado à treliça), comprimento (somente leitura), marca e comentários, e
 * as quantidades do kernel. Cada edição vale para todos os selecionados, num passo de desfazer.
 */
export function BeamProperties({ beams }: { beams: Beam[] }): ReactElement {
  const p = useProject();
  const { t } = useT();
  const units = useUnits();
  const first = beams[0]!;
  const ids = beams.map((b) => b.id);
  const tipoMisto = new Set(beams.map((b) => b.typeId)).size > 1;
  const mixed = <K extends keyof Beam>(k: K): boolean => beams.some((b) => b[k] !== first[k]);
  const apply = (patch: Patch): void => aplicarEstr(ids, t('estr_undo_edit_beam'), (id) => ({ type: 'updateBeam', id, patch }));
  const select = (id: string, valor: string, variado: boolean, opcoes: ReadonlyArray<readonly [string, string]>, on: (v: string) => void): ReactElement => (
    <select id={id} className="select" value={variado ? '' : valor} onChange={(e) => on(e.target.value)}>
      {variado ? <option value="">{t('prc_opt_varied')}</option> : null}
      {opcoes.map(([v, rotulo]) => <option key={v} value={v}>{rotulo}</option>)}
    </select>
  );
  return (
    <div className="props-estr">
      <TypeSelector
        triggerId="prop-beamtype"
        label={t('estr_type_beam')}
        categoryLabel={`${t('cvn_cat_beams')} (${beams.length})`}
        options={estrOptions(Object.values(beamTypesOf(p)), () => t('estr_fam_beam'))}
        selectedId={tipoMisto ? null : first.typeId}
        editDisabled={tipoMisto}
        onSelect={(id) => aplicarEstr(ids, t('estr_undo_type_beam'), () => ({ type: 'setBeamType', ids, typeId: id }))}
        onEdit={() => useUi.setState({ dialog: 'beamType', dialogArg: first.typeId })}
      />
      <LevelField ids={ids} />
      <Row label={t('estr_fld_z_a')} htmlFor="beam-za"><NumField id="beam-za" value={first.zOffsetA} mixed={mixed('zOffsetA')} quantity="length" onCommit={(v) => apply({ zOffsetA: v })} /></Row>
      <Row label={t('estr_fld_z_b')} htmlFor="beam-zb"><NumField id="beam-zb" value={first.zOffsetB} mixed={mixed('zOffsetB')} quantity="length" onCommit={(v) => apply({ zOffsetB: v })} /></Row>
      <Row label={t('estr_fld_alignment')} htmlFor="beam-align">{select('beam-align', first.alinhamento, mixed('alinhamento'), ALINHAMENTOS_VIGA.map((a) => [a, t(ALINHAMENTO_KEY[a])]), (v) => apply({ alinhamento: v as BeamAlinhamento }))}</Row>
      <Row label={t('estr_fld_rotation')} htmlFor="beam-rot"><NumField id="beam-rot" value={first.rotation} mixed={mixed('rotation')} quantity="angle" onCommit={(v) => apply({ rotation: v })} /></Row>
      <Row label={t('estr_fld_end_a')} htmlFor="beam-ea">{select('beam-ea', first.extremidadeA, mixed('extremidadeA'), EXTREMIDADES_VIGA.map((x) => [x, t(EXTREMIDADE_KEY[x])]), (v) => apply({ extremidadeA: v as BeamExtremidade }))}</Row>
      <Row label={t('estr_fld_end_b')} htmlFor="beam-eb">{select('beam-eb', first.extremidadeB, mixed('extremidadeB'), EXTREMIDADES_VIGA.map((x) => [x, t(EXTREMIDADE_KEY[x])]), (v) => apply({ extremidadeB: v as BeamExtremidade }))}</Row>
      <Row label={t('estr_fld_length')} readOnly><span>{beams.length === 1 ? formatQuantity(units, 'length', beamPlanLength(first)) : t('prc_opt_varied')}</span></Row>
      <MarcaEComentarios els={beams} idBase="beam" onMark={(v) => apply({ mark: v })} onComments={(v) => apply({ comments: v })} />
      <LeiturasEstr ids={ids} />
    </div>
  );
}
