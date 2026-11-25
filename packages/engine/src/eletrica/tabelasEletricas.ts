import type { TipoCircuito } from '@hestia/model';

/*
 * TABELAS do dimensionamento elétrico (ficha C5). Tudo aqui é DADO EDITÁVEL, não código de norma: cada número abaixo é um valor
 * PROVISÓRIO plausível, NÃO é norma verificada. O projetista deve conferir CADA valor contra a norma vigente e o catálogo do
 * fabricante do condutor, editar a tabela e só então marcá-la como `conferido`. Nenhuma função do pacote afirma conformidade com a
 * NBR 5410 nem com qualquer outra norma; elas só aplicam estas tabelas e devolvem a tabela usada para auditoria.
 */

export type EstadoTabelas = 'CONFERIR' | 'conferido';

/** Método de instalação único desta fase: condutores de cobre isolados em eletroduto embutido (provisório). */
export type MetodoInstalacao = 'eletroduto_embutido';

export interface TabelasEletricas {
  estado: EstadoTabelas;
  conferidoPor?: string;
  conferidoEm?: string;
  /** Aviso fixo de procedência: quem lê a tabela sabe que ela não é norma verificada. */
  fonte: string;
  metodoInstalacao: MetodoInstalacao;
  /** Resistividade do cobre (ohm·mm²/m) usada na queda de tensão. */
  resistividadeCobre: number;
  /** Fator de potência assumido quando o circuito não declara o seu. */
  fatorPotenciaPadrao: number;
  /** Seções comerciais de condutor (mm²), em ordem crescente. */
  secoes: number[];
  /** Capacidade de condução de corrente (A) por seção, para o método de instalação acima; chave = seção em texto (`'2.5'`). */
  capacidadeA: Record<string, number>;
  /** Correntes (A) dos disjuntores padronizados, em ordem crescente. */
  disjuntoresA: number[];
  /** Queda de tensão máxima (%) do circuito terminal. */
  quedaMaximaPct: number;
  /** Seção mínima (mm²) por tipo de circuito. */
  secaoMinimaMm2: Record<TipoCircuito, number>;
  /** Fator de demanda (0 a 1) por tipo de circuito, aplicado à potência do circuito. */
  fatorDemanda: Record<TipoCircuito, number>;
}

export const AVISO_TABELAS = 'CONFERIR contra a norma/tabela vigente e o catálogo do fabricante do condutor; valor provisório, não é norma verificada.';

/** Chave da seção na tabela de capacidades. */
export const chaveSecao = (s: number): string => String(s);

/** Tabelas PROVISÓRIAS (todas CONFERIR). Valores plausíveis para dar um ponto de partida: nenhum é norma verificada. */
export const TABELAS_PROVISORIAS: TabelasEletricas = {
  estado: 'CONFERIR',
  fonte: AVISO_TABELAS,
  metodoInstalacao: 'eletroduto_embutido',
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada: cobre a ~70 °C.
  resistividadeCobre: 0.0225,
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada.
  fatorPotenciaPadrao: 1,
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada: série comercial usual.
  secoes: [1.5, 2.5, 4, 6, 10, 16, 25, 35],
  // CONFERIR contra a norma/tabela vigente e o catálogo do fabricante; valor provisório, não é norma verificada.
  capacidadeA: { '1.5': 17.5, '2.5': 24, '4': 32, '6': 41, '10': 57, '16': 76, '25': 101, '35': 125 },
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada.
  disjuntoresA: [6, 10, 16, 20, 25, 32, 40, 50, 63],
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada.
  quedaMaximaPct: 4,
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada.
  secaoMinimaMm2: { iluminacao: 1.5, tomadas_uso_geral: 2.5, tomadas_uso_especifico: 2.5 },
  // CONFERIR contra a norma/tabela vigente; valor provisório, não é norma verificada: 1 = sem redução (lado seguro).
  fatorDemanda: { iluminacao: 1, tomadas_uso_geral: 1, tomadas_uso_especifico: 1 },
};

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const lista = (v: unknown): number[] | undefined => (Array.isArray(v) && v.every((x) => finito(x) && x > 0) ? [...(v as number[])].sort((a, b) => a - b) : undefined);
const mapa = (v: unknown, atual: Record<string, number>): Record<string, number> => {
  if (typeof v !== 'object' || v === null) return atual;
  const out = { ...atual };
  for (const [k, x] of Object.entries(v)) if (finito(x) && x > 0) out[k] = x;
  return out;
};

