import { ROTULO_TIPO_CIRCUITO, TIPOS_CIRCUITO, type CircuitoConsultado, type ConsultaCircuitos, type Id, type TipoCircuito } from '@hestia/model';
import type { ReactElement } from 'react';
import { NumField, TextField } from '../fields.tsx';
import { textoVA } from './circuitosAcoes.ts';
import './circuitos.css';

/*
 * Vista do painel Circuitos (ficha C4): só apresentação. Recebe a consulta do projeto e callbacks; o contêiner (`CircuitosPainel`)
 * liga os callbacks aos comandos. Texto fixo em português, como os demais painéis MEP.
 */

export interface AcoesCircuitos {
  onNovo: () => void;
  onRenomear: (id: Id, nome: string) => void;
  onTipo: (id: Id, tipo: TipoCircuito) => void;
  onTensao: (id: Id, tensao: number) => void;
  onCor: (id: Id, cor: string) => void;
  onQuadro: (id: Id, quadroId: Id | undefined) => void;
  onAtribuir: (id: Id) => void;
  onApagar: (id: Id) => void;
  onPotencia: (circuitoId: Id, componenteId: Id, potenciaVA: number, fator?: number) => void;
  onTirar: (componenteId: Id) => void;
  onRenomearQuadro: (id: Id, nome: string) => void;
}

export interface PropsCircuitosView {
  consulta: ConsultaCircuitos;
  /** Quantos componentes (que não são quadro) estão selecionados no projeto: habilita "Atribuir selecionados". */
  selecionados: number;
  /** Itens selecionados que NÃO são ponto elétrico (eletroduto, curva, luva, caixa...): ficam de fora e o painel avisa (ficha C8a). */
  ignorados?: number;
  /** Mensagem do último erro de comando, ou `null`. */
  erro?: string | null;
  /** Mensagem do último resultado (ex.: "2 pontos atribuídos"), ou `null`. */
  aviso?: string | null;
  acoes: AcoesCircuitos;
  /** Comprimento (m) do circuito pela rede de eletrodutos; `null` = sem caminho. Só informação (sem cálculo elétrico). */
  comprimentos?: Readonly<Record<Id, number | null>>;
}

