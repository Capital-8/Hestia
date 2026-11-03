import { useState, type ReactElement } from 'react';
import { COMANDOS_COM_ATALHO, TOOL_GROUPS, type ShortcutCommand } from '@hestia/tools';
import { nomeComandoLang, useT, type Dict } from '../../editor/i18n.ts';
import { makeLevel, newId } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { pinAutoTops } from '../../editor/levelActions.ts';
import { commitLevelElevation } from '../../editor/commitLevelElevation.ts';
import { hasAutosave } from '../../editor/storage.ts';
import { useUi } from '../../editor/state.ts';
import { useAtalhos } from '../../editor/shortcutConfig.ts';
import { NumField, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

// O diálogo do tipo de abertura vive em `openingType/`; o nome antigo continua sendo a porta de entrada do App.
export { OpeningTypeDialog } from './openingType/OpeningTypeDialog.tsx';

export function LevelsDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const arg = useUi((s) => s.dialogArg);
  // Destaque da linha: o nível selecionado no 3D manda; sem ele, vale o `dialogArg` (clique na linha de nível do 3D).
  const destaque = useUi((s) => s.selectedLevel) ?? arg;
  const [err, setErr] = useState('');
  const run = (fn: () => void): void => {
    try {
      fn();
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlm_error'));
    }
  };
  return (
    <Dialog title={t('dlm_levels')} sub={t('dlm_levels_sub')} size="narrow" onClose={close} footer={<button className="btn primary" onClick={close}>{t('dlm_btn_close')}</button>}>
      <table className="layers">
        <thead><tr><th>{t('col_name')}</th><th>{t('dlm_col_elevation')}</th><th /></tr></thead>
        <tbody>
          {p.levels.map((l) => (
            <tr key={l.id} style={l.id === destaque ? { background: 'var(--sel-bg, rgba(0,0,0,0.06))' } : undefined} data-selected={l.id === destaque ? 'true' : undefined}>
              <td><TextField value={l.name} onCommit={(v) => run(() => editor.store.exec({ type: 'upsertLevel', level: { ...l, name: v || l.name } }))} /></td>
              <td><NumField value={l.elevation} quantity="length" onCommit={(v) => run(() => {
                if (!commitLevelElevation(l.id, v)) {
                  const st = useUi.getState().status;
                  throw new Error(typeof st === 'string' ? st : st.key);
                }
              })} /></td>
              <td><button className="btn small danger" onClick={() => run(() => editor.store.exec({ type: 'deleteLevel', id: l.id }))}>{t('dlm_btn_delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {err ? <p className="error" role="alert">{err}</p> : null}
      <p>
        <button className="btn small" onClick={() => run(() => {
          // Inserir um nível no meio não pode trocar o topo automático das escadas que já existem: fixa antes.
          editor.store.transaction(t('dlm_undo_level_new'), () => {
            pinAutoTops(editor.store);
            editor.store.exec({ type: 'upsertLevel', level: makeLevel({ id: newId('lv'), name: t('dlm_default_level', { n: p.levels.length + 1 }), elevation: (p.levels[p.levels.length - 1]?.elevation ?? 0) + 3 }) });
          });
        })}>{t('dlm_levels_new')}</button>
      </p>
    </Dialog>
  );
}

/**
 * Novo projeto: só o projeto em branco e o que já está salvo — o último projeto deste navegador (autosave) e um
 * arquivo `.hestia.json` do disco. Os exemplos de `TEMPLATES` (casa, prédio, esquadrias…) são material de teste e
 * não aparecem mais aqui: abrir o app nunca deve começar por um projeto de exemplo.
 */
export function StartDialog(): ReactElement {
  const { t } = useT();
  const [has] = useState(() => hasAutosave());
  const emBranco = (): void => {
    editor.newProject('blank');
    close();
    useUi.setState({ tutorial: true });
  };
  const abrirArquivo = (): void => {
    close();
    document.getElementById('file-open')?.click();
  };
  const voltarAoSalvo = (): void => {
    editor.restoreAutosave();
    close();
  };
  const icone = (d: string): ReactElement => (
    <span className="tpl-thumb">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
  return (
    <Dialog title={t('dlm_new_project')} sub={t('dlm_new_project_sub')} onClose={close} footer={
      <>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={close}>{t('dlm_btn_cancel')}</button>
      </>
    }>
      <div className="tplgrid">
        <button className="tpl" onClick={emBranco}>
          {icone('M5 3h9l5 5v13H5z M14 3v5h5')}
          <span className="tpl-body">
            <span className="tpl-name">{t('dlm_tpl_blank')}</span>
            <span className="tpl-desc">{t('dlm_tpl_blank_desc')}</span>
            <span className="tpl-meta">{t('dlm_tpl_blank_meta')}<span className="area">{t('dlm_tag_new')}</span></span>
          </span>
        </button>
        <button className="tpl" onClick={abrirArquivo}>
          {icone('M3 7h6l2 2h10v10H3z')}
          <span className="tpl-body">
            <span className="tpl-name">{t('dlm_tpl_open')}</span>
            <span className="tpl-desc">{t('dlm_tpl_open_desc')}</span>
            <span className="tpl-meta">{t('dlm_tpl_open_meta')}<span className="area">{t('dlm_tag_file')}</span></span>
          </span>
        </button>
        {has ? (
          <button className="tpl" onClick={voltarAoSalvo}>
            {icone('M12 3a9 9 0 1 1-9 9h3a6 6 0 1 0 6-6v3L7 5l5-4z')}
            <span className="tpl-body">
              <span className="tpl-name">{t('dlm_tpl_autosave')}</span>
              <span className="tpl-desc">{t('dlm_tpl_autosave_desc')}</span>
              <span className="tpl-meta">{t('dlm_tpl_autosave_meta')}<span className="area">{t('dlm_tag_resume')}</span></span>
            </span>
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Teclas que não são comando: a tabela de comandos (com as sequências atuais) entra antes destas. */
const KEYS: ReadonlyArray<readonly [keyof Dict, keyof Dict]> = [
  ['dlm_kb_esc', 'dlm_kb_esc_desc'],
  ['dlm_kb_enter', 'dlm_kb_enter_desc'],
  ['dlm_kb_digits', 'dlm_kb_digits_desc'],
  ['dlm_kb_tab', 'dlm_kb_tab_desc'],
  ['dlm_kb_space', 'dlm_kb_space_desc'],
  ['dlm_kb_shift', 'dlm_kb_shift_desc'],
  ['dlm_kb_alt', 'dlm_kb_alt_desc'],
  ['dlm_kb_copy', 'dlm_kb_copy_desc'],
  ['dlm_kb_del', 'dlm_kb_del_desc'],
  ['dlm_kb_undo', 'dlm_kb_undo_desc'],
  ['dlm_kb_save', 'dlm_kb_save_desc'],
  ['dlm_kb_wheel', 'dlm_kb_wheel_desc'],
  ['dlm_kb_right', 'dlm_kb_right_desc'],
];

/** Descrições longas de comandos cujo rótulo sozinho não diz tudo (escada, corte etc.). */
const DESCRICAO_COMANDO: Partial<Record<ShortcutCommand, keyof Dict>> = {
  stair: 'dlm_cmd_desc_stair',
  stairrun: 'dlm_cmd_desc_stairrun',
  ramp: 'dlm_cmd_desc_ramp',
  trim: 'dlm_cmd_desc_trim',
  joins: 'dlm_cmd_desc_joins',
  split: 'dlm_cmd_desc_split',
  section: 'dlm_cmd_desc_section',
};

/** Tabela de atalhos gerada da configuração atual: comandos na ordem da faixa, depois as teclas fixas. */
export function ShortcutsDialog(): ReactElement {
  const { t, lang } = useT();
  const mapa = useAtalhos((s) => s.mapa);
  const ordem = [...new Set<ShortcutCommand>([...TOOL_GROUPS.flatMap((g) => g.tools), ...COMANDOS_COM_ATALHO])];
  return (
    <Dialog
      title={t('dlm_shortcuts')}
      size="mid"
      onClose={close}
      footer={<><button className="btn" onClick={() => useUi.setState({ dialog: 'shortcutsConfig', dialogArg: null })}>{t('dlm_shortcuts_customize')}</button><button className="btn primary" onClick={close}>{t('dlm_btn_close')}</button></>}
    >
      <table className="kbtable">
        <tbody>
          <tr><td><span style={{ color: 'var(--fg-faint)' }}>{t('dlm_kb_none')}</span></td><td>{t('dlm_kb_select')}</td></tr>
          {ordem.map((cmd) => {
            const desc = DESCRICAO_COMANDO[cmd];
            return (
              <tr key={cmd}>
                <td>{mapa[cmd] ? <kbd>{mapa[cmd]}</kbd> : <span style={{ color: 'var(--fg-faint)' }}>{t('dlm_kb_unassigned')}</span>}</td>
                <td title={desc ? t(desc) : undefined}>{nomeComandoLang(cmd, lang)}</td>
              </tr>
            );
          })}
          {KEYS.map(([k, d]) => <tr key={k}><td><kbd>{t(k)}</kbd></td><td>{t(d)}</td></tr>)}
        </tbody>
      </table>
    </Dialog>
  );
}
