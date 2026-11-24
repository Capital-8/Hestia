import { compilar, referencias } from './expressao.ts';
import { LIMITES, type Familia, type NivelDetalhe } from './tipos.ts';
import { LIMITES_REPRESENTACAO, type PlanoSimbolo, type VistaSimbolo } from './tiposRepresentacao.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import { exigirPositivo } from './validarPerfil.ts';
import type { Problema } from './validar.ts';

/*
 * Validação dos símbolos 2D (CONTRATO §4, ADR 0061 §D4), chamada por `validarFamilia`. Só o que dá para conferir sem
 * resolver: ids, limites (símbolos e primitivos da família), vistas e plano válidos, a forma de cada primitivo, polilinha
 * com pelo menos 2 pontos, raio e altura literais > 0 e a sintaxe/referências das fórmulas. A resolução (metros, radianos,
 * `quando` e texto) fica em `simbolosResolvidos.ts`. Os nomes das fórmulas são parâmetros e planos (símbolo não repete, então
 * `i` e `n` não valem; `x.esp` só para chapa). Nunca lança: entrada estranha vira `Problema`.
 */

const VISTAS: readonly VistaSimbolo[] = ['planta', 'corte', 'elevacao'];
const PLANOS: readonly PlanoSimbolo[] = ['xy', 'xz', 'yz'];
const DETALHES: readonly NivelDetalhe[] = ['grosso', 'medio', 'fino'];
const TIPOS_PRIMITIVO = new Set<string>(['linha', 'circulo', 'arco', 'polilinha', 'texto']);

/** Escopo de nomes das fórmulas de símbolo: parâmetros e planos (e `x.esp` para chapa). */
interface Escopo {
  ids: Set<string>;
  chapas: Set<string>;
}

export function validarSimbolos(f: Familia): Problema[] {
  if (f.simbolos === undefined) return [];
  if (!Array.isArray(f.simbolos)) return [criarProblema('tipo', 'simbolos precisa ser uma lista', 'familia')];
  const simbolos = comoArray<unknown>(f.simbolos);

  const out: Problema[] = [];
  if (simbolos.length > LIMITES_REPRESENTACAO.simbolos) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_REPRESENTACAO.simbolos} símbolos`, 'familia'));
  }
  const totalPrimitivos = simbolos.reduce<number>((soma, s) => soma + (ehObjeto(s) ? comoArray<unknown>(s.primitivos).length : 0), 0);
  if (totalPrimitivos > LIMITES_REPRESENTACAO.primitivos) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_REPRESENTACAO.primitivos} primitivos de símbolo`, 'familia'));
  }

  const escopo = escopoDosSimbolos(f);
  const vistos = new Set<string>();
  simbolos.forEach((s, k) => {
    if (!ehObjeto(s)) {
      out.push(criarProblema('tipo', 'o símbolo precisa ser um objeto', `simbolos[${k}]`));
      return;
    }
    const onde = `simbolo:${texto(s.id)}`;
    if (typeof s.id !== 'string' || s.id.trim() === '') {
      out.push(criarProblema('id_invalido', 'símbolo sem id (o id precisa ser texto não vazio)', `simbolos[${k}]`));
    } else if (vistos.has(s.id)) {
      out.push(criarProblema('id_duplicado', `id “${s.id}” já existe em outro símbolo`, onde));
    } else {
      vistos.add(s.id);
    }
    validarUmSimbolo(s, onde, escopo, out);
  });
  return out;
}

function escopoDosSimbolos(f: Familia): Escopo {
  const ids = new Set<string>();
  const chapas = new Set<string>();
  for (const p of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(p) || typeof p.id !== 'string') continue;
    ids.add(p.id);
    if (p.tipo === 'chapa') chapas.add(p.id);
  }
  for (const p of comoArray<unknown>(f.planos)) {
    if (ehObjeto(p) && typeof p.id === 'string') ids.add(p.id);
  }
  return { ids, chapas };
}

function validarUmSimbolo(s: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (s.nome !== undefined) {
    if (typeof s.nome !== 'string') out.push(criarProblema('tipo', 'nome precisa ser texto', `${onde}.nome`));
    else if (s.nome.length > LIMITES.nome) out.push(criarProblema('limite', `nome passa de ${LIMITES.nome} caracteres`, `${onde}.nome`));
  }
  validarVistas(s.vistas, `${onde}.vistas`, out);
  validarPlano(s.plano, `${onde}.plano`, out);
  if (s.substituiGeometria !== undefined && typeof s.substituiGeometria !== 'boolean') {
    out.push(criarProblema('tipo', 'substituiGeometria precisa ser verdadeiro ou falso', `${onde}.substituiGeometria`));
  }
  validarDetalhe(s.detalhe, `${onde}.detalhe`, out);
  if (s.quando !== undefined) validarFormula(s.quando, `${onde}.quando`, escopo, out);
  validarPrimitivos(s.primitivos, onde, escopo, out);
}

/** `vistas` é lista não vazia de vistas conhecidas (planta, corte, elevação). */
function validarVistas(valor: unknown, campo: string, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'vistas ausentes', campo));
    return;
  }
  if (!Array.isArray(valor)) {
    out.push(criarProblema('tipo', 'vistas precisa ser uma lista', campo));
    return;
  }
  const lista = comoArray<unknown>(valor);
  if (lista.length === 0) {
    out.push(criarProblema('faixa', 'o símbolo precisa aparecer em pelo menos uma vista', campo));
    return;
  }
  lista.forEach((v, j) => {
    if (!VISTAS.includes(v as VistaSimbolo)) out.push(criarProblema('tipo', `vista desconhecida “${texto(v)}”`, `${campo}[${j}]`));
  });
}

