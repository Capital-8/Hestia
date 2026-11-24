import { tentar, type Env } from './familia/expressao.ts';
import type { Familia, Valor } from './familia/tipos.ts';
import type { Ligacao } from './familia/tiposLigacao.ts';
import { conexoesIssue, type SistemaMep } from './sistemasMep.ts';
import type { Component, Id, Project } from './types.ts';

/*
 * Comandos das redes de MEP no projeto (ADR 0061, CONTRATO.md §3 e §7): conectar e desconectar ligações de instâncias e
 * renomear sistemas. A conexão é SIMÉTRICA (gravada nos dois lados) e todo comando valida antes de gravar (lança `Error` em
 * português; o histórico trabalha sobre rascunho, então o projeto fica como estava). Desfazer, refazer e colaboração vêm
 * dos patches do histórico, como nos demais comandos. A compatibilidade completa das ligações é da ficha C4.
 */

export type MepCommand =
  /**
   * Conecta `ligacaoA` da instância `a` (a arrastada) com `ligacaoB` da instância `b` (o alvo). Cria o sistema do domínio se
   * faltar, funde sistemas diferentes (o de `a` vira o de `b`) e propaga a bitola (`propagaParametro`). `sistemaId` opcional
   * dá o id do sistema novo (o padrão é derivado do projeto).
   */
  | { type: 'connectComponents'; a: Id; ligacaoA: string; b: Id; ligacaoB: string; sistemaId?: Id }
  /** Desfaz a conexão da ligação nos DOIS lados. */
  | { type: 'disconnectComponents'; a: Id; ligacaoA: string }
  | { type: 'renameMepSystem'; id: Id; nome: string };

const LIMITE_PASSADAS = 16;

function instancia(p: Project, id: Id): Component {
  const e = p.elements[id];
  if (e?.kind !== 'component') throw new Error('Componente inexistente: ' + id);
  return e;
}

function ligacaoDa(p: Project, c: Component, ligacaoId: string): Ligacao {
  const l = p.componentFamilies?.[c.familyId]?.ligacoes?.find((x) => x.id === ligacaoId);
  if (!l) throw new Error(`A ligação "${ligacaoId}" não existe na família do componente ${c.id}.`);
  return l;
}

/** Sistema a que a instância já pertence (o primeiro, em ordem de ligação), ou `undefined`. */
function sistemaDaInstancia(c: Component): Id | undefined {
  for (const cx of Object.values(c.ligacoes ?? {})) if (cx.sistemaId !== undefined) return cx.sistemaId;
  return undefined;
}

function novoIdSistema(p: Project, pedido?: Id): Id {
  const existentes = p.sistemasMep ?? {};
  if (pedido !== undefined) {
    if (!pedido.trim()) throw new Error('O id do sistema não pode ser vazio.');
    if (existentes[pedido]) throw new Error('Já existe um sistema com este id: ' + pedido);
    return pedido;
  }
  let n = Object.keys(existentes).length + 1;
  while (existentes['sis_' + n]) n++;
  return 'sis_' + n;
}

/** Valores efetivos da instância (mm): padrão do parâmetro, depois o tipo, depois a instância; fórmulas em passadas limitadas. */
function ambienteDa(f: Familia, c: Component): Env {
  const tipo = f.tipos.find((t) => t.id === c.typeId);
  const env: Record<string, Valor> = {};
  for (const par of f.parametros) env[par.id] = c.values?.[par.id] ?? tipo?.valores[par.id] ?? par.padrao;
  const passadas = Math.min(f.parametros.length, LIMITE_PASSADAS);
  for (let i = 0; i < passadas; i++) {
    for (const par of f.parametros) {
      if (par.formula === undefined) continue;
      const r = tentar(par.formula, env);
      if (r.ok) env[par.id] = r.valor;
    }
  }
  return env;
}

/** Diâmetro (mm) da ligação redonda de `c`, ou `undefined` (seção retangular ou fórmula inválida). */
function diametroMm(p: Project, c: Component, l: Ligacao): number | undefined {
  const f = p.componentFamilies?.[c.familyId];
  if (!f || l.secao !== 'redonda' || l.diametro === undefined) return undefined;
  const r = tentar(l.diametro, ambienteDa(f, c));
  return r.ok && typeof r.valor === 'number' && Number.isFinite(r.valor) && r.valor > 0 ? Math.round(r.valor) : undefined;
}

/** Aplica `propagaParametro`: o parâmetro de `c` recebe o diâmetro (mm) da outra ponta, se for parâmetro de instância numérico. */
function propagar(p: Project, c: Component, l: Ligacao, diametro: number | undefined): void {
  if (l.propagaParametro === undefined || diametro === undefined) return;
  const par = p.componentFamilies?.[c.familyId]?.parametros.find((x) => x.id === l.propagaParametro);
  if (!par || par.escopo !== 'instancia' || par.formula !== undefined) return;
  c.values = { ...(c.values ?? {}), [par.id]: diametro };
}

/** Remove da lista de sistemas os `candidatos` que ficaram sem nenhuma conexão. */
function limparSistemasVazios(p: Project, candidatos: Iterable<Id | undefined>): void {
  const sistemas = p.sistemasMep;
  if (!sistemas) return;
  const usados = new Set<Id>();
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'component') continue;
    for (const cx of Object.values(e.ligacoes ?? {})) if (cx.sistemaId !== undefined) usados.add(cx.sistemaId);
  }
  for (const id of candidatos) if (id !== undefined && !usados.has(id)) delete sistemas[id];
}

/** Reaponta toda conexão do sistema `de` para o sistema `para` e apaga `de`. */
function fundirSistemas(p: Project, de: Id, para: Id): void {
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'component' || !e.ligacoes) continue;
    for (const cx of Object.values(e.ligacoes)) if (cx.sistemaId === de) cx.sistemaId = para;
  }
  if (p.sistemasMep) delete p.sistemasMep[de];
}

