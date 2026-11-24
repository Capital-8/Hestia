import { idLivre, lista } from './edicaoApoio.ts';
import type { Familia } from './tipos.ts';
import { LIMITES_REPRESENTACAO, type PlanoSimbolo, type Primitivo2D, type Simbolo2D, type VistaSimbolo } from './tiposRepresentacao.ts';
import type { Ponto2 } from './tiposCorpo.ts';
import { validarSimbolos } from './validarSimbolos.ts';

/*
 * Operações de edição dos SÍMBOLOS 2D (ficha D3; semântica em docs/familias-parametricas/CONTRATO.md §4). Mesmo contrato de
 * `edicaoDetalhes.ts`: puras sobre o rascunho, devolvem `null` em sucesso ou o MOTIVO em português; com erro a família fica
 * exatamente como estava. Cada operação monta a lista NOVA, confere com `validarSimbolos` (a família inteira é o contexto) e
 * só então grava. Coordenadas e raios são texto em mm (fórmulas aceitas); `moverPonto` grava números literais arredondados.
 */

const SEM_LISTA = 'a família não tem lista de símbolos';
const TIPOS_PRIMITIVO: readonly Primitivo2D['tipo'][] = ['linha', 'circulo', 'arco', 'polilinha', 'texto'];

/** Primeiro erro que a lista nova traz e a atual não tinha: defeito antigo não bloqueia edição nova. */
function primeiroErro(f: Familia, nova: Simbolo2D[]): string | null {
  const chave = (p: { mensagem: string; onde: string }): string => `${p.onde}|${p.mensagem}`;
  const antes = new Set(validarSimbolos(f).map(chave));
  const erro = validarSimbolos({ ...f, simbolos: nova }).find((p) => p.nivel === 'erro' && !antes.has(chave(p)));
  return erro === undefined ? null : `${erro.mensagem} (${erro.onde})`;
}

function gravar(f: Familia, nova: Simbolo2D[]): string | null {
  const erro = primeiroErro(f, nova);
  if (erro !== null) return erro;
  f.simbolos = nova;
  return null;
}

function localizar(f: Familia, id: string): { indice: number; simbolo: Simbolo2D } | string {
  if (f.simbolos !== undefined && !Array.isArray(f.simbolos)) return SEM_LISTA;
  const indice = lista<Simbolo2D>(f.simbolos).findIndex((s) => s?.id === id);
  const simbolo = lista<Simbolo2D>(f.simbolos)[indice];
  if (indice < 0 || simbolo === undefined) return `símbolo “${id}” não existe`;
  return { indice, simbolo };
}

function idOk(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== '';
}

/** Símbolo novo: planta, plano XY, uma linha de exemplo (o validador exige ao menos um primitivo) e sem substituir a geometria. */
export function criarSimboloPadrao(id: string, nome: string): Simbolo2D {
  return { id, nome, vistas: ['planta'], plano: 'xy', primitivos: [criarPrimitivoPadrao('linha')], substituiGeometria: false };
}

/** Primitivo novo do tipo pedido, com medidas de exemplo em mm (uma linha de 100 mm, um círculo de 50 mm…). */
export function criarPrimitivoPadrao(tipo: Primitivo2D['tipo']): Primitivo2D {
  switch (tipo) {
    case 'linha': return { tipo, de: ['0', '0'], ate: ['100', '0'] };
    case 'circulo': return { tipo, centro: ['0', '0'], raio: '50' };
    case 'arco': return { tipo, centro: ['0', '0'], raio: '50', deGraus: '0', ateGraus: '90' };
    case 'polilinha': return { tipo, pontos: [['0', '0'], ['100', '0'], ['100', '100']] };
    case 'texto': return { tipo, posicao: ['0', '0'], texto: '"Tomada"', altura: '50' };
  }
}

/** Tipos de primitivo aceitos pela interface (ordem do seletor). */
export function tiposDePrimitivo(): readonly Primitivo2D['tipo'][] {
  return TIPOS_PRIMITIVO;
}

/** Acrescenta o símbolo ao fim. Erros: objeto inválido, id vazio/repetido, nome vazio, limite e o que `validarSimbolos` recusa. */
export function adicionarSimbolo(f: Familia, simbolo: Simbolo2D): string | null {
  if (!simbolo || typeof simbolo !== 'object') return 'símbolo inválido';
  if (f.simbolos !== undefined && !Array.isArray(f.simbolos)) return SEM_LISTA;
  if (!idOk(simbolo.id)) return 'o símbolo precisa de um id não vazio';
  const atuais = lista<Simbolo2D>(f.simbolos);
  if (atuais.some((s) => s?.id === simbolo.id)) return `id repetido: “${simbolo.id}”`;
  if (typeof simbolo.nome !== 'string' || simbolo.nome.trim() === '') return 'o símbolo precisa de um nome';
  if (atuais.length >= LIMITES_REPRESENTACAO.simbolos) return `limite de ${LIMITES_REPRESENTACAO.simbolos} símbolos atingido`;
  return gravar(f, [...atuais, simbolo]);
}

/** Troca os campos presentes no patch (`undefined` remove o campo opcional). Id e primitivos não mudam por aqui. */
export function editarSimbolo(f: Familia, id: string, patch: Partial<Omit<Simbolo2D, 'id' | 'primitivos'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'alteração inválida';
  if ('id' in patch || 'primitivos' in patch) return 'o id e os primitivos não mudam por aqui';
  if ('nome' in patch && (typeof patch.nome !== 'string' || patch.nome.trim() === '')) return 'o símbolo precisa de um nome';
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const novo: Simbolo2D = { ...achado.simbolo, ...patch };
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete novo[k];
  const nova = [...lista<Simbolo2D>(f.simbolos)];
  nova[achado.indice] = novo;
  return gravar(f, nova);
}

