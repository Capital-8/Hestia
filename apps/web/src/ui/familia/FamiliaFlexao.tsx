import type { Parametro } from '@hestia/model';
import type { ReactElement } from 'react';
import { agruparParametros, controlesDeFlex, lerEntrada, rotuloDoValor, valorEfetivo, type TipoControle } from './acoes.ts';
import { useFamilia } from './familiaStore.ts';

/** Flexionar gerado dos parâmetros da família: cada mudança vai para o flex (fora do histórico) e reavalia a resolução. */

function ControleFlex({ param, controle }: { param: Parametro; controle: TipoControle }): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const valores = useFamilia((s) => s.valores);
  const setValor = useFamilia((s) => s.setValor);
  const limparValor = useFamilia((s) => s.limparValor);
  const valor = valorEfetivo(familia, tipoId, valores, param);
  const id = `fx-${param.id}`;
  const entrada = (texto: string): void => {
    const v = lerEntrada(param, texto);
    if (v !== null) setValor(param.id, v);
  };
  const botao = <button className="fam-reset" title="Voltar ao valor do tipo (limpa o ajuste)" aria-label={`Limpar ${param.nome}`} onClick={() => limparValor(param.id)}>↺</button>;

  if (controle === 'slider') {
    return (
      <div className="fam-ctl">
        <div className="fam-slider"><label htmlFor={id}>{param.nome}</label>
          <input id={id} type="range" min={param.min} max={param.max} step={param.passo ?? 1} value={Number(valor)} onChange={(e) => setValor(param.id, Number(e.target.value))} />
          <output>{String(valor)}</output>
        </div>
        {botao}
      </div>
    );
  }
  if (controle === 'select') {
    return (
      <div className="fam-ctl">
        <div className="fam-row"><label htmlFor={id}>{param.nome}</label>
          <select id={id} className="fam-f" value={String(valor)} onChange={(e) => entrada(e.target.value)}>
            {(param.opcoes ?? []).map((o) => <option key={String(o.valor)} value={String(o.valor)}>{rotuloDoValor(param, o.valor)}</option>)}
          </select>
        </div>
        {botao}
      </div>
    );
  }
  if (controle === 'check') {
    return (
      <div className="fam-ctl">
        <div className="fam-row"><label htmlFor={id}>{param.nome}</label>
          <input id={id} type="checkbox" checked={Boolean(valor)} onChange={(e) => setValor(param.id, e.target.checked)} />
        </div>
        {botao}
      </div>
    );
  }
  if (controle === 'numero') {
    return (
      <div className="fam-ctl">
        <div className="fam-row"><label htmlFor={id}>{param.nome}</label>
          <input id={id} className="fam-f" type="number" min={param.min} max={param.max} step={param.passo ?? (param.tipo === 'inteiro' ? 1 : 'any')} value={Number(valor)} onChange={(e) => entrada(e.target.value)} />
        </div>
        {botao}
      </div>
    );
  }
  return (
    <div className="fam-ctl">
      <div className="fam-row"><label htmlFor={id}>{param.nome}</label>
        <input id={id} className="fam-f" value={String(valor)} onChange={(e) => entrada(e.target.value)} />
      </div>
      {botao}
    </div>
  );
}

export function Flexionar(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const controles = controlesDeFlex(familia);
  const grupos = agruparParametros(controles.map((c) => c.param));
  const porId = new Map(controles.map((c) => [c.param.id, c.controle]));
  return (
    <div className="fam-grp"><div className="fam-gh">Flexionar (testa a família)</div>
      {grupos.length === 0
        ? <div className="fam-hint">Esta família não tem parâmetros livres para flexionar.</div>
        : grupos.map((g) => (
          <div key={g.grupo}>
            <div className="fam-gh">{g.grupo}</div>
            {g.params.map((p) => <ControleFlex key={p.id} param={p} controle={porId.get(p.id)!} />)}
          </div>
        ))}
      <div className="fam-hint">Cada movimento reavalia as fórmulas e valida: peça fora da caixa, dimensão ≤ 0, atravessamento.</div>
    </div>
  );
}
