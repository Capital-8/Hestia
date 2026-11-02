import type { ReactElement, ReactNode } from 'react';
import { DERIVADOS, PARAMS, TIPOS } from './familiaModelo.ts';
import { useFamilia } from './familiaStore.ts';
import { quantitativos, type Resolucao } from './resolver.ts';
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

function Parametros({ res }: { res: Resolucao }): ReactElement {
  const valores = useFamilia((s) => s.valores);
  const setValor = useFamilia((s) => s.setValor);
  return (
    <Janela titulo="Parâmetros da família · Armário baixo" rodape={<><button className="fam-bt">Novo parâmetro…</button><button className="fam-bt">Excluir</button></>}>
      <div className="fam-tabela"><table>
        <thead><tr><th>Nome</th><th>Tipo de dado</th><th>Escopo</th><th>Valor</th><th>Faixa</th><th>Fórmula</th></tr></thead>
        <tbody>
          {PARAMS.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.tipo}</td><td><span className={`fam-tag${p.escopo === 'instância' ? ' novo' : ''}`}>{p.escopo}</span></td>
              <td>{p.ctl === 'sel'
                ? <select className="fam-f" aria-label={p.nome} value={String(valores[p.id])} onChange={(e) => setValor(p.id, typeof p.opts?.[0] === 'number' ? Number(e.target.value) : e.target.value)}>{p.opts?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : <input className="fam-f" type="number" aria-label={p.nome} min={p.min} max={p.max} step={p.step} value={Number(valores[p.id])} onChange={(e) => setValor(p.id, Number(e.target.value))} style={{ width: 90 }} />}</td>
              <td className="mono">{p.min !== undefined ? `${p.min} – ${p.max}` : '—'}</td><td className="mono">—</td></tr>
          ))}
          {DERIVADOS.map((d) => (
            <tr key={d.id}><td>{d.nome}</td><td>número</td><td><span className="fam-tag">tipo</span></td><td className="mono">{String(res.env[d.id])}</td><td>—</td><td className="mono"><span className="fam-sig">Σ</span> {d.f}</td></tr>
          ))}
        </tbody>
      </table></div>
      <div className="fam-hint">No máximo 256 parâmetros e fórmulas de até 512 caracteres; ciclo entre fórmulas é recusado ao salvar; o resultado é arredondado a 1 µm uma vez, na saída.</div>
    </Janela>
  );
}

function Tipos(): ReactElement {
  const tipoId = useFamilia((s) => s.tipoId);
  const escolher = useFamilia((s) => s.escolherTipo);
  return (
    <Janela titulo="Tipos da família · Armário baixo" larga rodape={<><button className="fam-bt">Novo tipo</button><button className="fam-bt">Duplicar</button><button className="fam-bt">Excluir</button></>}>
      <div className="fam-tabela"><table>
        <thead><tr><th>Tipo</th>{PARAMS.map((p) => <th key={p.id}>{p.nome.replace(/ \(.*/, '')}{p.escopo === 'instância' && <span className="fam-mut"> (padrão)</span>}</th>)}</tr></thead>
        <tbody>{TIPOS.map((t) => (
          <tr key={t.id} className={t.id === tipoId ? 'sel' : ''} onClick={() => escolher(t.id)} style={{ cursor: 'pointer' }}><td><b>{t.nome}</b></td>{PARAMS.map((p) => <td key={p.id} className="n">{String(t.v[p.id])}</td>)}</tr>
        ))}</tbody>
      </table></div>
      <div className="fam-hint">Clique numa linha para tornar o tipo corrente. Parâmetros de instância mostram o valor padrão do tipo; cada móvel colocado pode mudá-lo.</div>
    </Janela>
  );
}

function ListaPecas({ res }: { res: Resolucao }): ReactElement {
  const tipoId = useFamilia((s) => s.tipoId);
  const tipo = TIPOS.find((t) => t.id === tipoId);
  const v = useFamilia((s) => s.valores);
  const qt = quantitativos(res.pecas);
  // units-ok: áreas em m² de exemplo do protótipo (a lista real formata pelas unidades do projeto)
  const resumo = Object.entries(qt.porEspessura).map(([e, a]) => `${e} mm: ${a.toFixed(2)} m²`).join(' · ');
  return (
    <Janela titulo={`Lista de peças · ${tipo?.nome ?? ''} · L ${String(v.L)} × A ${String(v.A)} × P ${String(v.P)}`} larga rodape={<><button className="fam-bt">Copiar CSV</button><button className="fam-bt" disabled title="Fase posterior (F10)">Plano de corte…</button></>}>
      <div className="fam-tabela"><table>
        {/* units-ok: cabeçalho de exemplo do protótipo */}
        <thead><tr><th className="n">Nº</th><th>Peça</th><th>Papel</th><th>Material</th><th className="n">Comp.</th><th className="n">Larg.</th><th className="n">Esp.</th><th>Fita</th><th>Veio</th><th className="n">Usin.</th><th className="n">Área m²</th></tr></thead>
        <tbody>{res.pecas.map((p, i) => (
          // units-ok: idem
          <tr key={`${p.id}${i}`}><td className="n">{i + 1}</td><td>{p.nome}</td><td>{p.papel}</td><td>{p.cor === 'fundo' ? 'MDF fundo' : 'MDF'} {p.ct} mm</td><td className="n">{p.ca}</td><td className="n">{p.cb}</td><td className="n">{p.ct}</td><td>{p.fita}</td><td>{p.veio}</td><td className="n">{p.usinagens}</td><td className="n">{((p.ca * p.cb) / 1e6).toFixed(3)}</td></tr>
        ))}</tbody>
      </table></div>
      {/* units-ok: idem */}
      <p className="fam-resumo"><b>{res.pecas.length}</b> peças · área <b>{qt.areaM2.toFixed(2)} m²</b> ({resumo}) · fita ≈ <b>{qt.fitaM.toFixed(1)} m</b> · usinagens <b>{qt.usinagens}</b>. <span className="fam-mut">Fita e usinagens são estimativas de exemplo neste protótipo.</span></p>
    </Janela>
  );
}

export function FamiliaDialogos({ res }: { res: Resolucao }): ReactElement | null {
  const d = useFamilia((s) => s.dialogo);
  if (d === 'parametros') return <Parametros res={res} />;
  if (d === 'tipos') return <Tipos />;
  if (d === 'pecas') return <ListaPecas res={res} />;
  if (d === 'novo') return <Janela titulo="Novo ▸ Família ▸ Escolha o modelo" larga rodape={<span className="fam-mut">O modelo só preenche parâmetros, peças e fórmulas; nada fica preso a ele.</span>}><ModelosNovo /></Janela>;
  return null;
}
