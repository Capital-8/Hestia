import { LIMITES_REPRESENTACAO, tentar, type Env, type Familia, type PlanoSimbolo, type Valor, type VistaSimbolo } from '@hestia/model';
import type { PrimitivoResolvido, SimboloResolvido } from './corposTipos.ts';

/*
 * Resolução dos SÍMBOLOS 2D da família (CONTRATO §4, ADR 0061 §D4): cada símbolo vira um `SimboloResolvido` com os primitivos
 * em METROS (o texto da família é em mm) e os ângulos em RADIANOS (o texto é em graus). `quando` falso remove o símbolo. O
 * `texto` avaliado: fórmula de texto vale como está; número sai formatado (CONTRATO §4). Símbolo com erro NÃO entra na lista,
 * como as ligações. A linguagem de fórmulas não concatena texto (CONTRATO §8 mantém a gramática): `"DN" + DN` não resolve;
 * o caminho é o número do parâmetro, formatado. Nunca lança por entrada do usuário: fórmula ruim vira diagnóstico.
 */

export type CodigoDiagnosticoSimbolo = 'formula' | 'faixa' | 'tipo' | 'obrigatorio' | 'limite';

export interface DiagnosticoSimbolo {
  codigo: CodigoDiagnosticoSimbolo;
  mensagem: string;
  /** `simbolo:<id>.<campo>`, ou `simbolos[k]` quando o símbolo não tem id. */
  onde: string;
}

export interface ResultadoSimbolos {
  /** `true` quando nenhum símbolo gerou diagnóstico (símbolos removidos por `quando` não contam como erro). */
  ok: boolean;
  simbolos: SimboloResolvido[];
  diagnosticos: DiagnosticoSimbolo[];
}

const METRO_EM_MM = 1000;
const ARREDONDAR_M = 1e6;
const VISTAS: readonly VistaSimbolo[] = ['planta', 'corte', 'elevacao'];
const PLANOS: readonly PlanoSimbolo[] = ['xy', 'xz', 'yz'];

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function resolverSimbolos(familia: Familia, ambiente: Env): ResultadoSimbolos {
  const bruto: unknown = familia.simbolos;
  if (bruto === undefined) return { ok: true, simbolos: [], diagnosticos: [] };
  if (!Array.isArray(bruto)) {
    return { ok: false, simbolos: [], diagnosticos: [{ codigo: 'tipo', mensagem: 'simbolos precisa ser uma lista', onde: 'familia' }] };
  }

  const diagnosticos: DiagnosticoSimbolo[] = [];
  const simbolos: SimboloResolvido[] = [];
  const lista: unknown[] = bruto;
  if (lista.length > LIMITES_REPRESENTACAO.simbolos) {
    diagnosticos.push({ codigo: 'limite', mensagem: `a família passa de ${LIMITES_REPRESENTACAO.simbolos} símbolos`, onde: 'familia' });
  }
  lista.slice(0, LIMITES_REPRESENTACAO.simbolos).forEach((item, k) => {
    const r = resolverUm(item, k, ambiente);
    diagnosticos.push(...r.diagnosticos);
    if (r.simbolo !== null) simbolos.push(r.simbolo);
  });
  return { ok: diagnosticos.length === 0, simbolos, diagnosticos };
}

interface ResultadoUm {
  simbolo: SimboloResolvido | null;
  diagnosticos: DiagnosticoSimbolo[];
}

function resolverUm(bruto: unknown, k: number, ambiente: Env): ResultadoUm {
  if (!ehObjeto(bruto)) {
    return { simbolo: null, diagnosticos: [{ codigo: 'tipo', mensagem: 'o símbolo precisa ser um objeto', onde: `simbolos[${k}]` }] };
  }
  const id = typeof bruto.id === 'string' && bruto.id.trim() !== '' ? bruto.id : undefined;
  const onde = id !== undefined ? `simbolo:${id}` : `simbolos[${k}]`;
  const diag: DiagnosticoSimbolo[] = [];

  if (bruto.quando !== undefined) {
    const quando = avaliarBruto(bruto.quando, `${onde}.quando`, ambiente, diag);
    if (quando === undefined) return { simbolo: null, diagnosticos: diag };
    if (!quando) return { simbolo: null, diagnosticos: [] };
  }

  if (id === undefined) diag.push({ codigo: 'obrigatorio', mensagem: 'símbolo sem id', onde });
  const nome = typeof bruto.nome === 'string' ? bruto.nome : (id ?? onde);
  const vistas = resolverVistas(bruto.vistas, onde, diag);
  const plano = resolverPlano(bruto.plano, onde, diag);
  const primitivos = resolverPrimitivos(bruto.primitivos, onde, ambiente, diag);

  if (diag.length > 0 || id === undefined || vistas === undefined || plano === undefined || primitivos === undefined) {
    return { simbolo: null, diagnosticos: diag };
  }
  const simbolo: SimboloResolvido = { id, nome, vistas, plano, substituiGeometria: bruto.substituiGeometria === true, primitivos };
  return { simbolo, diagnosticos: [] };
}

