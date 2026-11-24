import { compilar, referencias } from './expressao.ts';
import { LIMITES, type Familia } from './tipos.ts';
import { LIMITES_REPRESENTACAO, type VistaSimbolo } from './tiposRepresentacao.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Validação dos DETALHES da família (CONTRATO §5, ADR 0061 §D4): vista, escala, plano de corte, símbolos mostrados e cotas.
 * Só confere o que dá para ver sem resolver: ids e limites, tipos dos campos, fórmulas e referências (planos, ligações,
 * símbolos e parâmetros existem; plano ou ligação solto numa cota é só aviso). A cota dirigida (`parametro`) precisa apontar para parâmetro numérico SEM fórmula, senão
 * editar a cota não teria o que editar. Nunca lança: entrada estranha vira `Problema`.
 */

const VISTAS: readonly VistaSimbolo[] = ['planta', 'corte', 'elevacao'];
const EIXOS: readonly string[] = ['x', 'y', 'z'];
const TIPOS_NUMERICOS: readonly string[] = ['comprimento', 'numero', 'inteiro'];

interface Contexto {
  ids: Set<string>;
  chapas: Set<string>;
  planos: Set<string>;
  ligacoes: Set<string>;
  simbolos: Set<string>;
  parametros: Map<string, Record<string, unknown>>;
}

function idsDe(lista: unknown): Set<string> {
  const out = new Set<string>();
  for (const x of comoArray<unknown>(lista)) if (ehObjeto(x) && typeof x.id === 'string') out.add(x.id);
  return out;
}

function contextoDe(f: Familia): Contexto {
  const ids = new Set<string>();
  const chapas = new Set<string>();
  const parametros = new Map<string, Record<string, unknown>>();
  for (const p of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(p) || typeof p.id !== 'string') continue;
    ids.add(p.id);
    parametros.set(p.id, p);
    if (p.tipo === 'chapa') chapas.add(p.id);
  }
  const planos = idsDe(f.planos);
  for (const id of planos) ids.add(id);
  return { ids, chapas, planos, ligacoes: idsDe(f.ligacoes), simbolos: idsDe(f.simbolos), parametros };
}

