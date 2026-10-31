import { describe, expect, it } from 'vitest';
import {
  createPasteLevelsModel,
  deltaOf,
  groupLevels,
  isOriginLevel,
  originElevation,
  search,
  selectAllAbove,
  selectAllBelow,
  selectRange,
  summary,
  toggleLevel,
  validate,
  type PasteLevelsLevel,
  type PasteLevelsModel,
} from './pasteLevelsModel.ts';

const LEVELS: PasteLevelsLevel[] = [
  { id: 'lv_2', name: 'Pavimento 2', elevation: 6 },
  { id: 'lv_0', name: 'Térreo', elevation: 0 },
  { id: 'lv_3', name: 'Pavimento 3', elevation: 9 },
  { id: 'lv_1', name: 'Pavimento 1', elevation: 3 },
  { id: 'lv_m1', name: 'Subsolo', elevation: -3 },
];

/** Modelo padrão do teste: origem no Térreo, nada marcado, 12 elementos. */
function model(over: Partial<Parameters<typeof createPasteLevelsModel>[0]> = {}): PasteLevelsModel {
  return createPasteLevelsModel({
    levels: LEVELS,
    originLevelIds: ['lv_0'],
    elementCount: 12,
    initialSelected: [],
    initialLink: false,
    ...over,
  });
}

describe('createPasteLevelsModel', () => {
  it('ordena por elevação e limpa a seleção inicial', () => {
    const m = model({ initialSelected: ['lv_1', 'lv_0', 'lv_1', 'lv_x'] });
    expect(m.levels.map((l) => l.id)).toEqual(['lv_m1', 'lv_0', 'lv_1', 'lv_2', 'lv_3']);
    expect(m.originLevelIds).toEqual(['lv_0']);
    expect(m.selected).toEqual(['lv_1']);
    expect(m.link).toBe(false);
    expect(validate(m)).toBeNull();
  });

  it('não altera os arrays recebidos', () => {
    const entrada = [...LEVELS];
    model({ levels: entrada });
    expect(entrada.map((l) => l.id)).toEqual(LEVELS.map((l) => l.id));
  });

  it('ignora origem inexistente e liga o vínculo só com true', () => {
    const m = model({ originLevelIds: ['lv_x'], initialLink: true });
    expect(m.originLevelIds).toEqual([]);
    expect(m.link).toBe(true);
  });

  it('mantém só origens que existem, na ordem dos níveis', () => {
    const m = model({ originLevelIds: ['lv_2', 'lv_0', 'lv_x'] });
    expect(m.originLevelIds).toEqual(['lv_0', 'lv_2']);
  });

  it('normaliza a contagem de elementos', () => {
    expect(model({ elementCount: -4 }).elementCount).toBe(0);
    expect(model({ elementCount: 2.9 }).elementCount).toBe(2);
    expect(model({ elementCount: Number.NaN }).elementCount).toBe(0);
  });
});

describe('toggleLevel', () => {
  it('marca e desmarca, mantendo a ordem dos níveis', () => {
    let m = model();
    m = toggleLevel(m, 'lv_2');
    m = toggleLevel(m, 'lv_m1');
    expect(m.selected).toEqual(['lv_m1', 'lv_2']);
    m = toggleLevel(m, 'lv_2');
    expect(m.selected).toEqual(['lv_m1']);
  });

  it('não marca o nível de origem nem id inexistente', () => {
    const m = model();
    expect(toggleLevel(m, 'lv_0')).toBe(m);
    expect(toggleLevel(m, 'lv_x')).toBe(m);
    expect(isOriginLevel(m, 'lv_0')).toBe(true);
    expect(isOriginLevel(m, 'lv_1')).toBe(false);
  });
});

describe('selectAllAbove e selectAllBelow', () => {
  it('marca os níveis acima da origem, sem a origem', () => {
    const m = selectAllAbove(model());
    expect(m.selected).toEqual(['lv_1', 'lv_2', 'lv_3']);
  });

  it('marca os níveis abaixo da origem', () => {
    const m = selectAllBelow(model());
    expect(m.selected).toEqual(['lv_m1']);
  });

  it('soma à seleção atual', () => {
    const inicio = toggleLevel(model(), 'lv_1');
    expect(selectAllAbove(inicio).selected).toEqual(['lv_1', 'lv_2', 'lv_3']);
    expect(selectAllBelow(inicio).selected).toEqual(['lv_m1', 'lv_1']);
  });

  it('sem origem, não muda nada', () => {
    const semOrigem = model({ originLevelIds: [] });
    expect(selectAllAbove(semOrigem)).toBe(semOrigem);
    expect(selectAllBelow(semOrigem)).toBe(semOrigem);
  });
});