function conectar(p: Project, c: Extract<MepCommand, { type: 'connectComponents' }>): void {
  if (c.a === c.b) throw new Error('Um componente não pode se conectar a si mesmo.');
  const a = instancia(p, c.a);
  const b = instancia(p, c.b);
  const la = ligacaoDa(p, a, c.ligacaoA);
  const lb = ligacaoDa(p, b, c.ligacaoB);
  if (a.ligacoes?.[c.ligacaoA]) throw new Error(`A ligação "${c.ligacaoA}" do componente ${a.id} já está conectada.`);
  if (b.ligacoes?.[c.ligacaoB]) throw new Error(`A ligação "${c.ligacaoB}" do componente ${b.id} já está conectada.`);

  // Sistema: o de `a` vira o de `b` quando diferem; sem nenhum, nasce um do domínio da ligação de `a`.
  const sa = sistemaDaInstancia(a);
  const sb = sistemaDaInstancia(b);
  const sistemas = { ...(p.sistemasMep ?? {}) };
  if (sa !== undefined && !sistemas[sa]) throw new Error('Sistema de MEP inexistente: ' + sa);
  if (sb !== undefined && !sistemas[sb]) throw new Error('Sistema de MEP inexistente: ' + sb);
  const dominio = sistemas[sa ?? sb ?? '']?.dominio ?? la.dominio;
  if (sa !== undefined && sb !== undefined && sistemas[sa]?.dominio !== sistemas[sb]?.dominio) {
    throw new Error('Não é possível fundir sistemas de domínios diferentes.');
  }
  p.sistemasMep = sistemas;
  let alvo = sb ?? sa;
  if (alvo === undefined) {
    alvo = novoIdSistema(p, c.sistemaId);
    const novo: SistemaMep = { id: alvo, nome: la.sistema?.trim() || lb.sistema?.trim() || 'Sistema ' + dominio, dominio };
    p.sistemasMep[alvo] = novo;
  } else if (sa !== undefined && sb !== undefined && sa !== sb) {
    fundirSistemas(p, sa, sb);
  }

  // Propagação de bitola, calculada antes de qualquer gravação (as duas pontas leem os valores de antes).
  const da = diametroMm(p, a, la);
  const db = diametroMm(p, b, lb);

  a.ligacoes = { ...(a.ligacoes ?? {}), [c.ligacaoA]: { componenteId: b.id, ligacaoId: c.ligacaoB, sistemaId: alvo } };
  b.ligacoes = { ...(b.ligacoes ?? {}), [c.ligacaoB]: { componenteId: a.id, ligacaoId: c.ligacaoA, sistemaId: alvo } };
  // `a` ou `b` podem ter sido tocados pelo reapontamento: os objetos em `elements` são os mesmos, então não há cópia velha.
  propagar(p, a, la, db);
  propagar(p, b, lb, da);

  for (const x of [a, b]) {
    const issue = conexoesIssue(p, x);
    if (issue) throw new Error(issue);
  }
}

function desconectar(p: Project, c: Extract<MepCommand, { type: 'disconnectComponents' }>): void {
  const a = instancia(p, c.a);
  const cx = a.ligacoes?.[c.ligacaoA];
  if (!cx) throw new Error(`A ligação "${c.ligacaoA}" do componente ${a.id} não está conectada.`);
  const b = p.elements[cx.componenteId];
  tirarConexao(a, c.ligacaoA);
  if (b?.kind === 'component' && b.ligacoes?.[cx.ligacaoId]?.componenteId === a.id) tirarConexao(b, cx.ligacaoId);
  limparSistemasVazios(p, [cx.sistemaId]);
}

function tirarConexao(c: Component, ligacaoId: string): void {
  if (!c.ligacoes) return;
  const { [ligacaoId]: _tirada, ...resto } = c.ligacoes;
  void _tirada;
  if (Object.keys(resto).length === 0) delete c.ligacoes;
  else c.ligacoes = resto;
}

/**
 * Excluir instâncias desconecta as vizinhas na mesma operação (um só passo de desfazer): toda conexão que aponta para uma
 * instância excluída sai da vizinha, e os sistemas que ficaram vazios saem do projeto. Chamado por `removerMembrosExcluidos`.
 */
export function desconectarExcluidas(p: Project, excluidos: ReadonlySet<Id>): void {
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'component' || !e.ligacoes) continue;
    for (const [ligacaoId, cx] of Object.entries(e.ligacoes)) {
      if (!excluidos.has(cx.componenteId)) continue;
      tirarConexao(e, ligacaoId);
    }
  }
  // As pontas excluídas já saíram do projeto: qualquer sistema sem conexão restante é resto delas.
  if (p.sistemasMep) limparSistemasVazios(p, Object.keys(p.sistemasMep));
}

export function applyMepCommand(p: Project, c: MepCommand): void {
  switch (c.type) {
    case 'connectComponents':
      conectar(p, c);
      break;
    case 'disconnectComponents':
      desconectar(p, c);
      break;
    case 'renameMepSystem': {
      const s = p.sistemasMep?.[c.id];
      if (!s) throw new Error('Sistema de MEP inexistente: ' + c.id);
      const nome = c.nome.trim();
      if (!nome) throw new Error('O sistema precisa de um nome.');
      s.nome = nome;
      break;
    }
  }
}

export function mepCommandLabel(c: MepCommand): string {
  switch (c.type) {
    case 'connectComponents': return 'Conectar ligações';
    case 'disconnectComponents': return 'Desconectar ligações';
    case 'renameMepSystem': return 'Renomear sistema';
  }
}
