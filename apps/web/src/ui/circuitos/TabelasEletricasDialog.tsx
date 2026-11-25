import { chaveSecao, marcarConferido, mesclarTabelas, validarTabelas, AVISO_TABELAS, type TabelasEletricas } from '@hestia/engine';
import { ROTULO_TIPO_CIRCUITO, TIPOS_CIRCUITO } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { Dialog } from '../dialogs/Dialog.tsx';
import { NumField, TextField } from '../fields.tsx';
import { guardarTabelas, restaurarTabelas, useTabelasEletricas } from './tabelasNavegador.ts';
import './circuitos.css';

/*
 * Diálogo "Tabelas elétricas" (ficha C5): edita as tabelas do dimensionamento. Cada edição vale na hora e VOLTA o estado para
 * CONFERIR; só "Marcar como conferido" (com o nome de quem conferiu) muda o selo. Os números provisórios NÃO são norma. Texto fixo
 * em português, como os demais painéis MEP.
 */

const emLista = (texto: string): number[] => texto.split(/[;\s]+/).map((x) => Number(x.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0);
const mostrar = (l: number[]): string => l.join(' ');

export function TabelasEletricasDialog({ onClose }: { onClose: () => void }): ReactElement {
  const t = useTabelasEletricas();
  const [quem, setQuem] = useState('');
  const edita = (parcial: Partial<TabelasEletricas>): void => guardarTabelas(mesclarTabelas(t, parcial));
  const problemas = validarTabelas(t);
  const conferido = t.estado === 'conferido';
  return (
    <Dialog
      title="Tabelas elétricas"
      sub="Valores de partida PROVISÓRIOS, editáveis. Confira cada um contra a norma vigente e o catálogo do fabricante do condutor antes de usar."
      onClose={onClose}
      size="wide"
      z={70}
      footer={
        <>
          <button className="btn" onClick={restaurarTabelas}>Restaurar o provisório</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Fechar</button>
        </>
      }
    >
      <div className="circ-tabelas" data-tabelas-estado={t.estado}>
        <p className={`circ-conferir${conferido ? ' ok' : ''}`} role="status">
          {conferido ? `Tabelas conferidas por ${t.conferidoPor ?? ''}${t.conferidoEm ? ` em ${t.conferidoEm}` : ''}.` : `CONFERIR: ${AVISO_TABELAS}`}
        </p>
        {problemas.map((p) => <p key={p} className="circ-alerta" role="status">{p}</p>)}
        <div className="circ-linha">
          <label>Queda de tensão máxima (%)<NumField id="tab-queda" value={t.quedaMaximaPct} decimals={1} min={0.1} max={100} width={72} onCommit={(v) => edita({ quedaMaximaPct: v })} /></label>
          <label>Resistividade do cobre (ohm mm2/m)<NumField id="tab-rho" value={t.resistividadeCobre} decimals={4} min={0.001} width={90} onCommit={(v) => edita({ resistividadeCobre: v })} /></label>
          <label>Fator de potência padrão<NumField id="tab-fp" value={t.fatorPotenciaPadrao} decimals={2} min={0.01} max={1} width={72} onCommit={(v) => edita({ fatorPotenciaPadrao: v })} /></label>
        </div>
        <label className="circ-col">Seções comerciais (mm2, separadas por espaço)
          <TextField value={mostrar(t.secoes)} onCommit={(v) => edita({ secoes: emLista(v) })} />
        </label>
        <label className="circ-col">Disjuntores padronizados (A, separados por espaço)
          <TextField value={mostrar(t.disjuntoresA)} onCommit={(v) => edita({ disjuntoresA: emLista(v) })} />
        </label>
        <h3>Capacidade de condução por seção (eletroduto embutido, provisório)</h3>
        <table className="circ-tab" aria-label="Capacidade de condução">
          <thead><tr><th>Seção (mm2)</th><th>Capacidade (A)</th></tr></thead>
          <tbody>
            {t.secoes.map((s) => (
              <tr key={s} data-secao={s}>
                <td>{s}</td>
                <td><NumField value={t.capacidadeA[chaveSecao(s)] ?? 0} decimals={1} min={0.1} width={84} onCommit={(v) => edita({ capacidadeA: { [chaveSecao(s)]: v } })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Por tipo de circuito</h3>
        <table className="circ-tab" aria-label="Por tipo de circuito">
          <thead><tr><th>Tipo</th><th>Seção mínima (mm2)</th><th>Fator de demanda (0 a 1)</th></tr></thead>
          <tbody>
            {TIPOS_CIRCUITO.map((tipo) => (
              <tr key={tipo} data-tipo={tipo}>
                <td>{ROTULO_TIPO_CIRCUITO[tipo]}</td>
                <td><NumField value={t.secaoMinimaMm2[tipo]} decimals={1} min={0.1} width={72} onCommit={(v) => edita({ secaoMinimaMm2: { ...t.secaoMinimaMm2, [tipo]: v } })} /></td>
                <td><NumField value={t.fatorDemanda[tipo]} decimals={2} min={0.01} max={1} width={72} onCommit={(v) => edita({ fatorDemanda: { ...t.fatorDemanda, [tipo]: v } })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="circ-linha">
          <label>Conferido por<input className="input" aria-label="Conferido por" value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="seu nome" /></label>
          <button className="btn" disabled={!quem.trim()} onClick={() => guardarTabelas(marcarConferido(t, quem, new Date().toISOString().slice(0, 10)))}>Marcar como conferido</button>
        </div>
        <p className="circ-dica">As tabelas ficam neste navegador (como Meus catálogos) e não vão dentro do arquivo do projeto.</p>
      </div>
    </Dialog>
  );
}
