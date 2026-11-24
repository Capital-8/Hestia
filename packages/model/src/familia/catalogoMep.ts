/*
 * Catálogo de tubos e conexões (MEP): dimensões de fabricante como DADO editável, fora do código das famílias (ADR 0061, fase 2,
 * ficha P3). Medidas em MILÍMETROS. Funções puras. Cada item é uma tabela do catálogo (uma linha por bitola) com as colunas
 * nomeadas como no desenho do fabricante (B, C, D, d, e, Z...), mais o significado de cada coluna.
 *
 * FIDELIDADE: todo dado transcrito nasce `CONFERIR`. Só vira `conferido` quando uma pessoa compara com o documento de origem e
 * registra quem e quando (`conferirItem`). Nenhuma família construída daqui afirma conformidade com norma.
 */

export const CATALOGO_MEP_FORMATO = 'hestia-catalogo-mep';
export const CATALOGO_MEP_VERSAO = 1;
export const CATALOGO_MEP_LIMITES = { itens: 400, linhas: 64, colunas: 16 } as const;

export type EstadoConferencia = 'CONFERIR' | 'conferido';

export interface FonteCatalogo {
  fabricante: string;
  documento: string;
  /** Edição ou data do documento, como impressa nele. */
  edicao?: string;
  url?: string;
  /** SHA-256 do PDF baixado (para saber se a fonte mudou). */
  sha256?: string;
}

export interface LinhaCatalogo {
  /** Código do produto no catálogo (texto, pode ter zeros à esquerda). */
  codigo?: string;
  /** Bitola como no catálogo: "100", "50 x 40", "25 x 3/4”". Só bitolas numéricas servem de chave de `busca`. */
  bitola: string;
  /** Uma entrada por coluna do item (mm). */
  valores: Record<string, number>;
  nota?: string;
}

export interface ItemCatalogo {
  id: string;
  nome: string;
  /** Tipo de peça: ajuda a escolher a geometria ('tubo', 'joelho90', 'joelho45', 'luva', 'te', 'juncao45', 'reducao', 'cap'...). */
  tipo: string;
  /** Série ou linha dentro do fabricante ("Esgoto série normal", "Série reforçada", "Soldável"). */
  serie: string;
  /** Significado de cada coluna, como no desenho (ex.: `B: "profundidade da bolsa"`). */
  colunas: Record<string, string>;
  linhas: LinhaCatalogo[];
  /** Página do documento de origem. */
  pagina?: number;
  estado: EstadoConferencia;
  conferidoPor?: string;
  conferidoEm?: string;
}

export interface CatalogoMep {
  formato: typeof CATALOGO_MEP_FORMATO;
  versao: number;
  id: string;
  nome: string;
  dominio: string;
  fonte: FonteCatalogo;
  itens: ItemCatalogo[];
}

export interface ProblemaCatalogoMep {
  nivel: 'erro' | 'aviso';
  mensagem: string;
  onde: string;
}

const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const erro = (onde: string, mensagem: string): ProblemaCatalogoMep => ({ nivel: 'erro', mensagem, onde });
const aviso = (onde: string, mensagem: string): ProblemaCatalogoMep => ({ nivel: 'aviso', mensagem, onde });

/** Bitola numérica ("100") vira número; "50 x 40" e afins vira `null`. */
export function bitolaNumerica(bitola: string): number | null {
  return /^\d+(?:[.,]\d+)?$/.test(bitola.trim()) ? Number(bitola.trim().replace(',', '.')) : null;
}

/** Linha da bitola numérica pedida, se existir. */
export function linhaDaBitola(item: ItemCatalogo, bitola: number): LinhaCatalogo | undefined {
  return item.linhas.find((l) => bitolaNumerica(l.bitola) === bitola);
}

/** Bitolas numéricas do item, em ordem crescente. */
export function bitolasDoItem(item: ItemCatalogo): number[] {
  return item.linhas.map((l) => bitolaNumerica(l.bitola)).filter((b): b is number => b !== null).sort((a, b) => a - b);
}

/**
 * Expressão de família `busca(chave, b1, v1, b2, v2, ...)` com uma coluna do item por bitola numérica. O catálogo vira fórmula,
 * então a família lê o dado em vez de repeti-lo no código. `null` se a coluna não existe em nenhuma linha.
 */
export function buscaDaColuna(item: ItemCatalogo, coluna: string, chave: string): string | null {
  const pares = item.linhas
    .map((l) => [bitolaNumerica(l.bitola), l.valores[coluna]] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && ehNumero(p[1]));
  if (pares.length === 0) return null;
  return `busca(${chave}, ${pares.map(([b, v]) => `${b}, ${v}`).join(', ')})`;
}

/** Valor de uma coluna para uma bitola, ou erro claro (não devolve zero por omissão). */
export function valorDoItem(item: ItemCatalogo, bitola: number, coluna: string): number {
  const v = linhaDaBitola(item, bitola)?.valores[coluna];
  if (!ehNumero(v)) throw new Error(`Catálogo: “${item.id}” não tem a coluna ${coluna} para a bitola ${bitola}`);
  return v;
}

