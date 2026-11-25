import { useState, type ReactElement } from 'react';
import { PEN_SETS, type UserPenSet } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { applyPenSet, deleteUserPenSet, renameUserPenSet, saveCurrentAsPenSet } from '../../editor/penSetActions.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type Dict } from '../../editor/i18n.ts';
import { Dialog } from './Dialog.tsx';
import { conjuntosDoUsuario, emUso, nomeValido, paredeCortada } from './penSetsLogic.ts';

/**
 * Conjuntos de penas prontos (estilo de prancha, regra 5): lista os pacotes embutidos com amostra da espessura de corte
 * da parede em 1:100 e, abaixo, os conjuntos do usuário (salvar o ajuste atual, aplicar, renomear e excluir). Aplicar
 * copia os valores para o projeto num passo de desfazer; a janela continua aberta e "Em uso" acompanha o projeto.
 */
export function PenSetsDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const atual = emUso(p);
  const doUsuario = conjuntosDoUsuario(p);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [newName, setNewName] = useState('');
  const fecharAgora = (): void => useUi.setState({ dialog: null, dialogArg: null });
  // Esc e o ✕ cancelam a renomeação em curso antes de fechar a janela.
  const close = (): void => {
    if (renaming !== null) {
      setRenaming(null);
      return;
    }
    fecharAgora();
  };
  const aplicar = (id: string): void => setError(applyPenSet(editor.store, id).error);
  const iniciarRenomear = (set: UserPenSet): void => {
    setRenaming(set.id);
    setRenameName(set.name);
  };
  const confirmarRenomear = (id: string): void => {
    const r = renameUserPenSet(editor.store, id, renameName);
    setError(r.error);
    if (r.ok) setRenaming(null);
  };
  const excluir = (set: UserPenSet): void => {
    if (!window.confirm(t('pens_dlg_delete_confirm', { name: set.name }))) return;
    setError(deleteUserPenSet(editor.store, set.id).error);
  };
  const salvar = (): void => {
    const r = saveCurrentAsPenSet(editor.store, newName);
    setError(r.error);
    if (r.ok) setNewName('');
  };
  const cartaoDoUsuario = (set: UserPenSet): ReactElement => (
    <div
      key={set.id}
      style={{
        border: `1px solid ${atual === set.id ? 'var(--accent)' : 'var(--line-strong)'}`,
        borderRadius: 4,
        padding: '8px 10px',
        background: atual === set.id ? 'var(--accent-soft)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {renaming === set.id ? (
          <>
            <input
              className="input"
              aria-label={t('pens_dlg_rename')}
              value={renameName}
              autoFocus
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (nomeValido(renameName)) confirmarRenomear(set.id);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setRenaming(null);
                }
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" disabled={!nomeValido(renameName)} onClick={() => confirmarRenomear(set.id)}>{t('pens_dlg_rename_ok')}</button>
            <button className="btn" onClick={() => setRenaming(null)}>{t('pens_dlg_cancel')}</button>
          </>
        ) : (
          <>
            <strong>{set.name}</strong>
            {atual === set.id ? <span className="badge">{t('pens_dlg_in_use')}</span> : null}
            <span style={{ flex: 1 }} />
            <button className="btn primary" onClick={() => aplicar(set.id)}>{t('pens_dlg_apply')}</button>
            <button className="btn" onClick={() => iniciarRenomear(set)}>{t('pens_dlg_rename')}</button>
            <button className="btn" onClick={() => excluir(set)}>{t('pens_dlg_delete')}</button>
          </>
        )}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12 }}>{t('pens_dlg_wall_cut', { value: paredeCortada(set, 100, lang) })}</p>
    </div>
  );
  return (
    <Dialog
      title={t('pens_dlg_title')}
      onClose={close}
      size="mid"
      footer={
        <>
          <button className="btn" onClick={() => useUi.setState({ dialog: 'lineWeights', dialogArg: null })}>{t('pens_dlg_edit_weights')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={fecharAgora}>{t('pens_dlg_close')}</button>
        </>
      }
    >
      {atual === null ? <div style={{ margin: '0 0 8px' }}><span className="badge">{t('pens_dlg_custom')}</span></div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PEN_SETS.map((set) => (
          <div
            key={set.id}
            style={{
              border: `1px solid ${atual === set.id ? 'var(--accent)' : 'var(--line-strong)'}`,
              borderRadius: 4,
              padding: '8px 10px',
              background: atual === set.id ? 'var(--accent-soft)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <strong>{t(set.nameKey as keyof Dict)}</strong>
              {atual === set.id ? <span className="badge">{t('pens_dlg_in_use')}</span> : null}
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => aplicar(set.id)}>{t('pens_dlg_apply')}</button>
            </div>
            <p className="hint" style={{ margin: '4px 0' }}>{t(set.descKey as keyof Dict)}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>{t('pens_dlg_wall_cut', { value: paredeCortada(set, 100, lang) })}</p>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 12, margin: '12px 0 6px' }}>{t('pens_dlg_mine')}</h3>
      {doUsuario.length === 0 ? <p className="hint" style={{ margin: '0 0 8px' }}>{t('pens_dlg_mine_empty')}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {doUsuario.map(cartaoDoUsuario)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          className="input"
          aria-label={t('pens_dlg_name_placeholder')}
          placeholder={t('pens_dlg_name_placeholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nomeValido(newName)) {
              e.preventDefault();
              salvar();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn" disabled={!nomeValido(newName)} onClick={salvar}>{t('pens_dlg_save_current')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog>
  );
}
