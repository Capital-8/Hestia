import type { ItemCatalogo, LinhaCatalogo } from './catalogoMep.ts';

/*
 * CSV do catálogo MEP (ficha P3): é como a pessoa leva uma tabela do PDF ou da planilha para o editor e de volta. Separador `;`
 * ou tab (o que vier na primeira linha), decimal com ponto ou vírgula. Primeira linha = cabeçalho: `bitola`, opcionalmente
 * `codigo`, e uma coluna por medida (B, C, D, d, e...). Funções puras; nunca lança por linha ruim: devolve os problemas.
 */

export interface ResultadoCsv {
  linhas: LinhaCatalogo[];
  colunas: string[];
  problemas: string[];
}

function separador(cabecalho: string): string {
  return cabecalho.includes('\t') ? '\t' : ';';
}

function numero(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Lê o CSV. Linhas em branco são ignoradas; célula não numérica vira problema e a linha segue sem aquele valor. */
export function lerCsvCatalogo(csv: string): ResultadoCsv {
  const problemas: string[] = [];
  const linhasTexto = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhasTexto.length < 2) return { linhas: [], colunas: [], problemas: ['O CSV precisa de cabeçalho e ao menos uma linha'] };
  const sep = separador(linhasTexto[0] ?? '');
  const cab = (linhasTexto[0] ?? '').split(sep).map((c) => c.trim());
  const iBitola = cab.findIndex((c) => c.toLowerCase() === 'bitola');
  const iCodigo = cab.findIndex((c) => c.toLowerCase() === 'codigo' || c.toLowerCase() === 'código');
  if (iBitola < 0) return { linhas: [], colunas: [], problemas: ['Falta a coluna “bitola” no cabeçalho'] };
  const colunas = cab.filter((_, i) => i !== iBitola && i !== iCodigo && cab[i] !== '');
  const linhas: LinhaCatalogo[] = [];
  linhasTexto.slice(1).forEach((texto, n) => {
    const cel = texto.split(sep);
    const bitola = (cel[iBitola] ?? '').trim();
    if (!bitola) {
      problemas.push(`Linha ${n + 2}: bitola vazia`);
      return;
    }
    const valores: Record<string, number> = {};
    cab.forEach((c, i) => {
      if (i === iBitola || i === iCodigo || c === '') return;
      const t = (cel[i] ?? '').trim();
      if (t === '') return;
      const v = numero(t);
      if (v === null) problemas.push(`Linha ${n + 2}, coluna ${c}: “${t}” não é número`);
      else valores[c] = v;
    });
    const codigo = iCodigo >= 0 ? (cel[iCodigo] ?? '').trim() : '';
    linhas.push({ ...(codigo ? { codigo } : {}), bitola, valores });
  });
  return { linhas, colunas, problemas };
}

/** Escreve o item em CSV (separador `;`, decimal com ponto) para abrir em planilha. */
export function csvDoItem(item: ItemCatalogo): string {
  const letras = Object.keys(item.colunas);
  const cab = ['bitola', 'codigo', ...letras].join(';');
  const corpo = item.linhas.map((l) => [l.bitola, l.codigo ?? '', ...letras.map((k) => (l.valores[k] === undefined ? '' : String(l.valores[k])))].join(';'));
  return [cab, ...corpo].join('\n');
}

/**
 * Cria um item novo a partir de um CSV, sempre `CONFERIR`. `colunas` dá o significado de cada letra; letras sem significado
 * recebem o próprio nome (a pessoa completa depois no editor).
 */
export function itemDeCsv(csv: string, meta: { id: string; nome: string; tipo: string; serie: string; colunas?: Record<string, string> }): { item: ItemCatalogo | null; problemas: string[] } {
  const r = lerCsvCatalogo(csv);
  if (r.linhas.length === 0) return { item: null, problemas: r.problemas };
  const colunas: Record<string, string> = {};
  for (const c of r.colunas) colunas[c] = meta.colunas?.[c] ?? c;
  return { item: { id: meta.id, nome: meta.nome, tipo: meta.tipo, serie: meta.serie, colunas, linhas: r.linhas, estado: 'CONFERIR' }, problemas: r.problemas };
}
