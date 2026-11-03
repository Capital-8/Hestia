import { etiquetaDaLinha, type LinhaLista } from '@hestia/engine';
import type { ReactElement } from 'react';

/** Aba Etiquetas: um cartão por linha da lista, com as três linhas prontas e a quantidade no canto. */

interface PropsEtiquetas {
  linhas: readonly LinhaLista[];
}

export function FamiliaListaEtiquetas({ linhas }: PropsEtiquetas): ReactElement {
  if (linhas.length === 0) {
    return <p className="fam-hint">Nenhuma peça para etiquetar.</p>;
  }
  return (
    <div className="fam-lista-etiquetas">
      {linhas.map((linha, indice) => {
        const [nome = '', dimensoes = '', fita = ''] = etiquetaDaLinha(linha);
        return (
          <div className="fam-lista-etiqueta" key={`${linha.nome}-${indice}`}>
            <span className="fam-lista-etiqueta-qtd" title="Quantidade de peças iguais">{linha.quantidade}×</span>
            <div className="fam-lista-etiqueta-nome">{nome}</div>
            <div className="fam-lista-etiqueta-linha">{dimensoes}</div>
            <div className="fam-lista-etiqueta-linha">{fita}</div>
          </div>
        );
      })}
    </div>
  );
}
