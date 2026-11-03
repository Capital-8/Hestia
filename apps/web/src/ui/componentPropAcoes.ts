import { resolverComponente, type ErroResolucao } from '@hestia/engine';
import {
  isComponent,
  normalizarAngulo,
  type Component,
  type Familia,
  type Id,
  type Parametro,
  type Project,
  type ProjectStore,
  type Valor,
} from '@hestia/model';

/*
 * Ações do painel de propriedades de um componente colocado (E8-web-b). Ficam fora do JSX para poderem ser testadas
 * sem DOM: cada edição vira um comando `updateComponent` dentro de UMA transação (um só desfazer).
 */

/** Valor comum aos itens da seleção; `misto` quando algum difere do primeiro. A lista precisa ter ao menos um item. */
export interface Comum<T> {
  valor: T;
  misto: boolean;
}

export function comumDe<T, K>(itens: readonly T[], obter: (t: T) => K): Comum<K> {
  const primeiro = obter(itens[0]!);
  return { valor: primeiro, misto: itens.some((t, i) => i > 0 && obter(t) !== primeiro) };
}

/** Componentes da seleção, ignorando ids que não existem (ou que não são componentes). */
export function componentesDaSelecao(p: Project, ids: readonly Id[]): Component[] {
  return ids.map((id) => p.elements[id]).filter(isComponent);
}

/** Parâmetros que cada instância pode mudar: escopo `instancia` e sem fórmula (o valor vem do tipo ou do padrão). */
export function parametrosDeInstancia(familia: Familia): Parametro[] {
  return familia.parametros.filter((p) => p.escopo === 'instancia' && p.formula === undefined);
}

export function radianosParaGraus(radianos: number): number {
  return (radianos * 180) / Math.PI;
}

export function grausParaRadianos(graus: number): number {
  return normalizarAngulo((graus * Math.PI) / 180);
}

/** Metros (SI) → milímetros inteiros com 3 casas, a unidade em que o texto da família guarda os comprimentos. */
export function metrosParaMilimetros(metros: number): number {
  return Math.round(metros * 1e6) / 1e3;
}

export function milimetrosParaMetros(milimetros: number): number {
  return milimetros / 1000;
}

export type PatchComponente = Partial<Omit<Component, 'id' | 'kind' | 'order'>>;

/** Aplica o mesmo campo a uma ou várias instâncias em uma única transação. */
export function aplicarPatchDeComponente(store: ProjectStore, ids: readonly Id[], patch: PatchComponente, rotulo: string): void {
  if (ids.length === 0) return;
  store.transaction(rotulo, () => {
    for (const id of ids) store.exec({ type: 'updateComponent', id, patch });
  });
}

function chaveDoErro(e: ErroResolucao): string {
  return `${e.onde}\u0000${e.mensagem}`;
}

/** Erros que apareceram na resolução candidata e não existiam na atual. É o que a resolução "recusa". */
export function errosNovos(antes: readonly ErroResolucao[], depois: readonly ErroResolucao[]): ErroResolucao[] {
  const vistos = new Set(antes.map(chaveDoErro));
  const novos = new Map<string, ErroResolucao>();
  for (const e of depois) {
    const chave = chaveDoErro(e);
    if (!vistos.has(chave)) novos.set(chave, e);
  }
  return [...novos.values()];
}

/** Cópia da instância com `values` trocado (mm); `null` remove a sobreposição e volta ao valor do tipo. */
export function comValorDeParametro(c: Component, paramId: string, valor: Valor | null): Component {
  const values = { ...(c.values ?? {}) };
  if (valor === null) delete values[paramId];
  else values[paramId] = valor;
  return { ...c, values: Object.keys(values).length > 0 ? values : undefined };
}

export type ResultadoDoValor = { ok: true } | { ok: false; erro: string };

/**
 * Grava um parâmetro de instância (em mm) em um ou vários componentes. Antes de gravar, resolve cada candidato e
 * recusa tudo se a mudança criar erro de resolução (valor fora das opções, dimensão ≤ 0, fórmula quebrada...).
 */
export function aplicarValorDeParametro(store: ProjectStore, ids: readonly Id[], paramId: string, valor: Valor | null): ResultadoDoValor {
  const p = store.project;
  const candidatos: Component[] = [];
  const erros: ErroResolucao[] = [];
  for (const id of ids) {
    const atual = p.elements[id];
    if (atual?.kind !== 'component') continue;
    const candidato = comValorDeParametro(atual, paramId, valor);
    erros.push(...errosNovos(resolverComponente(p, atual).erros, resolverComponente(p, candidato).erros));
    candidatos.push(candidato);
  }
  const primeiro = erros[0];
  if (primeiro) return { ok: false, erro: primeiro.mensagem };
  if (candidatos.length > 0) {
    store.transaction('Editar parâmetro do componente', () => {
      for (const c of candidatos) store.exec({ type: 'updateComponent', id: c.id, patch: { values: c.values } });
    });
  }
  return { ok: true };
}
