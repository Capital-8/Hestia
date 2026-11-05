import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { notasDaVersao } from '../../editor/atualizacao/auto.ts';
import { carregarPreferencias, salvarAvisarAoAbrir } from '../../editor/atualizacao/preferencias.ts';
import { emTauri, instalarAtualizacao, verificarAtualizacao, type AtualizacaoDisponivel } from '../../editor/atualizacao/ponte.ts';
import { versaoDoApp } from '../../editor/atualizacao/versao.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * Diálogo "Sobre o Hestia": nome, versão em execução (injetada do package.json), notas
 * desta versão e, só no desktop, verificação manual de atualizações. No navegador os
 * controles de atualização ficam escondidos; restam versão e notas.
 */
export function SobreDialog(): ReactElement {
  const { t, lang } = useT();
  const desktop = emTauri();
  const versao = versaoDoApp();
  const [avisar, setAvisar] = useState(() => carregarPreferencias().avisarAoAbrir);
  const [verificando, setVerificando] = useState(false);
  const [instalando, setInstalando] = useState(false);
  const [resultado, setResultado] = useState<AtualizacaoDisponivel | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const notas = notasDaVersao(versao, lang);

  const verificar = async (): Promise<void> => {
    setVerificando(true);
    setErro('');
    try {
      setResultado(await verificarAtualizacao());
    } catch (e) {
      setErro(t('dlm_about_check_failed', { msg: mensagem(e) }));
    } finally {
      setVerificando(false);
    }
  };

  const atualizar = async (): Promise<void> => {
    setInstalando(true);
    setErro('');
    try {
      await instalarAtualizacao();
    } catch (e) {
      setErro(t('dlm_about_update_failed', { msg: mensagem(e) }));
      setInstalando(false);
    }
  };

  const alternarAviso = (ligado: boolean): void => {
    setAvisar(ligado);
    salvarAvisarAoAbrir(ligado);
  };

  return (
    <Dialog
      title={t('dlm_about_title')}
      sub="Hestia"
      size="mid"
      onClose={fechar}
      footer={<button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>}
    >
      <p className="hint"><b>Hestia</b> · {t('dlm_about_version', { v: versao })}</p>
      <div className="hint">
        <strong>{t('dlm_about_notes')}</strong>
        <p style={{ whiteSpace: 'pre-wrap' }}>{notas || t('dlm_about_no_notes')}</p>
      </div>
      {desktop ? (
        <>
          <label className="prow" htmlFor="about-avisar">
            <span>{t('dlm_about_auto')}</span>
            <span>
              <input
                id="about-avisar"
                type="checkbox"
                checked={avisar}
                onChange={(e) => alternarAviso(e.target.checked)}
              />
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
            <button className="btn" onClick={() => void verificar()} disabled={verificando || instalando}>
              {verificando ? t('dlm_about_checking') : t('dlm_about_check')}
            </button>
          </div>
          {resultado === null ? <p role="status">{t('dlm_about_up_to_date')}</p> : null}
          {resultado ? (
            <div role="status">
              <p>{t('dlm_about_available', { v: resultado.versao })}</p>
              {resultado.notas ? <p style={{ whiteSpace: 'pre-wrap' }}>{resultado.notas}</p> : null}
              <button className="btn primary" onClick={() => void atualizar()} disabled={instalando}>
                {instalando ? t('dlm_about_updating') : t('dlm_about_update_now')}
              </button>
            </div>
          ) : null}
          {erro ? <p role="alert">{erro}</p> : null}
        </>
      ) : null}
    </Dialog>
  );
}
