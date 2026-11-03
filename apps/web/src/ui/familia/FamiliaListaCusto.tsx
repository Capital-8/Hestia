import { custoEstimado, type FerragemResolvida, type ResumoLista } from '@hestia/engine';
import type { Catalogo } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { CampoNumero } from './FamiliaParametrosCampos.tsx';
import { textoMoeda } from './familiaLista.ts';

/** Aba Custo: perdas de chapa e fita e o custo estimado em reais. */

interface PropsCusto {
  resumo: ResumoLista;
  catalogo: Catalogo;
  ferragens: readonly FerragemResolvida[];
}

export function FamiliaListaCusto({ resumo, catalogo, ferragens }: PropsCusto): ReactElement {
  const [perdaChapa, setPerdaChapa] = useState(15);
  const [perdaFita, setPerdaFita] = useState(10);
  const custo = custoEstimado(resumo, catalogo, ferragens, {
    perdaChapa: perdaChapa / 100,
    perdaFita: perdaFita / 100,
  });
  const linhas: ReadonlyArray<{ rotulo: string; valor: number; total?: boolean }> = [
    { rotulo: 'Chapas', valor: custo.chapas },
    { rotulo: 'Fitas', valor: custo.fitas },
    { rotulo: 'Ferragens', valor: custo.ferragens },
    { rotulo: 'Total', valor: custo.total, total: true },
  ];

  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-lista-barra">
        <label>
          Perda de chapa (%)
          <CampoNumero
            valor={perdaChapa}
            ariaLabel="Perda de chapa (%)"
            classe="fam-lista-campo"
            aoGravar={(n) => {
              if (n === undefined || n < 0) return false;
              setPerdaChapa(n);
              return true;
            }}
          />
        </label>
        <label>
          Perda de fita (%)
          <CampoNumero
            valor={perdaFita}
            ariaLabel="Perda de fita (%)"
            classe="fam-lista-campo"
            aoGravar={(n) => {
              if (n === undefined || n < 0) return false;
              setPerdaFita(n);
              return true;
            }}
          />
        </label>
      </div>

      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela fam-lista-custo">
          <thead>
            <tr><th>Item</th><th className="n">Valor</th></tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.rotulo} className={linha.total === true ? 'total' : ''}>
                <td>{linha.rotulo}</td>
                <td className="n">{textoMoeda(linha.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="fam-hint">
        Valores ilustrativos do catálogo da sessão: chapas por área útil, fitas por metro e ferragens por unidade.
      </p>
    </div>
  );
}
