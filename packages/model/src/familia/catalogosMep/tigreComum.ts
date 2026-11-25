import { CATALOGO_MEP_FORMATO, CATALOGO_MEP_VERSAO, type CatalogoMep, type FonteCatalogo, type ItemCatalogo, type LinhaCatalogo } from '../catalogoMep.ts';

/*
 * Montagem comum dos catálogos Tigre (fase 3, ficha D5). Cada tabela impressa vira um item: uma lista de cotas por letra,
 * na mesma ordem das bitolas da tabela. Assim a transcrição fica igual à página do PDF, coluna por coluna.
 * Todo item nasce CONFERIR: ninguém comparou com o PDF ainda.
 */

export const TIGRE_FABRICANTE = 'Tigre';

export type Cotas = Readonly<Record<string, readonly number[]>>;

export interface TabelaTigre {
  id: string;
  nome: string;
  tipo: string;
  serie: string;
  /** Página do PDF onde está a tabela (contagem pelo separador de página do pdftotext; conferir). */
  pagina: number;
  /** Significado de cada letra, como no desenho ou nosso (marcado CONFERIR). */
  colunas: Readonly<Record<string, string>>;
  /** Bitolas como impressas, uma por coluna da tabela. Texto: vira chave de busca só se for número puro. */
  bitolas: readonly string[];
  /** Cotas impressas (mm), uma lista por letra. Cada lista tem uma entrada por bitola. */
  cotas: Cotas;
  /** Anomalia ou ressalva por bitola; vai para a linha do item. */
  notas?: Readonly<Record<string, string>>;
}

/** Monta um item a partir da tabela impressa. Falha cedo se alguma lista não bate com as bitolas (erro de transcrição). */
export function tabelaTigre(t: TabelaTigre): ItemCatalogo {
  for (const [letra, serie] of Object.entries(t.cotas)) {
    if (!(letra in t.colunas)) throw new Error(`tigre: ${t.id} tem a coluna ${letra} sem significado`);
    if (serie.length !== t.bitolas.length) throw new Error(`tigre: ${t.id} coluna ${letra} tem ${serie.length} cotas para ${t.bitolas.length} bitolas`);
  }
  const linhas: LinhaCatalogo[] = t.bitolas.map((bitola, i) => {
    const valores: Record<string, number> = {};
    for (const [letra, serie] of Object.entries(t.cotas)) valores[letra] = serie[i] as number;
    const nota = t.notas?.[bitola];
    return nota ? { bitola, valores, nota } : { bitola, valores };
  });
  return { id: t.id, nome: t.nome, tipo: t.tipo, serie: t.serie, colunas: { ...t.colunas }, pagina: t.pagina, estado: 'CONFERIR', linhas };
}

export function catalogoTigre(c: { id: string; nome: string; dominio: string; fonte: FonteCatalogo; itens: ItemCatalogo[] }): CatalogoMep {
  return { formato: CATALOGO_MEP_FORMATO, versao: CATALOGO_MEP_VERSAO, ...c };
}
