import { listaPecasCsv, orcamentoDoProjeto } from '@hestia/engine';
import { CATALOGO_PADRAO, type Id } from '@hestia/model';
import { create } from 'zustand';
import { useMemo, useState, type ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { FamiliaListaCorte } from './familia/FamiliaListaCorte.tsx';
import { FamiliaListaTabela } from './familia/FamiliaListaTabela.tsx';
import { textoArea, textoMoeda } from './familia/familiaLista.ts';
import { ferragensParaTabela, mostraSemComponentes, nivelOptions, nomeArquivoOrcamento, rotuloNivel } from './orcamentoProjeto.ts';
import './familia/familia.css';
import './familia/familiaLista.css';
import './OrcamentoProjeto.css';

/**
 * Janela "Orçamento do projeto" (ficha ORC): moveis, lista consolidada de pecas, plano de corte e ferragens de TODOS
 * os componentes colocados, com CSV. Reaproveita as abas da lista do editor de familias e a pele dos dialogos.
 */

interface OrcamentoState {
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
}

export const useOrcamento = create<OrcamentoState>((set) => ({
  aberta: false,
  abrir: () => set({ aberta: true }),
  fechar: () => set({ aberta: false }),
}));

type AbaOrcamento = 'resumo' | 'pecas' | 'corte' | 'ferragens';

const ABAS: ReadonlyArray<{ id: AbaOrcamento; rotulo: string }> = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'pecas', rotulo: 'Peças' },
  { id: 'corte', rotulo: 'Plano de corte' },
  { id: 'ferragens', rotulo: 'Ferragens' },
];

