import { duplicarPeca, espelharPecaEmX, excluirPeca, moverPecaNaLista, type Familia } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { Icon } from '../Icon.tsx';
import { idAdicionado, idsDePecas } from './familiaPeca.ts';
import { executarPeca, useAvisoPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';
import { FamiliaNovaPeca } from './FamiliaNovaPeca.tsx';

/*
 * Barra de ações da lista de peças. Duplicar, espelhar e criar selecionam a peça nova comparando os ids antes e depois;
 * excluir pede confirmação inline (a mesma barra é acionada pela tecla Delete).
 */

interface Props {
  rotulo: string;
  icone: string;
  dica: string;
  desabilitado?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function Botao({ rotulo, icone, dica, desabilitado = false, onClick }: Props): ReactElement {
  return (
    <button
      type="button"
      className="fam-peca-btn"
      title={dica}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={onClick}
    >
      <Icon name={icone} size={14} />
    </button>
  );
}

export function FamiliaPecaAcoes(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const sel = useFamilia((s) => s.sel);
  const confirmada = useAvisoPeca((s) => s.exclusao);
  const [ancoraNova, setAncoraNova] = useState<DOMRect | null>(null);
  const peca = sel === null ? undefined : familia.pecas.find((p) => p.id === sel);
  const semSelecao = peca === undefined;

  const comSelecao = (rotulo: string, acao: (f: Familia, id: string) => string | null): void => {
    if (sel === null) return;
    const antes = idsDePecas(familia);
    const motivo = executarPeca(rotulo, (f) => acao(f, sel));
    if (motivo !== null) return;
    const novo = idAdicionado(antes, idsDePecas(useFamilia.getState().familia()));
    if (novo !== null) useFamilia.getState().selecionarPeca(novo);
  };

  const confirmarExclusao = (): void => {
    comSelecao('Excluir peça', excluirPeca);
    useAvisoPeca.getState().cancelarExclusao();
  };

  return (
    <div className="fam-peca-acoes">
      <Botao
        rotulo="Nova peça"
        icone="plus"
        dica="Criar uma peça"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAncoraNova((atual) => (atual === null ? rect : null));
        }}
      />
      <Botao rotulo="Duplicar" icone="copy" dica="Duplicar a peça selecionada (Ctrl+D)" desabilitado={semSelecao} onClick={() => comSelecao('Duplicar peça', duplicarPeca)} />
      <Botao rotulo="Excluir" icone="trash" dica="Excluir a peça selecionada (Delete)" desabilitado={semSelecao} onClick={() => { if (sel !== null) useAvisoPeca.getState().pedirExclusao(sel); }} />
      <Botao rotulo="Subir" icone="up" dica="Subir na lista" desabilitado={semSelecao} onClick={() => comSelecao('Subir peça', (f, id) => moverPecaNaLista(f, id, -1))} />
      <Botao rotulo="Descer" icone="down" dica="Descer na lista" desabilitado={semSelecao} onClick={() => comSelecao('Descer peça', (f, id) => moverPecaNaLista(f, id, 1))} />
      <Botao rotulo="Espelhar em X" icone="mirror" dica="Espelhar em torno do centro da família" desabilitado={semSelecao} onClick={() => comSelecao('Espelhar peça em X', espelharPecaEmX)} />
      {peca !== undefined && confirmada === peca.id && (
        <div className="fam-peca-confirma" role="alertdialog" aria-label="Confirmar exclusão">
          <span>Excluir “{peca.nome}”?</span>
          <button type="button" className="fam-bt" onClick={confirmarExclusao}>Sim</button>
          <button type="button" className="fam-bt" onClick={() => useAvisoPeca.getState().cancelarExclusao()}>Não</button>
        </div>
      )}
      {ancoraNova !== null && <FamiliaNovaPeca ancora={ancoraNova} onFechar={() => setAncoraNova(null)} />}
    </div>
  );
}
