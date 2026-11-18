import { exportarFamilias, serializar, type Familia } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { armazenamentoDoNavegador, guardarModelo, lerMeusModelos } from './meusModelos.ts';

interface Mensagem {
  texto: string;
  erro: boolean;
}

/** Bloco "Salvar" do diálogo de arquivo: baixa a família corrente ou guarda em "Meus modelos". */
export function FamiliaArquivoSalvar({ familia }: { familia: Familia }): ReactElement {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const baixar = (): void => {
    const texto = serializar(exportarFamilias([familia]));
    const blob = new Blob([texto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const ancora = document.createElement('a');
    ancora.href = url;
    ancora.download = `${familia.id}.hestia-familia.json`;
    document.body.append(ancora);
    ancora.click();
    ancora.remove();
    URL.revokeObjectURL(url);
    setMensagem({ texto: `Arquivo “${familia.id}.hestia-familia.json” gerado.`, erro: false });
  };

  const guardar = (): void => {
    const storage = armazenamentoDoNavegador();
    if (storage === null) {
      setMensagem({ texto: 'O navegador não permite guardar modelos.', erro: true });
      return;
    }
    guardarModelo(storage, familia);
    const salvos = lerMeusModelos(storage);
    const guardou = salvos.some((f) => f.id === familia.id);
    setMensagem(guardou
      ? { texto: `“${familia.nome}” guardada em Meus modelos.`, erro: false }
      : { texto: 'Não foi possível guardar o modelo neste navegador.', erro: true });
  };

  return (
    <section className="fam-arq-bloco">
      <h3>Salvar</h3>
      <div className="fam-arq-nome">Família corrente: <b>{familia.nome}</b></div>
      <div className="fam-arq-acoes">
        <button type="button" className="fam-bt" onClick={baixar}>Baixar arquivo</button>
        <button type="button" className="fam-bt" onClick={guardar}>Guardar em Meus modelos</button>
      </div>
      {mensagem !== null && (
        <div className={`fam-msg${mensagem.erro ? ' erro' : ''}`} role={mensagem.erro ? 'alert' : 'status'}>{mensagem.texto}</div>
      )}
      <div className="fam-hint">O arquivo leva só esta família; “Meus modelos” fica neste navegador (até 100 famílias).</div>
    </section>
  );
}
