import {
  LIMITES,
  PARAMETROS_PADRAO,
  adicionarParametro,
  excluirParametro,
  renomearParametro,
  usosDoNome,
  type Escopo,
  type Familia,
  type Parametro,
  type TipoParametro,
  type Valor,
} from '@hestia/model';
import { Fragment, useState, type ReactElement } from 'react';
import { agruparParametros } from './acoes.ts';
import { Janela } from './FamiliaDialogos.tsx';
import { FamiliaOpcoes } from './FamiliaOpcoes.tsx';
import { CampoFormula, CampoNumero, CampoPadrao, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { ROTULO_ESCOPO, ROTULO_TIPO, TIPOS_PARAMETRO, aceitaFormula, parametroNovo, temFaixa, temOpcoes } from './familiaDialogos.ts';
import { useFamilia, useResolucao } from './familiaStore.ts';
import './familiaDialogos.css';

/** Diálogo de Parâmetros: tabela editável, agrupada por `grupo`, com opções, fórmula e usos. */

const COLUNAS = 12;

interface NovoParametro {
  id: string;
  nome: string;
  tipo: TipoParametro;
  escopo: Escopo;
}

const novoVazio = (): NovoParametro => ({ id: '', nome: '', tipo: 'comprimento', escopo: 'tipo' });

type Registrar = (motivo: string | null) => boolean;

export function DialogoParametros(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const executar = useFamilia((s) => s.executar);
  const env = useResolucao().env;
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState<NovoParametro>(novoVazio);
  const [opcoesAbertas, setOpcoesAbertas] = useState<string | null>(null);
  const registrar: Registrar = (motivo) => {
    setMensagem(motivo);
    return motivo === null;
  };
  const grupos = agruparParametros(familia.parametros);
  const criar = (): void => {
    const motivo = executar('Novo parâmetro', (f) => adicionarParametro(f, parametroNovo(novo.id, novo.nome, novo.tipo, novo.escopo)));
    if (registrar(motivo)) {
      setAberto(false);
      setNovo(novoVazio());
    }
  };
  const alternar = (id: string): void => setOpcoesAbertas((atual) => (atual === id ? null : id));
  return (
    <Janela
      titulo={`Parâmetros da família · ${familia.nome}`}
      larga
      rodape={<button className="fam-bt" onClick={() => setAberto((v) => !v)}>Novo parâmetro…</button>}
    >
      {mensagem !== null && <div className="fam-dlg-erro" role="alert">{mensagem}</div>}
      {aberto && (
        <div className="fam-dlg-novo">
          <label>Id<input className="fam-dlg-input" value={novo.id} aria-label="Id do novo parâmetro" onChange={(e) => setNovo((n) => ({ ...n, id: e.target.value }))} /></label>
          <label>Nome<input className="fam-dlg-input" value={novo.nome} aria-label="Nome do novo parâmetro" onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} /></label>
          <label>Tipo de dado<select className="fam-dlg-input" value={novo.tipo} aria-label="Tipo do novo parâmetro" onChange={(e) => setNovo((n) => ({ ...n, tipo: e.target.value as TipoParametro }))}>{TIPOS_PARAMETRO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}</select></label>
          <label>Escopo<select className="fam-dlg-input" value={novo.escopo} aria-label="Escopo do novo parâmetro" onChange={(e) => setNovo((n) => ({ ...n, escopo: e.target.value as Escopo }))}><option value="tipo">{ROTULO_ESCOPO.tipo}</option><option value="instancia">{ROTULO_ESCOPO.instancia}</option></select></label>
          <div className="fam-dlg-novo-acoes">
            <button className="fam-bt pri" onClick={criar}>Criar</button>
            <button className="fam-bt" onClick={() => { setAberto(false); setMensagem(null); }}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="fam-dlg-scroll">
        <table className="fam-dlg-tabela">
          <thead>
            <tr>
              <th>Nome</th><th>Id</th><th>Tipo de dado</th><th>Escopo</th><th>Padrão</th>
              <th className="num">Mín</th><th className="num">Máx</th><th className="num">Passo</th>
              <th>Opções</th><th>Fórmula</th><th className="fam-dlg-usos">Usos</th><th />
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.grupo}>
                <tr className="fam-dlg-grupo"><td colSpan={COLUNAS}>{g.grupo}</td></tr>
                {g.params.map((p) => (
                  <LinhaParametro
                    key={p.id}
                    familia={familia}
                    param={p}
                    env={env}
                    registrar={registrar}
                    opcoesAbertas={opcoesAbertas === p.id}
                    alternarOpcoes={() => alternar(p.id)}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fam-hint">Id novo precisa ser único e começar por letra ou _; fórmulas de até {LIMITES.formula} caracteres. Cada edição vira um passo de desfazer.</div>
    </Janela>
  );
}

interface PropsLinhaParametro {
  familia: Familia;
  param: Parametro;
  env: Readonly<Record<string, Valor>>;
  registrar: Registrar;
  opcoesAbertas: boolean;
  alternarOpcoes: () => void;
}

function LinhaParametro({ familia, param, env, registrar, opcoesAbertas, alternarOpcoes }: PropsLinhaParametro): ReactElement {
  const executar = useFamilia((s) => s.executar);
  const usos = usosDoNome(familia, param.id);
  const comFormula = param.formula !== undefined;
  const idFixo = (PARAMETROS_PADRAO as readonly string[]).includes(param.id);

  const gravarNome = (texto: string): boolean => {
    const nome = texto.trim();
    if (nome === '') {
      registrar('O nome do parâmetro não pode ficar vazio');
      return false;
    }
    if (nome === param.nome) return true;
    return registrar(executar('Renomear parâmetro', (f) => {
      const alvo = f.parametros.find((x) => x?.id === param.id);
      if (alvo === undefined) return 'parâmetro não existe';
      alvo.nome = nome;
      return null;
    }));
  };

  const gravarId = (texto: string): boolean => {
    const novoId = texto.trim();
    if (novoId === param.id) return true;
    return registrar(executar('Renomear parâmetro', (f) => renomearParametro(f, param.id, novoId)));
  };

  const gravarEscopo = (escopo: Escopo): void => {
    registrar(executar(`Editar escopo de ${param.id}`, (f) => {
      const alvo = f.parametros.find((x) => x?.id === param.id);
      if (alvo === undefined) return 'parâmetro não existe';
      if (escopo === 'instancia' && alvo.formula !== undefined) return 'parâmetro com fórmula precisa ter escopo “tipo”';
      alvo.escopo = escopo;
      return null;
    }));
  };

  const gravarPadrao = (valor: Valor): boolean => registrar(executar(`Editar parâmetro ${param.id}`, (f) => {
    const alvo = f.parametros.find((x) => x?.id === param.id);
    if (alvo === undefined) return 'parâmetro não existe';
    alvo.padrao = valor;
    return null;
  }));

  const gravarFaixa = (campo: 'min' | 'max' | 'passo', n: number | undefined): boolean => registrar(executar(`Editar parâmetro ${param.id}`, (f) => {
    const alvo = f.parametros.find((x) => x?.id === param.id);
    if (alvo === undefined) return 'parâmetro não existe';
    if (campo === 'passo' && n !== undefined && n <= 0) return 'o passo precisa ser maior que zero';
    const min = campo === 'min' ? n : alvo.min;
    const max = campo === 'max' ? n : alvo.max;
    if (min !== undefined && max !== undefined && min > max) return 'o mínimo não pode ser maior que o máximo';
    if (n === undefined) {
      if (campo === 'min') delete alvo.min;
      else if (campo === 'max') delete alvo.max;
      else delete alvo.passo;
    } else if (campo === 'min') alvo.min = n;
    else if (campo === 'max') alvo.max = n;
    else alvo.passo = n;
    return null;
  }));

  const gravarFormula = (texto: string): boolean => registrar(executar(`Editar fórmula de ${param.id}`, (f) => {
    const alvo = f.parametros.find((x) => x?.id === param.id);
    if (alvo === undefined) return 'parâmetro não existe';
    const limpo = texto.trim();
    if (limpo === '') {
      delete alvo.formula;
      return null;
    }
    if (limpo.length > LIMITES.formula) return `a fórmula passa de ${LIMITES.formula} caracteres`;
    alvo.formula = limpo;
    return null;
  }));

  const excluir = (): void => {
    registrar(executar('Excluir parâmetro', (f) => excluirParametro(f, param.id)));
  };

  const tituloFormula = !aceitaFormula(param.tipo)
    ? 'Este tipo de dado não aceita fórmula'
    : param.escopo === 'instancia'
      ? 'Mude o escopo para Tipo para usar fórmula'
      : 'Vazio remove a fórmula';

  return (
    <Fragment>
      <tr>
        <td className="fam-dlg-nome"><CampoTexto valor={param.nome} ariaLabel={`Nome de ${param.id}`} aoGravar={gravarNome} /></td>
        <td className="fam-dlg-id">
          <CampoTexto
            valor={param.id}
            ariaLabel={`Id de ${param.nome}`}
            aoGravar={gravarId}
            desabilitado={idFixo}
            titulo={idFixo ? 'Largura, altura e profundidade não podem ser renomeadas' : 'Id usado nas fórmulas'}
          />
        </td>
        <td>{ROTULO_TIPO[param.tipo]}</td>
        <td>
          <select
            className="fam-dlg-input"
            value={comFormula ? 'tipo' : param.escopo}
            disabled={comFormula}
            aria-label={`Escopo de ${param.id}`}
            title={comFormula ? 'Com fórmula o escopo é sempre Tipo' : undefined}
            onChange={(e) => gravarEscopo(e.target.value as Escopo)}
          >
            <option value="tipo">{ROTULO_ESCOPO.tipo}</option>
            <option value="instancia">{ROTULO_ESCOPO.instancia}</option>
          </select>
        </td>
        <td><CampoPadrao param={param} env={env} aoGravar={gravarPadrao} /></td>
        <td className="num">{temFaixa(param.tipo) ? <CampoNumero valor={param.min} ariaLabel={`Mínimo de ${param.id}`} aoGravar={(n) => gravarFaixa('min', n)} /> : '—'}</td>
        <td className="num">{temFaixa(param.tipo) ? <CampoNumero valor={param.max} ariaLabel={`Máximo de ${param.id}`} aoGravar={(n) => gravarFaixa('max', n)} /> : '—'}</td>
        <td className="num">{temFaixa(param.tipo) ? <CampoNumero valor={param.passo} ariaLabel={`Passo de ${param.id}`} aoGravar={(n) => gravarFaixa('passo', n)} /> : '—'}</td>
        <td>{temOpcoes(param.tipo) ? <button className="fam-bt" onClick={alternarOpcoes}>Opções…</button> : '—'}</td>
        <td>
          <CampoFormula
            valor={param.formula ?? ''}
            aoGravar={gravarFormula}
            ariaLabel={`Fórmula de ${param.id}`}
            desabilitado={!aceitaFormula(param.tipo) || param.escopo === 'instancia'}
            titulo={tituloFormula}
          />
        </td>
        <td className="fam-dlg-usos" title={usos.length === 0 ? 'Sem usos' : usos.join('\n')}>{usos.length}</td>
        <td><button className="fam-bt fam-dlg-excluir" onClick={excluir}>Excluir</button></td>
      </tr>
      {opcoesAbertas && temOpcoes(param.tipo) && (
        <tr><td colSpan={COLUNAS}><FamiliaOpcoes param={param} registrar={registrar} /></td></tr>
      )}
    </Fragment>
  );
}
