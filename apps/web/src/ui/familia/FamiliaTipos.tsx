import {
  adicionarTipo,
  definirValorDeTipo,
  duplicarTipo,
  excluirTipo,
  type Parametro,
  type Tipo,
  type Valor,
} from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { lerEntrada, rotuloDoValor } from './acoes.ts';
import { Janela } from './FamiliaJanela.tsx';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { valorDoTipo } from './familiaDialogos.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaDialogos.css';

/** Diálogo de Tipos: nome editável, valores por parâmetro sem fórmula e tipo padrão. */

type Registrar = (motivo: string | null) => boolean;

export function DialogoTipos(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const tipoId = useFamilia((s) => s.tipoId);
  const executar = useFamilia((s) => s.executar);
  const escolherTipo = useFamilia((s) => s.escolherTipo);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const registrar: Registrar = (motivo) => {
    setMensagem(motivo);
    return motivo === null;
  };
  const colunas = familia.parametros.filter((p) => p.formula === undefined);
  const alvo = familia.tipos.find((t) => t.id === tipoId)?.id ?? familia.tipos[0]?.id;

  const novoTipo = (): void => {
    const motivo = executar('Novo tipo', (f) => adicionarTipo(f, 'Novo tipo'));
    if (!registrar(motivo)) return;
    const atual = useFamilia.getState().familia();
    const criado = atual.tipos[atual.tipos.length - 1];
    if (criado !== undefined) escolherTipo(criado.id);
  };

  const duplicar = (): void => {
    if (alvo === undefined) return;
    registrar(executar('Duplicar tipo', (f) => duplicarTipo(f, alvo)));
  };

  const excluir = (): void => {
    if (alvo === undefined) return;
    const motivo = executar('Excluir tipo', (f) => excluirTipo(f, alvo));
    if (!registrar(motivo)) return;
    const atual = useFamilia.getState().familia();
    const proximo = atual.tipos.find((t) => t.id === atual.tipoPadrao) ?? atual.tipos[0];
    if (proximo !== undefined) escolherTipo(proximo.id);
  };

  return (
    <Janela
      titulo={`Tipos da família · ${familia.nome}`}
      larga
      rodape={<>
        <button className="fam-bt" onClick={novoTipo}>Novo tipo</button>
        <button className="fam-bt" onClick={duplicar} disabled={familia.tipos.length === 0}>Duplicar</button>
        <button className="fam-bt" onClick={excluir} disabled={familia.tipos.length === 0}>Excluir</button>
      </>}
    >
      {mensagem !== null && <div className="fam-dlg-erro" role="alert">{mensagem}</div>}
      <div className="fam-dlg-scroll">
        <table className="fam-dlg-tabela fam-dlg-tipos">
          <thead>
            <tr>
              <th>Tipo</th>
              {colunas.map((p) => <th key={p.id} title={`${p.nome} (${p.id})`}>{p.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {familia.tipos.length === 0 && (
              <tr><td colSpan={colunas.length + 1} className="fam-hint">Nenhum tipo. Use “Novo tipo”.</td></tr>
            )}
            {familia.tipos.map((t) => (
              <LinhaTipo
                key={t.id}
                tipo={t}
                colunas={colunas}
                corrente={t.id === tipoId}
                ehPadrao={t.id === familia.tipoPadrao}
                registrar={registrar}
                onEscolher={() => escolherTipo(t.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="fam-hint">Clique numa linha para tornar o tipo corrente. A estrela marca o tipo padrão; “×” na célula volta ao padrão do parâmetro. Cada mudança vira um passo de desfazer.</div>
    </Janela>
  );
}

interface PropsLinhaTipo {
  tipo: Tipo;
  colunas: readonly Parametro[];
  corrente: boolean;
  ehPadrao: boolean;
  registrar: Registrar;
  onEscolher: () => void;
}

function LinhaTipo({ tipo, colunas, corrente, ehPadrao, registrar, onEscolher }: PropsLinhaTipo): ReactElement {
  const executar = useFamilia((s) => s.executar);

  const gravarNome = (texto: string): boolean => {
    const nome = texto.trim();
    if (nome === '') {
      registrar('O nome do tipo não pode ficar vazio');
      return false;
    }
    if (nome === tipo.nome) return true;
    return registrar(executar('Renomear tipo', (f) => {
      const alvo = f.tipos.find((t) => t?.id === tipo.id);
      if (alvo === undefined) return 'tipo não existe';
      alvo.nome = nome;
      return null;
    }));
  };

  const definirPadrao = (): void => {
    registrar(executar('Definir tipo padrão', (f) => {
      const alvo = f.tipos.find((t) => t?.id === tipo.id);
      if (alvo === undefined) return 'tipo não existe';
      f.tipoPadrao = alvo.id;
      return null;
    }));
  };

  return (
    <tr className={corrente ? 'sel' : ''} onClick={onEscolher}>
      <td>
        <button
          className="fam-dlg-estrela"
          aria-label={ehPadrao ? 'Tipo padrão da família' : 'Tornar tipo padrão'}
          title={ehPadrao ? 'Tipo padrão da família' : 'Tornar tipo padrão'}
          onClick={definirPadrao}
        >
          {ehPadrao ? '★' : '☆'}
        </button>
        <CampoTexto valor={tipo.nome} ariaLabel={`Nome do tipo ${tipo.id}`} aoGravar={gravarNome} classe="fam-dlg-tipo-nome" />
      </td>
      {colunas.map((p) => <td key={p.id}><CelulaTipo tipo={tipo} param={p} registrar={registrar} /></td>)}
    </tr>
  );
}

interface PropsCelulaTipo {
  tipo: Tipo;
  param: Parametro;
  registrar: Registrar;
}

function CelulaTipo({ tipo, param, registrar }: PropsCelulaTipo): ReactElement {
  const executar = useFamilia((s) => s.executar);
  const { valor, definido } = valorDoTipo(tipo, param);
  const definir = (v: Valor | undefined): boolean =>
    registrar(executar(`Editar valor de ${param.nome}`, (f) => definirValorDeTipo(f, tipo.id, param.id, v)));
  const remover = (): void => { definir(undefined); };
  const x = definido
    ? <button className="fam-dlg-x" title="Voltar ao padrão do parâmetro" aria-label={`Remover valor de ${param.nome} em ${tipo.nome}`} onClick={remover}>×</button>
    : null;
  const envolver = (controle: ReactElement): ReactElement => (
    <span className={`fam-dlg-celula${definido ? '' : ' herdado'}`}>{controle}{x}</span>
  );

  if (param.tipo === 'booleano') {
    return envolver(
      <input
        type="checkbox"
        checked={Boolean(valor)}
        aria-label={`${param.nome} em ${tipo.nome}`}
        onChange={() => { definir(!valor); }}
      />,
    );
  }

  if (param.tipo === 'enum' || param.tipo === 'chapa') {
    const opcoes = param.opcoes ?? [];
    if (opcoes.length === 0) return envolver(<span className="fam-dlg-ro">sem opções</span>);
    return envolver(
      <select
        className="fam-dlg-input"
        value={String(valor)}
        aria-label={`${param.nome} em ${tipo.nome}`}
        onChange={(e) => {
          const v = lerEntrada(param, e.target.value);
          if (v !== null) definir(v);
        }}
      >
        {opcoes.map((o) => <option key={String(o.valor)} value={String(o.valor)}>{rotuloDoValor(param, o.valor)}</option>)}
      </select>,
    );
  }

  if (param.tipo === 'texto' || param.tipo === 'material') {
    return envolver(
      <CampoTexto
        valor={String(valor)}
        ariaLabel={`${param.nome} em ${tipo.nome}`}
        aoGravar={(texto) => {
          const v = lerEntrada(param, texto);
          return v !== null && definir(v);
        }}
      />,
    );
  }

  return envolver(
    <CampoNumero
      valor={typeof valor === 'number' ? valor : undefined}
      ariaLabel={`${param.nome} em ${tipo.nome}`}
      aoGravar={(n) => {
        if (n === undefined) return definir(undefined);
        const v = lerEntrada(param, String(n));
        return v !== null && definir(v);
      }}
    />,
  );
}
