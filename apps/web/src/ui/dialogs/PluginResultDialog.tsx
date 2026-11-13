import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { usePluginResult } from '../../plugins/pluginResult.ts';
import { txt } from '../ribbon/model.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/**
 * Resultado de uma ação de suplemento (`DialogKind` 'pluginResult'): o texto que o handler devolveu. É dado não
 * confiável, por isso só aparece como texto simples (o React escapa; nada de HTML do suplemento).
 */
export function PluginResultDialog(): ReactElement | null {
  const { t, lang } = useT();
  const r = usePluginResult((s) => s.result);
  if (!r) return null;
  return (
    <Dialog title={r.title ? txt(r.title, lang) : t('sup_result_title')} sub={r.pluginName} size="narrow" onClose={fechar} footer={<button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{txt(r.message, lang)}</p>
    </Dialog>
  );
}
