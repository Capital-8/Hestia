import { resolverComponente } from '@hestia/engine';
import {
  type Component,
  type Escolha,
  type Familia,
  type Parametro,
  type Project,
  type ProjectStore,
  type TipoParametro,
  type Valor,
} from '@hestia/model';
import { comValorDeParametro, type PatchComponente } from './componentPropAcoes.ts';

/*
 * Lógica da seção "Escolhas" do painel de propriedades (ficha ESC-props). Pura, sem React: quais escolhas a família
 * realmente mostra, que valores cada uma pode receber (com rótulo), qual é o valor EFETIVO da resolução e o patch de
 * `values` que grava a opção. Escolha apontando para parâmetro inexistente, de tipo inválido ou com fórmula é omitida
 * sem lançar erro (dados inconsistentes não quebram o painel).
 */

/** Opção de uma escolha: o valor gravado em `values` e o rótulo exibido. */
export interface OpcaoDaEscolha {
  valor: Valor;
  rotulo: string;
}

/** Os mesmos tipos que `validarEncaixe` aceita para `escolhas[].parametro`. */
const TIPOS_DE_ESCOLHA: readonly TipoParametro[] = ['enum', 'booleano', 'inteiro'];

/** Teto de valores listados para um `inteiro` com faixa (mesma defesa de `opcoesDeParametro` no editor da família). */
const MAX_OPCOES_LISTADAS = 64;

/** O parâmetro apontado pela escolha, quando existe e é escolhível (tipo certo e sem fórmula: com fórmula o valor não é do usuário). */
export function parametroDaEscolha(familia: Familia, escolha: Escolha): Parametro | undefined {
  return familia.parametros.find(
    (p) => p !== undefined && p.id === escolha.parametro && TIPOS_DE_ESCOLHA.includes(p.tipo) && p.formula === undefined,
  );
}

/** Escolhas que o painel pode oferecer para a família de um componente: as válidas, na ordem da família. */
export function escolhasDoComponente(familia: Familia | undefined): Escolha[] {
  if (familia === undefined || !Array.isArray(familia.escolhas)) return [];
  return familia.escolhas.filter(
    (e) => e !== undefined && typeof e.parametro === 'string' && parametroDaEscolha(familia, e) !== undefined,
  );
}

/**
 * Opções de uma escolha, vindas do próprio parâmetro: `opcoes` no `enum` (rótulo da opção), Sim/Não no `booleano`,
 * a sequência de `min` a `max` com `passo` no `inteiro`. Lista vazia = nada a escolher (parâmetro quebrado ou faixa
 * grande demais / sem faixa).
 */
export function opcoesDaEscolha(familia: Familia, escolha: Escolha): OpcaoDaEscolha[] {
  const param = parametroDaEscolha(familia, escolha);
  if (param === undefined) return [];
  if (param.tipo === 'booleano') return [{ valor: true, rotulo: 'Sim' }, { valor: false, rotulo: 'Não' }];
  if (param.tipo === 'enum') {
    const out: OpcaoDaEscolha[] = [];
    for (const o of param.opcoes ?? []) {
      if (o === undefined) continue;
      out.push({ valor: o.valor, rotulo: o.rotulo ?? String(o.valor) });
    }
    return out;
  }
  if (param.min === undefined || param.max === undefined) return [];
  const passo = param.passo !== undefined && param.passo >= 1 ? Math.round(param.passo) : 1;
  const inicio = Math.ceil(param.min);
  const fim = Math.floor(param.max);
  const quantidade = Math.floor((fim - inicio) / passo) + 1;
  if (!(fim >= inicio) || quantidade > MAX_OPCOES_LISTADAS) return [];
  return Array.from({ length: quantidade }, (_unused, i) => {
    const valor = inicio + i * passo;
    return { valor, rotulo: String(valor) };
  });
}

/** Valor EFETIVO do parâmetro da escolha em um componente: o que a resolução produziu, em mm/unidade do parâmetro. */
export function valorEfetivo(p: Project, c: Component, escolha: Escolha): Valor | undefined {
  return resolverComponente(p, c).env[escolha.parametro];
}

/** Patch de instância que grava a opção da escolha (`null` remove o valor e volta ao tipo), preservando os demais. */
export function patchDaEscolha(c: Component, escolha: Escolha, valor: Valor | null): PatchComponente {
  return { values: comValorDeParametro(c, escolha.parametro, valor).values };
}

/** Grava a escolha em um ou vários componentes numa única transação de `updateComponent` (um passo de desfazer). */
export function aplicarEscolha(store: ProjectStore, components: readonly Component[], escolha: Escolha, valor: Valor | null): void {
  if (components.length === 0) return;
  store.transaction('Escolher opção do componente', () => {
    for (const c of components) store.exec({ type: 'updateComponent', id: c.id, patch: patchDaEscolha(c, escolha, valor) });
  });
}
