import type { Project } from './types.ts';

/**
 * Memo de resoluções e validações que NÃO leem janelas nem portas (lajes, junções entre paredes, sobreposição de
 * paredes). A validade é a identidade, elemento por elemento, de tudo o que o projeto tem exceto as esquadrias: editar,
 * mover ou apagar uma janela ou porta deixa a lista igual e o resultado guardado vale. Qualquer outra edição troca ao
 * menos um objeto e recalcula.
 */
const listaPorElementos = new WeakMap<object, readonly unknown[]>();
const listaSemJanelasPorElementos = new WeakMap<object, readonly unknown[]>();

/**
 * Fontes de validade: níveis, ajustes, tipos, materiais e os elementos que não são esquadrias. Com `soJanelas`, as portas
 * ficam na lista: o término explícito de piso e laje lê os vãos de porta que chegam ao piso (`doorRectsReaching`), nunca janelas.
 */
export function fontesSemEsquadrias(p: Project, soJanelas = false): readonly unknown[] {
  const mapa = soJanelas ? listaSemJanelasPorElementos : listaPorElementos;
  let lista = mapa.get(p.elements);
  if (!lista) {
    lista = Object.values(p.elements).filter((e) => e.kind !== 'window' && (soJanelas || e.kind !== 'door'));
    mapa.set(p.elements, lista);
  }
  return [...p.levels, p.settings, p.defaults, p.wallTypes, p.openingTypes, p.floorTypes, p.slabTypes, p.roofTypes, p.stairTypes, p.rampTypes, p.materials, ...lista];
}

const memo = new Map<string, { fontes: readonly unknown[]; valor: unknown }>();

/** `calcula()` guardado por `chave` enquanto as fontes sem esquadrias forem as mesmas (a chave deve incluir todo parâmetro além do projeto). */
export function memoSemEsquadrias<T>(chave: string, p: Project, calcula: () => T, soJanelas = false): T {
  const fontes = fontesSemEsquadrias(p, soJanelas);
  const antes = memo.get(chave);
  if (antes && antes.fontes.length === fontes.length && antes.fontes.every((x, i) => x === fontes[i])) return antes.valor as T;
  const valor = calcula();
  memo.set(chave, { fontes, valor });
  return valor;
}
