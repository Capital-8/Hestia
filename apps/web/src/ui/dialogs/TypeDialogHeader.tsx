import type { ReactElement } from 'react';
import { useUi } from '../../editor/state.ts';

interface TypeDialogHeaderProps {
  /** Família do tipo editado (só leitura). */
  family: string;
  /** Tipos do mesmo elemento: a troca de tipo no topo muda o tipo editado, como no Revit. */
  types: ReadonlyArray<{ id: string; name: string }>;
  currentId: string;
  /** Campo de nome do diálogo: "Renomear…" leva o foco a ele e seleciona o texto. */
  nameFieldId: string;
  /** Duplica o tipo editado (a mesma ação que estava no rodapé). */
  onDuplicate: () => void;
  /** Troca de tipo; ausente = troca direta (o diálogo pode pedir confirmação se há alterações não salvas). */
  onSelect?: (id: string) => void;
}

/**
 * Cabeçalho do diálogo "Propriedades do tipo" (padrão Revit): família em caixa somente leitura e a escolha do tipo
 * com "Duplicar…" e "Renomear…". Fica no topo de todos os diálogos de tipo.
 */
export function TypeDialogHeader({ family, types, currentId, nameFieldId, onDuplicate, onSelect }: TypeDialogHeaderProps): ReactElement {
  const rename = (): void => {
    const el = document.getElementById(nameFieldId);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  };
  return (
    <div className="tdlg-bar type-head">
      <label>Família:</label>
      <div className="in" title={family}>{family}</div>
      <span />
      <label htmlFor="tdlg-type-pick">Tipo:</label>
      <select id="tdlg-type-pick" className="select" value={currentId} onChange={(e) => (onSelect ? onSelect(e.target.value) : useUi.setState({ dialogArg: e.target.value }))}>
        {types.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <div className="btns">
        <button type="button" className="btn small" onClick={onDuplicate}>Duplicar…</button>
        <button type="button" className="btn small" onClick={rename}>Renomear…</button>
      </div>
    </div>
  );
}