describe('selectRange', () => {
  it('marca o intervalo inclusive, sem a origem, na ordem dos níveis', () => {
    const m = selectRange(model(), 0, 2);
    expect(m.selected).toEqual(['lv_m1', 'lv_1']);
  });

  it('aceita os índices invertidos', () => {
    expect(selectRange(model(), 4, 2).selected).toEqual(['lv_1', 'lv_2', 'lv_3']);
  });

  it('limita os índices ao que existe', () => {
    expect(selectRange(model(), -10, 99).selected).toEqual(['lv_m1', 'lv_1', 'lv_2', 'lv_3']);
  });

  it('ignora índices inválidos e soma à seleção atual', () => {
    const m = model();
    expect(selectRange(m, Number.NaN, 2)).toBe(m);
    const inicio = toggleLevel(m, 'lv_m1');
    expect(selectRange(inicio, 3, 4).selected).toEqual(['lv_m1', 'lv_2', 'lv_3']);
  });
});

describe('search', () => {
  const niveis = model().levels;

  it('encontra sem acento e sem caixa', () => {
    expect(search(niveis, 'terreo').map((l) => l.id)).toEqual(['lv_0']);
    expect(search(niveis, 'PAVIMENTO').map((l) => l.id)).toEqual(['lv_1', 'lv_2', 'lv_3']);
    expect(search(niveis, '  tér ').map((l) => l.id)).toEqual(['lv_0']);
  });

  it('termo vazio devolve todos e termo sem par devolve vazio', () => {
    expect(search(niveis, '')).toHaveLength(niveis.length);
    expect(search(niveis, 'cobertura')).toEqual([]);
  });
});

describe('groupLevels', () => {
  it('agrupa em Acima / Atual / Abaixo pela origem', () => {
    const grupos = groupLevels(model());
    expect(grupos.map((g) => [g.key, g.title])).toEqual([
      ['above', 'Acima'],
      ['current', 'Atual'],
      ['below', 'Abaixo'],
    ]);
    expect(grupos[0]?.levels.map((l) => l.id)).toEqual(['lv_1', 'lv_2', 'lv_3']);
    expect(grupos[1]?.levels.map((l) => l.id)).toEqual(['lv_0']);
    expect(grupos[2]?.levels.map((l) => l.id)).toEqual(['lv_m1']);
  });

  it('omite grupos vazios', () => {
    const semAcima = model({ levels: LEVELS.filter((l) => l.elevation <= 0), originLevelIds: ['lv_0'] });
    expect(groupLevels(semAcima).map((g) => g.key)).toEqual(['current', 'below']);
  });

  it('sem origem, todos ficam em Atual', () => {
    const grupos = groupLevels(model({ originLevelIds: [] }));
    expect(grupos.map((g) => g.key)).toEqual(['current']);
    expect(grupos[0]?.levels).toHaveLength(LEVELS.length);
  });
});

describe('elevação e Δh', () => {
  it('usa a origem mais baixa como referência', () => {
    const m = model({ originLevelIds: ['lv_1', 'lv_2'] });
    expect(originElevation(m)).toBe(3);
    expect(deltaOf(m, 'lv_3')).toBe(6);
    expect(deltaOf(m, 'lv_1')).toBe(0);
    expect(deltaOf(m, 'lv_0')).toBe(-3);
    expect(deltaOf(m, 'lv_x')).toBeNull();
  });

  it('sem origem, não há referência', () => {
    const m = model({ originLevelIds: [] });
    expect(originElevation(m)).toBeNull();
    expect(deltaOf(m, 'lv_1')).toBeNull();
  });
});

describe('summary', () => {
  it('mostra níveis e cópias (elementos × níveis)', () => {
    const todas = selectRange(model(), 0, 4);
    expect(summary(todas)).toBe('4 níveis • 48 cópias');
    expect(summary(model({ initialSelected: ['lv_1', 'lv_2', 'lv_3'], elementCount: 20 }))).toBe('3 níveis • 60 cópias');
    expect(summary(model({ initialSelected: ['lv_1', 'lv_2', 'lv_3'], elementCount: 12 }))).toBe('3 níveis • 36 cópias');
    expect(summary(model({ initialSelected: ['lv_1'], elementCount: 1 }))).toBe('1 nível • 1 cópia');
    expect(summary(model())).toBe('0 níveis • 0 cópias');
  });
});

describe('validate', () => {
  it('aceita uma seleção válida', () => {
    expect(validate(model({ initialSelected: ['lv_1', 'lv_m1'] }))).toBeNull();
  });

  it('recusa seleção vazia', () => {
    expect(validate(model())).toBe('Selecione ao menos um nível.');
  });

  it('recusa projeto sem níveis', () => {
    const vazio = model({ levels: [], originLevelIds: [] });
    expect(validate(vazio)).toBe('O projeto não tem níveis.');
  });

  it('recusa nível inexistente e nível de origem', () => {
    const m = model({ initialSelected: ['lv_1'] });
    expect(validate({ ...m, selected: ['lv_x'] })).toContain('Nível inexistente');
    expect(validate({ ...m, selected: ['lv_0'] })).toBe('O nível de origem não pode receber a cópia.');
  });
});
