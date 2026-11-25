import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { CircuitosPainel } from '../circuitos/CircuitosPainel.tsx';
import { Dialog } from './Dialog.tsx';

/** Diálogo "Circuitos" (ficha C4): circuitos, quadros e potência por ponto. Texto fixo em português, como os painéis MEP. */
export function CircuitosDialog(): ReactElement {
  const { t } = useT();
  const close = (): void => useUi.setState({ dialog: null });
  return (
    <Dialog
      title="Circuitos elétricos"
      sub="Crie circuitos, escolha o quadro e atribua os componentes selecionados. Os valores de potência são seus: o programa não aplica norma aqui."
      onClose={close}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('dlc_btn_close')}</button>
        </>
      }
    >
      <CircuitosPainel />
    </Dialog>
  );
}
