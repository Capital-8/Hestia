import {
  circuitoDoComponente,
  totalDoCircuito,
  vaDoPonto,
  type CircuitoEletrico,
  type PontoCircuito,
  type QuadroEletrico,
} from './circuitosEletricos.ts';
import type { Component, Id, Project } from './types.ts';

/*
 * Consulta e validação dos circuitos contra o projeto (ficha C4). A consulta NÃO altera o projeto: ponto cujo componente não
 * existe mais é descartado do resultado (e não entra nos totais). Sem valores de norma.
 */

/** Famílias que valem como quadro de distribuição: a nova (C4) e a de exemplo da disciplina elétrica. */
export const FAMILIAS_QUADRO: readonly string[] = ['fam_quadro_distribuicao_eletrico', 'fam_quadro_distribuicao'];

export const ehQuadro = (e: unknown): e is Component => (e as Component | undefined)?.kind === 'component' && FAMILIAS_QUADRO.includes((e as Component).familyId);

/** Categorias de peça de rede (eletroduto, curva, luva...): nunca são ponto de circuito. */
const CATEGORIAS_DE_REDE: readonly string[] = ['eletroduto', 'conexao_tubo', 'tubulacao', 'terminal_hidraulico'];

/**
 * Ponto de circuito (ficha C8a): componente elétrico que consome ou comanda, ou seja, tomada, interruptor, luminária ou outro
 * dispositivo. NÃO são pontos: o quadro, o eletroduto, a curva, a luva e a caixa de luz (dispositivo elétrico que só tem entradas de
 * eletroduto, sem ponto de força). Decide pelos dados da família no projeto (disciplina, categoria e ligações), não pelo id.
 */
export function ehPontoEletrico(p: Project, e: unknown): e is Component {
  const c = e as Component | undefined;
  if (c?.kind !== 'component' || FAMILIAS_QUADRO.includes(c.familyId)) return false;
  const f = p.componentFamilies?.[c.familyId];
  if (!f || CATEGORIAS_DE_REDE.includes(f.categoria)) return false;
  if (f.disciplina !== 'eletrico' && f.categoria !== 'dispositivo_eletrico' && f.categoria !== 'luminaria') return false;
  const caixa = f.categoria === 'dispositivo_eletrico' && !(f.ligacoes ?? []).some((l) => l.dominio === 'eletrica_forca');
  return !caixa;
}

export interface QuadroConsultado {
  id: Id;
  nome: string;
  /** Posições de disjuntor da instância (parâmetro `posicoes`), ou `undefined` se a família não o tem. */
  posicoes?: number;
  circuitos: Id[];
  totalVA: number;
}

export interface PontoConsultado extends PontoCircuito {
  /** Potência considerada (VA) = potência × fator. */
  va: number;
  /** Nome da família do componente, para listas. */
  rotulo: string;
}

export interface CircuitoConsultado extends Omit<CircuitoEletrico, 'pontos'> {
  pontos: PontoConsultado[];
  totalVA: number;
  /** Pontos descartados porque o componente não existe mais. */
  removidos: number;
}

export interface ConsultaCircuitos {
  circuitos: CircuitoConsultado[];
  quadros: QuadroConsultado[];
  /** Soma dos circuitos sem quadro (ou com quadro que não existe mais). */
  semQuadroVA: number;
}

export type CodigoProblemaCircuito = 'circuito_sem_quadro' | 'quadro_inexistente' | 'ponto_orfao' | 'circuito_vazio' | 'quadro_sem_posicao';

export interface ProblemaCircuito {
  codigo: CodigoProblemaCircuito;
  circuitoId?: Id;
  quadroId?: Id;
  componenteId?: Id;
  mensagem: string;
}

/** Componentes-quadro do projeto, com o nome registrado (ou "QD n" na ordem de criação). */
export function listarQuadros(p: Project): { id: Id; nome: string; componente: Component }[] {
  const lista = Object.values(p.elements).filter(ehQuadro).sort((a, b) => a.order - b.order);
  return lista.map((c, i) => ({ id: c.id, nome: nomeDoQuadro(p.quadrosEletricos?.[c.id], i), componente: c }));
}

const nomeDoQuadro = (q: QuadroEletrico | undefined, indice: number): string => (q?.nome.trim() ? q.nome : `QD ${indice + 1}`);

