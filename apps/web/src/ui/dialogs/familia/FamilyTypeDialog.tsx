import type { ReactElement, ReactNode } from 'react';
import { useT } from '../../../editor/i18n.ts';
import { TextField } from '../../fields.tsx';
import { Dialog } from '../Dialog.tsx';
import { TypeDialogHeader } from '../TypeDialogHeader.tsx';

interface NameField {
  id: string;
  value: string;
  onCommit: (v: string) => void;
  /** Mensagem de erro do nome (mostrada logo abaixo do campo). */
  error?: string;
  autofocus?: boolean;
}

interface FooterConfig {
  onDelete: () => void;
  deleteDisabled?: boolean;
  deleteTitle?: string;
  onApply: () => void;
  onOk: () => void;
  /** Desliga Aplicar e OK (rascunho com erro). */
  saveDisabled?: boolean;
  /** Dica dos botões Aplicar e OK quando desligados. */
  saveTitle?: string;
  /** Itens extras logo depois do Excluir (ex.: motivo do bloqueio). */
  afterDelete?: ReactNode;
  /** Itens extras antes de Cancelar (ex.: contagem de erros). */
  beforeCancel?: ReactNode;
  /** Itens extras no fim do rodapé (ex.: dica de atalhos). */
  end?: ReactNode;
}

interface FamilyTypeDialogProps {
  title: string;
  sub?: string;
  onClose: () => void;
  /** Ctrl+Enter. */
  onSubmit?: () => void;
  size?: '' | 'narrow' | 'mid' | 'wide' | 'fam';
  /** Cabeçalho Família/Tipo: igual em todos os diálogos de tipo. */
  family: string;
  types: ReadonlyArray<{ id: string; name: string }>;
  currentId: string;
  onDuplicate: () => void;
  onSelectType?: (id: string) => void;
  name: NameField;
  footer: FooterConfig;
  children: ReactNode;
}

/**
 * Esqueleto comum de todo diálogo "Editar tipo" de família (o da parede é a referência): cabeçalho Família/Tipo
 * (Duplicar e Renomear), campo Nome do tipo na mesma linha do rótulo e rodapé Excluir | Cancelar, Aplicar, OK.
 * O conteúdo (abas, seções, linhas) vem de `children`, montado com FamilyTabs, FamilySection e FamilyRow.
 */
export function FamilyTypeDialog({ title, sub, onClose, onSubmit, size, family, types, currentId, onDuplicate, onSelectType, name, footer, children }: FamilyTypeDialogProps): ReactElement {
  const { t } = useT();
  const errId = `${name.id}-err`;
  return (
    <Dialog
      title={title}
      sub={sub}
      onClose={onClose}
      onSubmit={onSubmit}
      size={size}
      footer={
        <>
          <button className="btn danger" disabled={footer.deleteDisabled} title={footer.deleteTitle ?? t('dlt_tt_delete_type')} onClick={footer.onDelete}>{t('stt_delete')}</button>
          {footer.afterDelete}
          <span style={{ flex: 1 }} />
          {footer.beforeCancel}
          <button className="btn" onClick={onClose}>{t('stt_cancel')}</button>
          <button className="btn" onClick={footer.onApply} disabled={footer.saveDisabled} aria-disabled={footer.saveDisabled} title={footer.saveTitle}>{t('stt_apply')}</button>
          <button className="btn primary" onClick={footer.onOk} disabled={footer.saveDisabled} aria-disabled={footer.saveDisabled} title={footer.saveTitle}>{t('stt_ok')}</button>
          {footer.end}
        </>
      }
    >
      <TypeDialogHeader family={family} types={types} currentId={currentId} nameFieldId={name.id} onDuplicate={onDuplicate} onSelect={onSelectType} />
      <div className="field-row">
        <label htmlFor={name.id}>{t('stt_f_name')}</label>
        <TextField id={name.id} value={name.value} onCommit={name.onCommit} invalid={Boolean(name.error)} describedBy={name.error ? errId : undefined} dataAutofocus={name.autofocus} />
      </div>
      {name.error ? <div className="vr-error" id={errId}>{name.error}</div> : null}
      {children}
    </Dialog>
  );
}