// units-ok: comprimento de eletroduto em m, só informação do painel (não é medida do sistema de unidades do projeto)
const textoMetros = (m: number): string => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(m)} m`;

function LinhaPonto({ c, p, acoes }: { c: CircuitoConsultado; p: CircuitoConsultado['pontos'][number]; acoes: AcoesCircuitos }): ReactElement {
  return (
    <li className="circ-ponto" data-ponto={p.componenteId}>
      <span className="circ-ponto-nome" style={{ borderLeft: `4px solid ${c.cor}` }}>{p.rotulo} <small>({p.componenteId})</small></span>
      <NumField value={p.potenciaVA} decimals={0} min={0} suffix="VA" width={84} onCommit={(v) => acoes.onPotencia(c.id, p.componenteId, v, p.fator)} />
      <button type="button" className="btn" aria-label={`Tirar ${p.componenteId} do circuito ${c.nome}`} onClick={() => acoes.onTirar(p.componenteId)}>Tirar</button>
    </li>
  );
}

function CartaoCircuito({ c, quadros, selecionados, acoes, comprimento }: { c: CircuitoConsultado; quadros: ConsultaCircuitos['quadros']; selecionados: number; acoes: AcoesCircuitos; comprimento?: number | null }): ReactElement {
  return (
    <section className="circ-cartao" data-circuito={c.id} aria-label={`Circuito ${c.nome}`}>
      <header className="circ-cab">
        <input type="color" className="circ-cor" aria-label={`Cor do circuito ${c.nome}`} value={c.cor} onChange={(e) => acoes.onCor(c.id, e.target.value)} />
        <TextField value={c.nome} onCommit={(v) => acoes.onRenomear(c.id, v)} />
        <strong className="circ-total" data-total-circuito={c.id}>{textoVA(c.totalVA)}</strong>
      </header>
      <div className="circ-linha">
        <label>Tipo
          <select className="input" value={c.tipo} onChange={(e) => acoes.onTipo(c.id, e.target.value as TipoCircuito)}>
            {TIPOS_CIRCUITO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_CIRCUITO[t]}</option>)}
          </select>
        </label>
        <label>Tensão (V)
          <NumField value={c.tensao} decimals={0} min={1} width={64} onCommit={(v) => acoes.onTensao(c.id, v)} />
        </label>
        <label>Quadro
          <select className="input" value={c.quadroId ?? ''} aria-label={`Quadro do circuito ${c.nome}`} onChange={(e) => acoes.onQuadro(c.id, e.target.value || undefined)}>
            <option value="">(sem quadro)</option>
            {quadros.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
          </select>
        </label>
      </div>
      {c.quadroId === undefined || !quadros.some((q) => q.id === c.quadroId) ? <p className="circ-alerta" role="status">Circuito sem quadro: escolha o quadro que o alimenta.</p> : null}
      {c.removidos > 0 ? <p className="circ-alerta" role="status">{c.removidos} ponto(s) apontavam para componentes que não existem mais e foram ignorados.</p> : null}
      {comprimento !== undefined ? <p className="circ-dica" data-comprimento={c.id}>Eletrodutos até o ponto mais distante: {comprimento === null ? 'sem caminho' : textoMetros(comprimento)}</p> : null}
      <ul className="circ-pontos">
        {c.pontos.map((p) => <LinhaPonto key={p.componenteId} c={c} p={p} acoes={acoes} />)}
        {c.pontos.length === 0 ? <li className="circ-vazio">Sem pontos. Selecione tomadas, interruptores ou luminárias no desenho e use Atribuir selecionados.</li> : null}
      </ul>
      <div className="circ-linha">
        <button type="button" className="btn" disabled={selecionados === 0} onClick={() => acoes.onAtribuir(c.id)}>Atribuir selecionados ({selecionados})</button>
        <button type="button" className="btn" onClick={() => acoes.onApagar(c.id)}>Apagar circuito</button>
      </div>
    </section>
  );
}

export function CircuitosView({ consulta, selecionados, ignorados = 0, erro, aviso, acoes, comprimentos }: PropsCircuitosView): ReactElement {
  const { circuitos, quadros, semQuadroVA } = consulta;
  return (
    <div className="circ-painel">
      {erro ? <p className="circ-erro" role="alert">{erro}</p> : null}
      {aviso && !erro ? <p className="circ-aviso" role="status">{aviso}</p> : null}
      <div className="circ-linha">
        <button type="button" className="btn primary" onClick={acoes.onNovo}>Novo circuito</button>
        <span className="circ-dica">{selecionados} componente(s) selecionado(s)</span>
        {ignorados > 0 ? <span className="circ-dica" data-ignorados>{ignorados} {ignorados === 1 ? 'item ignorado' : 'itens ignorados'} (não {ignorados === 1 ? 'é ponto elétrico' : 'são ponto elétrico'})</span> : null}
      </div>
      <h3>Quadros</h3>
      {quadros.length === 0 ? <p className="circ-vazio">Nenhum quadro no projeto. Insira o Quadro de distribuição pela aba Sistemas, Elétrico.</p> : (
        <ul className="circ-quadros">
          {quadros.map((q) => (
            <li key={q.id} className="circ-quadro" data-quadro={q.id}>
              <TextField value={q.nome} onCommit={(v) => acoes.onRenomearQuadro(q.id, v)} />
              <span>{q.circuitos.length} circuito(s){q.posicoes !== undefined ? ` de ${q.posicoes} posições` : ''}</span>
              <strong data-total-quadro={q.id}>{textoVA(q.totalVA)}</strong>
            </li>
          ))}
        </ul>
      )}
      {semQuadroVA > 0 ? <p className="circ-alerta" data-total-sem-quadro>Sem quadro: {textoVA(semQuadroVA)}</p> : null}
      <h3>Circuitos</h3>
      {circuitos.length === 0 ? <p className="circ-vazio">Nenhum circuito. Use Novo circuito.</p> : circuitos.map((c) => <CartaoCircuito key={c.id} c={c} quadros={quadros} selecionados={selecionados} acoes={acoes} comprimento={comprimentos?.[c.id]} />)}
    </div>
  );
}
