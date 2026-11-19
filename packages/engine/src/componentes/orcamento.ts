import { CATALOGO_PADRAO, isComponent, type Catalogo, type Component, type Id, type Project } from '@hestia/model';
import type { CustoEstimado, LinhaLista, ResumoLista } from './listaPecas.ts';
import { custoEstimado, listaDePecas, resumirLista } from './listaPecas.ts';
import { areaFace } from './medidas.ts';
import { resolverComponente } from './instancia.ts';
import { lateraisCompartilhadas } from './orcamentoLaterais.ts';
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

/** Quanto o projeto economizou ao descontar as laterais compartilhadas dos conjuntos. */
export interface EconomiaLaterais {
  /** Quantidade de peças descontadas (uma por par de módulos encostados). */
  laterais: number;
  /** Área (m2) das laterais descontadas. */
  areaChapaM2: number;
}

export interface OrcamentoProjeto {
  /** Móveis agrupados, por nome, depois família, depois tipo (`null` vem primeiro). */
  moveis: OrcamentoMovel[];
  /** Todas as peças consolidadas (mesmo agrupamento de `listaDePecas`, quantidades somadas entre móveis), menos as laterais compartilhadas. */
  linhas: LinhaLista[];
  resumo: ResumoLista;
  /** Soma dos custos dos móveis; com laterais descontadas, recalculado a partir das linhas descontadas. */
  custo: CustoEstimado;
  /** Ferragens somadas por id, por nome e depois id. */
  ferragens: OrcamentoFerragem[];
  /** Componentes com erro de resolução: `"<id do componente>: <mensagens>"`, na ordem dos componentes. */
  avisos: string[];
  /**
   * Laterais compartilhadas descontadas da lista (zeros quando nenhum conjunto usa a regra).
   * Opcional no tipo para não quebrar quem monta um orçamento à mão; `orcamentoDoProjeto` SEMPRE devolve o campo.
   */
  economia?: EconomiaLaterais;
}

/** Resultado de `orcamentoDoProjeto`: o orçamento sempre traz a economia de laterais. */
export type OrcamentoCalculado = OrcamentoProjeto & { economia: EconomiaLaterais };

/** Peça resolvida com o componente de onde veio, para casar os descontos de lateral. */
interface PecaDoComponente {
  componenteId: Id;
  peca: PecaResolvida;
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

/** Índice da primeira peça ainda não removida do componente e com o id pedido, ou `null`. */
function acharPeca(
  pecas: readonly PecaDoComponente[],
  removidas: ReadonlySet<number>,
  componenteId: Id,
  pecaId: string,
): number | null {
  for (let i = 0; i < pecas.length; i++) {
    if (removidas.has(i)) continue;
    const item = pecas[i]!;
    if (item.componenteId === componenteId && item.peca.id === pecaId) return i;
  }
  return null;
}

/**
 * Orçamento do projeto: resolve cada componente (do `nivel` dado ou de todos), agrupa móveis iguais e consolida as peças.
 * Sem componentes: tudo vazio e `avisos` vazio. Determinístico (ordens de `moveis` e `ferragens`: nome, depois id).
 */
export function orcamentoDoProjeto(p: Project, opcoes: OpcoesOrcamento = {}): OrcamentoCalculado {
  const catalogo = opcoes.catalogo ?? p.catalog ?? CATALOGO_PADRAO;
  const grupos = new Map<string, Grupo>();
  const pecas: PecaDoComponente[] = [];
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
    for (const peca of res.pecas) pecas.push({ componenteId: c.id, peca });
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
  const ferragensConsolidadas: FerragemResolvida[] = [];
  for (const g of gruposOrdenados) {
    custo.chapas += g.custoUnit.chapas * g.quantidade;
    custo.fitas += g.custoUnit.fitas * g.quantidade;
    custo.ferragens += g.custoUnit.ferragens * g.quantidade;
    custo.total += g.custoUnit.total * g.quantidade;
    for (const f of g.ferragensUnit) {
      const quantidade = f.quantidade * g.quantidade;
      ferragensConsolidadas.push({ ...f, quantidade });
      const existente = porId.get(f.id);
      if (existente === undefined) porId.set(f.id, { id: f.id, nome: f.nome, quantidade });
      else existente.quantidade += quantidade;
    }
  }
  const removidas = new Set<number>();
  let areaDescontada = 0;
  for (const lateral of lateraisCompartilhadas(p)) {
    const indice = acharPeca(pecas, removidas, lateral.descontadoDe, lateral.peca);
    if (indice === null) continue;
    removidas.add(indice);
    areaDescontada += areaFace(pecas[indice]!.peca);
  }
  const linhas = listaDePecas(pecas.filter((_, indice) => !removidas.has(indice)).map((item) => item.peca));
  const resumo = resumirLista(linhas);
  return {
    moveis,
    linhas,
    resumo,
    custo: removidas.size > 0 ? custoEstimado(resumo, catalogo, ferragensConsolidadas) : custo,
    ferragens: [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome) || cmpTexto(a.id, b.id)),
    avisos,
    economia: { laterais: removidas.size, areaChapaM2: areaDescontada },
  };
}