function resolverVistas(valor: unknown, onde: string, diag: DiagnosticoSimbolo[]): VistaSimbolo[] | undefined {
  const campo = `${onde}.vistas`;
  if (valor === undefined) {
    diag.push({ codigo: 'obrigatorio', mensagem: 'vistas ausentes', onde: campo });
    return undefined;
  }
  if (!Array.isArray(valor)) {
    diag.push({ codigo: 'tipo', mensagem: 'vistas precisa ser uma lista', onde: campo });
    return undefined;
  }
  const lista: unknown[] = valor;
  const out: VistaSimbolo[] = [];
  for (const v of lista) {
    if (!VISTAS.includes(v as VistaSimbolo)) {
      diag.push({ codigo: 'tipo', mensagem: `vista desconhecida “${typeof v === 'string' ? v : '?'}”`, onde: campo });
      return undefined;
    }
    out.push(v as VistaSimbolo);
  }
  if (out.length === 0) {
    diag.push({ codigo: 'faixa', mensagem: 'o símbolo precisa aparecer em pelo menos uma vista', onde: campo });
    return undefined;
  }
  return out;
}

function resolverPlano(valor: unknown, onde: string, diag: DiagnosticoSimbolo[]): PlanoSimbolo | undefined {
  const campo = `${onde}.plano`;
  if (valor === undefined) {
    diag.push({ codigo: 'obrigatorio', mensagem: 'plano ausente', onde: campo });
    return undefined;
  }
  if (!PLANOS.includes(valor as PlanoSimbolo)) {
    diag.push({ codigo: 'tipo', mensagem: `plano desconhecido “${typeof valor === 'string' ? valor : '?'}”`, onde: campo });
    return undefined;
  }
  return valor as PlanoSimbolo;
}

function resolverPrimitivos(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): PrimitivoResolvido[] | undefined {
  const campo = `${onde}.primitivos`;
  if (valor === undefined) {
    diag.push({ codigo: 'obrigatorio', mensagem: 'primitivos ausentes', onde: campo });
    return undefined;
  }
  if (!Array.isArray(valor)) {
    diag.push({ codigo: 'tipo', mensagem: 'primitivos precisa ser uma lista', onde: campo });
    return undefined;
  }
  const lista: unknown[] = valor;
  if (lista.length === 0) {
    diag.push({ codigo: 'faixa', mensagem: 'o símbolo precisa de pelo menos um primitivo', onde: campo });
    return undefined;
  }
  const out: PrimitivoResolvido[] = [];
  let ok = true;
  lista.forEach((p, j) => {
    const r = resolverPrimitivo(p, `${campo}[${j}]`, ambiente, diag);
    if (r === undefined) ok = false;
    else out.push(r);
  });
  return ok ? out : undefined;
}

/** Um primitivo: a forma depende do `tipo`; campo faltando ou ruim vira diagnóstico e devolve `undefined`. */
function resolverPrimitivo(p: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): PrimitivoResolvido | undefined {
  if (!ehObjeto(p)) {
    diag.push({ codigo: 'tipo', mensagem: 'o primitivo precisa ser um objeto', onde });
    return undefined;
  }
  switch (p.tipo) {
    case 'linha': {
      const de = pontoDe(p.de, `${onde}.de`, ambiente, diag);
      const ate = pontoDe(p.ate, `${onde}.ate`, ambiente, diag);
      return de === undefined || ate === undefined ? undefined : { tipo: 'linha', de, ate };
    }
    case 'circulo': {
      const centro = pontoDe(p.centro, `${onde}.centro`, ambiente, diag);
      const raio = medidaPositiva(p.raio, `${onde}.raio`, ambiente, diag);
      return centro === undefined || raio === undefined ? undefined : { tipo: 'circulo', centro, raio };
    }
    case 'arco': {
      const centro = pontoDe(p.centro, `${onde}.centro`, ambiente, diag);
      const raio = medidaPositiva(p.raio, `${onde}.raio`, ambiente, diag);
      const inicioRad = anguloRad(p.deGraus, `${onde}.deGraus`, ambiente, diag);
      const fimRad = anguloRad(p.ateGraus, `${onde}.ateGraus`, ambiente, diag);
      if (centro === undefined || raio === undefined || inicioRad === undefined || fimRad === undefined) return undefined;
      return { tipo: 'arco', centro, raio, inicioRad, fimRad };
    }
    case 'polilinha': {
      const pontos = polilinhaDe(p.pontos, `${onde}.pontos`, ambiente, diag);
      if (pontos === undefined) return undefined;
      return { tipo: 'polilinha', pontos, fechada: p.fechada === true };
    }
    case 'texto': {
      const posicao = pontoDe(p.posicao, `${onde}.posicao`, ambiente, diag);
      const conteudo = textoDe(p.texto, `${onde}.texto`, ambiente, diag);
      const altura = medidaPositiva(p.altura, `${onde}.altura`, ambiente, diag);
      if (posicao === undefined || conteudo === undefined || altura === undefined) return undefined;
      return { tipo: 'texto', posicao, texto: conteudo, altura };
    }
    default:
      diag.push({ codigo: 'tipo', mensagem: 'primitivo desconhecido', onde });
      return undefined;
  }
}

