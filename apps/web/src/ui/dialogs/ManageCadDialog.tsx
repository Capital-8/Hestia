import type { ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cadBoxOf, cadDrawingsOf, cadLevelName, frameCad, removeCad, renameCad, selectCad, setCadVisible } from '../../editor/cadActions.ts';
import { useT } from '../../editor/i18n.ts';
import { Dialog } from './Dialog.tsx';
import { TextField } from '../fields.tsx';

/**
 * Diálogo "CAD importado": lista os desenhos DXF do projeto com nível, visibilidade, conteúdo e ações (selecionar,
 * enquadrar, renomear e excluir). É o gerenciador das importações: a aba Inserir abre por aqui, e o Navegador de projeto
 * repete as mesmas ações no nó "CAD importado".
 */
export function ManageCadDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const cads = cadDrawingsOf(p);
  const close = (): void => useUi.setState({ dialog: null });
  return (
    <Dialog
      title={t('dlc_cad_manager')}
      sub={t('dlc_cad_manager_sub')}
      onClose={close}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('dlc_btn_close')}</button>
          <button className="btn primary" onClick={() => useUi.setState({ dialog: 'importCad', dialogArg: null })}>
            {t('dlc_import_dxf')}
          </button>
        </>
      }
    >
      {cads.length === 0 ? (
        <p role="status" style={{ margin: 0, opacity: 0.8 }}>
          {t('dlc_cad_empty_pre')}<b>{t('dlc_import_dxf')}</b>{t('dlc_cad_empty_post')}
        </p>
      ) : (
        <div className="table-scroll">
        <table className="kbtable">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{t('col_name')}</th>
              <th style={{ textAlign: 'left' }}>{t('col_level')}</th>
              <th>{t('dlc_col_visible')}</th>
              <th style={{ textAlign: 'left' }}>{t('dlc_col_content')}</th>
              <th style={{ textAlign: 'right' }}>{t('dlc_col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {cads.map((c) => {
              const box = cadBoxOf(c);
              return (
                <tr key={c.id}>
                  <td style={{ minWidth: 180 }}>
                    <TextField
                      id={`cad-manage-name-${c.id}`}
                      value={c.name}
                      onCommit={(v) => renameCad(c, v)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{cadLevelName(p, c)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label={t('dlc_aria_cad_visible', { name: c.name })}
                      checked={c.visible !== false}
                      onChange={(e) => setCadVisible(c, e.target.checked)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--fg-soft)' }}>
                    {t('dlc_cad_content', { layers: c.layers.length, paths: c.paths.length, texts: c.texts.length })}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn small" onClick={() => selectCad(c)} title={t('dlc_tip_cad_select')}>{t('dlc_btn_select')}</button>{' '}
                    <button
                      className="btn small"
                      onClick={() => {
                        selectCad(c);
                        frameCad(c);
                      }}
                      disabled={!box}
                      title={t('dlc_tip_cad_frame')}
                    >
                      {t('dlc_btn_zoom_fit')}
                    </button>{' '}
                    <button className="btn small" onClick={() => removeCad(c)} title={t('dlc_tip_cad_delete')}>{t('dlc_btn_delete')}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {cads.length > 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--fg-soft)' }}>
          {t('dlc_cad_snap_hint')}
        </p>
      ) : null}
    </Dialog>
  );
}
