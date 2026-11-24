import { useMemo, useState, type ReactElement } from 'react';
import { caixaDoComponente, resolverComponente } from '@hestia/engine';
import { type ChaveAcabamentoInstancia, type Id, type Parametro, type Valor } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { AcabamentoSelect } from './AcabamentoSelect.tsx';
import { SeletorEstavel } from './SeletorEstavel.tsx';
import { ACTIONS } from './ribbon/actions.ts';
import { useFormat } from './useUnits.ts';
import { ComponentPropEscolhas } from './ComponentPropEscolhas.tsx';
import { ComponentePropriedadesMep } from './ComponentePropriedadesMep.tsx';
import { tm } from './moveisTextos.ts';
import {
  aplicarAcabamentoComponentes,
  aplicarAlinhamentoFrente,
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

const SELETORES_ACABAMENTO: ReadonlyArray<{ chave: ChaveAcabamentoInstancia; rotulo: keyof Dict }> = [
  { chave: 'acabCorpo', rotulo: 'mov_sel_corpo' },
  { chave: 'acabPorta', rotulo: 'mov_sel_portas' },
  { chave: 'acabTampo', rotulo: 'mov_sel_tampo' },
];

type Caixa = NonNullable<ReturnType<typeof caixaDoComponente>>;

const numeroOuNulo = (v: Valor | undefined): number | null => (typeof v === 'number' ? v : null);

/** Milímetros com vírgula decimal: a faixa da família é sempre em mm, mesmo quando o campo exibe outra unidade. */
const milimetros = (n: number): string => String(n).replace(/\./g, ',');

interface Limites {
  /** Faixa em mm, para o texto e o aviso. */
  min?: number;
  max?: number;
  /** Texto curto exibido ao lado do campo, ex.: `mín 300 · máx 1200 mm`. */
  rotulo: string;
  /** Faixa para o aviso de recusa, ex.: `300 a 1200 mm`. */
  faixa: string;
}

/** Limites do parâmetro em mm, ou null quando ele não tem mín. nem máx. */
const limitesDe = (param: Parametro): Limites | null => {
  if (param.min === undefined && param.max === undefined) return null;
  const partes: string[] = [];
  if (param.min !== undefined) partes.push(tm('mov_lim_min', { v: milimetros(param.min) }));
  if (param.max !== undefined) partes.push(tm('mov_lim_max', { v: milimetros(param.max) }));
  const faixa = param.min !== undefined && param.max !== undefined
    ? `${tm('mov_lim_ab', { a: milimetros(param.min), b: milimetros(param.max) })} mm`
    : param.min !== undefined
      ? tm('mov_lim_minimo', { v: milimetros(param.min) })
      : tm('mov_lim_maximo', { v: milimetros(param.max!) });
  return { min: param.min, max: param.max, rotulo: `${partes.join(' · ')} mm`, faixa };
};

/**
 * Propriedades de um ou vários componentes colocados (ADR 0049): família e tipo, parâmetros de INSTÂNCIA (mm),
 * posição/rotação/espelho/marca e os resultados da resolução. A edição de parâmetro é recusada quando a resolução
 * acusaria erro novo, e a seleção múltipla grava tudo em uma transação.
 */
export function ComponentProperties({ ids }: { ids: Id[] }): ReactElement | null {
  const p = useProject();
  const fmt = useFormat();
  const { t } = useT();
  const [mensagens, setMensagens] = useState<Record<string, string>>({});
  const components = useMemo(() => componentesDaSelecao(p, ids), [p, ids]);
  const resolucoes = new Map(components.map((c) => [c.id, resolverComponente(p, c)] as const));
  const conjunto = useMemo(() => {
    const idsUnicos = new Set(components.map((c) => c.groupId));
    if (idsUnicos.size !== 1) return null;
    const id = [...idsUnicos][0];
    return id === undefined ? null : p.componentGroups?.[id] ?? null;
  }, [components, p.componentGroups]);

  if (components.length === 0) return null;

  const familiaComum = comumDe(components, (c) => c.familyId);
  const familia = familiaComum.misto ? undefined : p.componentFamilies?.[familiaComum.valor];
  const nomeDaFamilia = familiaComum.misto ? tm('mov_varios') : familia?.nome ?? familiaComum.valor;
  const tipoComum = comumDe(components, (c) => c.typeId ?? '');
  const parametros = familia ? parametrosDeInstancia(familia) : [];

  const alterar = (patch: PatchComponente, rotulo: string): void => {
    try {
      aplicarPatchDeComponente(editor.store, components.map((c) => c.id), patch, rotulo);
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'mov_op_recusada' } });
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

  const definirMensagem = (paramId: string, mensagem: string | null): void => {
    setMensagens((atuais) => {
      const proximas = { ...atuais };
      if (mensagem === null) delete proximas[paramId];
      else proximas[paramId] = mensagem;
      return proximas;
    });
  };

  const temSobreposicao = (paramId: string): boolean => components.some((c) => c.values?.[paramId] !== undefined);

  const campoDoParametro = (param: Parametro): ReactElement => {
    const efetivo = comumDe(components, (c) => resolucoes.get(c.id)?.env[param.id]);
    const numero = numeroOuNulo(efetivo.valor);
    const id = `p-comp-${param.id}`;
    const erro = mensagens[param.id];
    const limites = limitesDe(param);
    const aviso = (motivo: 'invalido' | 'fora'): string =>
      motivo === 'fora' && limites !== null ? tm('mov_fora_faixa', { faixa: limites.faixa }) : tm('mov_valor_invalido');
    const recusar = (motivo: 'invalido' | 'fora'): void => definirMensagem(param.id, aviso(motivo));
    const aceitar = (): void => definirMensagem(param.id, null);
    let entrada: ReactElement;
    switch (param.tipo) {
      case 'comprimento':
        entrada = (
          <NumField
            id={id}
            value={numero === null ? null : milimetrosParaMetros(numero)}
            mixed={efetivo.misto}
            quantity="length"
            min={limites?.min === undefined ? undefined : limites.min / 1000}
            max={limites?.max === undefined ? undefined : limites.max / 1000}
            strictRange={limites !== null}
            title={limites?.rotulo}
            onInvalid={(_, motivo) => recusar(motivo)}
            onValid={aceitar}
            onCommit={(v) => gravarParametro(param, metrosParaMilimetros(v))}
          />
        );
        break;
      case 'inteiro':
        entrada = (
          <NumField
            id={id}
            value={numero}
            mixed={efetivo.misto}
            decimals={0}
            min={limites?.min}
            max={limites?.max}
            strictRange={limites !== null}
            title={limites?.rotulo}
            onInvalid={(_, motivo) => recusar(motivo)}
            onValid={aceitar}
            onCommit={(v) => gravarParametro(param, Math.round(v))}
          />
        );
        break;
      case 'numero':
        entrada = (
          <NumField
            id={id}
            value={numero}
            mixed={efetivo.misto}
            decimals={3}
            min={limites?.min}
            max={limites?.max}
            strictRange={limites !== null}
            title={limites?.rotulo}
            onInvalid={(_, motivo) => recusar(motivo)}
            onValid={aceitar}
            onCommit={(v) => gravarParametro(param, v)}
          />
        );
        break;
      case 'booleano':
        entrada = <Check id={id} checked={efetivo.valor === true} mixed={efetivo.misto} onChange={(v) => gravarParametro(param, v)} />;
        break;
      case 'enum':
      case 'chapa':
        entrada = (
          <SeletorEstavel
            id={id}
            value={efetivo.misto ? VALOR_MISTO : String(efetivo.valor ?? '')}
            opcoes={[
              ...(efetivo.misto ? [{ valor: VALOR_MISTO, rotulo: tm('mov_variados'), desabilitada: true }] : []),
              ...(param.opcoes ?? []).map((o) => ({ valor: String(o.valor), rotulo: o.rotulo ?? String(o.valor) })),
            ]}
            onChange={(v) => {
              if (v === VALOR_MISTO) return;
              const escolhida = param.opcoes?.find((o) => String(o.valor) === v);
              if (escolhida) gravarParametro(param, escolhida.valor);
            }}
          />
        );
        break;
      default:
        entrada = <TextField id={id} value={String(efetivo.valor ?? '')} mixed={efetivo.misto} onCommit={(v) => gravarParametro(param, v)} />;
        break;
    }
    return (
      <div key={param.id}>
        <Row label={param.nome} htmlFor={id}>
          {entrada}
          {limites !== null && <span className="hint" title={tm('mov_faixa_aceita', { faixa: limites.faixa })}> {limites.rotulo}</span>}
        </Row>
        {erro && <div className="hint" role="alert" style={{ color: 'var(--danger, #b42318)' }}>{erro}</div>}
        {temSobreposicao(param.id) && (
          <div className="prow">
            <span />
            <button
              type="button"
              className="chiplink"
              title={tm('mov_voltar_tipo')}
              aria-label={tm('mov_remover_valor', { nome: param.nome })}
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
    valor.misto ? <span className="val soft">{tm('mov_varios')}</span> : <span className="val">{fmt('length', valor.valor)}</span>;

  return (
    <>
      <Group title={t('mov_grp_componente')}>
        <Row label={t('mov_familia')} readOnly><span className="val">{nomeDaFamilia}</span></Row>
        {conjunto && (
          <Row label={t('mov_conjunto')}>
            <span className="val">{conjunto.nome}</span>{' '}
            <button
              type="button"
              className="chiplink"
              title={t('mov_desagrupar_dica')}
              onClick={() => { ACTIONS.ungroupComponents.run(); }}
            >
              {t('mov_desagrupar')}
            </button>
          </Row>
        )}
        {familia ? (
          <Row label={t('mov_tipo')} htmlFor="p-comp-type">
            <SeletorEstavel
              id="p-comp-type"
              value={tipoComum.misto ? VALOR_MISTO : tipoComum.valor}
              opcoes={[
                ...(tipoComum.misto ? [{ valor: VALOR_MISTO, rotulo: tm('mov_variados'), desabilitada: true }] : []),
                { valor: '', rotulo: t('mov_padrao_familia') },
                ...familia.tipos.map((x) => ({ valor: x.id, rotulo: x.nome })),
              ]}
              onChange={(v) => {
                if (v === VALOR_MISTO) return;
                alterar({ typeId: v === '' ? null : v }, 'mov_undo_tipo');
              }}
            />
          </Row>
        ) : (
          <div className="hint">{t('mov_sel_mesma_familia')}</div>
        )}
      </Group>
      {familia && (
        <Group title={t('mov_grp_parametros')}>
          {parametros.length === 0 ? (
            <div className="hint">{t('mov_familia_sem_parametros')}</div>
          ) : (
            parametros.map(campoDoParametro)
          )}
        </Group>
      )}
      {familia && <ComponentPropEscolhas familia={familia} components={components} />}
      {familia && <ComponentePropriedadesMep familia={familia} components={components} />}
      <Group title={t('mov_grp_acabamentos')}>
        <Row label={t('mov_alinhamento')}>
          <button
            type="button"
            className="btn small"
            title={t('mov_alinhar_frente_dica')}
            onClick={() => {
              const n = aplicarAlinhamentoFrente(editor.store, components.map((c) => c.id));
              useUi.setState({
                status: n > 0
                  ? { key: 'mov_status_alinhados', args: { n } }
                  : { key: 'mov_status_sem_paralelo' },
              });
            }}
          >
            {t('mov_alinhar_frente')}
          </button>
        </Row>
        {SELETORES_ACABAMENTO.map(({ chave, rotulo }) => {
          const atual = comumDe(components, (c) => {
            const v = c.values?.[chave];
            return typeof v === 'string' ? v : '';
          });
          const id = `p-comp-${chave}`;
          return (
            <Row key={chave} label={t(rotulo)} htmlFor={id}>
              <AcabamentoSelect
                id={id}
                rotulo={t(rotulo)}
                valor={atual.misto ? '' : atual.valor}
                misto={atual.misto}
                onEscolher={(acabamentoId) => aplicarAcabamentoComponentes(editor.store, components.map((c) => c.id), chave, acabamentoId)}
              />
            </Row>
          );
        })}
      </Group>
      <Group title={t('mov_grp_posicao')}>
        <Row label="X" htmlFor="p-comp-x">
          <NumField id="p-comp-x" value={x.misto ? null : x.valor} mixed={x.misto} quantity="length" onCommit={(v) => alterar({ x: v }, 'mov_undo_mover')} />
        </Row>
        <Row label="Y" htmlFor="p-comp-y">
          <NumField id="p-comp-y" value={y.misto ? null : y.valor} mixed={y.misto} quantity="length" onCommit={(v) => alterar({ y: v }, 'mov_undo_mover')} />
        </Row>
        <Row label={t('mov_elevacao_z')} htmlFor="p-comp-z">
          <NumField id="p-comp-z" value={z.misto ? null : z.valor} mixed={z.misto} quantity="length" onCommit={(v) => alterar({ z: v }, 'mov_undo_mover')} />
        </Row>
        <Row label={t('mov_rotacao')} htmlFor="p-comp-rot">
          <NumField
            id="p-comp-rot"
            value={radianosParaGraus(rotacao.valor)}
            mixed={rotacao.misto}
            suffix="°"
            decimals={2}
            onCommit={(v) => alterar({ rotation: grausParaRadianos(v) }, 'mov_undo_girar')}
          />
        </Row>
        <Row label={t('mov_espelhado')}>
          <Check id="p-comp-mirror" checked={espelhado.valor} mixed={espelhado.misto} onChange={(v) => alterar({ mirrored: v }, 'mov_undo_espelhar')} />
        </Row>
      </Group>
      <Group title={t('mov_grp_resultados')} open={caixas.length > 0}>
        {dimensoes ? (
          <>
            <Row label={t('mov_largura')}>{medida(dimensoes.largura)}</Row>
            <Row label={t('mov_profundidade')}>{medida(dimensoes.profundidade)}</Row>
            <Row label={t('mov_altura')}>{medida(dimensoes.altura)}</Row>
          </>
        ) : (
          <div className="hint">{t('mov_sem_geometria')}</div>
        )}
        <Row label={t('mov_pecas')}><span className="val">{pecas}</span></Row>
      </Group>
      <Group title={t('mov_grp_identidade')} open={false}>
        <Row label={t('mov_marca')} htmlFor="p-comp-mark">
          <TextField id="p-comp-mark" value={marca.valor} mixed={marca.misto} onCommit={(v) => alterar({ mark: v }, 'mov_undo_marca')} />
        </Row>
      </Group>
      {avisos.length > 0 && (
        <Group title={tm('mov_avisos_n', { n: avisos.length })}>
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
