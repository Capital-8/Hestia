import type { ReactElement } from 'react';
import { type Component, type Escolha, type Familia, type Project, type Valor } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { SeletorEstavel } from './SeletorEstavel.tsx';
import { Check, Group, Row } from './fields.tsx';
import { comumDe } from './componentPropAcoes.ts';
import { tm } from './moveisTextos.ts';
import {
  aplicarEscolha,
  escolhasDoComponente,
  opcoesDaEscolha,
  parametroDaEscolha,
  valorEfetivo,
  type OpcaoDaEscolha,
} from './componentPropEscolhas.ts';

/*
 * Seção "Escolhas" do painel de propriedades (ficha ESC-props): uma linha por escolha da família do componente, com o
 * valor EFETIVO da resolução. `select` para `enum` e `inteiro`, caixa de seleção para `booleano`; "↺" remove o valor
 * da instância. Com vários componentes, o pai só monta a seção quando todos são da mesma família; valores diferentes
 * aparecem como "Vários" e escolher aplica a todos numa única transação.
 */

/** Sentinela do `select` quando os componentes selecionados têm valores diferentes. */
const VALOR_MISTO = '__misto__';

interface PropsEscolhas {
  familia: Familia;
  components: readonly Component[];
}

export function ComponentPropEscolhas({ familia, components }: PropsEscolhas): ReactElement | null {
  const p = useProject();
  const linhas = escolhasDoComponente(familia)
    .map((escolha) => ({ escolha, opcoes: opcoesDaEscolha(familia, escolha) }))
    .filter((linha) => linha.opcoes.length > 0);
  if (linhas.length === 0) return null;
  return (
    <Group title={tm('mov_grp_escolhas')}>
      {linhas.map(({ escolha, opcoes }) => (
        <LinhaEscolha key={escolha.id} p={p} components={components} familia={familia} escolha={escolha} opcoes={opcoes} />
      ))}
    </Group>
  );
}

interface PropsLinha {
  p: Project;
  components: readonly Component[];
  familia: Familia;
  escolha: Escolha;
  opcoes: readonly OpcaoDaEscolha[];
}

function LinhaEscolha({ p, components, familia, escolha, opcoes }: PropsLinha): ReactElement {
  const efetivo = comumDe(components, (c) => valorEfetivo(p, c, escolha));
  const booleano = parametroDaEscolha(familia, escolha)?.tipo === 'booleano';
  const temSobreposicao = components.some((c) => c.values?.[escolha.parametro] !== undefined);
  const id = `p-escolha-${escolha.id}`;

  const gravar = (valor: Valor | null): void => {
    aplicarEscolha(editor.store, components, escolha, valor);
  };

  let entrada: ReactElement;
  if (booleano) {
    entrada = <Check id={id} checked={efetivo.valor === true} mixed={efetivo.misto} onChange={gravar} />;
  } else {
    const atual = efetivo.misto ? VALOR_MISTO : String(efetivo.valor ?? '');
    const foraDaLista = !efetivo.misto && efetivo.valor !== undefined && !opcoes.some((o) => String(o.valor) === atual);
    entrada = (
      <SeletorEstavel
        id={id}
        value={atual}
        opcoes={[
          ...(efetivo.misto ? [{ valor: VALOR_MISTO, rotulo: tm('mov_varios'), desabilitada: true }] : []),
          ...(foraDaLista ? [{ valor: atual, rotulo: tm('mov_atual', { v: atual }) }] : []),
          ...opcoes.map((o) => ({ valor: String(o.valor), rotulo: o.rotulo })),
        ]}
        onChange={(v) => {
          if (v === VALOR_MISTO) return;
          const escolhida = opcoes.find((o) => String(o.valor) === v);
          if (escolhida !== undefined) gravar(escolhida.valor);
        }}
      />
    );
  }

  return (
    <Row label={escolha.nome} htmlFor={id}>
      <span title={tm('mov_zona', { zona: escolha.zona })}>
        {entrada}
        {temSobreposicao && (
          <button type="button" className="chiplink" title={tm('mov_voltar_tipo')} aria-label={tm('mov_remover_escolha', { nome: escolha.nome })} onClick={() => gravar(null)}>
            ↺
          </button>
        )}
      </span>
    </Row>
  );
}