/** Remove o símbolo. Erro: inexistente. */
export function excluirSimbolo(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  return gravar(f, lista<Simbolo2D>(f.simbolos).filter((_, k) => k !== achado.indice));
}

/** Troca a lista de primitivos do símbolo pela lista nova, validando antes. */
function trocarPrimitivos(f: Familia, simboloId: string, fazer: (lista: Primitivo2D[]) => Primitivo2D[] | string): string | null {
  const achado = localizar(f, simboloId);
  if (typeof achado === 'string') return achado;
  const novos = fazer([...lista<Primitivo2D>(achado.simbolo.primitivos)]);
  if (typeof novos === 'string') return novos;
  const nova = [...lista<Simbolo2D>(f.simbolos)];
  nova[achado.indice] = { ...achado.simbolo, primitivos: novos };
  return gravar(f, nova);
}

/** Acrescenta o primitivo ao símbolo. Erros: limite de primitivos (por símbolo e na família) e o que o validador recusa. */
export function adicionarPrimitivo(f: Familia, simboloId: string, primitivo: Primitivo2D): string | null {
  if (!primitivo || typeof primitivo !== 'object' || !TIPOS_PRIMITIVO.includes(primitivo.tipo)) return 'primitivo inválido';
  const total = lista<Simbolo2D>(f.simbolos).reduce((soma, s) => soma + lista<Primitivo2D>(s?.primitivos).length, 0);
  if (total >= LIMITES_REPRESENTACAO.primitivos) return `limite de ${LIMITES_REPRESENTACAO.primitivos} primitivos de símbolo atingido`;
  return trocarPrimitivos(f, simboloId, (atuais) => [...atuais, primitivo]);
}

/** Troca o primitivo de posição `indice` pelo novo (o tipo pode mudar). */
export function substituirPrimitivo(f: Familia, simboloId: string, indice: number, primitivo: Primitivo2D): string | null {
  if (!primitivo || typeof primitivo !== 'object' || !TIPOS_PRIMITIVO.includes(primitivo.tipo)) return 'primitivo inválido';
  return trocarPrimitivos(f, simboloId, (atuais) => {
    if (!Number.isInteger(indice) || indice < 0 || indice >= atuais.length) return `primitivo ${indice} não existe`;
    atuais[indice] = primitivo;
    return atuais;
  });
}

/** Remove o primitivo de posição `indice`. */
export function excluirPrimitivo(f: Familia, simboloId: string, indice: number): string | null {
  return trocarPrimitivos(f, simboloId, (atuais) => {
    if (!Number.isInteger(indice) || indice < 0 || indice >= atuais.length) return `primitivo ${indice} não existe`;
    return atuais.filter((_, k) => k !== indice);
  });
}

/**
 * Pontos de controle de um primitivo, como referências para o texto dentro dele: a alça da ferramenta de arrasto. Linha: início
 * e fim; círculo e arco: centro; polilinha: cada vértice; texto: posição.
 */
export function pontosDoPrimitivo(p: Primitivo2D): Ponto2[] {
  switch (p.tipo) {
    case 'linha': return [p.de, p.ate];
    case 'circulo':
    case 'arco': return [p.centro];
    case 'polilinha': return p.pontos;
    case 'texto': return [p.posicao];
  }
}

/** Número em mm com até 3 casas, como texto literal (sem notação científica). */
export function milimetros(valor: number): string {
  const r = Math.round(valor * 1000) / 1000;
  return Number.isFinite(r) ? String(r) : '0';
}

/**
 * Arrasta um ponto de controle para (x, y) em mm: grava os dois campos como números literais. `k` indexa `pontosDoPrimitivo`.
 * Erros: primitivo ou ponto inexistente, coordenada não finita.
 */
export function moverPonto(f: Familia, simboloId: string, indice: number, k: number, x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'coordenada inválida';
  return trocarPrimitivos(f, simboloId, (atuais) => {
    const original = atuais[indice];
    if (original === undefined) return `primitivo ${indice} não existe`;
    // Cópia profunda: os pontos são referências dentro do primitivo, e o original não pode mudar se a gravação for recusada.
    const copia = JSON.parse(JSON.stringify(original)) as Primitivo2D;
    const ponto: Ponto2 | undefined = pontosDoPrimitivo(copia)[k];
    if (ponto === undefined) return `ponto ${k} não existe`;
    ponto[0] = milimetros(x);
    ponto[1] = milimetros(y);
    atuais[indice] = copia;
    return atuais;
  });
}

/** Id livre para um símbolo novo: `base`, `base_2`… entre os símbolos da família. */
export function idNovoSimbolo(f: Familia, base = 'simbolo'): string {
  return idLivre(base, lista<Simbolo2D>(f.simbolos).map((s) => s?.id ?? ''));
}

/** Vistas e planos aceitos pela interface (para os seletores). */
export const VISTAS_SIMBOLO: readonly VistaSimbolo[] = ['planta', 'corte', 'elevacao'];
export const PLANOS_SIMBOLO: readonly PlanoSimbolo[] = ['xy', 'xz', 'yz'];