export function validarDetalhes(f: Familia): Problema[] {
  if (f.detalhes === undefined) return [];
  if (!Array.isArray(f.detalhes)) return [criarProblema('tipo', 'detalhes precisa ser uma lista', 'familia')];
  const detalhes = comoArray<unknown>(f.detalhes);
  const out: Problema[] = [];
  if (detalhes.length > LIMITES_REPRESENTACAO.detalhes) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_REPRESENTACAO.detalhes} detalhes`, 'familia'));
  }
  const ctx = contextoDe(f);
  const vistos = new Set<string>();
  detalhes.forEach((d, k) => {
    if (!ehObjeto(d)) {
      out.push(criarProblema('tipo', 'o detalhe precisa ser um objeto', `detalhes[${k}]`));
      return;
    }
    const onde = `detalhe:${texto(d.id)}`;
    if (typeof d.id !== 'string' || d.id.trim() === '') {
      out.push(criarProblema('id_invalido', 'detalhe sem id (o id precisa ser texto não vazio)', `detalhes[${k}]`));
    } else if (vistos.has(d.id)) {
      out.push(criarProblema('id_duplicado', `id “${d.id}” já existe em outro detalhe`, onde));
    } else {
      vistos.add(d.id);
    }
    validarUmDetalhe(d, onde, ctx, out);
  });
  return out;
}

function validarUmDetalhe(d: Record<string, unknown>, onde: string, ctx: Contexto, out: Problema[]): void {
  if (typeof d.nome !== 'string' || d.nome.trim() === '') out.push(criarProblema('obrigatorio', 'o detalhe precisa de um nome', `${onde}.nome`));
  else if (d.nome.length > LIMITES.nome) out.push(criarProblema('limite', `nome passa de ${LIMITES.nome} caracteres`, `${onde}.nome`));
  if (!VISTAS.includes(d.vista as VistaSimbolo)) out.push(criarProblema('tipo', `vista desconhecida “${texto(d.vista)}”`, `${onde}.vista`));
  if (typeof d.escala !== 'number' || !Number.isFinite(d.escala) || d.escala <= 0) {
    out.push(criarProblema('faixa', 'a escala precisa ser um número maior que 0 (denominador, 20 = 1:20)', `${onde}.escala`));
  }
  if (d.plano !== undefined) validarPlano(d.plano, `${onde}.plano`, ctx, out);
  if (d.simbolos !== undefined) {
    if (!Array.isArray(d.simbolos)) out.push(criarProblema('tipo', 'simbolos precisa ser uma lista de ids', `${onde}.simbolos`));
    comoArray<unknown>(d.simbolos).forEach((s, j) => {
      if (typeof s !== 'string' || !ctx.simbolos.has(s)) out.push(criarProblema('referencia', `o símbolo “${texto(s)}” não existe`, `${onde}.simbolos[${j}]`));
    });
  }
  if (d.cotas !== undefined) validarCotas(d.cotas, onde, ctx, out);
}

function validarPlano(p: unknown, campo: string, ctx: Contexto, out: Problema[]): void {
  if (!ehObjeto(p)) {
    out.push(criarProblema('tipo', 'plano precisa ser um objeto', campo));
    return;
  }
  if (typeof p.eixo !== 'string' || !EIXOS.includes(p.eixo)) out.push(criarProblema('tipo', `eixo desconhecido “${texto(p.eixo)}”`, `${campo}.eixo`));
  if (p.sentido !== undefined && p.sentido !== 1 && p.sentido !== -1) out.push(criarProblema('faixa', 'sentido precisa ser 1 ou -1', `${campo}.sentido`));
  validarFormula(p.posicao, `${campo}.posicao`, ctx, out);
}

function validarCotas(cotas: unknown, onde: string, ctx: Contexto, out: Problema[]): void {
  if (!Array.isArray(cotas)) {
    out.push(criarProblema('tipo', 'cotas precisa ser uma lista', `${onde}.cotas`));
    return;
  }
  const lista = comoArray<unknown>(cotas);
  if (lista.length > LIMITES_REPRESENTACAO.cotas) out.push(criarProblema('limite', `o detalhe passa de ${LIMITES_REPRESENTACAO.cotas} cotas`, `${onde}.cotas`));
  const vistos = new Set<string>();
  lista.forEach((c, k) => {
    if (!ehObjeto(c)) {
      out.push(criarProblema('tipo', 'a cota precisa ser um objeto', `${onde}.cotas[${k}]`));
      return;
    }
    const campo = `${onde}.cota:${texto(c.id)}`;
    if (typeof c.id !== 'string' || c.id.trim() === '') out.push(criarProblema('id_invalido', 'cota sem id', `${onde}.cotas[${k}]`));
    else if (vistos.has(c.id)) out.push(criarProblema('id_duplicado', `id “${c.id}” já existe em outra cota deste detalhe`, campo));
    else vistos.add(c.id);
    validarReferenciaCota(c.de, `${campo}.de`, ctx, out);
    validarReferenciaCota(c.ate, `${campo}.ate`, ctx, out);
    if (c.deslocamento !== undefined) validarFormula(c.deslocamento, `${campo}.deslocamento`, ctx, out);
    if (c.texto !== undefined) validarFormula(c.texto, `${campo}.texto`, ctx, out);
    if (c.parametro !== undefined) validarParametroDirigido(c.parametro, `${campo}.parametro`, ctx, out);
  });
}

/** Referência solta de cota é AVISO (a cota some do desenho com diagnóstico), não erro: a família ainda abre e se corrige. */
function avisar(mensagem: string, onde: string): Problema {
  return { nivel: 'aviso', codigo: 'referencia', mensagem, onde };
}

function validarReferenciaCota(r: unknown, campo: string, ctx: Contexto, out: Problema[]): void {
  if (!ehObjeto(r)) {
    out.push(criarProblema('obrigatorio', 'referência da cota ausente', campo));
    return;
  }
  if (r.tipo === 'plano') {
    if (typeof r.id !== 'string' || !ctx.planos.has(r.id)) out.push(avisar(`o plano “${texto(r.id)}” não existe`, campo));
  } else if (r.tipo === 'ligacao') {
    if (typeof r.id !== 'string' || !ctx.ligacoes.has(r.id)) out.push(avisar(`a ligação “${texto(r.id)}” não existe`, campo));
  } else if (r.tipo === 'ponto') {
    if (!Array.isArray(r.ponto) || r.ponto.length !== 3) out.push(criarProblema('tipo', 'ponto precisa de 3 coordenadas', `${campo}.ponto`));
    else comoArray<unknown>(r.ponto).forEach((e, j) => validarFormula(e, `${campo}.ponto[${j}]`, ctx, out));
  } else {
    out.push(criarProblema('tipo', `tipo de referência desconhecido “${texto(r.tipo)}”`, campo));
  }
}

function validarParametroDirigido(id: unknown, campo: string, ctx: Contexto, out: Problema[]): void {
  const p = typeof id === 'string' ? ctx.parametros.get(id) : undefined;
  if (p === undefined) {
    out.push(criarProblema('referencia', `o parâmetro “${texto(id)}” não existe`, campo));
  } else if (!TIPOS_NUMERICOS.includes(String(p.tipo))) {
    out.push(criarProblema('tipo', `a cota só dirige parâmetro numérico; “${texto(id)}” é ${texto(p.tipo)}`, campo));
  } else if (p.formula !== undefined) {
    out.push(criarProblema('tipo', `“${texto(id)}” é calculado por fórmula e não pode ser dirigido por cota`, campo));
  }
}

function validarFormula(valor: unknown, campo: string, ctx: Contexto, out: Problema[]): void {
  if (typeof valor !== 'string') {
    out.push(criarProblema(valor === undefined ? 'obrigatorio' : 'tipo', 'expressão precisa ser texto', campo));
    return;
  }
  const compilado = compilar(valor);
  if ('erro' in compilado) {
    out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo));
    return;
  }
  for (const nome of referencias(compilado.no)) {
    const partes = nome.split('.');
    const ok = ctx.ids.has(nome) || (partes.length === 2 && partes[1] === 'esp' && ctx.chapas.has(partes[0] ?? ''));
    if (!ok) out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo));
  }
}
