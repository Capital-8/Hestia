import type { ReactElement } from 'react';
import { Dialog } from './Dialog.tsx';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { editor } from '../../editor/controller.ts';
import { bibliotecaDoAmbiente } from '../../editor/biblioteca/biblioteca.ts';
import { publicarBiblioteca } from '../../editor/biblioteca/aoVivo.ts';

/**
 * "Salvar sem pasta escolhida": explica por que o programa quer uma pasta (o Ctrl+S passa a ATUALIZAR o arquivo do
 * projeto, em vez de baixar um JSON novo) e deixa o usuário decidir — escolher a pasta agora ou baixar só este projeto
 * e escolher depois. Antes, o seletor do sistema abria sozinho, sem dizer por quê.
 */
export function SalvarSemPastaDialog(): ReactElement {
  const { t } = useT();
  const close = (): void => useUi.setState({ dialog: null });
  const biblioteca = bibliotecaDoAmbiente();

  const escolherPasta = async (): Promise<void> => {
    if (!biblioteca) return;
    try {
      publicarBiblioteca(await biblioteca.escolher());
    } catch {
      // Cancelou ou o navegador recusou: o diálogo continua aberto para tentar de novo ou baixar.
    }
    if (biblioteca.pronta) {
      close();
      await editor.save();
    }
  };

  const baixar = async (): Promise<void> => {
    close();
    await editor.baixarProjeto();
  };

  return (
    <Dialog
      title={t('bib_need_folder_title')}
      sub={t('bib_need_folder_sub')}
      size="narrow"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => void baixar()}>
            {t('bib_download_file')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>
            {t('dlm_btn_cancel')}
          </button>
          <button className="btn primary" autoFocus onClick={() => void escolherPasta()}>
            {t('bib_choose_folder')}
          </button>
        </>
      }
    >
      <p>{t('bib_need_folder_text')}</p>
      <ul className="dlg-list">
        <li>{t('bib_need_folder_point_save')}</li>
        <li>{t('bib_need_folder_point_download')}</li>
      </ul>
    </Dialog>
  );
}
