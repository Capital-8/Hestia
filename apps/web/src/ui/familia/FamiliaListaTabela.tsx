import type { FerragemResolvida, LinhaLista, ResumoLista } from '@hestia/engine';
import { chapaPorId, type Catalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { simboloVeio, textoArea, textoMetros, textoMm } from './familiaLista.ts';

/** Aba Lista: tabela de peças agrupadas, resumo de áreas/fitas/usinagens e tabela de ferragens. */

interface PropsLista {
  linhas: readonly LinhaLista[];
  resumo: ResumoLista;
  ferragens: readonly FerragemResolvida[];
  catalogo: Catalogo;
}

const LADOS_FITA: ReadonlyArray<{ chave: 'c1' | 'c2' | 'l1' | 'l2'; rotulo: string }> = [
  { chave: 'c1', rotulo: 'Fita C1' },
  { chave: 'c2', rotulo: 'Fita C2' },
  { chave: 'l1', rotulo: 'Fita L1' },
  { chave: 'l2', rotulo: 'Fita L2' },
];

function nomeDaChapa(catalogo: Catalogo, id: string | null): string {
  if (id === null) return '—';
  return chapaPorId(catalogo, id)?.nome ?? id;
}

function identificacao(catalogo: Catalogo, linha: LinhaLista): string {
  if (linha.chapa !== null) return nomeDaChapa(catalogo, linha.chapa);
  return linha.material ?? '—';
}

export function FamiliaListaTabela({ linhas, resumo, ferragens, catalogo }: PropsLista): ReactElement {
  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela">
          <thead>
            <tr>
              <th className="n">Qtd</th>
              <th>Peça</th>
              <th>Papel</th>
              <th>Chapa/Material</th>
              <th className="n">Comprimento</th>
              <th className="n">Largura</th>
              <th className="n">Espessura</th>
              <th>Veio</th>
              {LADOS_FITA.map((lado) => <th key={lado.chave} className="fam-lista-fita-col">{lado.rotulo}</th>)}
              <th className="n">Furos</th>
              <th className="n">Rasgos</th>
              <th className="n">Recortes</th>
              <th className="n">Área</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={16} className="fam-hint">Nenhuma peça na lista.</td></tr>
            )}
            {linhas.map((linha, indice) => (
              <tr key={`${linha.nome}-${indice}`}>
                <td className="n">{linha.quantidade}</td>
                <td title={linha.nomes.join(' / ')}>{linha.nome}</td>
                <td>{linha.papel}</td>
                <td>{identificacao(catalogo, linha)}</td>
                <td className="n">{textoMm(linha.comprimento)}</td>
                <td className="n">{textoMm(linha.largura)}</td>
                <td className="n">{textoMm(linha.espessura)}</td>
                <td className="fam-lista-veio">{simboloVeio(linha.veio)}</td>
                {LADOS_FITA.map((lado) => {
                  const fita = linha.fita[lado.chave];
                  return (
                    <td key={lado.chave} className="fam-lista-fita-col" title={fita ?? undefined}>
                      {fita === null ? '' : '✔'}
                    </td>
                  );
                })}
                <td className="n">{linha.furos}</td>
                <td className="n">{linha.rasgos}</td>
                <td className="n">{linha.recortes}</td>
                <td className="n">{textoArea(linha.area, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fam-lista-resumo">
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Resumo</div>
          <div><b>{resumo.totalPecas}</b> peças</div>
          <div>Área total: {textoArea(resumo.areaM2, 4)}</div>
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Área por chapa e espessura</div>
          {resumo.porChapa.length === 0
            ? <div className="fam-hint">Sem peças.</div>
            : (
              <ul className="fam-lista-resumo-lista">
                {resumo.porChapa.map((item) => (
                  <li key={`${item.chapa ?? 'sem'}-${item.espessura}`}>
                    {nomeDaChapa(catalogo, item.chapa)} · {textoMm(item.espessura)} mm — {textoArea(item.area, 4)}
                    <span className="fam-mut">{item.pecas} peças</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Fita por tipo</div>
          {resumo.fitaMetros.length === 0
            ? <div className="fam-hint">Sem fita.</div>
            : (
              <ul className="fam-lista-resumo-lista">
                {resumo.fitaMetros.map((item) => (
                  <li key={item.fita}>{item.fita}: {textoMetros(item.metros)}</li>
                ))}
              </ul>
            )}
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Usinagens</div>
          <div>Furos: {resumo.usinagens.furos}</div>
          <div>Rasgos: {resumo.usinagens.rasgos}</div>
          <div>Recortes: {resumo.usinagens.recortes}</div>
        </div>
      </div>

      <div className="fam-lista-ferragens">
        <div className="fam-lista-resumo-titulo">Ferragens</div>
        {ferragens.length === 0
          ? <p className="fam-hint">Nenhuma ferragem nesta configuração.</p>
          : (
            <div className="fam-tabela fam-lista-rolagem">
              <table className="fam-lista-tabela">
                <thead>
                  <tr><th>Nome</th><th>Código</th><th className="n">Quantidade</th></tr>
                </thead>
                <tbody>
                  {ferragens.map((ferragem) => (
                    <tr key={ferragem.id}>
                      <td>{ferragem.nome}</td>
                      <td className="mono">{ferragem.codigo ?? '—'}</td>
                      <td className="n">{ferragem.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
