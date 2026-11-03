import { compilar, escreverCampo, lerCampo, type CampoPeca, type PapelPeca, type Peca } from '@hestia/model';
import type { ReactElement, ReactNode } from 'react';
import { mm } from './familiaDesenho.ts';
import { FamiliaFabricacao } from './FamiliaFabricacao.tsx';
import { FamiliaUsinagens } from './FamiliaUsinagens.tsx';
import { FamiliaPecaAcoes } from './FamiliaPecaAcoes.tsx';
import { FamiliaPecaArranjo } from './FamiliaPecaArranjo.tsx';
import { AtalhosPeca } from './FamiliaPecaAtalhos.tsx';
import { PAPEIS, rotuloDoPapel } from './familiaPeca.ts';
import { executarPeca, useAvisoPeca } from './familiaPecaAviso.ts';
import { Flexionar } from './FamiliaFlexao.tsx';
import { FamiliaPromover } from './FamiliaPromover.tsx';
import { Validacao } from './FamiliaValidacao.tsx';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaPeca.css';

/** Painéis laterais do editor: navegador da família (esquerda) e Flexionar, validação e propriedades da peça (direita). */

const Li = ({ cls = '', id, children, onClick }: { cls?: string; id?: string; children: ReactNode; onClick?: () => void }): ReactElement => {
  const sel = useFamilia((s) => s.sel);
  return (
    <li className={`${cls}${id !== undefined && id === sel ? ' sel' : ''}`} onClick={onClick ?? (id !== undefined ? () => useFamilia.getState().selecionarPeca(id) : undefined)}>{children}</li>
  );
};

export function NavegadorFamilia(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const escolherTipo = useFamilia((s) => s.escolherTipo);
  const res = useResolucao();
  const derivados = familia.parametros.filter((p) => p.formula !== undefined).length;
  const nomes = familia.parametros.slice(0, 6).map((p) => p.id).join(' · ');
  return (
    <ul className="fam-tree">
      <Li cls="h">▾ Parâmetros ({familia.parametros.length})</Li>
      <Li cls="l2">{nomes}{familia.parametros.length > 6 ? '…' : ''}</Li>
      <Li cls="l2"><span className="fam-sig">Σ</span> {derivados} derivados</Li>
      <Li cls="h">▾ Planos de referência ({familia.planos.length})</Li>
      <Li cls="l2">{familia.planos.map((p) => p.nome).join(' · ') || '—'}</Li>
      <Li cls="h">▾ Peças ({familia.pecas.length} definidas, {res.pecas.length} resolvidas)</Li>
      <li className="fam-peca-acoes-li"><FamiliaPecaAcoes /></li>
      {familia.pecas.map((p) => {
        const n = res.pecas.filter((x) => x.id === p.id).length;
        const erro = res.erros.some((e) => e.onde.startsWith(`peca:${p.id}.`));
        return (
          <Li key={p.id} cls="l2" id={p.id}>
            {p.nome}
            <span className="fam-mut">{n === 0 ? 'oculta (condição)' : `×${n}`}</span>
            {erro && <span className="fam-err">!</span>}
          </Li>
        );
      })}
      <Li cls="h">▾ Ferragens ({familia.ferragens.length})</Li>
      {familia.ferragens.map((f) => <Li key={f.id} cls="l2">{f.nome}<span className="fam-mut">{f.quantidade}</span></Li>)}
      <Li cls="h">▾ Tipos ({familia.tipos.length})</Li>
      {familia.tipos.map((t) => (
        <li key={t.id} className={`l2${t.id === tipoId ? ' sel' : ''}`} onClick={() => escolherTipo(t.id)}>{t.nome}</li>
      ))}
    </ul>
  );
}

function Campo({ peca, campo, rotulo, promover = false }: { peca: Peca; campo: CampoPeca; rotulo: string; promover?: boolean }): ReactElement {
  const texto = lerCampo(peca, campo) ?? '';
  const opcional = campo === 'repetir' || campo === 'quando';
  const compilada = opcional && texto === '' ? null : compilar(texto);
  const erro = compilada !== null && 'erro' in compilada ? compilada.erro.message : undefined;
  const id = `pc-${peca.id}-${campo}`;
  const entrada = (
    <input
      id={id}
      className={`fam-f mono${erro !== undefined ? ' bad' : ''}`}
      value={texto}
      onChange={(e) => executarPeca(`Editar ${rotulo}`, (f) => escreverCampo(f, peca.id, campo, e.target.value))}
      aria-invalid={erro !== undefined ? true : undefined}
    />
  );
  return (
    <>
      <div className="fam-row"><label htmlFor={id}>{rotulo}</label>
        {promover
          ? <div className="fam-campo-promover">{entrada}<FamiliaPromover peca={peca} campo={campo} rotulo={rotulo} /></div>
          : entrada}
      </div>
      {erro !== undefined && <div className="fam-msg erro">{erro}</div>}
    </>
  );
}