/**
 * Mescla `parcial` sobre `base` e devolve tabelas novas (não altera as entradas). Valor inválido (não finito, não positivo, lista
 * com número ruim) é IGNORADO e o da base fica. Editar qualquer número volta o estado para `CONFERIR`: só `estado: 'conferido'`
 * explícito (com `conferidoPor`) mantém a conferência.
 */
export function mesclarTabelas(base: TabelasEletricas, parcial: unknown): TabelasEletricas {
  const p = (typeof parcial === 'object' && parcial !== null ? parcial : {}) as Record<string, unknown>;
  const secoes = lista(p.secoes) ?? base.secoes;
  const por = <T extends string>(chaves: readonly T[], v: unknown, atual: Record<T, number>, max?: number): Record<T, number> => {
    const m = mapa(v, atual);
    return Object.fromEntries(chaves.map((k) => [k, max !== undefined && (m[k] ?? 0) > max ? atual[k] : (m[k] ?? atual[k])])) as Record<T, number>;
  };
  const tipos = Object.keys(base.secaoMinimaMm2) as TipoCircuito[];
  const novo: TabelasEletricas = {
    ...base,
    secoes,
    capacidadeA: mapa(p.capacidadeA, base.capacidadeA),
    disjuntoresA: lista(p.disjuntoresA) ?? base.disjuntoresA,
    resistividadeCobre: finito(p.resistividadeCobre) && p.resistividadeCobre > 0 ? p.resistividadeCobre : base.resistividadeCobre,
    fatorPotenciaPadrao: finito(p.fatorPotenciaPadrao) && p.fatorPotenciaPadrao > 0 && p.fatorPotenciaPadrao <= 1 ? p.fatorPotenciaPadrao : base.fatorPotenciaPadrao,
    quedaMaximaPct: finito(p.quedaMaximaPct) && p.quedaMaximaPct > 0 && p.quedaMaximaPct <= 100 ? p.quedaMaximaPct : base.quedaMaximaPct,
    secaoMinimaMm2: por(tipos, p.secaoMinimaMm2, base.secaoMinimaMm2),
    fatorDemanda: por(tipos, p.fatorDemanda, base.fatorDemanda, 1),
    estado: 'CONFERIR',
  };
  delete novo.conferidoPor;
  delete novo.conferidoEm;
  if (p.estado === 'conferido' && typeof p.conferidoPor === 'string' && p.conferidoPor.trim() && !mudou(base, novo)) {
    return { ...novo, estado: 'conferido', conferidoPor: p.conferidoPor.trim(), ...(typeof p.conferidoEm === 'string' ? { conferidoEm: p.conferidoEm } : {}) };
  }
  return novo;
}

const numeros = (t: TabelasEletricas): string => JSON.stringify([t.secoes, t.capacidadeA, t.disjuntoresA, t.resistividadeCobre, t.fatorPotenciaPadrao, t.quedaMaximaPct, t.secaoMinimaMm2, t.fatorDemanda]);
const mudou = (a: TabelasEletricas, b: TabelasEletricas): boolean => numeros(a) !== numeros(b);

/** Marca as tabelas como conferidas por `quem` em `quando` (texto livre). Sem nome, não marca. */
export function marcarConferido(t: TabelasEletricas, quem: string, quando: string): TabelasEletricas {
  if (!quem.trim()) return t;
  return { ...t, estado: 'conferido', conferidoPor: quem.trim(), conferidoEm: quando };
}

/** Problemas da tabela (texto em português); lista vazia = coerente. Serve de aviso, não de norma. */
export function validarTabelas(t: TabelasEletricas): string[] {
  const out: string[] = [];
  if (t.secoes.length === 0) out.push('A tabela precisa de pelo menos uma seção.');
  for (const s of t.secoes) if (!finito(t.capacidadeA[chaveSecao(s)])) out.push(`Falta a capacidade de condução da seção ${s}.`);
  const caps = t.secoes.map((s) => t.capacidadeA[chaveSecao(s)] ?? 0);
  if (caps.some((c, i) => i > 0 && c < (caps[i - 1] ?? 0))) out.push('A capacidade de condução deveria crescer com a seção.');
  if (t.disjuntoresA.length === 0) out.push('A lista de disjuntores está vazia.');
  return out;
}

/** Texto curto do estado (para selos). */
export const rotuloEstado = (t: TabelasEletricas): string => (t.estado === 'conferido' ? `conferido por ${t.conferidoPor ?? ''}` : 'CONFERIR');
