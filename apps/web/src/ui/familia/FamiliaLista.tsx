import type { PecaResolvida } from '@hestia/engine';
import { resumirPecas } from '@hestia/engine';
import type { ReactElement } from 'react';
import { mm } from './familiaDesenho.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import { Janela } from './FamiliaJanela.tsx';

/**
 * Lista de peças (diálogo). BASE provisória: a ficha E6-ui a reescreve com `listaDePecas`, resumo, custo, CSV, plano de corte, DXF e
 * etiquetas (funções de `@hestia/engine` e `@hestia/io`).
 */

function textoFita(fita: PecaResolvida['fita']): string {
  if (fita === null) return '—';
  const lados = Object.entries(fita).filter(([, v]) => v !== undefined && v !== 'nenhuma').map(([k]) => k);
  return lados.length > 0 ? lados.join(' ') : '—';
}

export function FamiliaLista(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const resolucao = useResolucao();
  const tipo = familia.tipos.find((t) => t.id === tipoId);
  const resumo = resumirPecas(resolucao.pecas);
  return (
    <Janela titulo={`Lista de peças · ${tipo?.nome ?? ''}`} larga>
      <div className="fam-tabela"><table>
        {/* units-ok: cabeçalho provisório */}
        <thead><tr><th className="n">Nº</th><th>Peça</th><th>Papel</th><th>Material</th><th className="n">Comp.</th><th className="n">Larg.</th><th className="n">Esp.</th><th>Fita</th><th>Veio</th></tr></thead>
        <tbody>{resolucao.pecas.map((p, i) => (
          <tr key={`${p.id}${i}`}><td className="n">{i + 1}</td><td>{p.nome}</td><td>{p.papel}</td><td>{p.material ?? '—'}</td><td className="n">{mm(p.tamanho[0])}</td><td className="n">{mm(p.tamanho[1])}</td><td className="n">{mm(p.espessura)}</td><td>{textoFita(p.fita)}</td><td>{p.veio ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="fam-resumo"><b>{resumo.quantidade}</b> peças.</p>
    </Janela>
  );
}
