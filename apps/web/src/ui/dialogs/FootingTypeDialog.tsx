import type { ReactElement } from 'react';
import { FORMAS_DE_FUNDACAO, type FootingForma, type FootingModo, type FootingType } from '@hestia/model';
import { FamilyCheck, FamilyRow, FamilySection, FamilyTypeDialog } from './familia/index.ts';
import { IdentidadeSection, MaterialRow, mesclarIdentidade } from './EstrTypeParts.tsx';
import { useEstrTypeDraft } from './estrTypeDraft.ts';
import { PerfilEditor } from './PerfilEditor.tsx';
import { ESTACA, ISOLADA, formasDaBase, perfilParaForma } from './perfilForm.ts';
import { NumField } from '../fields.tsx';

const FORMA_KEY = { sapata: 'estr_ft_sapata', bloco: 'estr_ft_bloco', estaca: 'estr_ft_estaca' } as const satisfies Record<FootingForma, string>;
const PESCOCO_PADRAO = { forma: 'retangular', b: 0.25, h: 0.25 } as const;

/** Troca o modo mantendo o tipo válido: a corrida é sempre sapata de base retangular e sem pescoço. */
function comModo(tp: FootingType, modo: FootingModo): FootingType {
  if (modo === 'isolada') return { ...tp, modo };
  const { pescoco: _p, alturaPescoco: _a, ...resto } = tp;
  return { ...resto, modo, forma: 'sapata', base: perfilParaForma(tp.base, 'retangular') };
}

/** Troca a forma mantendo o tipo válido: estaca tem base circular ou tubo e não tem pescoço. */
function comForma(tp: FootingType, forma: FootingForma): FootingType {
  if (forma !== 'estaca') return { ...tp, forma };
  const { pescoco: _p, alturaPescoco: _a, ...resto } = tp;
  return { ...resto, forma, base: ESTACA.includes(tp.base.forma) ? tp.base : perfilParaForma(tp.base, 'circular') };
}

/**
 * Editor de tipo de fundação (isolada, corrida ou estaca; ficha U1, A.6): fundação (modo, forma, alturas, pescoço),
 * base e pescoço (perfis com preset e prévia do kernel), material e identidade.
 */
export function FootingTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const d = useEstrTypeDraft<FootingType>('footing', typeId, 'footingType');
  const { t, draft, set, issue, erro } = d;
  if (!draft) return null;
  const estaca = draft.forma === 'estaca';
  const podePescoco = draft.modo === 'isolada' && !estaca;
  const temPescoco = draft.pescoco !== undefined;
  const ligaPescoco = (on: boolean): void => {
    if (on) set({ pescoco: structuredClone(PESCOCO_PADRAO), alturaPescoco: 0.5 });
    else {
      const { pescoco: _p, alturaPescoco: _a, ...resto } = draft;
      d.setDraft(resto);
    }
  };
  return (
    <FamilyTypeDialog
      title={t('estr_dlg_footing_type')}
      sub={`${draft.name} · ${t(d.usage === 1 ? 'estr_usage_one' : 'estr_usage_many', { n: d.usage })}`}
      onClose={d.close}
      size="fam"
      family={t('estr_fam_footing')}
      types={d.types}
      currentId={draft.id}
      onDuplicate={d.duplicate}
      name={{ id: 'fun-t-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{ onDelete: d.remove, deleteDisabled: d.deleteBlock !== null, deleteTitle: d.deleteBlock ?? undefined, onApply: () => d.save(false), onOk: () => d.save(true), saveDisabled: issue !== null, saveTitle: issue ?? undefined }}
    >
      {(issue || erro) && <div className="vr-error" role="alert">{erro ?? issue}</div>}
      <FamilySection title={t('estr_sec_foundation')}>
        <FamilyRow label={t('estr_f_mode')} htmlFor="fun-t-modo" title={d.usage > 0 ? t('estr_tt_mode_locked') : undefined}>
          <select id="fun-t-modo" className="select" value={draft.modo} disabled={d.usage > 0} onChange={(e) => d.setDraft(comModo(draft, e.target.value as FootingModo))}>
            <option value="isolada">{t('estr_mode_isolada')}</option>
            <option value="corrida">{t('estr_mode_corrida')}</option>
          </select>
        </FamilyRow>
        <FamilyRow label={t('estr_f_form')} htmlFor="fun-t-forma">
          <select id="fun-t-forma" className="select" value={draft.forma} disabled={draft.modo === 'corrida'} onChange={(e) => d.setDraft(comForma(draft, e.target.value as FootingForma))}>
            {FORMAS_DE_FUNDACAO.map((f) => <option key={f} value={f}>{t(FORMA_KEY[f])}</option>)}
          </select>
        </FamilyRow>
        <FamilyRow label={t(estaca ? 'estr_f_pile_length' : 'estr_f_base_height')} htmlFor="fun-t-hb">
          <NumField id="fun-t-hb" value={draft.alturaBase} quantity="smallLength" min={0.001} onCommit={(v) => set({ alturaBase: v })} />
        </FamilyRow>
        {podePescoco && <FamilyCheck id="fun-t-pescoco" checked={temPescoco} onChange={ligaPescoco}>{t('estr_f_neck_enabled')}</FamilyCheck>}
        {podePescoco && temPescoco && (
          <FamilyRow label={t('estr_f_neck_height')} htmlFor="fun-t-hp">
            <NumField id="fun-t-hp" value={draft.alturaPescoco ?? 0.5} quantity="smallLength" min={0.001} onCommit={(v) => set({ alturaPescoco: v })} />
          </FamilyRow>
        )}
      </FamilySection>
      <FamilySection title={t(estaca ? 'estr_sec_pile' : 'estr_sec_base')}>
        <PerfilEditor perfil={draft.base} formas={formasDaBase(draft)} onChange={(base) => set({ base })} idBase="fun-t-base" />
      </FamilySection>
      {podePescoco && draft.pescoco && (
        <FamilySection title={t('estr_sec_neck')}>
          <PerfilEditor perfil={draft.pescoco} formas={ISOLADA} onChange={(pescoco) => set({ pescoco })} idBase="fun-t-pescoco-perfil" />
        </FamilySection>
      )}
      <FamilySection title={t('estr_sec_material')}>
        <MaterialRow id="fun-t-mat" label={t('estr_f_material')} value={draft.materialId} materials={d.p.materials} onChange={(v) => set({ materialId: v })} />
      </FamilySection>
      <IdentidadeSection idBase="fun-t" value={draft} onChange={(patch) => d.setDraft(mesclarIdentidade(draft, patch))} />
    </FamilyTypeDialog>
  );
}
