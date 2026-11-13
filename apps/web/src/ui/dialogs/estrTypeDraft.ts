// Rascunho de um diálogo de tipo de estrutura (pilar, viga, fundação; ficha U1): cópia do tipo editado, validação do
// modelo, Aplicar/OK, Duplicar e Excluir. Os três diálogos compartilham isto; cada um só monta as suas seções.

import { useState } from 'react';
import { useProject } from '../../editor/controller.ts';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import type { DialogKind } from '../../editor/state.ts';
import { useUi } from '../../editor/state.ts';
import { duplicateEstrType, estrTypeDeleteBlock, estrTypeError, estrTypesOf, estrTypeUsage, tryDeleteEstrType, upsertEstrType, type EstrKind, type TipoEstr } from '../../editor/typeActions.ts';

export function useEstrTypeDraft<T extends TipoEstr>(kind: EstrKind, typeId: string, dialog: DialogKind) {
  const p = useProject();
  const { t } = useT();
  const src = estrTypesOf(p, kind)[typeId] as T | undefined;
  const [draft, setDraft] = useState<T | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [erro, setErro] = useState<string | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(src ? structuredClone(src) : null);
    setErro(null);
  }
  const issue = draft ? estrTypeError(kind, draft) : null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<T>): void => {
    if (draft) setDraft({ ...draft, ...patch });
  };
  const mensagem = (e: unknown): string => (e instanceof Error ? e.message : t('prc_err_unknown'));

  /** Grava o tipo: o OK fecha; o Aplicar deixa o diálogo aberto com o rascunho. */
  const save = (fechar: boolean): void => {
    if (!draft || issue) return;
    try {
      upsertEstrType(editor.store, kind, draft, t('estr_undo_edit_type'));
      setErro(null);
      if (fechar) close();
    } catch (e) {
      setErro(mensagem(e));
    }
  };
  const duplicate = (): void => {
    if (!draft) return;
    try {
      const id = duplicateEstrType(editor.store, kind, draft.id);
      if (id) useUi.setState({ dialog, dialogArg: id });
    } catch (e) {
      setErro(mensagem(e));
    }
  };
  const remove = (): void => {
    if (!draft) return;
    const r = tryDeleteEstrType(editor.store, kind, draft.id);
    if (r.ok) close();
    else setErro(r.error);
  };
  return {
    p,
    t,
    draft,
    setDraft,
    set,
    issue,
    erro,
    close,
    save,
    duplicate,
    remove,
    usage: draft ? estrTypeUsage(p, kind, draft.id) : 0,
    deleteBlock: draft ? estrTypeDeleteBlock(p, kind, draft.id) : null,
    types: Object.values(estrTypesOf(p, kind)),
  };
}
