import { Fragment, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { COMANDOS_COM_ATALHO, PERFIL_NOMES, TOOL_GROUPS, perfilNome, toolGroupTitle, type ShortcutCommand, type ShortcutProfile } from '@hestia/tools';
import { nomeComandoLang, useT, type Lang } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { atribuirAtalho, exportaAtalhos, importaAtalhos, removerAtalho, restaurarAtalho, restaurarTodos, trocarPerfil, useAtalhos } from '../../editor/shortcutConfig.ts';
import { saveText } from '../../editor/saveText.ts';
import { Dialog } from './Dialog.tsx';

/** Tamanho máximo de uma sequência digitada na tela. */
const TAMANHO_MAX = 4;

/** Grupos da tabela: os da faixa, e "Outros" com o que não está em nenhum deles (inclui a tela de atalhos). */
function grupos(lang: Lang, outrosTitulo: string): Array<{ titulo: string; comandos: ShortcutCommand[] }> {
  const naFaixa = new Set<string>(TOOL_GROUPS.flatMap((g) => g.tools));
  const outros = COMANDOS_COM_ATALHO.filter((c) => !naFaixa.has(c));
  return [...TOOL_GROUPS.map((g) => ({ titulo: toolGroupTitle(g.title, lang), comandos: g.tools as ShortcutCommand[] })), { titulo: outrosTitulo, comandos: outros }];
}

/** Tela "Atalhos de teclado": clique num comando e pressione as novas teclas (Enter grava, Esc cancela). */
export function ShortcutsConfigDialog(): ReactElement {
  const { t, lang } = useT();
  const perfil = useAtalhos((s) => s.perfil);
  const mapa = useAtalhos((s) => s.mapa);
  const [filtro, setFiltro] = useState('');
  const [ativo, setAtivo] = useState<ShortcutCommand | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [msg, setMsg] = useState('');
  // Durante a captura, Esc cancela a captura e não fecha o diálogo (o Dialog fecha no Esc, então a guarda passa pela ref).
  const capturandoRef = useRef(false);
  capturandoRef.current = ativo !== null;
  const fechar = (): void => {
    if (!capturandoRef.current) useUi.setState({ dialog: null, dialogArg: null });
  };

  const inicia = (cmd: ShortcutCommand): void => {
    setAtivo(cmd);
    setRascunho('');
    setMsg('');
  };

  /** Encerra a captura em curso (Remover, Restaurar e Restaurar tudo não podem deixar as teclas irem ao rascunho). */
  const encerraCaptura = useCallback((): void => {
    setAtivo(null);
    setRascunho('');
  }, []);

  const grava = useCallback((cmd: ShortcutCommand, texto: string): void => {
    encerraCaptura();
    if (!texto) {
      setMsg(t('dlm_msg_no_key_typed'));
      return;
    }
    const r = atribuirAtalho(cmd, texto);
    setMsg(r.ok ? r.mensagem : r.erro);
  }, [encerraCaptura, t]);

  useEffect(() => {
    if (!ativo) return;
    const h = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setAtivo(null);
        setRascunho('');
        setMsg(t('dlm_msg_capture_canceled'));
      } else if (e.key === 'Enter') grava(ativo, rascunho);
      else if (e.key === 'Backspace') setRascunho((r) => r.slice(0, -1));
      else if (/^[A-Za-z0-9]$/.test(e.key)) setRascunho((r) => (r + e.key.toUpperCase()).slice(0, TAMANHO_MAX));
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [ativo, rascunho, grava, t]);

  const termo = filtro.trim().toLowerCase();
  const visiveis = grupos(lang, t('dlm_grp_others'))
    .map((g) => ({ ...g, comandos: g.comandos.filter((c) => !termo || nomeComandoLang(c, lang).toLowerCase().includes(termo)) }))
    .filter((g) => g.comandos.length > 0);

  const exporta = async (): Promise<void> => {
    setMsg(await saveText('atalhos-hestia.json', exportaAtalhos()));
  };

  const importa = async (arq: File | undefined): Promise<void> => {
    if (!arq) return;
    const r = importaAtalhos(await arq.text());
    setMsg(r.ok ? r.mensagem : r.erro);
  };

  const faint = { color: 'var(--fg-faint)' } as const;

  return (
    <Dialog title={t('dlm_keyboard_shortcuts')} sub={t('dlm_keyboard_shortcuts_sub')} size="mid" onClose={fechar} footer={<button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label>
          {t('dlm_lbl_profile')}{' '}
          <select className="input" value={perfil} onChange={(e) => { trocarPerfil(e.target.value as ShortcutProfile); setMsg(t('dlm_msg_profile_changed')); }}>
            {(Object.keys(PERFIL_NOMES) as ShortcutProfile[]).map((p) => <option key={p} value={p}>{perfilNome(p, lang)}</option>)}
          </select>
        </label>
        <input className="input" placeholder={t('dlm_ph_filter_name')} aria-label={t('dlm_aria_filter_commands')} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={() => void exporta()}>{t('dlm_btn_export_json')}</button>
        <label className="btn small" style={{ cursor: 'pointer' }}>
          {t('dlm_btn_import_json')}
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { void importa(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button className="btn small" onClick={() => { encerraCaptura(); restaurarTodos(); setMsg(t('dlm_msg_restore_all')); }}>{t('dlm_btn_restore_all')}</button>
      </div>
      {ativo ? (
        <p role="status" style={{ margin: '4px 0 10px' }}>
          {t('dlm_press_keys_prefix')} <b>{nomeComandoLang(ativo, lang)}</b>: {rascunho ? <kbd>{rascunho}</kbd> : <span style={faint}>…</span>} {t('dlm_press_keys_suffix')}
        </p>
      ) : null}
      {msg && !ativo ? <p role="status" style={{ margin: '4px 0 10px', color: 'var(--fg-soft)' }}>{msg}</p> : null}
      <table className="kbtable">
        <tbody>
          {visiveis.map((g) => (
            <Fragment key={g.titulo}>
              <tr><th colSpan={3} style={{ textAlign: 'left', ...faint }}>{g.titulo}</th></tr>
              {g.comandos.map((cmd) => {
                const seq = mapa[cmd];
                const editando = ativo === cmd;
                return (
                  <tr key={cmd} onClick={() => inicia(cmd)} style={{ cursor: 'pointer', background: editando ? 'var(--chrome)' : undefined }}>
                    <td>{nomeComandoLang(cmd, lang)}</td>
                    <td>{editando ? <kbd>{rascunho || '…'}</kbd> : seq ? <kbd>{seq}</kbd> : <span style={faint}>{t('dlm_kb_unassigned')}</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn small" onClick={(e) => { e.stopPropagation(); inicia(cmd); }}>{t('dlm_btn_assign')}</button>{' '}
                      <button className="btn small" disabled={!seq} onClick={(e) => { e.stopPropagation(); encerraCaptura(); removerAtalho(cmd); setMsg(t('dlm_msg_shortcut_removed', { command: nomeComandoLang(cmd, lang) })); }}>{t('dlm_btn_remove')}</button>{' '}
                      <button className="btn small" onClick={(e) => { e.stopPropagation(); encerraCaptura(); restaurarAtalho(cmd); setMsg(t('dlm_msg_shortcut_restored', { command: nomeComandoLang(cmd, lang) })); }}>{t('dlm_btn_restore')}</button>
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      {visiveis.length === 0 ? <p style={faint}>{t('dlm_no_command')}</p> : null}
    </Dialog>
  );
}
