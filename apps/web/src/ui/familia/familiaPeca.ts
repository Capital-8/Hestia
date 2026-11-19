import type { Eixo, Familia, PapelPeca, Peca } from '@hestia/model';

/*
 * Apoio puro das ações sobre peças no editor de famílias: rótulos de papel, id padrão a partir do nome, descoberta do id
 * novo (para selecionar a peça criada/duplicada/espelhada) e medidas padrão coerentes com o eixo da espessura.
 */

/** Papéis na ordem em que aparecem no formulário de nova peça. */
export const PAPEIS: readonly PapelPeca[] = [
  'lateral', 'base', 'topo', 'travessa', 'prateleira', 'divisoria', 'fundo', 'porta', 'frente_gaveta',
  'tampo', 'rodape', 'painel', 'bloco', 'generica',
];

export const ROTULOS_PAPEL: Record<PapelPeca, string> = {
  lateral: 'Lateral',
  base: 'Base',
  topo: 'Topo',
  travessa: 'Travessa',
  prateleira: 'Prateleira',
  divisoria: 'Divisória',
  fundo: 'Fundo',
  porta: 'Porta',
  frente_gaveta: 'Frente de gaveta',
  tampo: 'Tampo',
  rodape: 'Rodapé',
  painel: 'Painel',
  bloco: 'Bloco',
  generica: 'Genérica',
};

/** Eixo da espessura sugerido por papel: o mais comum na marcenaria de caixaria. */
export const EIXO_PADRAO: Record<PapelPeca, Eixo> = {
  lateral: 'x',
  base: 'z',
  topo: 'z',
  travessa: 'z',
  prateleira: 'z',
  divisoria: 'z',
  fundo: 'y',
  porta: 'y',
  frente_gaveta: 'y',
  tampo: 'z',
  rodape: 'z',
  painel: 'z',
  bloco: 'z',
  generica: 'z',
};

/** Orientação do plano da chapa em cada eixo (a mesma convenção de `Peca.tamanho` no modelo). */
export const DICAS_EIXO: Record<Eixo, string> = {
  x: 'Espessura em X: a = profundidade (P), b = altura (A).',
  y: 'Espessura em Y: a = largura (L), b = altura (A).',
  z: 'Espessura em Z: a = largura (L), b = profundidade (P).',
};

export function rotuloDoPapel(papel: PapelPeca): string {
  return ROTULOS_PAPEL[papel];
}

/** Id a partir do nome: minúsculas sem acento, `[^a-z0-9]+` → `_`, sem `_` nas pontas e começando por letra. */
export function normalizarIdPeca(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (base === '') return 'peca';
  return /^[a-z_]/.test(base) ? base : `p_${base}`;
}

/** Id padrão único entre `ocupados`: o normalizado do nome, com sufixo `_2`, `_3`… se já existir. */
export function idPadraoDeNome(nome: string, ocupados: Iterable<string>): string {
  const base = normalizarIdPeca(nome);
  const usados = new Set(ocupados);
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function idsDePecas(f: Pick<Familia, 'pecas'>): string[] {
  return f.pecas.map((p) => p.id);
}

/** Primeiro id que aparece em `depois` e não estava em `antes` (a peça criada, duplicada ou espelhada). */
export function idAdicionado(antes: readonly string[], depois: readonly string[]): string | null {
  const anteriores = new Set(antes);
  return depois.find((id) => !anteriores.has(id)) ?? null;
}

/** Medidas `a` e `b` padrão do plano da chapa para o eixo escolhido. */
export function medidasPadrao(eixo: Eixo): { a: string; b: string } {
  if (eixo === 'x') return { a: 'P', b: 'A' };
  if (eixo === 'y') return { a: 'L', b: 'A' };
  return { a: 'L', b: 'P' };
}

/** Espessura padrão: a fórmula do parâmetro `esp` quando ele existe; senão o valor 18 mm. */
export function espessuraPadrao(f: Pick<Familia, 'parametros'>): string {
  return f.parametros.some((p) => p.id === 'esp') ? 'esp' : '18';
}

/** Peça nova com os padrões do papel/eixo e origem no canto mínimo. */
export function pecaNova(f: Pick<Familia, 'parametros'>, papel: PapelPeca, eixo: Eixo, nome: string, id: string): Peca {
  const medidas = medidasPadrao(eixo);
  return {
    id,
    nome,
    papel,
    eixo,
    origem: ['0', '0', '0'],
    tamanho: [medidas.a, medidas.b],
    espessura: espessuraPadrao(f),
  };
}