function validarPlano(valor: unknown, campo: string, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'plano ausente', campo));
  } else if (!PLANOS.includes(valor as PlanoSimbolo)) {
    out.push(criarProblema('tipo', `plano desconhecido “${texto(valor)}”`, campo));
  }
}

function validarDetalhe(valor: unknown, campo: string, out: Problema[]): void {
  if (valor === undefined) return;
  if (!Array.isArray(valor)) {
    out.push(criarProblema('tipo', 'detalhe precisa ser uma lista de níveis', campo));
    return;
  }
  comoArray<unknown>(valor).forEach((d, j) => {
    if (!DETALHES.includes(d as NivelDetalhe)) out.push(criarProblema('tipo', `nível de detalhe desconhecido “${texto(d)}”`, `${campo}[${j}]`));
  });
}

/** `primitivos` é lista não vazia; cada item é validado pela forma do seu `tipo`. */
function validarPrimitivos(valor: unknown, onde: string, escopo: Escopo, out: Problema[]): void {
  const campo = `${onde}.primitivos`;
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'primitivos ausentes', campo));
    return;
  }
  if (!Array.isArray(valor)) {
    out.push(criarProblema('tipo', 'primitivos precisa ser uma lista', campo));
    return;
  }
  const lista = comoArray<unknown>(valor);
  if (lista.length === 0) {
    out.push(criarProblema('faixa', 'o símbolo precisa de pelo menos um primitivo', campo));
    return;
  }
  lista.forEach((p, j) => validarPrimitivo(p, `${campo}[${j}]`, escopo, out));
}

function validarPrimitivo(p: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (!ehObjeto(p)) {
    out.push(criarProblema('tipo', 'o primitivo precisa ser um objeto', campo));
    return;
  }
  const tipo = p.tipo;
  if (typeof tipo !== 'string' || !TIPOS_PRIMITIVO.has(tipo)) {
    out.push(criarProblema('tipo', `primitivo desconhecido “${texto(tipo)}”`, campo));
    return;
  }
  switch (tipo) {
    case 'linha':
      validarPonto(p.de, `${campo}.de`, escopo, out);
      validarPonto(p.ate, `${campo}.ate`, escopo, out);
      break;
    case 'circulo':
      validarPonto(p.centro, `${campo}.centro`, escopo, out);
      validarMedida(p.raio, `${campo}.raio`, escopo, out);
      break;
    case 'arco':
      validarPonto(p.centro, `${campo}.centro`, escopo, out);
      validarMedida(p.raio, `${campo}.raio`, escopo, out);
      validarFormula(p.deGraus, `${campo}.deGraus`, escopo, out);
      validarFormula(p.ateGraus, `${campo}.ateGraus`, escopo, out);
      break;
    case 'polilinha':
      validarPolilinha(p, campo, escopo, out);
      break;
    default:
      validarPonto(p.posicao, `${campo}.posicao`, escopo, out);
      validarFormula(p.texto, `${campo}.texto`, escopo, out);
      validarMedida(p.altura, `${campo}.altura`, escopo, out);
      break;
  }
}

/** Polilinha: pelo menos 2 pontos; `fechada`, se houver, é booleano. */
function validarPolilinha(p: Record<string, unknown>, campo: string, escopo: Escopo, out: Problema[]): void {
  const pontos = p.pontos;
  if (pontos === undefined) {
    out.push(criarProblema('obrigatorio', 'pontos ausentes', `${campo}.pontos`));
  } else if (!Array.isArray(pontos)) {
    out.push(criarProblema('tipo', 'pontos precisa ser uma lista', `${campo}.pontos`));
  } else if (pontos.length < 2) {
    out.push(criarProblema('faixa', 'polilinha precisa de pelo menos 2 pontos', `${campo}.pontos`));
  } else {
    comoArray<unknown>(pontos).forEach((pt, j) => validarPonto(pt, `${campo}.pontos[${j}]`, escopo, out));
  }
  if (p.fechada !== undefined && typeof p.fechada !== 'boolean') {
    out.push(criarProblema('tipo', 'fechada precisa ser verdadeiro ou falso', `${campo}.fechada`));
  }
}

/** Ponto 2D: par de fórmulas (mm no plano do símbolo). */
function validarPonto(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'ponto ausente', campo));
    return;
  }
  if (!Array.isArray(valor) || valor.length !== 2) {
    out.push(criarProblema('tipo', 'ponto precisa de 2 coordenadas', campo));
    return;
  }
  comoArray<unknown>(valor).forEach((v, j) => validarFormula(v, `${campo}[${j}]`, escopo, out));
}

/** Medida de comprimento (raio, altura): fórmula, e literal precisa ser maior que zero. */
function validarMedida(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  validarFormula(valor, campo, escopo, out);
  exigirPositivo(valor, campo, out);
}

/** Fórmula de símbolo: presente, texto, compila e só usa nomes do escopo. */
function validarFormula(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'expressão ausente', campo));
    return;
  }
  if (typeof valor !== 'string') {
    out.push(criarProblema('tipo', 'expressão precisa ser texto', campo));
    return;
  }
  const compilado = compilar(valor);
  if ('erro' in compilado) {
    out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo));
    return;
  }
  for (const nome of referencias(compilado.no)) {
    if (!referenciaValida(nome, escopo)) out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo));
  }
}

function referenciaValida(nome: string, escopo: Escopo): boolean {
  if (escopo.ids.has(nome)) return true;
  const partes = nome.split('.');
  return partes.length === 2 && partes[1] === 'esp' && partes[0] !== undefined && escopo.chapas.has(partes[0]);
}
