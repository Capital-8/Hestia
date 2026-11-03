import { compilar, type Parametro, type Valor } from '@hestia/model';
import { useEffect, useState, type ReactElement } from 'react';
import { lerEntrada, rotuloDoValor } from './acoes.ts';
import { lerNumeroOpcional } from './familiaDialogos.ts';

/*
 * Campos reutilizáveis das tabelas editáveis. Texto e número gravam ao sair do campo (um passo de desfazer por edição);
 * o valor canônico volta para o campo quando o dono recusa a mudança. A fórmula é validada enquanto se digita.
 */

interface PropsCampoTexto {
  valor: string;
  aoGravar: (texto: string) => boolean;
  ariaLabel: string;
  classe?: string;
  titulo?: string;
  desabilitado?: boolean;
}

export function CampoTexto({ valor, aoGravar, ariaLabel, classe = '', titulo, desabilitado = false }: PropsCampoTexto): ReactElement {
  const [texto, setTexto] = useState(valor);
  useEffect(() => { setTexto(valor); }, [valor]);
  const gravar = (): void => {
    if (texto === valor) return;
    if (!aoGravar(texto)) setTexto(valor);
  };
  return (
    <input
      className={`fam-dlg-input ${classe}`.trim()}
      value={texto}
      aria-label={ariaLabel}
      title={titulo}
      disabled={desabilitado}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

interface PropsCampoNumero {
  valor: number | undefined;
  aoGravar: (valor: number | undefined) => boolean;
  ariaLabel: string;
  classe?: string;
  titulo?: string;
}

export function CampoNumero({ valor, aoGravar, ariaLabel, classe = '', titulo }: PropsCampoNumero): ReactElement {
  const [texto, setTexto] = useState(valor === undefined ? '' : String(valor));
  useEffect(() => { setTexto(valor === undefined ? '' : String(valor)); }, [valor]);
  const resetar = (): void => setTexto(valor === undefined ? '' : String(valor));
  const gravar = (): void => {
    if (texto.trim() === '') {
      if (valor !== undefined && !aoGravar(undefined)) resetar();
      return;
    }
    const n = lerNumeroOpcional(texto);
    if (n === undefined || n === null) {
      resetar();
      return;
    }
    if (!aoGravar(n)) resetar();
  };
  return (
    <input
      className={`fam-dlg-input ${classe}`.trim()}
      value={texto}
      aria-label={ariaLabel}
      title={titulo}
      inputMode="decimal"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

interface PropsCampoFormula {
  valor: string;
  aoGravar: (texto: string) => boolean;
  ariaLabel: string;
  desabilitado: boolean;
  titulo?: string;
}

export function CampoFormula({ valor, aoGravar, ariaLabel, desabilitado, titulo }: PropsCampoFormula): ReactElement {
  const [texto, setTexto] = useState(valor);
  useEffect(() => { setTexto(valor); }, [valor]);
  const compilada = texto.trim() === '' ? null : compilar(texto);
  const erro = compilada !== null && 'erro' in compilada ? compilada.erro.message : undefined;
  const gravar = (): void => {
    if (texto === valor) return;
    if (!aoGravar(texto)) setTexto(valor);
  };
  return (
    <div className="fam-dlg-formula">
      <input
        className={`fam-dlg-input mono${erro !== undefined ? ' bad' : ''}`}
        value={texto}
        aria-label={ariaLabel}
        title={titulo}
        disabled={desabilitado}
        aria-invalid={erro !== undefined ? true : undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {erro !== undefined && <div className="fam-dlg-formula-erro">{erro}</div>}
    </div>
  );
}

interface PropsCampoPadrao {
  param: Parametro;
  env: Readonly<Record<string, Valor>>;
  aoGravar: (valor: Valor) => boolean;
}

export function CampoPadrao({ param, env, aoGravar }: PropsCampoPadrao): ReactElement {
  if (param.formula !== undefined) {
    const resolvido = env[param.id];
    return <span className="fam-dlg-ro mono" title="Valor calculado pela fórmula">{resolvido === undefined ? '—' : String(resolvido)}</span>;
  }
  const aria = `Padrão de ${param.id}`;
  if (param.tipo === 'booleano') {
    return <input type="checkbox" checked={Boolean(param.padrao)} aria-label={aria} onChange={(e) => { aoGravar(e.target.checked); }} />;
  }
  if (param.tipo === 'enum' || param.tipo === 'chapa') {
    const opcoes = param.opcoes ?? [];
    if (opcoes.length === 0) return <span className="fam-dlg-ro">sem opções</span>;
    return (
      <select className="fam-dlg-input" value={String(param.padrao)} aria-label={aria} onChange={(e) => { const v = lerEntrada(param, e.target.value); if (v !== null) aoGravar(v); }}>
        {opcoes.map((o) => <option key={String(o.valor)} value={String(o.valor)}>{rotuloDoValor(param, o.valor)}</option>)}
      </select>
    );
  }
  if (param.tipo === 'texto' || param.tipo === 'material') {
    return (
      <CampoTexto
        valor={String(param.padrao)}
        ariaLabel={aria}
        aoGravar={(texto) => {
          const v = lerEntrada(param, texto);
          return v !== null && aoGravar(v);
        }}
      />
    );
  }
  return (
    <CampoNumero
      valor={typeof param.padrao === 'number' ? param.padrao : undefined}
      ariaLabel={aria}
      aoGravar={(n) => {
        if (n === undefined) return false;
        const v = lerEntrada(param, String(n));
        return v !== null && aoGravar(v);
      }}
    />
  );
}
