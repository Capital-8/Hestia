import type { FerragemResolvida, LinhaLista, ResumoLista } from '@hestia/engine';
import { chapaPorId, type Catalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { simboloVeio, textoArea, textoMetros, textoMm } from './familiaLista.ts';
import { tm } from '../moveisTextos.ts';

/** Aba Lista: tabela de peças agrupadas, resumo de áreas/fitas/usinagens e tabela de ferragens. */

interface PropsLista {
  linhas: readonly LinhaLista[];
  resumo: ResumoLista;
  ferragens: readonly FerragemResolvida[];
  catalogo: Catalogo;
}

const LADOS_FITA: ReadonlyArray<{ chave: 'c1' | 'c2' | 'l1' | 'l2'; rotulo: 'mov_fita_c1' | 'mov_fita_c2' | 'mov_fita_l1' | 'mov_fita_l2' }> = [
  { chave: 'c1', rotulo: 'mov_fita_c1' },
  { chave: 'c2', rotulo: 'mov_fita_c2' },
  { chave: 'l1', rotulo: 'mov_fita_l1' },
  { chave: 'l2', rotulo: 'mov_fita_l2' },
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
              <th className="n">{tm('mov_orc_qtd')}</th>
              <th>{tm('mov_lista_peca')}</th>
              <th>{tm('mov_papel')}</th>
              <th>{tm('mov_lista_chapa_material')}</th>
              <th className="n">{tm('mov_comprimento')}</th>
              <th className="n">{tm('mov_largura')}</th>
              <th className="n">{tm('mov_lista_espessura')}</th>
              <th>{tm('mov_lista_veio')}</th>
              {LADOS_FITA.map((lado) => <th key={lado.chave} className="fam-lista-fita-col">{tm(lado.rotulo)}</th>)}
              <th className="n">{tm('mov_lista_furos')}</th>
              <th className="n">{tm('mov_lista_rasgos')}</th>
              <th className="n">{tm('mov_lista_recortes')}</th>
              <th className="n">{tm('mov_lista_area')}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={16} className="fam-hint">{tm('mov_lista_sem_pecas')}</td></tr>
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
          <div className="fam-lista-resumo-titulo">{tm('mov_orc_resumo')}</div>
          <div><b>{resumo.totalPecas}</b> {tm('mov_pecas_min')}</div>
          <div>{tm('mov_area_total')} {textoArea(resumo.areaM2, 4)}</div>
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">{tm('mov_lista_area_chapa')}</div>
          {resumo.porChapa.length === 0
            ? <div className="fam-hint">{tm('mov_sem_pecas')}</div>
            : (
              <ul className="fam-lista-resumo-lista">
                {resumo.porChapa.map((item) => (
                  <li key={`${item.chapa ?? 'sem'}-${item.espessura}`}>
                    {nomeDaChapa(catalogo, item.chapa)} · {textoMm(item.espessura)} mm — {textoArea(item.area, 4)}
                    <span className="fam-mut">{item.pecas} {tm('mov_pecas_min')}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">{tm('mov_lista_fita_tipo')}</div>
          {resumo.fitaMetros.length === 0
            ? <div className="fam-hint">{tm('mov_sem_fita')}</div>
            : (
              <ul className="fam-lista-resumo-lista">
                {resumo.fitaMetros.map((item) => (
                  <li key={item.fita}>{item.fita}: {textoMetros(item.metros)}</li>
                ))}
              </ul>
            )}
        </div>

        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">{tm('mov_lista_usinagens')}</div>
          <div>{tm('mov_lista_furos')}: {resumo.usinagens.furos}</div>
          <div>{tm('mov_lista_rasgos')}: {resumo.usinagens.rasgos}</div>
          <div>{tm('mov_lista_recortes')}: {resumo.usinagens.recortes}</div>
        </div>
      </div>

      <div className="fam-lista-ferragens">
        <div className="fam-lista-resumo-titulo">{tm('mov_orc_ferragens')}</div>
        {ferragens.length === 0
          ? <p className="fam-hint">{tm('mov_orc_sem_ferragem_config')}</p>
          : (
            <div className="fam-tabela fam-lista-rolagem">
              <table className="fam-lista-tabela">
                <thead>
                  <tr><th>{tm('mov_nome')}</th><th>{tm('mov_codigo')}</th><th className="n">{tm('mov_quantidade')}</th></tr>
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
