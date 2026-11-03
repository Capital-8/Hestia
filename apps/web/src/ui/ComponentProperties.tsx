import { useMemo, useState, type ReactElement } from 'react';
import { caixaDoComponente, resolverComponente } from '@hestia/engine';
import { type Id, type Parametro, type Valor } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import {
  aplicarPatchDeComponente,
  aplicarValorDeParametro,
  comumDe,
  componentesDaSelecao,
  grausParaRadianos,
  metrosParaMilimetros,
  milimetrosParaMetros,
  parametrosDeInstancia,
  radianosParaGraus,
  type Comum,
  type PatchComponente,
} from './componentPropAcoes.ts';

/** Sentinela dos `select` quando os valores diferem (não pode ser confundida com uma opção real). */
const VALOR_MISTO = '__misto__';

type Caixa = NonNullable<ReturnType<typeof caixaDoComponente>>;

const numeroOuNulo = (v: Valor | undefined): number | null => (typeof v === 'number' ? v : null);

/**
 * Propriedades de um ou vários componentes colocados (ADR 0049): família e tipo, parâmetros de INSTÂNCIA (mm),
 * posição/rotação/espelho/marca e os resultados da resolução. A edição de parâmetro é recusada quando a resolução
 * acusaria erro novo, e a seleção múltipla grava tudo em uma transação.
 */