/** Posições de disjuntor da instância: valor da instância, depois do tipo, depois o padrão do parâmetro. */
export function posicoesDoQuadro(p: Project, c: Component): number | undefined {
  const f = p.componentFamilies?.[c.familyId];
  const par = f?.parametros.find((x) => x.id === 'posicoes');
  const v = c.values?.posicoes ?? f?.tipos.find((t) => t.id === c.typeId)?.valores.posicoes ?? par?.padrao;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

const existeComponente = (p: Project, id: Id): boolean => p.elements[id]?.kind === 'component';

function rotuloDoComponente(p: Project, id: Id): string {
  const e = p.elements[id];
  if (e?.kind !== 'component') return id;
  return p.componentFamilies?.[e.familyId]?.nome ?? e.familyId;
}

/** Circuitos do projeto já com pontos válidos, totais por circuito e por quadro. */
export function consultarCircuitos(p: Project): ConsultaCircuitos {
  const cs = p.circuitosEletricos ?? {};
  const circuitos: CircuitoConsultado[] = Object.values(cs).map((c) => {
    const validos = c.pontos.filter((pt) => existeComponente(p, pt.componenteId));
    const pontos = validos.map((pt): PontoConsultado => ({ ...pt, va: vaDoPonto(pt), rotulo: rotuloDoComponente(p, pt.componenteId) }));
    return { ...c, pontos, totalVA: totalDoCircuito({ pontos: validos }), removidos: c.pontos.length - validos.length };
  });
  const quadros = listarQuadros(p).map((q): QuadroConsultado => {
    const seus = circuitos.filter((c) => c.quadroId === q.id);
    const posicoes = posicoesDoQuadro(p, q.componente);
    return { id: q.id, nome: q.nome, ...(posicoes !== undefined ? { posicoes } : {}), circuitos: seus.map((c) => c.id), totalVA: seus.reduce((s, c) => s + c.totalVA, 0) };
  });
  const comQuadro = new Set(quadros.map((q) => q.id));
  const semQuadroVA = circuitos.filter((c) => c.quadroId === undefined || !comQuadro.has(c.quadroId)).reduce((s, c) => s + c.totalVA, 0);
  return { circuitos, quadros, semQuadroVA };
}

/** Cor de destaque por componente (id do componente → cor do circuito), só de componentes que existem. */
export function coresPorComponente(p: Project): Map<Id, string> {
  const mapa = new Map<Id, string>();
  for (const c of Object.values(p.circuitosEletricos ?? {})) {
    for (const pt of c.pontos) if (existeComponente(p, pt.componenteId)) mapa.set(pt.componenteId, c.cor);
  }
  return mapa;
}

/** Cor do circuito do componente, ou `undefined`. */
export function corDoComponente(p: Project, componenteId: Id): string | undefined {
  return circuitoDoComponente(p.circuitosEletricos ?? {}, componenteId)?.cor;
}

/** Problemas dos circuitos: sem quadro, quadro que não existe, ponto órfão, circuito vazio e quadro com mais circuitos que posições. */
export function validarCircuitos(p: Project): ProblemaCircuito[] {
  const out: ProblemaCircuito[] = [];
  for (const c of Object.values(p.circuitosEletricos ?? {})) {
    if (c.quadroId === undefined) out.push({ codigo: 'circuito_sem_quadro', circuitoId: c.id, mensagem: `O circuito ${c.nome} não está ligado a nenhum quadro.` });
    else if (!ehQuadro(p.elements[c.quadroId])) out.push({ codigo: 'quadro_inexistente', circuitoId: c.id, quadroId: c.quadroId, mensagem: `O quadro do circuito ${c.nome} não existe mais.` });
    for (const pt of c.pontos) {
      if (!existeComponente(p, pt.componenteId)) out.push({ codigo: 'ponto_orfao', circuitoId: c.id, componenteId: pt.componenteId, mensagem: `O circuito ${c.nome} tem um ponto cujo componente não existe mais.` });
    }
    if (c.pontos.length === 0) out.push({ codigo: 'circuito_vazio', circuitoId: c.id, mensagem: `O circuito ${c.nome} não tem pontos.` });
  }
  for (const q of consultarCircuitos(p).quadros) {
    if (q.posicoes !== undefined && q.circuitos.length > q.posicoes) {
      out.push({ codigo: 'quadro_sem_posicao', quadroId: q.id, mensagem: `O quadro ${q.nome} tem ${q.circuitos.length} circuitos para ${q.posicoes} posições.` });
    }
  }
  return out;
}
