import { describe, expect, it } from 'vitest';
import { FAVORITES_LABEL, SHAPE_ALL, filterTypeChoices, groupTypeChoices, matchesTypeQuery, shapesPresent, type TypeChoice } from './typeSelectorModel.ts';

const T = (id: string, family: string, name: string, code: string): TypeChoice => ({ id, family, name, code });
const items: TypeChoice[] = [
  T('a', 'Porta de giro', 'Porta 80 x 210', 'P-02'),
  T('b', 'Porta de correr', 'Porta de correr 160 x 210', 'P-05'),
  T('c', 'Janela de correr', 'Janela 120 x 120', 'J-01'),
  T('d', 'Porta de giro', 'Porta 90 x 210', 'P-03'),
];

describe('matchesTypeQuery', () => {
  it('casa família, nome e código sem diferença de maiúsculas', () => {
    expect(matchesTypeQuery(items[1]!, 'CORRER')).toBe(true);
    expect(matchesTypeQuery(items[2]!, 'j-01')).toBe(true);
    expect(matchesTypeQuery(items[0]!, 'janela')).toBe(false);
  });

  it('ignora espaços em volta e casa tudo com busca vazia', () => {
    expect(matchesTypeQuery(items[0]!, '   ')).toBe(true);
    expect(matchesTypeQuery(items[0]!, '  80  ')).toBe(true);
  });
});

describe('filterTypeChoices', () => {
  it('mantém a ordem original e filtra pelo texto', () => {
    expect(filterTypeChoices(items, 'porta').map((t) => t.id)).toEqual(['a', 'b', 'd']);
    expect(filterTypeChoices(items, 'correr').map((t) => t.id)).toEqual(['b', 'c']);
    expect(filterTypeChoices(items, 'inexistente')).toEqual([]);
  });
});

describe('groupTypeChoices', () => {
  it('agrupa por família na ordem em que aparecem', () => {
    const groups = groupTypeChoices(items);
    expect(groups.map((g) => g.family)).toEqual(['Porta de giro', 'Porta de correr', 'Janela de correr']);
    expect(groups[0]!.items.map((t) => t.id)).toEqual(['a', 'd']);
  });

  it('tira os favoritos das famílias e os põe no topo', () => {
    const groups = groupTypeChoices(items, ['c', 'd']);
    expect(groups.map((g) => g.family)).toEqual([FAVORITES_LABEL, 'Porta de giro', 'Porta de correr']);
    expect(groups[0]!.items.map((t) => t.id)).toEqual(['c', 'd']);
    expect(groups[1]!.items.map((t) => t.id)).toEqual(['a']);
  });

  it('não mostra famílias vazias e lista vazia dá zero grupos', () => {
    expect(groupTypeChoices([], ['x'])).toEqual([]);
    expect(groupTypeChoices([items[2]!], ['c']).map((g) => g.family)).toEqual([FAVORITES_LABEL]);
  });
});

describe('forma do vão como atributo filtrável', () => {
  const S = (id: string, shape: string | undefined, label?: string): TypeChoice => ({ id, family: 'Porta de giro', name: `Porta ${id}`, code: id, ...(shape ? { shape } : {}), ...(label ? { shapeLabel: label } : {}) });
  const lista: TypeChoice[] = [S('a', undefined), S('b', 'round', 'Arco pleno'), S('c', 'gable', 'Empena'), S('d', 'round', 'Arco pleno')];

  it('a busca por texto acha pelo nome da forma', () => {
    expect(filterTypeChoices(lista, 'arco').map((t) => t.id)).toEqual(['b', 'd']);
    expect(filterTypeChoices(lista, 'empena').map((t) => t.id)).toEqual(['c']);
  });

  it('filtra pela forma; tipo sem forma conta como retangular; sem filtro nada muda', () => {
    expect(filterTypeChoices(lista, '', 'round').map((t) => t.id)).toEqual(['b', 'd']);
    expect(filterTypeChoices(lista, '', 'rect').map((t) => t.id)).toEqual(['a']);
    expect(filterTypeChoices(lista, '', SHAPE_ALL)).toEqual(lista);
    expect(filterTypeChoices(lista, 'porta c', 'gable').map((t) => t.id)).toEqual(['c']);
  });

  it('shapesPresent: só oferece o filtro quando há mais de uma forma, na ordem do modelo', () => {
    const ordem = ['rect', 'round', 'segmental', 'gable'];
    expect(shapesPresent(lista, ordem)).toEqual(['rect', 'round', 'gable']);
    expect(shapesPresent([S('a', undefined), S('b', 'rect')], ordem)).toEqual([]);
    expect(shapesPresent(items, ordem)).toEqual([]);
  });
});
