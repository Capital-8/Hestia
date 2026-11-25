import type { HatchKind, Material } from '@hestia/model';

/**
 * Lógica pura do navegador de materiais (sem React): gravação de campos dos blocos opcionais, limpeza de vazios,
 * agrupamento por classe e filtro da busca. Fica separada para ter teste unitário.
 */

/** Blocos opcionais do material (decisão 0056). */
export type BlocoMaterial = 'identidade' | 'graficos' | 'aparencia' | 'fisico' | 'termico';

/** Caminho de um campo dentro do bloco, ex.: `['superficie', 'primeiroPlano', 'padrao']`. Nunca vazio. */
export type Caminho = readonly [string, ...string[]];

/** Grava um campo do material. `valor` vazio (undefined, '', lista vazia) remove o campo; bloco vazio some. */
export type Editar = (bloco: BlocoMaterial, caminho: Caminho, valor: unknown, agora?: boolean) => void;

/** Os 21 padrões de hachura que o editor oferece (o `gesso` é do tipo de forro, não do material). */
export const PADROES: readonly HatchKind[] = [
  'none', 'diagonal', 'cross', 'dots', 'solid', 'brick', 'concrete', 'timber', 'insulation', 'earth',
  'cmu', 'exposedBrick', 'rcConcrete', 'stone', 'gravel', 'sand', 'eps', 'woolZigzag', 'gypsum', 'timberEnd', 'steel',
];

/** Cor padrão quando o usuário escolhe "personalizada" e ainda não há cor gravada. */
export const COR_PADRAO_PERSONALIZADA = '#808080';

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Remove recursivamente o que é vazio: `undefined`, `null`, texto em branco, número não finito, lista sem itens e
 * objeto sem campos. Devolve `undefined` quando nada sobra. Texto é aparado.
 */
export function limpaVazios(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) {
    const itens = v.map(limpaVazios).filter((x) => x !== undefined);
    return itens.length ? itens : undefined;
  }
  if (ehObjeto(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const lp = limpaVazios(x);
      if (lp !== undefined) out[k] = lp;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

/** Cópia do objeto com `valor` gravado no caminho; os ramos fora do caminho mantêm a mesma referência. */
function gravaNoCaminho(obj: Record<string, unknown>, caminho: readonly string[], valor: unknown): Record<string, unknown> {
  const [k, ...resto] = caminho;
  if (k === undefined) return obj;
  if (resto.length === 0) return { ...obj, [k]: valor };
  const filho = ehObjeto(obj[k]) ? (obj[k] as Record<string, unknown>) : {};
  return { ...obj, [k]: gravaNoCaminho(filho, resto, valor) };
}

/**
 * Grava um campo de um bloco e devolve um novo material. Só o bloco alterado é recriado; os demais blocos e campos
 * ficam com a mesma referência. Se o bloco ficar vazio, ele sai do material (volta ao comportamento anterior).
 */
export function atualizarCampo(m: Material, bloco: BlocoMaterial, caminho: Caminho, valor: unknown): Material {
  const atual = ehObjeto(m[bloco]) ? (m[bloco] as Record<string, unknown>) : {};
  const limpo = limpaVazios(gravaNoCaminho(atual, caminho, valor));
  const out: Record<string, unknown> = { ...m };
  if (limpo === undefined) delete out[bloco];
  else out[bloco] = limpo;
  return out as unknown as Material;
}

/** Texto digitado (separado por vírgula) em lista de palavras-chave: aparado, sem vazios e sem repetição. */
export function parsePalavrasChave(texto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of texto.split(',')) {
    const t = parte.trim();
    if (t) vistos.add(t);
  }
  return [...vistos];
}

/** Lista de palavras-chave de volta para o texto do campo. */
export function formatPalavrasChave(lista: readonly string[] | undefined): string {
  return (lista ?? []).join(', ');
}

/** Classe do material já aparada; `null` quando não tem classe. */
export function classeDe(m: Material): string | null {
  const c = m.identidade?.classe?.trim();
  return c ? c : null;
}

/** Remove acentos e põe em minúsculas, para a busca não depender de acento nem de caixa. */
export function normalizaBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Filtra pela busca. Procura em nome, classe, descrição, fabricante, modelo, comentários e palavras-chave.
 * Busca em branco devolve tudo.
 */
export function filtrarMateriais(lista: readonly Material[], termo: string): Material[] {
  const q = normalizaBusca(termo.trim());
  if (!q) return [...lista];
  return lista.filter((m) => {
    const id = m.identidade ?? {};
    const campos = [m.name, id.classe, id.descricao, id.fabricante, id.modelo, id.comentarios, ...(id.palavrasChave ?? [])];
    return campos.some((c) => typeof c === 'string' && normalizaBusca(c).includes(q));
  });
}

export interface GrupoMateriais {
  /** Classe do grupo; `null` = sem classe (vai por último). */
  classe: string | null;
  itens: Material[];
}

/**
 * Agrupa por `identidade.classe`. Os grupos com classe seguem `cmp` (ordem de texto do idioma); o grupo "sem classe"
 * fica no fim. Dentro de cada grupo, os itens seguem o mesmo `cmp` pelo nome.
 */
export function agruparPorClasse(lista: readonly Material[], cmp: (a: string, b: string) => number): GrupoMateriais[] {
  const mapa = new Map<string | null, Material[]>();
  for (const m of lista) {
    const c = classeDe(m);
    const grupo = mapa.get(c);
    if (grupo) grupo.push(m);
    else mapa.set(c, [m]);
  }
  const grupos: GrupoMateriais[] = [...mapa.entries()]
    .filter(([c]) => c !== null)
    .sort(([a], [b]) => cmp(a as string, b as string))
    .map(([classe, itens]) => ({ classe, itens: [...itens].sort((x, y) => cmp(x.name, y.name)) }));
  const semClasse = mapa.get(null);
  if (semClasse) grupos.push({ classe: null, itens: [...semClasse].sort((x, y) => cmp(x.name, y.name)) });
  return grupos;
}

/** Padrão mostrado quando a camada ainda não tem padrão gravado: a hachura do material (ou sólido no fundo). */
export function padraoEfetivoPrimeiro(m: Material): HatchKind {
  return PADROES.includes(m.hatch) ? m.hatch : 'none';
}
