import type { ResultadoCircuito, TabelasEletricas } from '@hestia/engine';
import type { CircuitoConsultado, Id } from '@hestia/model';
import type { ReactElement } from 'react';
import { NumField } from '../fields.tsx';

/*
 * Resultado do dimensionamento de UM circuito no painel Circuitos (ficha C5): potência aplicada, corrente de projeto, seção,
 * disjuntor, comprimento e queda de tensão, SEMPRE com o selo CONFERIR enquanto as tabelas não forem conferidas. Só apresentação.
 */

export interface AcoesDimensionamento {
  onFp?: (id: Id, fp: number | null) => void;
  onSecao?: (id: Id, secao: number | null) => void;
  onDisjuntor?: (id: Id, disjuntor: number | null) => void;
}

// units-ok: A, VA, W e mm2 são grandezas elétricas, não medidas do sistema de unidades do projeto
export const num = (v: number | null | undefined, casas = 1): string => (v === null || v === undefined || !Number.isFinite(v) ? '–' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas === 0 ? 0 : 1 }).format(v));

export const SeloConferir = ({ tabelas }: { tabelas: TabelasEletricas }): ReactElement | null =>
  tabelas.estado === 'conferido' ? null : <span className="circ-selo" title={tabelas.fonte} data-conferir>CONFERIR</span>;

export function CircuitoResultado({ c, r, acoes }: { c: CircuitoConsultado; r: ResultadoCircuito; acoes: AcoesDimensionamento }): ReactElement {
  const t = r.tabela;
  const adotada = c.secaoMm2 !== undefined;
  return (
    <div className="circ-calculo" data-calculo={c.id}>
      <dl className="circ-res">
        <div><dt>Potência aplicada</dt><dd data-res="potencia">{num(r.potenciaAplicadaVA, 0)} VA ({num(r.potenciaAplicadaW, 0)} W)</dd></div>
        <div><dt>Corrente de projeto</dt><dd data-res="corrente" className={r.sobrecarregado ? 'circ-ruim' : ''}>{num(r.correnteA, 2)} A</dd></div>
        <div><dt>Seção do condutor</dt><dd data-res="secao">{r.secaoMm2 === null ? 'nenhuma serve' : `${num(r.secaoMm2)} mm2${adotada ? ' (adotada)' : ''}`}</dd></div>
        <div><dt>Disjuntor</dt><dd data-res="disjuntor">{r.disjuntorA === null ? '–' : `${num(r.disjuntorA, 0)} A${c.disjuntorA !== undefined ? ' (adotado)' : ''}`}</dd></div>
        <div><dt>Comprimento</dt><dd data-res="comprimento">{r.comprimentoM === null ? 'sem comprimento' : `${num(r.comprimentoM, 2)} m`}</dd></div>
        <div><dt>Queda de tensão</dt><dd data-res="queda" className={r.quedaExcedida ? 'circ-ruim' : ''}>{r.quedaPct === null ? '–' : `${num(r.quedaPct, 2)} % (limite ${num(r.quedaMaximaPct)} %)`}</dd></div>
      </dl>
      <SeloConferir tabelas={t} />
      {r.avisos.map((a) => <p key={a} className="circ-alerta" role="status">{a}</p>)}
      <div className="circ-linha">
        <label>Fator de potência
          <NumField value={c.fp ?? r.fp} decimals={2} min={0.01} max={1} width={64} strictRange onCommit={(v) => acoes.onFp?.(c.id, v)} onClear={() => acoes.onFp?.(c.id, null)} placeholder={String(t.fatorPotenciaPadrao)} />
        </label>
        <label>Seção adotada
          <select className="input" aria-label={`Seção adotada do circuito ${c.nome}`} value={c.secaoMm2 ?? ''} onChange={(e) => acoes.onSecao?.(c.id, e.target.value ? Number(e.target.value) : null)}>
            <option value="">(calculada)</option>
            {t.secoes.map((s) => <option key={s} value={s}>{s} mm2</option>)}
          </select>
        </label>
        <label>Disjuntor adotado
          <select className="input" aria-label={`Disjuntor adotado do circuito ${c.nome}`} value={c.disjuntorA ?? ''} onChange={(e) => acoes.onDisjuntor?.(c.id, e.target.value ? Number(e.target.value) : null)}>
            <option value="">(calculado)</option>
            {t.disjuntoresA.map((d) => <option key={d} value={d}>{d} A</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