const Linha = ({ rotulo, valor }: { rotulo: string; valor: ReactNode }): ReactElement => (
  <div className="fam-row ro"><label>{rotulo}</label><div className="fam-v">{valor}</div></div>
);

export function PropriedadesFamilia(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const sel = useFamilia((s) => s.sel);
  const res = useResolucao();
  const erro = useAvisoPeca((s) => s.erro);
  const p = sel === null ? undefined : familia.pecas.find((x) => x.id === sel);
  const repetidas = sel === null ? [] : res.pecas.filter((x) => x.id === sel);
  const r = repetidas[0];

  const renomear = (nome: string): void => {
    if (p === undefined) return;
    executarPeca('Renomear peça', (f) => {
      const peca = f.pecas.find((x) => x.id === p.id);
      if (peca === undefined) return `peça “${p.id}” não existe`;
      peca.nome = nome;
      return null;
    });
  };

  const trocarPapel = (papel: PapelPeca): void => {
    if (p === undefined) return;
    executarPeca('Alterar papel', (f) => {
      const peca = f.pecas.find((x) => x.id === p.id);
      if (peca === undefined) return `peça “${p.id}” não existe`;
      peca.papel = papel;
      return null;
    });
  };

  return (
    <>
      <AtalhosPeca />
      {erro !== null && <div className="fam-aviso-erro" role="alert">{erro}</div>}
      <Flexionar />
      <Validacao />
      {p === undefined ? <div className="fam-hint">Selecione uma peça.</div> : (
        <>
          <div className="fam-grp"><div className="fam-gh">Identidade</div>
            <div className="fam-row"><label htmlFor={`pc-${p.id}-nome`}>Nome</label>
              <input id={`pc-${p.id}-nome`} className="fam-f" value={p.nome} onChange={(e) => renomear(e.target.value)} />
            </div>
            <div className="fam-row"><label htmlFor={`pc-${p.id}-papel`}>Papel</label>
              <select id={`pc-${p.id}-papel`} className="fam-f" value={p.papel} onChange={(e) => trocarPapel(e.target.value as PapelPeca)}>
                {PAPEIS.map((papel) => <option key={papel} value={papel}>{rotuloDoPapel(papel)}</option>)}
              </select>
            </div>
            <Linha rotulo="Eixo da espessura" valor={p.eixo.toUpperCase()} />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Origem (canto mínimo)</div>
            <Campo peca={p} campo="origem0" rotulo="Origem X" promover />
            <Campo peca={p} campo="origem1" rotulo="Origem Y" promover />
            <Campo peca={p} campo="origem2" rotulo="Origem Z" promover />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Tamanho</div>
            <Campo peca={p} campo="tamanho0" rotulo="Tamanho a" promover />
            <Campo peca={p} campo="tamanho1" rotulo="Tamanho b" promover />
            <Campo peca={p} campo="espessura" rotulo="Espessura" promover />
          </div>
          <div className="fam-grp"><div className="fam-gh"><span className="fam-sig">Σ</span> Repetição e condição</div>
            <Campo peca={p} campo="repetir" rotulo="Repetir (n)" />
            <Campo peca={p} campo="quando" rotulo="Existe se" />
          </div>
          <FamiliaFabricacao peca={p} />
          <FamiliaUsinagens peca={p} />
          <div className="fam-grp"><div className="fam-gh">Ações</div><FamiliaPecaArranjo peca={p} /></div>
          <div className="fam-hint">
            {r === undefined
              ? 'Esta peça não aparece com os valores atuais.'
              // units-ok: medida resolvida em mm (o motor devolve metros) para a inspeção do protótipo
              : `Resolvida: ${mm(r.tamanho[0])} × ${mm(r.tamanho[1])} × ${mm(r.espessura)} mm em (${mm(r.origem[0])}, ${mm(r.origem[1])}, ${mm(r.origem[2])})${repetidas.length > 1 ? ` · ${repetidas.length} peças` : ''}.`}
          </div>
        </>
      )}
    </>
  );
}