/** Valida a forma do item e a consistência dos números. Erros impedem o uso; avisos pedem conferência. */
export function validarItemCatalogo(item: ItemCatalogo): ProblemaCatalogoMep[] {
  const out: ProblemaCatalogoMep[] = [];
  const onde = `item ${item.id}`;
  if (!item.id || !item.nome) out.push(erro(onde, 'id e nome são obrigatórios'));
  const letras = Object.keys(item.colunas);
  if (letras.length === 0 || letras.length > CATALOGO_MEP_LIMITES.colunas) out.push(erro(onde, 'número de colunas fora do limite'));
  if (item.linhas.length === 0 || item.linhas.length > CATALOGO_MEP_LIMITES.linhas) out.push(erro(onde, 'número de linhas fora do limite'));
  if (item.estado === 'conferido' && (!item.conferidoPor || !item.conferidoEm)) out.push(erro(onde, 'item conferido precisa de quem conferiu e quando'));
  const vistas = new Set<string>();
  for (const l of item.linhas) {
    const o = `${onde}, bitola ${l.bitola}`;
    if (vistas.has(l.bitola)) out.push(erro(o, 'bitola repetida'));
    vistas.add(l.bitola);
    for (const [k, v] of Object.entries(l.valores)) {
      if (!letras.includes(k)) out.push(erro(o, `coluna ${k} não está declarada no item`));
      else if (!ehNumero(v) || v < 0) out.push(erro(o, `valor inválido em ${k}`));
    }
    for (const k of letras) if (l.valores[k] === undefined) out.push(aviso(o, `falta a coluna ${k}`));
  }
  return out.concat(consistenciaGeometrica(item));
}

/** Regras físicas simples que pegam erro de digitação (não pegam valor errado porém plausível). */
function consistenciaGeometrica(item: ItemCatalogo): ProblemaCatalogoMep[] {
  const out: ProblemaCatalogoMep[] = [];
  for (const l of item.linhas) {
    const o = `item ${item.id}, bitola ${l.bitola}`;
    const { B, C, D, d, e, Z } = l.valores;
    if (ehNumero(D) && ehNumero(d) && Math.abs(D - d) > 0.5) out.push(aviso(o, `D (${D}) difere de d (${d}) em mais de 0,5 mm: conferir qual é o diâmetro da bolsa e qual o da ponta`));
    if (ehNumero(e) && ehNumero(d) && e >= d / 2) out.push(erro(o, `espessura e (${e}) não cabe no diâmetro d (${d})`));
    if (ehNumero(B) && ehNumero(C) && B > C) out.push(erro(o, `profundidade da bolsa B (${B}) maior que o comprimento C (${C})`));
    if (item.tipo.startsWith('joelho') && ehNumero(B) && ehNumero(Z) && ehNumero(C) && Math.abs(B + Z - C) > 1) {
      out.push(aviso(o, `B + Z (${B + Z}) difere de C (${C}) em mais de 1 mm: conferir a tabela`));
    }
  }
  return out;
}

export function validarCatalogoMep(c: CatalogoMep): ProblemaCatalogoMep[] {
  const out: ProblemaCatalogoMep[] = [];
  if (c.formato !== CATALOGO_MEP_FORMATO) out.push(erro('catálogo', `formato desconhecido: ${String(c.formato)}`));
  if (c.versao > CATALOGO_MEP_VERSAO) out.push(erro('catálogo', `versão ${c.versao} é mais nova que a suportada`));
  if (!c.fonte.fabricante || !c.fonte.documento) out.push(erro('catálogo', 'a fonte precisa de fabricante e documento'));
  if (c.itens.length > CATALOGO_MEP_LIMITES.itens) out.push(erro('catálogo', 'itens demais'));
  const ids = new Set<string>();
  for (const it of c.itens) {
    if (ids.has(it.id)) out.push(erro(`item ${it.id}`, 'id repetido'));
    ids.add(it.id);
    out.push(...validarItemCatalogo(it));
  }
  return out;
}

/** Marca o item como conferido. Exige nome e data: sem isso a conferência não tem dono. */
export function conferirItem(item: ItemCatalogo, quem: string, quando: string): ItemCatalogo {
  if (!quem.trim() || !quando.trim()) throw new Error('Catálogo: informe quem conferiu e quando');
  return { ...item, estado: 'conferido', conferidoPor: quem.trim(), conferidoEm: quando.trim() };
}

/** Edição de qualquer número volta o item para `CONFERIR`: um dado alterado não herda a conferência anterior. */
export function editarLinha(item: ItemCatalogo, bitola: string, valores: Record<string, number>): ItemCatalogo {
  const existe = item.linhas.some((l) => l.bitola === bitola);
  const linhas = existe ? item.linhas.map((l) => (l.bitola === bitola ? { ...l, valores: { ...l.valores, ...valores } } : l)) : [...item.linhas, { bitola, valores }];
  const { conferidoPor: _p, conferidoEm: _e, ...resto } = item;
  return { ...resto, linhas, estado: 'CONFERIR' };
}

/** Quantos itens do catálogo ainda estão por conferir. */
export function pendentesDeConferencia(c: CatalogoMep): number {
  return c.itens.filter((i) => i.estado !== 'conferido').length;
}
