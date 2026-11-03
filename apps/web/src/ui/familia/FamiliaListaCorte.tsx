import { pecasParaCorte, planoDeCorte, type LinhaLista, type PecaParaCorte } from '@hestia/engine';
import { chapaPorId, type Catalogo } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { CampoNumero } from './FamiliaParametrosCampos.tsx';
import {
  chapasPresentes,
  geometriaDaChapa,
  linhasDaChapa,
  textoMm,
  textoPercentual,
} from './familiaLista.ts';

/** Aba Plano de corte: escolha da chapa, serra e desenho de cada chapa com as peças posicionadas. */

interface PropsCorte {
  linhas: readonly LinhaLista[];
  catalogo: Catalogo;
}

function nomeCurto(peca: PecaParaCorte | undefined, indice: number): string {
  const nome = peca?.id ?? `Peça ${indice + 1}`;
  return nome.length > 18 ? `${nome.slice(0, 17)}…` : nome;
}

export function FamiliaListaCorte({ linhas, catalogo }: PropsCorte): ReactElement {
  const chapas = chapasPresentes(linhas, catalogo);
  const [sel, setSel] = useState('');
  const [serra, setSerra] = useState(3);
  const escolhida = chapas.find((chapa) => chapa.id === sel) ?? chapas[0];

  if (escolhida === undefined) {
    return <p className="fam-hint">Nenhuma peça usa uma chapa do catálogo; não há plano de corte.</p>;
  }

  const chapa = chapaPorId(catalogo, escolhida.id) ?? escolhida;
  const doPlano = linhasDaChapa(linhas, chapa.id);
  const pecas = pecasParaCorte(doPlano);
  const plano = planoDeCorte(pecas, {
    largura: chapa.largura,
    altura: chapa.altura,
    refilo: chapa.refilo,
    veio: chapa.veio,
    kerf: serra,
  });
  const geometria = geometriaDaChapa(plano, chapa);
  const fora = linhas
    .filter((linha) => linha.chapa !== chapa.id)
    .reduce((soma, linha) => soma + linha.quantidade, 0);

  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-lista-barra">
        <label>
          Chapa
          <select className="fam-f" value={chapa.id} onChange={(e) => setSel(e.target.value)}>
            {chapas.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>)}
          </select>
        </label>
        <label>
          Serra (mm)
          <CampoNumero
            valor={serra}
            ariaLabel="Serra (mm)"
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
        <span>Aproveitamento: <b>{textoPercentual(geometria.aproveitamento)}</b></span>
        <span>Chapas: <b>{geometria.chapas.length}</b></span>
        <span>Peças no plano: <b>{pecas.length}</b></span>
      </div>

      {fora > 0 && (
        <p className="fam-hint">{fora} peça(s) de outra chapa ou sem chapa ficaram de fora deste plano.</p>
      )}

      <div className="fam-lista-chapas">
        {geometria.chapas.map((cortada, indice) => (
          <div className="fam-lista-chapa" key={indice}>
            <div className="fam-lista-chapa-topo">
              Chapa {indice + 1} · {textoMm(cortada.largura)} × {textoMm(cortada.altura)} mm
            </div>
            <svg
              viewBox={`0 0 ${cortada.largura} ${cortada.altura}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Chapa ${indice + 1} do plano de corte`}
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

      {geometria.naoCouberam.length > 0 && (
        <div className="fam-lista-fora">
          <b>Não couberam:</b>{' '}
          {geometria.naoCouberam.map((indice) => pecas[indice]?.id ?? `Peça ${indice + 1}`).join(', ')}
        </div>
      )}
    </div>
  );
}