export function ComponentProperties({ ids }: { ids: Id[] }): ReactElement | null {
  const p = useProject();
  const fmt = useFormat();
  const [mensagens, setMensagens] = useState<Record<string, string>>({});
  const components = useMemo(() => componentesDaSelecao(p, ids), [p, ids]);
  const resolucoes = new Map(components.map((c) => [c.id, resolverComponente(p, c)] as const));

  if (components.length === 0) return null;

  const familiaComum = comumDe(components, (c) => c.familyId);
  const familia = familiaComum.misto ? undefined : p.componentFamilies?.[familiaComum.valor];
  const nomeDaFamilia = familiaComum.misto ? 'Vários' : familia?.nome ?? familiaComum.valor;
  const tipoComum = comumDe(components, (c) => c.typeId ?? '');
  const parametros = familia ? parametrosDeInstancia(familia) : [];

  const alterar = (patch: PatchComponente, rotulo: string): void => {
    try {
      aplicarPatchDeComponente(editor.store, components.map((c) => c.id), patch, rotulo);
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : 'Operação recusada.' });
    }
  };

  const gravarParametro = (param: Parametro, valor: Valor | null): void => {
    const r = aplicarValorDeParametro(editor.store, components.map((c) => c.id), param.id, valor);
    setMensagens((atuais) => {
      const proximas = { ...atuais };
      if (r.ok) delete proximas[param.id];
      else proximas[param.id] = r.erro;
      return proximas;
    });
  };

  const temSobreposicao = (paramId: string): boolean => components.some((c) => c.values?.[paramId] !== undefined);

  const campoDoParametro = (param: Parametro): ReactElement => {
    const efetivo = comumDe(components, (c) => resolucoes.get(c.id)?.env[param.id]);
    const numero = numeroOuNulo(efetivo.valor);
    const id = `p-comp-${param.id}`;
    const erro = mensagens[param.id];
    let entrada: ReactElement;
    switch (param.tipo) {
      case 'comprimento':
        entrada = (
          <NumField
            id={id}
            value={numero === null ? null : milimetrosParaMetros(numero)}
            mixed={efetivo.misto}
            quantity="length"
            onCommit={(v) => gravarParametro(param, metrosParaMilimetros(v))}
          />
        );
        break;
      case 'inteiro':
        entrada = <NumField id={id} value={numero} mixed={efetivo.misto} decimals={0} onCommit={(v) => gravarParametro(param, Math.round(v))} />;
        break;
      case 'numero':
        entrada = <NumField id={id} value={numero} mixed={efetivo.misto} decimals={3} onCommit={(v) => gravarParametro(param, v)} />;
        break;
      case 'booleano':
        entrada = <Check id={id} checked={efetivo.valor === true} mixed={efetivo.misto} onChange={(v) => gravarParametro(param, v)} />;
        break;
      case 'enum':
      case 'chapa':
        entrada = (
          <select
            id={id}
            className="select"
            value={efetivo.misto ? VALOR_MISTO : String(efetivo.valor ?? '')}
            onChange={(e) => {
              if (e.target.value === VALOR_MISTO) return;
              const escolhida = param.opcoes?.find((o) => String(o.valor) === e.target.value);
              if (escolhida) gravarParametro(param, escolhida.valor);
            }}
          >
            {efetivo.misto && <option value={VALOR_MISTO} disabled>variados</option>}
            {(param.opcoes ?? []).map((o) => <option key={String(o.valor)} value={String(o.valor)}>{o.rotulo ?? String(o.valor)}</option>)}
          </select>
        );
        break;
      default:
        entrada = <TextField id={id} value={String(efetivo.valor ?? '')} mixed={efetivo.misto} onCommit={(v) => gravarParametro(param, v)} />;
        break;
    }
    return (
      <div key={param.id}>
        <Row label={param.nome} htmlFor={id}>{entrada}</Row>
        {erro && <div className="hint" role="alert" style={{ color: 'var(--danger, #b42318)' }}>{erro}</div>}
        {temSobreposicao(param.id) && (
          <div className="prow">
            <span />
            <button
              type="button"
              className="chiplink"
              title="Voltar ao valor do tipo"
              aria-label={`Remover o valor de ${param.nome}`}
              onClick={() => gravarParametro(param, null)}
            >
              ↺
            </button>
          </div>
        )}
      </div>
    );
  };

  const x = comumDe(components, (c) => c.x);
  const y = comumDe(components, (c) => c.y);
  const z = comumDe(components, (c) => c.z);
  const rotacao = comumDe(components, (c) => c.rotation);
  const espelhado = comumDe(components, (c) => c.mirrored);
  const marca = comumDe(components, (c) => c.mark);

  const caixas = components
    .map((c) => caixaDoComponente(p, c, resolucoes.get(c.id)))
    .filter((b): b is Caixa => b !== null);
  const dimensoes = caixas.length > 0
    ? {
      largura: comumDe(caixas, (b) => b.max[0] - b.min[0]),
      profundidade: comumDe(caixas, (b) => b.max[1] - b.min[1]),
      altura: comumDe(caixas, (b) => b.max[2] - b.min[2]),
    }
    : null;
  const pecas = components.reduce((total, c) => total + (resolucoes.get(c.id)?.pecas.filter((q) => !q.vazio).length ?? 0), 0);
  const avisos = [...new Map(
    components.flatMap((c) => resolucoes.get(c.id)?.erros ?? []).map((e) => [`${e.onde}|${e.mensagem}`, e]),
  ).values()];

  const medida = (valor: Comum<number>): ReactElement =>
    valor.misto ? <span className="val soft">Vários</span> : <span className="val">{fmt('length', valor.valor)}</span>;

  return (
    <>
      <Group title="Componente">
        <Row label="Família" readOnly><span className="val">{nomeDaFamilia}</span></Row>
        {familia ? (
          <Row label="Tipo" htmlFor="p-comp-type">
            <select
              id="p-comp-type"
              className="select"
              value={tipoComum.misto ? VALOR_MISTO : tipoComum.valor}
              onChange={(e) => {
                if (e.target.value === VALOR_MISTO) return;
                alterar({ typeId: e.target.value === '' ? null : e.target.value }, 'Trocar tipo do componente');
              }}
            >
              {tipoComum.misto && <option value={VALOR_MISTO} disabled>variados</option>}
              <option value="">Padrão da família</option>
              {familia.tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Row>
        ) : (
          <div className="hint">Selecione componentes da mesma família para editar o tipo e os parâmetros.</div>
        )}
      </Group>
      {familia && (
        <Group title="Parâmetros de instância">
          {parametros.length === 0 ? (
            <div className="hint">A família não tem parâmetros de instância.</div>
          ) : (
            parametros.map(campoDoParametro)
          )}
        </Group>
      )}
      <Group title="Posição">
        <Row label="X" htmlFor="p-comp-x">
          <NumField id="p-comp-x" value={x.misto ? null : x.valor} mixed={x.misto} quantity="length" onCommit={(v) => alterar({ x: v }, 'Mover componente')} />
        </Row>
        <Row label="Y" htmlFor="p-comp-y">
          <NumField id="p-comp-y" value={y.misto ? null : y.valor} mixed={y.misto} quantity="length" onCommit={(v) => alterar({ y: v }, 'Mover componente')} />
        </Row>
        <Row label="Elevação Z" htmlFor="p-comp-z">
          <NumField id="p-comp-z" value={z.misto ? null : z.valor} mixed={z.misto} quantity="length" onCommit={(v) => alterar({ z: v }, 'Mover componente')} />
        </Row>
        <Row label="Rotação" htmlFor="p-comp-rot">
          <NumField
            id="p-comp-rot"
            value={radianosParaGraus(rotacao.valor)}
            mixed={rotacao.misto}
            suffix="°"
            decimals={2}
            onCommit={(v) => alterar({ rotation: grausParaRadianos(v) }, 'Girar componente')}
          />
        </Row>
        <Row label="Espelhado">
          <Check id="p-comp-mirror" checked={espelhado.valor} mixed={espelhado.misto} onChange={(v) => alterar({ mirrored: v }, 'Espelhar componente')} />
        </Row>
      </Group>
      <Group title="Resultados" open={caixas.length > 0}>
        {dimensoes ? (
          <>
            <Row label="Largura">{medida(dimensoes.largura)}</Row>
            <Row label="Profundidade">{medida(dimensoes.profundidade)}</Row>
            <Row label="Altura">{medida(dimensoes.altura)}</Row>
          </>
        ) : (
          <div className="hint">Sem geometria resolvida para a seleção.</div>
        )}
        <Row label="Peças"><span className="val">{pecas}</span></Row>
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-comp-mark">
          <TextField id="p-comp-mark" value={marca.valor} mixed={marca.misto} onCommit={(v) => alterar({ mark: v }, 'Alterar marca')} />
        </Row>
      </Group>
      {avisos.length > 0 && (
        <Group title={`Avisos (${avisos.length})`}>
          {avisos.map((e) => (
            <div className="prow" key={`${e.onde}|${e.mensagem}`} style={{ alignItems: 'start' }}>
              <span className="lbl" style={{ color: 'var(--danger, #b42318)' }}>{e.mensagem}</span>
            </div>
          ))}
        </Group>
      )}
    </>
  );
}
