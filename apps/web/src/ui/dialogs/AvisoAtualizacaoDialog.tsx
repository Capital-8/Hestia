import { useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { lerAtualizacaoPendente, instalarAtualizacao } from '../../editor/atualizacao/ponte.ts';
import { marcarAdiadoNaSessao, salvarAvisarAoAbrir, salvarVersaoRecusada } from '../../editor/atualizacao/preferencias.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * Aviso automático ao abrir (só desktop), agora recusável: "Agora não" adia só esta
 * sessão; "Não perguntar novamente" grava a preferência e a versão recusada. Uma
 * versão maior que a recusada volta a avisar na próxima abertura.
 */
export function AvisoAtualizacaoDialog(): ReactElement | null {
  const { t } = useT();
  const info = lerAtualizacaoPendente();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  if (!info) return null;

  const atualizar = async (): Promise<void> => {
    setOcupado(true);
    setErro('');
    try {
      await instalarAtualizacao();
    } catch (e) {
      setErro(t('dlm_update_failed', { msg: mensagem(e) }));
      setOcupado(false);
    }
  };

  const agoraNao = (): void => {
    marcarAdiadoNaSessao();
    fechar();
  };

  const nunca = (): void => {
    salvarAvisarAoAbrir(false);
    salvarVersaoRecusada(info.versao);
    fechar();
  };

  return (
    <Dialog
      title={t('dlm_update_title')}
      size="mid"
      onClose={agoraNao}
      footer={
        <>
          <button className="btn primary" onClick={() => void atualizar()} disabled={ocupado}>
            {ocupado ? t('dlm_about_updating') : t('dlm_update_now')}
          </button>
          <button className="btn" onClick={agoraNao} disabled={ocupado}>{t('dlm_update_later')}</button>
          <button className="btn" onClick={nunca} disabled={ocupado}>{t('dlm_update_never')}</button>
        </>
      }
    >
      <p>{t('dlm_update_body', { v: info.versao })}</p>
      {info.notas ? <p style={{ whiteSpace: 'pre-wrap' }}>{info.notas}</p> : null}
      {erro ? <p role="alert">{erro}</p> : null}
    </Dialog>
  );
}
