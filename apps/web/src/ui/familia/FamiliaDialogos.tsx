import type { PecaResolvida } from '@hestia/engine';
import { resumirPecas } from '@hestia/engine';
import type { ReactElement, ReactNode } from 'react';
import { valorEfetivo } from './acoes.ts';
import { mm } from './familiaDesenho.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import { ModelosNovo } from './FamiliaModelos.tsx';

/** Diálogos do editor de famílias: Parâmetros, Tipos, Lista de peças e Novo módulo. Mesma pele dos diálogos do app. */

function Janela({ titulo, children, rodape, larga }: { titulo: string; children: ReactNode; rodape?: ReactNode; larga?: boolean }): ReactElement {
  const fechar = (): void => useFamilia.getState().set({ dialogo: null });
  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className={`fam-dwin${larga ? ' larga' : ''}`} role="dialog" aria-label={titulo}>
        <div className="fam-dt"><span>{titulo}</span><button aria-label="Fechar" onClick={fechar}>✕</button></div>
        <div className="fam-db">{children}</div>
        <div className="fam-df">{rodape}<span style={{ flex: 1 }} /><button className="fam-bt pri" onClick={fechar}>OK</button></div>
      </div>
    </div>
  );
}

function Parametros(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const valores = useFamilia((s) => s.valores);
  const resolucao = useResolucao();
  return (
    <Janela titulo={`Parâmetros da família · ${familia.nome}`} rodape={<><button className="fam-bt" disabled title="Somente leitura nesta ficha">Novo parâmetro…</button><button className="fam-bt" disabled title="Somente leitura nesta ficha">Excluir</button></>}>
      <div className="fam-tabela"><table>
        <thead><tr><th>Nome</th><th>Tipo de dado</th><th>Escopo</th><th>Valor</th><th>Faixa</th><th>Fórmula</th></tr></thead>
        <tbody>
          {familia.parametros.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.tipo}</td>
              <td><span className={`fam-tag${p.escopo === 'instancia' ? ' novo' : ''}`}>{p.escopo}</span></td>
              <td className="mono">{p.formula !== undefined ? String(resolucao.env[p.id]) : String(valorEfetivo(familia, tipoId, valores, p))}</td>
              <td className="mono">{p.min !== undefined || p.max !== undefined ? `${p.min ?? '—'} – ${p.max ?? '—'}` : '—'}</td>
              <td className="mono">{p.formula !== undefined ? <><span className="fam-sig">Σ</span> {p.formula}</> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="fam-hint">No máximo 256 parâmetros e fórmulas de até 512 caracteres; ciclo entre fórmulas é recusado ao salvar; o resultado é arredondado a 1 µm uma vez, na saída.</div>
    </Janela>
  );
}

function Tipos(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const escolherTipo = useFamilia((s) => s.escolherTipo);
  return (
    <Janela titulo={`Tipos da família · ${familia.nome}`} larga rodape={<><button className="fam-bt" disabled title="Somente leitura nesta ficha">Novo tipo</button><button className="fam-bt" disabled title="Somente leitura nesta ficha">Duplicar</button><button className="fam-bt" disabled title="Somente leitura nesta ficha">Excluir</button></>}>
      <div className="fam-tabela"><table>
        <thead><tr><th>Tipo</th>{familia.parametros.map((p) => <th key={p.id}>{p.nome}{p.escopo === 'instancia' && <span className="fam-mut"> (padrão)</span>}</th>)}</tr></thead>
        <tbody>{familia.tipos.map((t) => (
          <tr key={t.id} className={t.id === tipoId ? 'sel' : ''} onClick={() => escolherTipo(t.id)} style={{ cursor: 'pointer' }}>
            <td><b>{t.nome}</b></td>
            {familia.parametros.map((p) => <td key={p.id} className="n">{p.formula !== undefined ? <span className="fam-sig">Σ</span> : String(t.valores[p.id] ?? p.padrao)}</td>)}
          </tr>
        ))}</tbody>
      </table></div>
      <div className="fam-hint">Clique numa linha para tornar o tipo corrente. Parâmetros de instância mostram o valor padrão do tipo; cada móvel colocado pode mudá-lo.</div>
    </Janela>
  );
}

function textoFita(fita: PecaResolvida['fita']): string {
  if (fita === null) return '—';
  const lados = Object.entries(fita).filter(([, v]) => v !== undefined && v !== 'nenhuma').map(([k]) => k);
  return lados.length > 0 ? lados.join(' ') : '—';
}

function ListaPecas(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const resolucao = useResolucao();
  const tipo = familia.tipos.find((t) => t.id === tipoId);
  const resumo = resumirPecas(resolucao.pecas);
  const area = Object.values(resumo.areaPorEspessura).reduce((s, a) => s + a, 0);
  // units-ok: resumo de exemplo do protótipo (a lista real formata pelas unidades do projeto)
  const porEspessura = Object.entries(resumo.areaPorEspessura).map(([e, a]) => `${e} mm: ${a.toFixed(2)} m²`).join(' · ');
  return (
    <Janela titulo={`Lista de peças · ${tipo?.nome ?? ''} · L ${String(resolucao.env.L)} × A ${String(resolucao.env.A)} × P ${String(resolucao.env.P)}`} larga rodape={<><button className="fam-bt">Copiar CSV</button><button className="fam-bt" disabled title="Fase posterior (F10)">Plano de corte…</button></>}>
      <div className="fam-tabela"><table>
        {/* units-ok: cabeçalho de exemplo do protótipo */}
        <thead><tr><th className="n">Nº</th><th>Peça</th><th>Papel</th><th>Material</th><th className="n">Comp.</th><th className="n">Larg.</th><th className="n">Esp.</th><th>Fita</th><th>Veio</th><th className="n">Área m²</th></tr></thead>
        <tbody>{resolucao.pecas.map((p, i) => (
          // units-ok: medidas em mm e área em m² do protótipo
          <tr key={`${p.id}${i}`}><td className="n">{i + 1}</td><td>{p.nome}</td><td>{p.papel}</td><td>{p.material ?? '—'}</td><td className="n">{mm(p.tamanho[0])}</td><td className="n">{mm(p.tamanho[1])}</td><td className="n">{mm(p.espessura)}</td><td>{textoFita(p.fita)}</td><td>{p.veio ?? '—'}</td><td className="n">{(p.tamanho[0] * p.tamanho[1]).toFixed(3)}</td></tr>
        ))}</tbody>
      </table></div>
      {/* units-ok: resumo em m²/m³ de exemplo do protótipo */}
      <p className="fam-resumo"><b>{resumo.quantidade}</b> peças · área <b>{area.toFixed(2)} m²</b> ({porEspessura}) · volume <b>{resumo.volume.toFixed(3)} m³</b> · vazios <b>{resumo.vazios}</b>.</p>
    </Janela>
  );
}

export function FamiliaDialogos(): ReactElement | null {
  const d = useFamilia((s) => s.dialogo);
  if (d === 'parametros') return <Parametros />;
  if (d === 'tipos') return <Tipos />;
  if (d === 'pecas') return <ListaPecas />;
  if (d === 'novo') return <Janela titulo="Novo ▸ Família ▸ Escolha o modelo" larga rodape={<span className="fam-mut">O modelo só preenche parâmetros, peças e fórmulas; nada fica preso a ele.</span>}><ModelosNovo /></Janela>;
  return null;
}
