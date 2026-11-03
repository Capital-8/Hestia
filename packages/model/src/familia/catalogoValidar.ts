import type { ProblemaCatalogo } from './catalogo.ts';
import { corValida, custoValido, ehObjetoSimples, idValido, numeroFinito, texto, textoNaoVazio } from './catalogoComum.ts';

/*
 * Regra de `validarCatalogo` (ficha E5-catalogo): toda a conferência do catálogo, sem nunca lançar. A lista de problemas
 * acumula em vez de parar no primeiro, para o editor mostrar tudo de uma vez.
 */

export interface LimitesCatalogo {
  readonly chapas: number;
  readonly fitas: number;
  readonly ferragens: number;
}

const UNIDADES_FERRAGEM = new Set(['un', 'par', 'jogo', 'm']);

function ondeDe(tipo: string, id: unknown, campo?: string): string {
  const base = `${tipo}:${texto(id)}`;
  return campo === undefined ? base : `${base}.${campo}`;
}

function problema(codigo: ProblemaCatalogo['codigo'], mensagem: string, onde: string): ProblemaCatalogo {
  return { codigo, mensagem, onde };
}

function validarId(bruto: Record<string, unknown>, tipo: string, vistos: Set<string>, problemas: ProblemaCatalogo[]): string | null {
  const id = bruto['id'];
  if (!idValido(id)) {
    problemas.push(problema('id_invalido', 'id inválido (use letras, dígitos ou _, começando por letra ou _)', ondeDe(tipo, id)));
    return null;
  }
  if (vistos.has(id)) {
    problemas.push(problema('id_duplicado', `id repetido: ${id}`, ondeDe(tipo, id)));
    return null;
  }
  vistos.add(id);
  return id;
}

function validarNome(bruto: Record<string, unknown>, tipo: string, id: string, problemas: ProblemaCatalogo[]): void {
  if (!textoNaoVazio(bruto['nome'])) problemas.push(problema('valor', 'nome vazio', ondeDe(tipo, id, 'nome')));
}

function validarChapa(bruto: Record<string, unknown>, id: string, problemas: ProblemaCatalogo[]): void {
  validarNome(bruto, 'chapa', id, problemas);

  const espessura = bruto['espessura'];
  if (!numeroFinito(espessura) || espessura <= 0) problemas.push(problema('valor', 'espessura inválida', ondeDe('chapa', id, 'espessura')));

  const largura = bruto['largura'];
  if (!numeroFinito(largura) || largura <= 0) problemas.push(problema('valor', 'largura inválida', ondeDe('chapa', id, 'largura')));

  const altura = bruto['altura'];
  if (!numeroFinito(altura) || altura <= 0) problemas.push(problema('valor', 'altura inválida', ondeDe('chapa', id, 'altura')));

  const refilo = bruto['refilo'];
  if (!numeroFinito(refilo) || refilo < 0) {
    problemas.push(problema('valor', 'refilo inválido', ondeDe('chapa', id, 'refilo')));
  } else if (numeroFinito(largura) && largura > 0 && numeroFinito(altura) && altura > 0 && refilo > Math.min(largura, altura) / 2) {
    problemas.push(problema('valor', 'refilo maior que a metade da menor dimensão da chapa', ondeDe('chapa', id, 'refilo')));
  }

  if (!custoValido(bruto['custoM2'])) problemas.push(problema('valor', 'custo por m² inválido', ondeDe('chapa', id, 'custoM2')));

  const cor = bruto['cor'];
  if (cor !== undefined && !corValida(cor)) problemas.push(problema('cor', 'cor inválida (use "#rrggbb")', ondeDe('chapa', id)));
}

function validarFita(bruto: Record<string, unknown>, id: string, problemas: ProblemaCatalogo[]): void {
  validarNome(bruto, 'fita', id, problemas);

  const espessura = bruto['espessura'];
  if (!numeroFinito(espessura) || espessura <= 0) problemas.push(problema('valor', 'espessura inválida', ondeDe('fita', id, 'espessura')));

  const altura = bruto['altura'];
  if (!numeroFinito(altura) || altura <= 0) problemas.push(problema('valor', 'altura inválida', ondeDe('fita', id, 'altura')));

  if (!custoValido(bruto['custoM'])) problemas.push(problema('valor', 'custo por metro inválido', ondeDe('fita', id, 'custoM')));

  const cor = bruto['cor'];
  if (cor !== undefined && !corValida(cor)) problemas.push(problema('cor', 'cor inválida (use "#rrggbb")', ondeDe('fita', id)));
}

function validarFerragem(bruto: Record<string, unknown>, id: string, problemas: ProblemaCatalogo[]): void {
  validarNome(bruto, 'ferragem', id, problemas);

  if (typeof bruto['unidade'] !== 'string' || !UNIDADES_FERRAGEM.has(bruto['unidade'])) {
    problemas.push(problema('valor', 'unidade fora de un, par, jogo ou m', ondeDe('ferragem', id, 'unidade')));
  }

  if (!custoValido(bruto['custo'])) problemas.push(problema('valor', 'custo inválido', ondeDe('ferragem', id, 'custo')));
}

type TipoItem = 'chapa' | 'fita' | 'ferragem';

function plural(tipo: TipoItem): string {
  return tipo === 'ferragem' ? 'ferragens' : `${tipo}s`;
}

function validarLista(bruta: unknown, tipo: TipoItem, limite: number, problemas: ProblemaCatalogo[]): void {
  if (!Array.isArray(bruta)) {
    problemas.push(problema('valor', `lista de ${plural(tipo)} ausente ou inválida`, `catalogo.${plural(tipo)}`));
    return;
  }
  if (bruta.length > limite) {
    problemas.push(problema('limite', `mais de ${limite} ${plural(tipo)}`, 'catalogo'));
  }

  const vistos = new Set<string>();
  for (const item of bruta) {
    const bruto = ehObjetoSimples(item) ? item : {};
    const id = validarId(bruto, tipo, vistos, problemas);
    if (id === null) continue;
    if (tipo === 'chapa') validarChapa(bruto, id, problemas);
    else if (tipo === 'fita') validarFita(bruto, id, problemas);
    else validarFerragem(bruto, id, problemas);
  }
}

/** Confere o catálogo inteiro (mesma regra de `validarCatalogo`, mas aceitando entrada hostil). Nunca lança. */
export function validarCatalogoInterno(c: unknown, limites: LimitesCatalogo): ProblemaCatalogo[] {
  const problemas: ProblemaCatalogo[] = [];
  if (!ehObjetoSimples(c)) {
    problemas.push(problema('valor', 'o catálogo não é um objeto', 'catalogo'));
    return problemas;
  }
  validarLista(c['chapas'], 'chapa', limites.chapas, problemas);
  validarLista(c['fitas'], 'fita', limites.fitas, problemas);
  validarLista(c['ferragens'], 'ferragem', limites.ferragens, problemas);
  return problemas;
}

/** Primeiro problema do item, para relatar por que ele foi ignorado na importação. */
export function motivoDoItem(item: unknown, tipo: TipoItem, limites: LimitesCatalogo): string | null {
  const lista =
    tipo === 'chapa'
      ? { chapas: [item], fitas: [], ferragens: [] }
      : tipo === 'fita'
        ? { chapas: [], fitas: [item], ferragens: [] }
        : { chapas: [], fitas: [], ferragens: [item] };
  const primeiro = validarCatalogoInterno(lista, limites)[0];
  return primeiro === undefined ? null : `${primeiro.mensagem} (${primeiro.onde})`;
}
