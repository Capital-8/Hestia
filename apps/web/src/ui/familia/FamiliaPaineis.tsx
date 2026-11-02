import type { ReactElement, ReactNode } from 'react';
import { compilar } from './expressao.ts';
import { DERIVADOS, PARAMS, TIPOS, type CampoFormula, type Peca } from './familiaModelo.ts';
import { useFamilia } from './familiaStore.ts';
import { validar, type Resolucao } from './resolver.ts';

/** Painéis laterais do editor: navegador da família (esquerda) e Flexionar, validação e propriedades da peça (direita). */

const Li = ({ cls = '', id, children }: { cls?: string; id?: string; children: ReactNode }): ReactElement => {
  const sel = useFamilia((s) => s.sel);
  return (
    <li className={`${cls}${id !== undefined && id === sel ? ' sel' : ''}`} onClick={id !== undefined ? () => useFamilia.getState().set({ sel: id }) : undefined}>{children}</li>
  );
};

export function NavegadorFamilia({ res }: { res: Resolucao }): ReactElement {
  const pecas = useFamilia((s) => s.pecas);
  const tipoId = useFamilia((s) => s.tipoId);
  return (
    <ul className="fam-tree">
      <Li cls="h">▾ Parâmetros ({PARAMS.length + DERIVADOS.length})</Li>
      <Li cls="l2">L · A · P · corpo · montagem · fundo…</Li>
      <Li cls="l2"><span className="fam-sig">Σ</span> {DERIVADOS.length} derivados</Li>
      <Li cls="h">▾ Planos de referência (3)</Li>
      <Li cls="l2">Esquerda · Direita · Frente</Li>
      <Li cls="h">▾ Peças ({pecas.length} definidas, {res.pecas.length} resolvidas)</Li>
      {pecas.map((p) => {
        const n = res.pecas.filter((x) => x.id === p.id).length;
        const erro = Object.keys(res.erros).some((k) => k.startsWith(`${p.id}.`));
        return <Li key={p.id} cls="l2" id={p.id}>{p.nome}<span className="fam-mut">{n === 0 && !erro ? 'oculta (condição)' : `×${n}`}</span>{erro && <span className="fam-err">!</span>}</Li>;
      })}
      <Li cls="h">▾ Ferragens (3)</Li>
      <Li cls="l2">Dobradiça ×4 · Puxador ×2 · Pino ×8</Li>
      <Li cls="h">▾ Tipos ({TIPOS.length})</Li>
      {TIPOS.map((t) => <li key={t.id} className={`l2${t.id === tipoId ? ' sel' : ''}`} onClick={() => useFamilia.getState().escolherTipo(t.id)}>{t.nome}</li>)}
    </ul>
  );
}

