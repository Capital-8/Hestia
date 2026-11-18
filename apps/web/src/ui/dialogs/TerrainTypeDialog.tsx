import { useState, type ReactElement } from 'react';
import {
  defaultTerrainTypeIdOf,
  defaultTerrainTextFamilyIdOf,
  TERRAIN_TYPE_LIMITES,
  TERRENO_LIMITES,
  terrainTextFamiliesOf,
  terrainTypeIssue,
  terrainTypesOf,
  type TerrainTextFamily,
  type TerrainType,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { FamilyCheck, FamilyRow, FamilySection, FamilyTypeDialog } from './familia/index.ts';
import { TextoFields } from './TerrainLotFamilyDialogs.tsx';
import { NumField, TextField } from '../fields.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const uid = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Cor com "padrão" (volta a ausência da cor). */
function CorOpcional({ id, value, padrao, onChange }: { id: string; value: string | undefined; padrao: string; onChange: (c: string | undefined) => void }): ReactElement {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input id={id} type="color" value={value ?? padrao} onChange={(e) => onChange(e.target.value)} />
      {value ? <button type="button" className="btn small" onClick={() => onChange(undefined)}>{t('ui_tn_p_cor_padrao')}</button> : null}
    </div>
  );
}

/** Material do projeto opcional (select). */
function MaterialOpcional({ id, value, onChange }: { id: string; value: string | undefined; onChange: (v: string | undefined) => void }): ReactElement {
  const { t } = useT();
  const p = useProject();
  return (
    <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
      <option value="">{t('ui_tn_p_nenhum')}</option>
      {Object.values(p.materials).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

/**
 * "Editar tipo" do terreno: todas as configurações do terreno que não são geometria. Superfície e solo (material ou cor), curvas de nível
 * (equidistância, mestra, cor, pesos), rótulo (família do texto, editada aqui mesmo: fonte, altura, unidade, casas, cor, prefixo) e o rótulo
 * automático das curvas. Aplicar grava os tipos e as famílias de rótulo alteradas num passo só de desfazer.
 */
export function TerrainTypeDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultTerrainTypeIdOf(p.settings);
  const [list, setList] = useState<TerrainType[]>(() => terrainTypesOf(p.settings).map((x) => ({ ...x })));
  const [fams, setFams] = useState<TerrainTextFamily[]>(() => terrainTextFamiliesOf(p.settings, 'contour').map((x) => ({ ...x })));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<TerrainType>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const famId = draft.rotuloFamilyId && fams.some((f) => f.id === draft.rotuloFamilyId) ? draft.rotuloFamilyId : defaultTerrainTextFamilyIdOf(p.settings, 'contour');
  const fam = fams.find((f) => f.id === famId) ?? fams[0]!;
  const patchFam = (k: Partial<TerrainTextFamily>): void => setFams((xs) => xs.map((x) => (x.id === fam.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: TerrainType = { ...draft, id: uid('tntype'), name: `${draft.name} ${t('ui_fam_copy')}` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (list.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next[0]!.id);
  };
  const apply = (): void => {
    try {
      editor.store.transaction(t('ui_tn_tipo_undo'), () => {
        for (const f of fams) editor.store.exec({ type: 'upsertTerrainTextFamily', family: f });
        for (const x of list) editor.store.exec({ type: 'upsertTerrainType', tipo: x });
        for (const g of terrainTypesOf(p.settings).filter((o) => !list.some((x) => x.id === o.id))) editor.store.exec({ type: 'removeTerrainType', id: g.id });
        editor.store.exec({ type: 'setSettings', patch: { defaultTerrainTypeId: draft.id } });
      });
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'shr_status_op_rejected' } });
    }
  };
  const invalido = list.some((x) => terrainTypeIssue(x) !== null);
  return (
    <FamilyTypeDialog
      title={t('ui_tn_tipo_titulo')}
      onClose={close}
      onSubmit={() => { if (!invalido) { apply(); close(); } }}
      size="mid"
      family={t('ui_tn_tipo_familia')}
      types={list}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'tt-tipo-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: list.length <= 1, onApply: apply, onOk: () => { apply(); close(); }, saveDisabled: invalido }}
    >
      <FamilySection title={t('ui_tn_tipo_superficie')}>
        <FamilyRow label={t('ui_tn_p_material')} htmlFor="tt-sup-mat"><MaterialOpcional id="tt-sup-mat" value={draft.superficieMaterialId} onChange={(v) => patch({ superficieMaterialId: v })} /></FamilyRow>
        <FamilyRow label={t('pra_fld_color')} htmlFor="tt-sup-cor"><CorOpcional id="tt-sup-cor" value={draft.superficieColor} padrao="#7f9f5c" onChange={(c) => patch({ superficieColor: c })} /></FamilyRow>
      </FamilySection>
      <FamilySection title={t('ui_tn_tipo_solo')}>
        <FamilyRow label={t('ui_tn_p_material')} htmlFor="tt-solo-mat"><MaterialOpcional id="tt-solo-mat" value={draft.soloMaterialId} onChange={(v) => patch({ soloMaterialId: v })} /></FamilyRow>
        <FamilyRow label={t('pra_fld_color')} htmlFor="tt-solo-cor" title={t('ui_tn_tipo_solo_dica')}><CorOpcional id="tt-solo-cor" value={draft.soloColor} padrao="#8b6b4a" onChange={(c) => patch({ soloColor: c })} /></FamilyRow>
      </FamilySection>
      <FamilySection title={t('ui_tn_g_curvas')}>
        <FamilyRow label={t('ui_tn_p_intervalo')} htmlFor="tt-intervalo"><NumField id="tt-intervalo" quantity="length" min={TERRENO_LIMITES.intervaloMin} value={draft.intervaloCurvas} onCommit={(v) => patch({ intervaloCurvas: v })} /></FamilyRow>
        <FamilyRow label={t('ui_tn_p_mestra')} htmlFor="tt-mestra"><NumField id="tt-mestra" decimals={0} min={1} max={TERRENO_LIMITES.mestraMax} value={draft.mestraCada} onCommit={(v) => patch({ mestraCada: Math.round(v) })} /></FamilyRow>
        <FamilyRow label={t('ui_tn_tipo_curva_cor')} htmlFor="tt-curva-cor"><CorOpcional id="tt-curva-cor" value={draft.curvaCor} padrao="#8a6a3a" onChange={(c) => patch({ curvaCor: c })} /></FamilyRow>
        <FamilyRow label={t('ui_tn_tipo_curva_peso')} htmlFor="tt-curva-peso"><NumField id="tt-curva-peso" decimals={2} min={TERRAIN_TYPE_LIMITES.pesoMin} max={TERRAIN_TYPE_LIMITES.pesoMax} value={draft.curvaPeso} onCommit={(v) => patch({ curvaPeso: v })} /></FamilyRow>
        <FamilyRow label={t('ui_tn_tipo_mestra_peso')} htmlFor="tt-mestra-peso"><NumField id="tt-mestra-peso" decimals={2} min={TERRAIN_TYPE_LIMITES.pesoMin} max={TERRAIN_TYPE_LIMITES.pesoMax} value={draft.mestraPeso} onCommit={(v) => patch({ mestraPeso: v })} /></FamilyRow>
      </FamilySection>
      <FamilySection title={t('ui_tn_tipo_rotulos')}>
        <FamilyCheck id="tt-rotular" checked={draft.rotularCurvas} onChange={(v) => patch({ rotularCurvas: v })}>{t('ui_tn_tipo_rotular')}</FamilyCheck>
        <FamilyRow label={t('ui_tn_tipo_rotular_cada')} htmlFor="tt-rotular-cada" dim={!draft.rotularCurvas}><NumField id="tt-rotular-cada" decimals={0} min={1} max={TERRENO_LIMITES.mestraMax} value={draft.rotularCada} onCommit={(v) => patch({ rotularCada: Math.round(v) })} /></FamilyRow>
        <FamilyRow label={t('ui_fam_family_contour')} htmlFor="tt-fam">
          <select id="tt-fam" className="select" value={famId} onChange={(e) => patch({ rotuloFamilyId: e.target.value })}>
            {fams.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </FamilyRow>
        <FamilyRow label={t('ui_tn_tipo_fam_nome')} htmlFor="tt-fam-nome"><TextField id="tt-fam-nome" value={fam.name} onCommit={(v) => v.trim() !== '' && patchFam({ name: v.trim() })} /></FamilyRow>
        <TextoFields pre="tt-rot" value={fam} color={fam.color} onColor={(c) => patchFam({ color: c })} patch={patchFam} />
        <FamilyRow label={t('ui_fam_prefix')} htmlFor="tt-rot-pre"><TextField id="tt-rot-pre" value={fam.prefix} onCommit={(v) => patchFam({ prefix: v })} /></FamilyRow>
      </FamilySection>
    </FamilyTypeDialog>
  );
}
