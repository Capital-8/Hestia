import { quantitativosEletricosDoProjeto } from '@hestia/engine';
import { useMemo, useState, type ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { QuantitativosEletricosTabela } from '../circuitos/QuantitativosEletricosTabela.tsx';
import { csvQuantitativoEletrico, linhasQuantitativoEletrico } from '../circuitos/quantitativosEletricosTexto.ts';
import { Dialog } from './Dialog.tsx';

/** Diálogo "Quantitativos elétricos" (ficha C6): traçado do projeto e por circuito, com cópia e download do CSV. Texto fixo em português. */
export function QuantitativosEletricosDialog(): ReactElement {
  const { t } = useT();
  const project = useProject();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const close = (): void => useUi.setState({ dialog: null });
  const linhas = useMemo(() => linhasQuantitativoEletrico(quantitativosEletricosDoProjeto(project)), [project]);
  const csv = (): string => csvQuantitativoEletrico(linhas);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(csv());
      setMensagem('CSV copiado.');
    } catch {
      setMensagem('Não foi possível copiar o CSV.');
    }
  };

  const baixar = (): void => {
    const nome = (project.name || 'projeto').replace(/[^\w-]+/g, '_');
    const url = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `quantitativos-eletricos-${nome}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      title="Quantitativos elétricos"
      sub="Eletrodutos por bitola (comprimento de cada peça cortada, sem repetir), curvas, luvas, caixas, quadros, pontos e VA por circuito. Quantidades de traçado: o programa não dimensiona."
      onClose={close}
      size="wide"
      footer={
        <>
          <span className="circ-msg" role="status" style={{ flex: 1 }}>{mensagem ?? ''}</span>
          <button className="btn" disabled={linhas.length === 0} onClick={() => { void copiar(); }}>Copiar CSV</button>
          <button className="btn" disabled={linhas.length === 0} onClick={baixar}>Baixar CSV</button>
          <button className="btn" onClick={close}>{t('dlc_btn_close')}</button>
        </>
      }
    >
      <QuantitativosEletricosTabela linhas={linhas} />
    </Dialog>
  );
}
