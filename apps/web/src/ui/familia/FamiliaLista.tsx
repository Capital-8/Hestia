import { listaDePecas, listaPecasCsv, resumirLista } from '@hestia/engine';
import { dxfDasPecas } from '@hestia/io';
import { useMemo, useState, type ReactElement } from 'react';
import { Janela } from './FamiliaJanela.tsx';
import { FamiliaListaCorte } from './FamiliaListaCorte.tsx';
import { FamiliaListaCusto } from './FamiliaListaCusto.tsx';
import { FamiliaListaEtiquetas } from './FamiliaListaEtiquetas.tsx';
import { FamiliaListaTabela } from './FamiliaListaTabela.tsx';
import { nomeDoArquivo, pecasEfetivas, textoDimensoesEnv } from './familiaLista.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaLista.css';

/**
 * Lista de peças do editor (diálogo largo): tabela, plano de corte, custo e etiquetas, com CSV e DXF.
 * As peças efetivas incluem as cavilhas automáticas quando a opção está ligada.
 */

type AbaLista = 'lista' | 'corte' | 'custo' | 'etiquetas';

const ABAS: ReadonlyArray<{ id: AbaLista; rotulo: string }> = [
  { id: 'lista', rotulo: 'Lista' },
  { id: 'corte', rotulo: 'Plano de corte' },
  { id: 'custo', rotulo: 'Custo' },
  { id: 'etiquetas', rotulo: 'Etiquetas' },
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

export function FamiliaLista(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const catalogo = useFamilia((s) => s.catalogo);
  const cavilhas = useFamilia((s) => s.cavilhas);
  const set = useFamilia((s) => s.set);
  const resolucao = useResolucao();
  const [aba, setAba] = useState<AbaLista>('lista');
  const [mensagem, setMensagem] = useState<string | null>(null);

  const tipo = familia.tipos.find((t) => t.id === tipoId);
  const efetivas = useMemo(() => pecasEfetivas(resolucao.pecas, cavilhas), [resolucao.pecas, cavilhas]);
  const linhas = useMemo(() => listaDePecas(efetivas), [efetivas]);
  const resumo = useMemo(() => resumirLista(linhas), [linhas]);
  const tipoDoArquivo = tipoId ?? familia.tipoPadrao ?? 'tipo';

  const copiarCsv = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(listaPecasCsv(linhas));
      setMensagem('CSV copiado');
    } catch {
      setMensagem('Não foi possível copiar');
    }
  };

  const baixarCsv = (): void => {
    baixarArquivo(nomeDoArquivo(familia.id, tipoDoArquivo, 'csv'), listaPecasCsv(linhas), 'text/csv;charset=utf-8');
  };

  const baixarDxf = (): void => {
    baixarArquivo(nomeDoArquivo(familia.id, tipoDoArquivo, 'dxf'), dxfDasPecas(efetivas), 'application/dxf');
  };

  return (
    <Janela
      titulo={`Lista de peças · ${tipo?.nome ?? familia.nome} · ${textoDimensoesEnv(resolucao.env)} mm`}
      larga
      rodape={<span className="fam-hint">{resumo.totalPecas} peças em {linhas.length} linhas</span>}
    >
      <div className="fam-lista">
        <div className="fam-lista-abas" role="tablist" aria-label="Seções da lista de peças">
          {ABAS.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              role="tab"
              id={`fam-lista-aba-${opcao.id}`}
              aria-selected={aba === opcao.id}
              aria-controls={`fam-lista-painel-${opcao.id}`}
              className={aba === opcao.id ? 'on' : ''}
              onClick={() => setAba(opcao.id)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>

        <div className="fam-lista-opcoes">
          <label>
            <input type="checkbox" checked={cavilhas} onChange={(e) => set({ cavilhas: e.target.checked })} />
            {' '}Cavilhas automáticas
          </label>
          <span className="fam-lista-msg" role="status">{mensagem}</span>
          <span className="fam-lista-espaco" />
          <button type="button" className="fam-bt" onClick={() => { void copiarCsv(); }}>Copiar CSV</button>
          <button type="button" className="fam-bt" onClick={baixarCsv}>Baixar CSV</button>
          <button type="button" className="fam-bt" onClick={baixarDxf}>Baixar DXF</button>
        </div>

        <div
          className="fam-lista-painel"
          role="tabpanel"
          id={`fam-lista-painel-${aba}`}
          aria-labelledby={`fam-lista-aba-${aba}`}
        >
          {aba === 'lista' && (
            <FamiliaListaTabela linhas={linhas} resumo={resumo} ferragens={resolucao.ferragens} catalogo={catalogo} />
          )}
          {aba === 'corte' && <FamiliaListaCorte linhas={linhas} catalogo={catalogo} />}
          {aba === 'custo' && <FamiliaListaCusto resumo={resumo} catalogo={catalogo} ferragens={resolucao.ferragens} />}
          {aba === 'etiquetas' && <FamiliaListaEtiquetas linhas={linhas} />}
        </div>
      </div>
    </Janela>
  );
}
