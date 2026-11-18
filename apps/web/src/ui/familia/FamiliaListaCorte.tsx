import { pecasParaCorte, planoDeCorte, type LinhaLista, type PecaParaCorte } from '@hestia/engine';
import { chapaPorId, type Catalogo } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { CampoNumero } from './FamiliaParametrosCampos.tsx';
import { tm } from '../moveisTextos.ts';
import { pecasForaDoPlano } from './familiaCorte.ts';
import {
  chapasPresentes,
  geometriaDaChapa,
  linhasDaChapa,
  textoMm,
  textoPercentual,
} from './familiaLista.ts';
import './familiaCorte.css';

/** Aba Plano de corte: escolha da chapa, serra e desenho de cada chapa com as peças posicionadas. */

interface PropsCorte {
  linhas: readonly LinhaLista[];
  catalogo: Catalogo;
}

function nomeCurto(peca: PecaParaCorte | undefined, indice: number): string {
  const nome = peca?.id ?? tm('mov_peca_n', { n: indice + 1 });
  return nome.length > 18 ? `${nome.slice(0, 17)}…` : nome;
}

export function FamiliaListaCorte({ linhas, catalogo }: PropsCorte): ReactElement {
  const chapas = chapasPresentes(linhas, catalogo);
  const [sel, setSel] = useState('');
  const [serra, setSerra] = useState(3);
  const escolhida = chapas.find((chapa) => chapa.id === sel) ?? chapas[0];

  if (escolhida === undefined) {
    return <p className="fam-hint">{tm('mov_corte_sem_chapa')}</p>;
  }

  const chapa = chapaPorId(catalogo, escolhida.id) ?? escolhida;
  const doPlano = linhasDaChapa(linhas, chapa.id);
  const pecas = pecasParaCorte(doPlano);
  const chapaParaCorte = {
    largura: chapa.largura,
    altura: chapa.altura,
    refilo: chapa.refilo,
    veio: chapa.veio,
    kerf: serra,
  };
  const plano = planoDeCorte(pecas, chapaParaCorte);
  const geometria = geometriaDaChapa(plano, chapa);
  const foraDoPlano = pecasForaDoPlano(pecas, plano.naoCouberam, chapaParaCorte);
  const fora = linhas
    .filter((linha) => linha.chapa !== chapa.id)
    .reduce((soma, linha) => soma + linha.quantidade, 0);

  return (
    <div className="fam-lista-aba-conteudo">
      {foraDoPlano.length > 0 && (
        <section className="fam-lista-nao-coube" role="alert" aria-label={tm('mov_corte_nao_couberam_aria')}>
          <div className="fam-lista-nao-coube-titulo">{tm('mov_corte_nao_couberam', { n: foraDoPlano.length })}</div>
          <ul>
            {foraDoPlano.map((item, indice) => (
              <li key={`${item.nome}-${indice}`}>
                <span className="fam-lista-nao-coube-nome">{item.nome}</span>
                <span className="fam-lista-nao-coube-medida">{item.medida}</span>
                <span className="fam-lista-nao-coube-motivo">{item.motivo}</span>
                <span className="fam-lista-nao-coube-dica">{item.dica}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="fam-lista-barra">
        <label>
          {tm('mov_chapa')}
          <select className="fam-f" value={chapa.id} onChange={(e) => setSel(e.target.value)}>
            {chapas.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>)}
          </select>
        </label>
        <label>
          {tm('mov_serra')}
          <CampoNumero
            valor={serra}
            ariaLabel={tm('mov_serra')}
            classe="fam-lista-campo"
            aoGravar={(n) => {
              if (n === undefined || n < 0) return false;
              setSerra(n);
              return true;
            }}
          />
        </label>
      </div>

      <div className="fam-lista-corte-resumo">
        <span>{tm('mov_aproveitamento')} <b>{textoPercentual(geometria.aproveitamento)}</b></span>
        <span>{tm('mov_orc_chapas')}: <b>{geometria.chapas.length}</b></span>
        <span>{tm('mov_pecas_no_plano')} <b>{pecas.length}</b></span>
      </div>

      {fora > 0 && (
        <p className="fam-hint">{tm('mov_corte_fora', { n: fora })}</p>
      )}

      <div className="fam-lista-chapas">
        {geometria.chapas.map((cortada, indice) => (
          <div className="fam-lista-chapa" key={indice}>
            <div className="fam-lista-chapa-topo">
              {tm('mov_chapa_n', { n: indice + 1 })} · {textoMm(cortada.largura)} × {textoMm(cortada.altura)} mm
            </div>
            <svg
              viewBox={`0 0 ${cortada.largura} ${cortada.altura}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={tm('mov_chapa_plano_aria', { n: indice + 1 })}
            >
              <rect className="fam-lista-chapa-bruta" x={0} y={0} width={cortada.largura} height={cortada.altura} />
              <rect className="fam-lista-chapa-util" x={cortada.util.x} y={cortada.util.y} width={cortada.util.w} height={cortada.util.h} />
              {cortada.pecas.map((posicao) => {
                const peca = pecas[posicao.peca];
                const nome = nomeCurto(peca, posicao.peca);
                const medida = `${textoMm(posicao.w)} × ${textoMm(posicao.h)}`;
                const titulo = peca === undefined
                  ? `${nome} — ${medida} mm`
                  : `${peca.id} — ${textoMm(peca.comprimento)} × ${textoMm(peca.largura)} mm`;
                return (
                  <g key={posicao.peca} className="fam-lista-peca-g">
                    <title>{titulo}</title>
                    <rect className="fam-lista-peca" x={posicao.x} y={posicao.y} width={posicao.w} height={posicao.h} />
                    <text className="fam-lista-peca-nome" x={posicao.x + posicao.w / 2} y={posicao.y + posicao.h / 2 - 6} textAnchor="middle">{nome}</text>
                    <text className="fam-lista-peca-medida" x={posicao.x + posicao.w / 2} y={posicao.y + posicao.h / 2 + 28} textAnchor="middle">{medida}</text>
                    {posicao.girada && <text className="fam-lista-peca-girada" x={posicao.x + 18} y={posicao.y + 42}>↻</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
