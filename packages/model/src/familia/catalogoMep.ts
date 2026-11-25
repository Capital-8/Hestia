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

/** Quem conferiu uma linha com o documento de origem, e quando (AAAA-MM-DD). */
export interface ConferenciaDeLinha {
  por: string;
  em: string;
}

export interface LinhaCatalogo {
  /** Código do produto no catálogo (texto, pode ter zeros à esquerda). */
  codigo?: string;
  /** Bitola como no catálogo: "100", "50 x 40", "25 x 3/4”". Só bitolas numéricas servem de chave de `busca`. */
  bitola: string;
  /** Uma entrada por coluna do item (mm). */
  valores: Record<string, number>;
  nota?: string;
  /** Conferência desta linha (ficha P3, fase 2). Ausente = ainda não conferida. Editar a linha apaga esta marca. */
  conferida?: ConferenciaDeLinha;
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

/** Linhas que têm TODAS as colunas pedidas (com `padroes`, uma coluna ausente copia outra: `{ d: 'D' }`). */
export function linhasCom(item: ItemCatalogo, colunas: string[], padroes: Record<string, string> = {}): LinhaCatalogo[] {
  return item.linhas
    .map((l) => {
      const valores = { ...l.valores };
      for (const [alvo, de] of Object.entries(padroes)) if (valores[alvo] === undefined && valores[de] !== undefined) valores[alvo] = valores[de];
      return { ...l, valores };
    })
    .filter((l) => colunas.every((c) => ehNumero(l.valores[c])));
}

/**
 * Junta itens do catálogo (ex.: primário + secundário) num só, para uma família ler todas as bitolas. As colunas do resultado são
 * as pedidas; linhas que não tenham todas ficam de fora (nunca se inventa valor). `padroes` copia coluna ausente de outra.
 */
export function juntarItens(id: string, nome: string, itens: ItemCatalogo[], colunas: string[], padroes: Record<string, string> = {}): ItemCatalogo {
  const base = itens[0];
  if (!base) throw new Error('Catálogo: juntarItens sem itens');
  const significado: Record<string, string> = {};
  for (const c of colunas) significado[c] = itens.map((i) => i.colunas[c]).find((x) => x !== undefined) ?? c;
  const linhas = itens.flatMap((i) => linhasCom(i, colunas, padroes).map((l) => ({ ...l, valores: Object.fromEntries(colunas.map((c) => [c, l.valores[c] as number])) })));
  const estado = itens.every((i) => i.estado === 'conferido') ? 'conferido' : 'CONFERIR';
  return { id, nome, tipo: base.tipo, serie: base.serie, colunas: significado, linhas, pagina: base.pagina, estado };
}

/** Como `buscaDaColuna`, mas a chave é o CÓDIGO do produto (para bitolas compostas como "75 x 50"). */
export function buscaPorCodigo(item: ItemCatalogo, coluna: string, chave: string): string | null {
  const pares = item.linhas
    .map((l) => [l.codigo === undefined ? NaN : Number(l.codigo), l.valores[coluna]] as const)
    .filter((p): p is readonly [number, number] => Number.isFinite(p[0]) && ehNumero(p[1]));
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
    if (ehNumero(D) && ehNumero(d) && (d > D * 3 || d < D / 3)) out.push(aviso(o, `D (${D}) e d (${d}) muito diferentes: provável erro de impressão do catálogo`));
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

/** Exige nome e data: sem isso a conferência não tem dono. Devolve o registro já limpo. */
function registroDeConferencia(quem: string, quando: string): ConferenciaDeLinha {
  if (!quem.trim() || !quando.trim()) throw new Error('Catálogo: informe quem conferiu e quando');
  return { por: quem.trim(), em: quando.trim() };
}

function linhaDaBitolaOuErro(item: ItemCatalogo, bitola: string): void {
  if (!item.linhas.some((l) => l.bitola === bitola)) throw new Error(`Catálogo: “${item.id}” não tem a bitola ${bitola}`);
}

/**
 * Fecha o estado do item a partir das linhas: `conferido` (com quem e quando da última conferência) só quando TODAS as linhas
 * estão conferidas; em qualquer outro caso, `CONFERIR`.
 */
function fecharItem(item: ItemCatalogo, linhas: LinhaCatalogo[], ultima?: ConferenciaDeLinha): ItemCatalogo {
  const { conferidoPor: _p, conferidoEm: _e, ...resto } = item;
  const todas = linhas.length > 0 && linhas.every((l) => l.conferida !== undefined);
  if (todas && ultima) return { ...resto, linhas, estado: 'conferido', conferidoPor: ultima.por, conferidoEm: ultima.em };
  return { ...resto, linhas, estado: 'CONFERIR' };
}

/** Marca o item como conferido por inteiro (todas as linhas). Exige nome e data. */
export function conferirItem(item: ItemCatalogo, quem: string, quando: string): ItemCatalogo {
  const registro = registroDeConferencia(quem, quando);
  return { ...item, linhas: item.linhas.map((l) => ({ ...l, conferida: registro })), estado: 'conferido', conferidoPor: registro.por, conferidoEm: registro.em };
}

/**
 * Marca UMA linha como conferida com o documento de origem. Se for a última que faltava, o item vira `conferido` com quem e quando
 * desta conferência. Não altera o item recebido.
 */
export function conferirLinha(item: ItemCatalogo, bitola: string, quem: string, quando: string): ItemCatalogo {
  const registro = registroDeConferencia(quem, quando);
  linhaDaBitolaOuErro(item, bitola);
  const linhas = item.linhas.map((l) => (l.bitola === bitola ? { ...l, conferida: registro } : l));
  return fecharItem(item, linhas, registro);
}

/** Tira a conferência de uma linha; o item volta para `CONFERIR` (ele não está mais inteiro conferido). */
export function desconferirLinha(item: ItemCatalogo, bitola: string): ItemCatalogo {
  linhaDaBitolaOuErro(item, bitola);
  const linhas = item.linhas.map((l) => {
    if (l.bitola !== bitola) return l;
    const { conferida: _c, ...resto } = l;
    return resto;
  });
  return fecharItem(item, linhas);
}

/** Quantas linhas do item estão conferidas. Item já `conferido` conta todas (mesmo que uma linha antiga não traga a marca). */
export function progressoDeConferencia(item: ItemCatalogo): { conferidas: number; total: number } {
  const total = item.linhas.length;
  if (item.estado === 'conferido') return { conferidas: total, total };
  return { conferidas: item.linhas.filter((l) => l.conferida !== undefined).length, total };
}

/**
 * Edição de qualquer número volta o item para `CONFERIR` e apaga a conferência da linha editada: um dado alterado não herda a
 * conferência anterior. As outras linhas mantêm a sua.
 */
export function editarLinha(item: ItemCatalogo, bitola: string, valores: Record<string, number>): ItemCatalogo {
  const existe = item.linhas.some((l) => l.bitola === bitola);
  const linhas = existe
    ? item.linhas.map((l) => {
        if (l.bitola !== bitola) return l;
        const { conferida: _c, ...resto } = l;
        return { ...resto, valores: { ...l.valores, ...valores } };
      })
    : [...item.linhas, { bitola, valores }];
  const { conferidoPor: _p, conferidoEm: _e, ...resto } = item;
  return { ...resto, linhas, estado: 'CONFERIR' };
}

/** Quantos itens do catálogo ainda estão por conferir. */
export function pendentesDeConferencia(c: CatalogoMep): number {
  return c.itens.filter((i) => i.estado !== 'conferido').length;
}
