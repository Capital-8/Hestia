import { listaPecasCsv, orcamentoDoProjeto } from '@hestia/engine';
import { CATALOGO_PADRAO, type Id } from '@hestia/model';
import { create } from 'zustand';
import { useMemo, useState, type ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useT, type Dict } from '../editor/i18n.ts';
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

const ABAS: ReadonlyArray<{ id: AbaOrcamento; rotulo: keyof Dict }> = [
  { id: 'resumo', rotulo: 'mov_orc_resumo' },
  { id: 'pecas', rotulo: 'mov_pecas' },
  { id: 'corte', rotulo: 'mov_orc_corte' },
  { id: 'ferragens', rotulo: 'mov_orc_ferragens' },
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
  const { t } = useT();
  const totalUnidades = orcamento.moveis.reduce((s, m) => s + m.quantidade, 0);
  const linhasCusto: ReadonlyArray<{ rotulo: keyof Dict; valor: number; total?: boolean }> = [
    { rotulo: 'mov_orc_chapas', valor: orcamento.custo.chapas },
    { rotulo: 'mov_orc_fitas', valor: orcamento.custo.fitas },
    { rotulo: 'mov_orc_ferragens', valor: orcamento.custo.ferragens },
    { rotulo: 'mov_total', valor: orcamento.custo.total, total: true },
  ];
  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela">
          <thead>
            <tr><th>{t('mov_orc_moveis')}</th><th>{t('mov_tipo')}</th><th className="n">{t('mov_orc_qtd')}</th><th className="n">{t('mov_pecas')}</th><th className="n">{t('mov_orc_custo')}</th></tr>
          </thead>
          <tbody>
            {orcamento.moveis.map((m, i) => (
              <tr key={`${m.familiaId}-${m.tipoId ?? ''}-${i}`}>
                <td className="orc-movel-nome">{m.nome}</td>
                <td className="mono">{m.tipoId ?? t('mov_orc_padrao')}</td>
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
          <div className="fam-lista-resumo-titulo">{t('mov_orc_moveis_pl')}</div>
          <div><b>{totalUnidades}</b> {t('mov_orc_comp_em', { n: orcamento.moveis.length })}</div>
        </div>
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">{t('mov_pecas')}</div>
          <div><b>{orcamento.resumo.totalPecas}</b> {t('mov_pecas_min')}</div>
          <div>{t('mov_area_total')} {textoArea(orcamento.resumo.areaM2, 4)}</div>
        </div>
        <div className="fam-lista-resumo-bloco">
          <div className="fam-lista-resumo-titulo">{t('mov_custo_estimado')}</div>
          <table className="fam-lista-tabela fam-lista-custo">
            <tbody>
              {linhasCusto.map((l) => (
                <tr key={l.rotulo} className={l.total === true ? 'total' : ''}>
                  <td>{t(l.rotulo)}</td>
                  <td className="n">{textoMoeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {orcamento.avisos.length > 0 && (
        <div className="fam-lista-fora orc-avisos">
          <b>{t('mov_avisos')}</b>
          <ul>{orcamento.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      <p className="fam-hint">{t('mov_custo_nota')}</p>
    </div>
  );
}

function AbaFerragens({ orcamento }: { orcamento: ReturnType<typeof orcamentoDoProjeto> }): ReactElement {
  const { t } = useT();
  if (orcamento.ferragens.length === 0) return <p className="fam-hint">{t('mov_orc_sem_ferragens')}</p>;
  return (
    <div className="fam-lista-aba-conteudo">
      <div className="fam-tabela fam-lista-rolagem">
        <table className="fam-lista-tabela">
          <thead>
            <tr><th>{t('mov_nome')}</th><th className="n">{t('mov_quantidade')}</th></tr>
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
  const { t } = useT();
  const aberta = useOrcamento((s) => s.aberta);
  const fechar = useOrcamento((s) => s.fechar);
  const p = useProject();
  const [aba, setAba] = useState<AbaOrcamento>('resumo');
  const [nivelId, setNivelId] = useState<Id | null>(null);
  const [mensagem, setMensagem] = useState<keyof Dict | null>(null);
  const nivelAtual = nivelOptions(p).some((o) => o.id === nivelId) ? nivelId : null;
  const orcamento = useMemo(() => orcamentoDoProjeto(p, { nivel: nivelAtual ?? undefined }), [p, nivelAtual]);
  const catalogo = p.catalog ?? CATALOGO_PADRAO;
  const semComponentes = mostraSemComponentes(orcamento);

  if (!aberta) return null;

  const copiarCsv = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(listaPecasCsv(orcamento.linhas));
      setMensagem('mov_orc_csv_copiado');
    } catch {
      setMensagem('mov_orc_copia_falhou');
    }
  };

  const baixarCsv = (): void => {
    baixarArquivo(nomeArquivoOrcamento(p), listaPecasCsv(orcamento.linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="fam-dwin larga" role="dialog" aria-label={t('mov_orcamento')}>
        <div className="fam-dt">
          <span>{t('mov_orcamento')} · {rotuloNivel(p, nivelAtual)}</span>
          <button aria-label="Fechar" onClick={fechar}>✕</button>
        </div>
        <div className="fam-db">
          <div className="fam-lista">
            <div className="fam-lista-abas" role="tablist" aria-label={t('mov_orc_secoes')}>
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
                  {t(opcao.rotulo)}
                </button>
              ))}
            </div>

            <div className="fam-lista-opcoes">
              <label>
                {t('mov_nivel')}
                <select className="fam-f" value={nivelAtual ?? ''} onChange={(e) => setNivelId(e.target.value === '' ? null : e.target.value)}>
                  {nivelOptions(p).map((o) => <option key={o.id ?? ''} value={o.id ?? ''}>{o.rotulo}</option>)}
                </select>
              </label>
              <span className="fam-lista-msg" role="status">{mensagem === null ? null : t(mensagem)}</span>
              <span className="fam-lista-espaco" />
              <button type="button" className="fam-bt" disabled={orcamento.linhas.length === 0} onClick={() => { void copiarCsv(); }}>{t('mov_orc_copiar_csv')}</button>
              <button type="button" className="fam-bt" disabled={orcamento.linhas.length === 0} onClick={baixarCsv}>{t('mov_orc_baixar_csv')}</button>
            </div>

            <div className="fam-lista-painel" role="tabpanel" id={`orc-painel-${aba}`} aria-labelledby={`orc-aba-${aba}`}>
              {semComponentes ? (
                <p className="fam-hint">{nivelAtual === null ? t('mov_orc_sem_componentes') : t('mov_orc_sem_componentes_nivel')}</p>
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
            {t('mov_orc_rodape', { n: orcamento.moveis.reduce((s, m) => s + m.quantidade, 0), p: orcamento.resumo.totalPecas, custo: textoMoeda(orcamento.custo.total) })}
          </span>
          <span style={{ flex: 1 }} />
          <button className="fam-bt pri" onClick={fechar}>OK</button>
        </div>
      </div>
    </div>
  );
}
