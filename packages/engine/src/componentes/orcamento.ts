import { CATALOGO_PADRAO, isComponent, type Catalogo, type Component, type Id, type Project } from '@hestia/model';
import type { CustoEstimado, LinhaLista, ResumoLista } from './listaPecas.ts';
import { custoEstimado, listaDePecas, resumirLista } from './listaPecas.ts';
import { resolverComponente } from './instancia.ts';
import type { FerragemResolvida, PecaResolvida } from './pecas.ts';

/*
 * Orçamento do projeto inteiro (ficha ORC): agrega TODOS os componentes colocados — a lista de peças, o resumo, o custo
 * e as ferragens deixam de ser por móvel e passam por projeto. Puro e determinístico: percorre as instâncias
 * (`resolverComponente`, com a memória de `instancia.ts`), agrupa móveis iguais e soma peças iguais.
 * Componente com erro de resolução entra em `avisos` (com o id e a mensagem) e fica FORA da agregação: não derruba o resto.
 */

/** Um móvel do orçamento: componentes iguais (mesma família, tipo e valores) agrupados. */
export interface OrcamentoMovel {
  familiaId: Id;
  /** `null` = padrão da família. */
  tipoId: Id | null;
  /** Nome do tipo quando existe, senão o nome da família. */
  nome: string;
  quantidade: number;
  /** Ids dos componentes do grupo, em ordem crescente. */
  ids: Id[];
  /** Peças (não vazias) do grupo: `quantidade` × as de um. */
  pecas: number;
  /** Custo do grupo: `quantidade` × o custo de um. */
  custo: number;
}

export interface OrcamentoFerragem {
  id: Id;
  nome: string;
  quantidade: number;
}

export interface OrcamentoProjeto {
  /** Móveis agrupados, por nome, depois família, depois tipo (`null` vem primeiro). */
  moveis: OrcamentoMovel[];
  /** Todas as peças consolidadas (mesmo agrupamento de `listaDePecas`, quantidades somadas entre móveis). */
  linhas: LinhaLista[];
  resumo: ResumoLista;
  /** Soma dos custos dos móveis (sem re-arredondar: `total` é exatamente a soma de `moveis[].custo`). */
  custo: CustoEstimado;
  /** Ferragens somadas por id, por nome e depois id. */
  ferragens: OrcamentoFerragem[];
  /** Componentes com erro de resolução: `"<id do componente>: <mensagens>"`, na ordem dos componentes. */
  avisos: string[];
}

export interface OpcoesOrcamento {
  /** Catálogo para o custo; ausente = `p.catalog`, senão `CATALOGO_PADRAO`. */
  catalogo?: Catalogo;
  /** Nível (`Level.id`); ausente = todos os níveis. */
  nivel?: Id;
}

interface Grupo {
  familiaId: Id;
  tipoId: Id | null;
  nome: string;
  ids: Id[];
  quantidade: number;
  pecasUnit: number;
  custoUnit: CustoEstimado;
  ferragensUnit: FerragemResolvida[];
}

function cmpTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function componentesDoProjeto(p: Project, nivel?: Id): Component[] {
  const lista: Component[] = [];
  for (const id of Object.keys(p.elements).sort()) {
    const e = p.elements[id];
    if (e === undefined || !isComponent(e)) continue;
    if (nivel !== undefined && e.levelId !== nivel) continue;
    lista.push(e);
  }
  return lista;
}

/** Chave do grupo: mesma família, mesmo tipo e os mesmos valores de instância (ordem dos nomes não importa). */
function chaveDoGrupo(c: Component): string {
  const valores = c.values ?? {};
  const nomes = Object.keys(valores).sort();
  return `${c.familyId}|${c.typeId ?? ''}|${JSON.stringify(nomes.map((nome) => [nome, valores[nome]]))}`;
}

function nomeDoMovel(p: Project, c: Component): string {
  const familia = p.componentFamilies?.[c.familyId];
  const tipo = c.typeId === null || familia === undefined ? undefined : familia.tipos.find((t) => t.id === c.typeId);
  return tipo?.nome ?? familia?.nome ?? c.familyId;
}

function compararGrupos(a: Grupo, b: Grupo): number {
  return a.nome.localeCompare(b.nome) || cmpTexto(a.familiaId, b.familiaId) || cmpTexto(a.tipoId ?? '', b.tipoId ?? '');
}

/**
 * Orçamento do projeto: resolve cada componente (do `nivel` dado ou de todos), agrupa móveis iguais e consolida as peças.
 * Sem componentes: tudo vazio e `avisos` vazio. Determinístico (ordens de `moveis` e `ferragens`: nome, depois id).
 */
export function orcamentoDoProjeto(p: Project, opcoes: OpcoesOrcamento = {}): OrcamentoProjeto {
  const catalogo = opcoes.catalogo ?? p.catalog ?? CATALOGO_PADRAO;
  const grupos = new Map<string, Grupo>();
  const pecas: PecaResolvida[] = [];
  const avisos: string[] = [];
  for (const c of componentesDoProjeto(p, opcoes.nivel)) {
    const res = resolverComponente(p, c);
    if (res.erros.length > 0) {
      avisos.push(`Componente ${c.id}: ${res.erros.map((e) => e.mensagem).join('; ')}`);
      continue;
    }
    const chave = chaveDoGrupo(c);
    let grupo = grupos.get(chave);
    if (grupo === undefined) {
      const resumoUnit = resumirLista(listaDePecas(res.pecas));
      grupo = {
        familiaId: c.familyId,
        tipoId: c.typeId ?? null,
        nome: nomeDoMovel(p, c),
        ids: [],
        quantidade: 0,
        pecasUnit: resumoUnit.totalPecas,
        custoUnit: custoEstimado(resumoUnit, catalogo, res.ferragens),
        ferragensUnit: res.ferragens,
      };
      grupos.set(chave, grupo);
    }
    grupo.ids.push(c.id);
    grupo.quantidade += 1;
    pecas.push(...res.pecas);
  }
  const gruposOrdenados = [...grupos.values()].sort(compararGrupos);
  const moveis: OrcamentoMovel[] = gruposOrdenados.map((g) => ({
    familiaId: g.familiaId,
    tipoId: g.tipoId,
    nome: g.nome,
    quantidade: g.quantidade,
    ids: [...g.ids].sort(),
    pecas: g.pecasUnit * g.quantidade,
    custo: g.custoUnit.total * g.quantidade,
  }));
  const custo: CustoEstimado = { chapas: 0, fitas: 0, ferragens: 0, total: 0 };
  const porId = new Map<Id, OrcamentoFerragem>();
  for (const g of gruposOrdenados) {
    custo.chapas += g.custoUnit.chapas * g.quantidade;
    custo.fitas += g.custoUnit.fitas * g.quantidade;
    custo.ferragens += g.custoUnit.ferragens * g.quantidade;
    custo.total += g.custoUnit.total * g.quantidade;
    for (const f of g.ferragensUnit) {
      const existente = porId.get(f.id);
      if (existente === undefined) porId.set(f.id, { id: f.id, nome: f.nome, quantidade: f.quantidade * g.quantidade });
      else existente.quantidade += f.quantidade * g.quantidade;
    }
  }
  const linhas = listaDePecas(pecas);
  return {
    moveis,
    linhas,
    resumo: resumirLista(linhas),
    custo,
    ferragens: [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome) || cmpTexto(a.id, b.id)),
    avisos,
  };
}
