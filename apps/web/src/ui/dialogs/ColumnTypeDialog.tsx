import type { ReactElement } from 'react';
import { type ColumnType, type DisciplinaPilar } from '@hestia/model';
import { FamilyRow, FamilySection, FamilyTypeDialog } from './familia/index.ts';
import { CamadasSection, IdentidadeSection, MaterialRow, mesclarIdentidade } from './EstrTypeParts.tsx';
import { useEstrTypeDraft } from './estrTypeDraft.ts';
import { PerfilEditor } from './PerfilEditor.tsx';

/**
 * Editor de tipo de pilar (arquitetônico e estrutural; ficha U1, A.6): perfil (as 9 formas, com preset do catálogo e
 * prévia do kernel), material, camadas de acabamento (só arquitetônico) e identidade. A validação é a do modelo
 * (`columnTypeIssue`); o OK só grava se ela passar.
 */
export function ColumnTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const d = useEstrTypeDraft<ColumnType>('column', typeId, 'columnType');
  const { t, draft, set, issue, erro } = d;
  if (!draft) return null;
  const arq = draft.disciplina === 'arquitetonico';
  const trocaDisciplina = (v: DisciplinaPilar): void => {
    const { camadas: _fora, ...resto } = draft;
    d.setDraft(v === 'arquitetonico' ? { ...draft, disciplina: v } : { ...resto, disciplina: v });
  };
  return (
    <FamilyTypeDialog
      title={t('estr_dlg_column_type')}
      sub={`${draft.name} · ${t(d.usage === 1 ? 'estr_usage_one' : 'estr_usage_many', { n: d.usage })}`}
      onClose={d.close}
      size="fam"
      family={t(arq ? 'estr_fam_column_arq' : 'estr_fam_column_est')}
      types={d.types}
      currentId={draft.id}
      onDuplicate={d.duplicate}
      name={{ id: 'pil-t-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{ onDelete: d.remove, deleteDisabled: d.deleteBlock !== null, deleteTitle: d.deleteBlock ?? undefined, onApply: () => d.save(false), onOk: () => d.save(true), saveDisabled: issue !== null, saveTitle: issue ?? undefined }}
    >
      {(issue || erro) && <div className="vr-error" role="alert">{erro ?? issue}</div>}
      <FamilySection title={t('estr_sec_profile')}>
        <FamilyRow label={t('estr_f_discipline')} htmlFor="pil-t-disc" title={d.usage > 0 ? t('estr_tt_discipline_locked') : undefined}>
          <select id="pil-t-disc" className="select" value={draft.disciplina} disabled={d.usage > 0} onChange={(e) => trocaDisciplina(e.target.value as DisciplinaPilar)}>
            <option value="arquitetonico">{t('estr_disc_arquitetonico')}</option>
            <option value="estrutural">{t('estr_disc_estrutural')}</option>
          </select>
        </FamilyRow>
        <PerfilEditor perfil={draft.perfil} onChange={(perfil) => set({ perfil })} idBase="pil-t-perfil" />
      </FamilySection>
      <FamilySection title={t('estr_sec_material')}>
        <MaterialRow id="pil-t-mat" label={t('estr_f_material')} value={draft.materialId} materials={d.p.materials} onChange={(v) => set({ materialId: v })} />
      </FamilySection>
      {arq && <CamadasSection camadas={draft.camadas ?? []} materials={d.p.materials} onChange={(camadas) => set({ camadas })} />}
      <IdentidadeSection idBase="pil-t" value={draft} onChange={(patch) => d.setDraft(mesclarIdentidade(draft, patch))} />
    </FamilyTypeDialog>
  );
}