function baixarArquivo(nome: string, conteudo: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AbaResumo({ orcamento }: { orcamento: ReturnType<typeof orcamentoDoProjeto> }): ReactElement {
  const totalUnidades = orcamento.moveis.reduce((s, m) => s + m.quantidade, 0);
  const linhasCusto: ReadonlyArray<{ rotulo: string; valor: number; total?: boolean }> = [
    { rotulo: 'Chapas', valor: orcamento.custo.chapas },
    { rotulo: 'Fitas', valor: orcamento.custo.fitas },
    { rotulo: 'Ferragens', valor: orcamento.custo.ferragens },
    { rotulo: 'Total', valor: orcamento.custo.total, total: true },
  ];
  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela">
          <thead>
            <tr><th>Móvel</th><th>Tipo</th><th className="n">Qtd</th><th className="n">Peças</th><th className="n">Custo</th></tr>
          </thead>
          <tbody>
            {orcamento.moveis.map((m, i) => (
              <tr key={`${m.familiaId}-${m.tipoId ?? ''}-${i}`}>
                <td className="orc-movel-nome">{m.nome}</td>
                <td className="mono">{m.tipoId ?? 'padrão'}</td>
                <td className="n">{m.quantidade}</td>
                <td className="n">{m.pecas}</td>
                <td className="n">{textoMoeda(m.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fam-lista-resumo">
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Móveis</div>
          <div><b>{totalUnidades}</b> componentes em {orcamento.moveis.length} tipo(s)</div>
        </div>
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Peças</div>
          <div><b>{orcamento.resumo.totalPecas}</b> peças</div>
          <div>Área total: {textoArea(orcamento.resumo.areaM2, 4)}</div>
        </div>
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">Custo estimado</div>
          <table className="fam-lista-tabela fam-lista-custo">
            <tbody>
              {linhasCusto.map((l) => (
                <tr key={l.rotulo} className={l.total === true ? 'total' : ''}>
                  <td>{l.rotulo}</td>
                  <td className="n">{textoMoeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {orcamento.avisos.length > 0 && (
        <div className="fam-lista-fora orc-avisos">
          <b>Avisos</b>
          <ul>{orcamento.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      <p className="fam-hint">Custo com as perdas padrão do motor (chapa 15%, fita 10%) e o catálogo do projeto.</p>
    </div>
  );
}

function AbaFerragens({ orcamento }: { orcamento: ReturnType<typeof orcamentoDoProjeto> }): ReactElement {
  if (orcamento.ferragens.length === 0) return <p className="fam-hint">Nenhuma ferragem nos componentes do projeto.</p>;
  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela">
          <thead>
            <tr><th>Nome</th><th className="n">Quantidade</th></tr>
          </thead>
          <tbody>
            {orcamento.ferragens.map((f) => (
              <tr key={f.id}><td>{f.nome}</td><td className="n">{f.quantidade}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrcamentoProjeto(): ReactElement | null {
  const aberta = useOrcamento((s) => s.aberta);
  const fechar = useOrcamento((s) => s.fechar);
  const p = useProject();
  const [aba, setAba] = useState<AbaOrcamento>('resumo');
  const [nivelId, setNivelId] = useState<Id | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const nivelAtual = nivelOptions(p).some((o) => o.id === nivelId) ? nivelId : null;
  const orcamento = useMemo(() => orcamentoDoProjeto(p, { nivel: nivelAtual ?? undefined }), [p, nivelAtual]);
  const catalogo = p.catalog ?? CATALOGO_PADRAO;
  const semComponentes = mostraSemComponentes(orcamento);

  if (!aberta) return null;

  const copiarCsv = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(listaPecasCsv(orcamento.linhas));
      setMensagem('CSV copiado');
    } catch {
      setMensagem('Não foi possível copiar');
    }
  };

  const baixarCsv = (): void => {
    baixarArquivo(nomeArquivoOrcamento(p), listaPecasCsv(orcamento.linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="fam-dwin larga" role="dialog" aria-label="Orçamento do projeto">
        <div className="fam-dt">
          <span>Orçamento do projeto · {rotuloNivel(p, nivelAtual)}</span>
          <button aria-label="Fechar" onClick={fechar}>✕</button>
        </div>
        <div className="fam-db">
          <div className="fam-lista">
            <div className="fam-lista-abas" role="tablist" aria-label="Seções do orçamento">
              {ABAS.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  role="tab"
                  id={`orc-aba-${opcao.id}`}
                  aria-selected={aba === opcao.id}
                  aria-controls={`orc-painel-${opcao.id}`}
                  className={aba === opcao.id ? 'on' : ''}
                  onClick={() => setAba(opcao.id)}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>

            <div className="fam-lista-opcoes">
              <label>
                Nível
                <select className="fam-f" value={nivelAtual ?? ''} onChange={(e) => setNivelId(e.target.value === '' ? null : e.target.value)}>
                  {nivelOptions(p).map((o) => <option key={o.id ?? ''} value={o.id ?? ''}>{o.rotulo}</option>)}
                </select>
              </label>
              <span className="fam-lista-msg" role="status">{mensagem}</span>
              <span className="fam-lista-espaco" />
              <button type="button" className="fam-bt" disabled={orcamento.linhas.length === 0} onClick={() => { void copiarCsv(); }}>Copiar CSV</button>
              <button type="button" className="fam-bt" disabled={orcamento.linhas.length === 0} onClick={baixarCsv}>Baixar CSV</button>
            </div>

            <div className="fam-lista-painel" role="tabpanel" id={`orc-painel-${aba}`} aria-labelledby={`orc-aba-${aba}`}>
              {semComponentes ? (
                <p className="fam-hint">{nivelAtual === null ? 'Nenhum componente no projeto.' : 'Nenhum componente neste nível.'}</p>
              ) : (
                <>
                  {aba === 'resumo' && <AbaResumo orcamento={orcamento} />}
                  {aba === 'pecas' && (
                    <FamiliaListaTabela
                      linhas={orcamento.linhas}
                      resumo={orcamento.resumo}
                      ferragens={ferragensParaTabela(orcamento.ferragens)}
                      catalogo={catalogo}
                    />
                  )}
                  {aba === 'corte' && <FamiliaListaCorte linhas={orcamento.linhas} catalogo={catalogo} />}
                  {aba === 'ferragens' && <AbaFerragens orcamento={orcamento} />}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="fam-df">
          <span className="fam-hint">
            {orcamento.moveis.reduce((s, m) => s + m.quantidade, 0)} componente(s) · {orcamento.resumo.totalPecas} peças · {textoMoeda(orcamento.custo.total)}
          </span>
          <span style={{ flex: 1 }} />
          <button className="fam-bt pri" onClick={fechar}>OK</button>
        </div>
      </div>
    </div>
  );
}