/** Ponto 2D em metros (cada coordenada é uma fórmula em mm). */
function pontoDe(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): [number, number] | undefined {
  if (!Array.isArray(valor) || valor.length !== 2) {
    diag.push({ codigo: 'tipo', mensagem: 'ponto precisa de 2 coordenadas', onde });
    return undefined;
  }
  const lista: unknown[] = valor;
  const x = comprimentoEmMetros(lista[0], `${onde}[0]`, ambiente, diag);
  const y = comprimentoEmMetros(lista[1], `${onde}[1]`, ambiente, diag);
  return x === undefined || y === undefined ? undefined : [x, y];
}

function polilinhaDe(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): [number, number][] | undefined {
  if (!Array.isArray(valor)) {
    diag.push({ codigo: 'tipo', mensagem: 'pontos precisa ser uma lista', onde });
    return undefined;
  }
  const lista: unknown[] = valor;
  if (lista.length < 2) {
    diag.push({ codigo: 'faixa', mensagem: 'polilinha precisa de pelo menos 2 pontos', onde });
    return undefined;
  }
  const out: [number, number][] = [];
  for (const [j, item] of lista.entries()) {
    const ponto = pontoDe(item, `${onde}[${j}]`, ambiente, diag);
    if (ponto === undefined) return undefined;
    out.push(ponto);
  }
  return out;
}

/** Medida de comprimento com sinal (coordenada): mm para metros, arredondado a 1 µm. */
function comprimentoEmMetros(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): number | undefined {
  const mm = numeroDe(avaliarBruto(valor, onde, ambiente, diag), onde, diag);
  return mm === undefined ? undefined : arredondarMetros(mm);
}

/** Medida de comprimento positiva (raio, altura). Zero ou negativo é `faixa`. */
function medidaPositiva(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): number | undefined {
  const mm = numeroDe(avaliarBruto(valor, onde, ambiente, diag), onde, diag);
  if (mm === undefined) return undefined;
  if (!(mm > 0)) {
    diag.push({ codigo: 'faixa', mensagem: 'medida precisa ser maior que zero', onde });
    return undefined;
  }
  return arredondarMetros(mm);
}

/** Ângulo em graus (da família) para radianos. */
function anguloRad(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): number | undefined {
  const graus = numeroDe(avaliarBruto(valor, onde, ambiente, diag), onde, diag);
  return graus === undefined ? undefined : (graus * Math.PI) / 180;
}

/** Texto do primitivo `texto`: fórmula de texto vale como está; número sai formatado; outro tipo é diagnóstico. */
function textoDe(valor: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): string | undefined {
  const r = avaliarBruto(valor, onde, ambiente, diag);
  if (r === undefined) return undefined;
  if (typeof r === 'string') return r;
  if (typeof r === 'number' && Number.isFinite(r)) return formatarNumero(r);
  diag.push({ codigo: 'tipo', mensagem: 'texto precisa ser fórmula de texto ou número', onde });
  return undefined;
}

/** Avalia uma fórmula; campo ausente, não-texto ou fórmula que não resolve viram diagnóstico e devolvem `undefined`. */
function avaliarBruto(expr: unknown, onde: string, ambiente: Env, diag: DiagnosticoSimbolo[]): Valor | undefined {
  if (expr === undefined) {
    diag.push({ codigo: 'obrigatorio', mensagem: 'expressão ausente', onde });
    return undefined;
  }
  if (typeof expr !== 'string') {
    diag.push({ codigo: 'tipo', mensagem: 'expressão precisa ser texto', onde });
    return undefined;
  }
  const r = tentar(expr, ambiente);
  if (!r.ok) {
    diag.push({ codigo: 'formula', mensagem: `fórmula não resolve: ${r.erro.message}`, onde });
    return undefined;
  }
  return r.valor;
}

/** Exige número finito; quem chama já recebeu o diagnóstico de `avaliarBruto` quando veio `undefined`. */
function numeroDe(valor: Valor | undefined, onde: string, diag: DiagnosticoSimbolo[]): number | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    diag.push({ codigo: 'tipo', mensagem: 'a fórmula não resolve para um número', onde });
    return undefined;
  }
  return valor;
}

function arredondarMetros(mm: number): number {
  return Math.round(mm * METRO_EM_MM) / ARREDONDAR_M;
}

/** Número para texto: inteiro sai sem casas; fracionário com até três casas, com ponto decimal (sem depender de idioma). */
function formatarNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