function Controle({ id }: { id: string }): ReactElement {
  const p = PARAMS.find((x) => x.id === id)!;
  const v = useFamilia((s) => s.valores[id]);
  const setValor = useFamilia((s) => s.setValor);
  if (p.ctl === 'sel') {
    return (
      <div className="fam-row"><label htmlFor={`fx-${id}`}>{p.nome}</label>
        <select id={`fx-${id}`} className="fam-f" value={String(v)} onChange={(e) => setValor(id, typeof p.opts?.[0] === 'number' ? Number(e.target.value) : e.target.value)}>{p.opts?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
      </div>
    );
  }
  return (
    <div className="fam-slider"><label htmlFor={`fx-${id}`}>{p.nome.split(' ')[0]}</label>
      <input id={`fx-${id}`} type="range" min={p.min} max={p.max} step={p.step} value={Number(v)} onChange={(e) => setValor(id, Number(e.target.value))} />
      <output>{String(v)}</output>
    </div>
  );
}

function Campo({ peca, campo, rotulo }: { peca: Peca; campo: CampoFormula; rotulo: string }): ReactElement {
  const texto = peca[campo] ?? '';
  const c = compilar(texto);
  return (
    <>
      <div className="fam-row"><label htmlFor={`pc-${campo}`}>{rotulo}</label>
        <input id={`pc-${campo}`} className={`fam-f mono${c.err ? ' bad' : ''}`} value={texto} onChange={(e) => useFamilia.getState().setFormula(peca.id, campo, e.target.value)} aria-invalid={c.err ? true : undefined} />
      </div>
      {c.err && <div className="fam-msg erro">{c.err}</div>}
    </>
  );
}

const Linha = ({ rotulo, valor, ro }: { rotulo: string; valor: ReactNode; ro?: boolean }): ReactElement => (
  <div className={`fam-row${ro ? ' ro' : ''}`}><label>{rotulo}</label><div className="fam-v">{valor}</div></div>
);

export function PropriedadesFamilia({ res }: { res: Resolucao }): ReactElement {
  const sel = useFamilia((s) => s.sel);
  const pecas = useFamilia((s) => s.pecas);
  const valores = useFamilia((s) => s.valores);
  const p = pecas.find((x) => x.id === sel);
  const r = res.pecas.find((x) => x.id === sel);
  const avisos = validar(res).slice(0, 5);
  return (
    <>
      <div className="fam-grp"><div className="fam-gh">Flexionar (testa a família)</div>
        {['L', 'A', 'P', 'nPrat', 'nPortas', 'corpo', 'montagem', 'fundo', 'tampo'].map((id) => <Controle key={id} id={id} />)}
        <div className="fam-hint">Cada movimento reavalia as fórmulas e valida: peça fora da caixa, dimensão ≤ 0, atravessamento.</div>
      </div>
      <div className="fam-grp"><div className="fam-gh">Validação</div>
        {avisos.map((a, i) => <div key={i} className={`fam-msg${a.nivel === 'erro' ? ' erro' : ''}`}>{a.msg}</div>)}
      </div>
      {!p ? <div className="fam-hint">Selecione uma peça.</div> : (
        <>
          <div className="fam-grp"><div className="fam-gh">Identidade</div>
            <Linha rotulo="Nome" valor={p.nome} /><Linha rotulo="Papel" valor={p.papel} />
            <Linha rotulo="Chapa / material" valor={p.cor === 'corpo' ? `corpo (${String(valores.corpo)} mm)` : p.cor} /><Linha rotulo="Eixo da espessura" valor={p.eixo.toUpperCase()} />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Posição (canto mínimo)</div>
            <Campo peca={p} campo="ox" rotulo="X" /><Campo peca={p} campo="oy" rotulo="Y (frente → fundo)" /><Campo peca={p} campo="oz" rotulo="Z (altura)" />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Tamanho</div>
            <Campo peca={p} campo="a" rotulo={p.eixo === 'x' ? 'a · profundidade' : 'a · largura'} /><Campo peca={p} campo="b" rotulo={p.eixo === 'z' ? 'b · profundidade' : 'b · altura'} /><Campo peca={p} campo="t" rotulo="Espessura" />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Repetição e condição</div>
            {p.n !== undefined ? <Campo peca={p} campo="n" rotulo="Repetir (n)" /> : <Linha rotulo="Repetir" valor="— (uma peça)" ro />}
            {p.when !== undefined ? <Campo peca={p} campo="when" rotulo="Existe se" /> : <Linha rotulo="Existe se" valor="sempre" ro />}
          </div>
          <div className="fam-grp"><div className="fam-gh">Fabricação</div>
            <Linha rotulo="Fita de borda" valor={p.fita} /><Linha rotulo="Veio" valor={p.veio} /><Linha rotulo="Usinagens" valor={`${r?.usinagens ?? 0} (fórmula)`} /><Linha rotulo="Detalhe 3D" valor="grosso · médio · fino" />
          </div>
          <div className="fam-hint">{r ? `Resolvida: ${r.ca} × ${r.cb} × ${r.ct} mm em (${r.ox}, ${r.oy}, ${r.oz}).` : 'Esta peça não aparece com os valores atuais.'}</div>
        </>
      )}
    </>
  );
}
