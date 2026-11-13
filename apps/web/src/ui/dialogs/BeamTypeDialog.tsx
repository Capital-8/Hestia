import type { ReactElement } from 'react';
import type { BeamType } from '@hestia/model';
import { FamilySection, FamilyTypeDialog } from './familia/index.ts';
import { IdentidadeSection, MaterialRow, mesclarIdentidade } from './EstrTypeParts.tsx';
import { useEstrTypeDraft } from './estrTypeDraft.ts';
import { PerfilEditor } from './PerfilEditor.tsx';

/** Editor de tipo de viga (ficha U1, A.6): perfil (as 9 formas, preset do catálogo e prévia do kernel), material e identidade. */
export function BeamTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const d = useEstrTypeDraft<BeamType>('beam', typeId, 'beamType');
  const { t, draft, set, issue, erro } = d;
  if (!draft) return null;
  return (
    <FamilyTypeDialog
      title={t('estr_dlg_beam_type')}
      sub={`${draft.name} · ${t(d.usage === 1 ? 'estr_usage_one' : 'estr_usage_many', { n: d.usage })}`}
      onClose={d.close}
      size="fam"
      family={t('estr_fam_beam')}
      types={d.types}
      currentId={draft.id}
      onDuplicate={d.duplicate}
      name={{ id: 'vig-t-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{ onDelete: d.remove, deleteDisabled: d.deleteBlock !== null, deleteTitle: d.deleteBlock ?? undefined, onApply: () => d.save(false), onOk: () => d.save(true), saveDisabled: issue !== null, saveTitle: issue ?? undefined }}
    >
      {(issue || erro) && <div className="vr-error" role="alert">{erro ?? issue}</div>}
      <FamilySection title={t('estr_sec_profile')}>
        <PerfilEditor perfil={draft.perfil} onChange={(perfil) => set({ perfil })} idBase="vig-t-perfil" />
      </FamilySection>
      <FamilySection title={t('estr_sec_material')}>
        <MaterialRow id="vig-t-mat" label={t('estr_f_material')} value={draft.materialId} materials={d.p.materials} onChange={(v) => set({ materialId: v })} />
      </FamilySection>
      <IdentidadeSection idBase="vig-t" value={draft} onChange={(patch) => d.setDraft(mesclarIdentidade(draft, patch))} />
    </FamilyTypeDialog>
  );
}
