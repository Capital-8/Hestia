import { compilar, referencias } from './expressao.ts';
import type { Familia } from './tipos.ts';

/*
 * Ordem de avaliação dos parâmetros e dos planos de referência (ADR 0049 §3.2: sem solver, ordem topológica).
 * FICHA E1-grafo: implementar os três corpos abaixo. Os testes de aceite estão em `grafo.test.ts`.
 */

export interface Dependencia {
  id: string;
  /** Ids dos quais este item depende (ids desconhecidos são ignorados por `ordenar`). */
  deps: readonly string[];
}

export type ResultadoOrdem = { ok: true; ordem: string[] } | { ok: false; ciclo: string[] };

/** Um id participa de ciclo quando, andando só pelas dependências restantes, volta a ele mesmo. */
function participaDeCiclo(
  id: string,
  depsPorId: ReadonlyMap<string, readonly string[]>,
  restantes: ReadonlySet<string>,
): boolean {
  const pilha: string[] = [];
  for (const dep of depsPorId.get(id) ?? []) if (restantes.has(dep)) pilha.push(dep);
  const vistos = new Set<string>();
  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    if (atual === id) return true;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const dep of depsPorId.get(atual) ?? []) if (restantes.has(dep)) pilha.push(dep);
  }
  return false;
}

/** Caminho de dependências dentro do conjunto cíclico; corta no primeiro id que volta a aparecer. */
function acharCiclo(
  inicio: string,
  depsPorId: ReadonlyMap<string, readonly string[]>,
  ciclicos: ReadonlySet<string>,
  posPorId: ReadonlyMap<string, number>,
): string[] {
  const caminho: string[] = [];
  const indice = new Map<string, number>();
  let atual = inicio;
  for (;;) {
    const anterior = indice.get(atual);
    if (anterior !== undefined) return caminho.slice(anterior);
    indice.set(atual, caminho.length);
    caminho.push(atual);
    let proximo: string | undefined;
    let menorPos = Number.POSITIVE_INFINITY;
    for (const dep of depsPorId.get(atual) ?? []) {
      if (!ciclicos.has(dep)) continue;
      const pos = posPorId.get(dep)!;
      if (pos < menorPos) {
        menorPos = pos;
        proximo = dep;
      }
    }
    if (proximo === undefined) return caminho;
    atual = proximo;
  }
}

/**
 * Ordenação topológica determinística (algoritmo de Kahn):
 * - cada id aparece uma vez em `ordem`, depois de todas as suas dependências conhecidas;
 * - entre itens prontos, vence o que aparece primeiro em `itens` (estável);
 * - dependência de id que não está em `itens` é ignorada; auto-dependência é ciclo de um só id;
 * - com ciclo devolve `{ ok: false, ciclo }`: `ciclo` é UM ciclo, na ordem do caminho (cada id depende do seguinte e o último
 *   do primeiro), começando pelo item de menor posição em `itens` que participe de algum ciclo; ao andar, entre as
 *   dependências que ainda estão no resíduo cíclico escolhe-se a de menor posição em `itens`.
 */
export function ordenar(itens: readonly Dependencia[]): ResultadoOrdem {
  const posPorId = new Map<string, number>();
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]!;
    if (!posPorId.has(item.id)) posPorId.set(item.id, i);
  }
  const ids = [...posPorId.keys()];

  const depsPorId = new Map<string, string[]>();
  for (const item of itens) {
    if (depsPorId.has(item.id)) continue;
    const vistas = new Set<string>();
    const deps: string[] = [];
    for (const dep of item.deps) {
      if (!posPorId.has(dep) || vistas.has(dep)) continue;
      vistas.add(dep);
      deps.push(dep);
    }
    depsPorId.set(item.id, deps);
  }

  const grau = new Map<string, number>();
  const dependentes = new Map<string, string[]>();
  for (const id of ids) dependentes.set(id, []);
  for (const id of ids) {
    const deps = depsPorId.get(id) ?? [];
    grau.set(id, deps.length);
    for (const dep of deps) dependentes.get(dep)!.push(id);
  }

  const prontos: string[] = [];
  for (const id of ids) if ((grau.get(id) ?? 0) === 0) prontos.push(id);
  const ordem: string[] = [];
  while (prontos.length > 0) {
    const id = prontos.shift()!;
    ordem.push(id);
    for (const dependente of dependentes.get(id) ?? []) {
      const novoGrau = (grau.get(dependente) ?? 0) - 1;
      grau.set(dependente, novoGrau);
      if (novoGrau !== 0) continue;
      const pos = posPorId.get(dependente)!;
      let i = prontos.length;
      while (i > 0 && posPorId.get(prontos[i - 1]!)! > pos) i--;
      prontos.splice(i, 0, dependente);
    }
  }
  if (ordem.length === ids.length) return { ok: true, ordem };

  const concluidos = new Set(ordem);
  const restantes = ids.filter((id) => !concluidos.has(id));
  const conjuntoRestante = new Set(restantes);
  const ciclicos = new Set<string>();
  for (const id of restantes) {
    if (participaDeCiclo(id, depsPorId, conjuntoRestante)) ciclicos.add(id);
  }
  const inicio = restantes.find((id) => ciclicos.has(id));
  if (inicio === undefined) return { ok: false, ciclo: [] };
  return { ok: false, ciclo: acharCiclo(inicio, depsPorId, ciclicos, posPorId) };
}

/** Nome de referência sem o sufixo depois do primeiro ponto (`corpo.esp` → `corpo`). */
function nomeBase(nome: string): string {
  const ponto = nome.indexOf('.');
  return ponto < 0 ? nome : nome.slice(0, ponto);
}

/**
 * Itens do grafo de uma família: primeiro cada parâmetro (na ordem da família), depois cada plano de referência.
 * `deps` de um item com fórmula = nomes que a fórmula referencia, com `x.esp` contando como `x`, mantendo só os que são
 * id de parâmetro ou de plano da família, sem repetição e na ordem alfabética de `referencias`. Item sem fórmula (ou com
 * fórmula que não compila) tem `deps` vazio: o erro de sintaxe é assunto de `validarFamilia`, não deste módulo.
 */
export function dependenciasDaFamilia(f: Familia): Dependencia[] {
  const conhecidos = new Set<string>();
  for (const p of f.parametros) conhecidos.add(p.id);
  for (const p of f.planos) conhecidos.add(p.id);

  const depsDe = (formula: string | undefined): string[] => {
    if (formula === undefined) return [];
    const compilada = compilar(formula);
    if ('erro' in compilada) return [];
    const vistas = new Set<string>();
    const deps: string[] = [];
    for (const nome of referencias(compilada.no)) {
      const base = nomeBase(nome);
      if (!conhecidos.has(base) || vistas.has(base)) continue;
      vistas.add(base);
      deps.push(base);
    }
    return deps;
  };

  const itens: Dependencia[] = [];
  for (const p of f.parametros) itens.push({ id: p.id, deps: depsDe(p.formula) });
  for (const p of f.planos) itens.push({ id: p.id, deps: depsDe(p.posicao) });
  return itens;
}

export function ordemDeAvaliacao(f: Familia): ResultadoOrdem {
  return ordenar(dependenciasDaFamilia(f));
}
