import type { ReactElement } from 'react';
import { CABECALHO_QUANTITATIVO_ELETRICO, textoMedidaQuantitativo, type LinhaQuantitativoEletrico } from './quantitativosEletricosTexto.ts';
import './circuitos.css';

/*
 * Tabela do diálogo "Quantitativos elétricos" (ficha C6): só apresentação, uma linha por item (projeto e cada circuito). Texto fixo
 * em português, como o painel Circuitos. Mesmas linhas que o CSV.
 */
export function QuantitativosEletricosTabela({ linhas }: { linhas: readonly LinhaQuantitativoEletrico[] }): ReactElement {
  if (linhas.length === 0) return <p className="circ-vazio">Nenhum componente elétrico no projeto: nada a quantificar.</p>;
  return (
    <div className="circ-quant-wrap">
      <table className="circ-quant" data-quantitativos="eletricos">
        <thead>
          <tr>
            {CABECALHO_QUANTITATIVO_ELETRICO.filter((h) => h !== 'Unidade').map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td>{l.escopo}</td>
              <td>{l.grupo}</td>
              <td>{l.item}</td>
              <td className="num">{l.quantidade}</td>
              <td className="num">{textoMedidaQuantitativo(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
