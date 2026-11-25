import { PEN_SETS, graphicsOf, lineWeightMm, type PenSet, type Project, type UserPenSet } from '@hestia/model';
import { fmtNum, type Lang } from '../../editor/i18n.ts';

/**
 * JSON com as chaves de objeto em ordem: a ordem de inserção (que difere entre o padrão e os conjuntos) não pode
 * decidir se dois gráficos são iguais.
 */
function jsonCanonico(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

/**
 * Conjunto em uso agora: dentre os conjuntos embutidos e os do usuário, o primeiro com os mesmos pesos e categorias do
 * projeto. Os embutidos vêm primeiro, por isso um conjunto do usuário com o ajuste padrão não toma o lugar do embutido.
 * Sem correspondência, `null`.
 */
export function emUso(p: Project): string | null {
  const g = graphicsOf(p);
  const pesos = jsonCanonico(g.lineWeights);
  const categorias = jsonCanonico(g.categories);
  const doUsuario: UserPenSet[] = p.penSets ? Object.values(p.penSets) : [];
  return [...PEN_SETS, ...doUsuario].find(
    (s) => jsonCanonico(s.lineWeights) === pesos && jsonCanonico(s.categories) === categorias,
  )?.id ?? null;
}

/** Nome aceitável para um conjunto do usuário: não vazio depois de aparado e com no máximo 60 caracteres. */
export function nomeValido(name: string): boolean {
  const nome = name.trim();
  return nome.length > 0 && nome.length <= 60;
}

/** Número do id `ps_N`, para ordenar `ps_2` antes de `ps_10`; ids fora do padrão vão para o fim. */
function numeroDoId(id: string): number {
  const m = /^ps_(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** Conjuntos do usuário na ordem natural do número do id, sem `penSets` no projeto a lista é vazia. */
export function conjuntosDoUsuario(p: Project): UserPenSet[] {
  return Object.values(p.penSets ?? {}).sort(
    (a, b) => numeroDoId(a.id) - numeroDoId(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Espessura de corte da parede em mm de papel na escala pedida (denominador), com o separador decimal do idioma. */
export function paredeCortada(set: Pick<PenSet, 'lineWeights' | 'categories'>, scale: number, lang: Lang): string {
  return `${fmtNum(lineWeightMm(set.lineWeights, set.categories.wall.cutWeight, scale), 2, lang)} mm`;
}
