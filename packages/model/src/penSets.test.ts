import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_STYLES,
  PEN_SETS,
  graphicsOf,
  penSetById,
  penSetMatching,
  type ProjectGraphics,
} from './index.ts';

const byId = (id: string) => PEN_SETS.find((s) => s.id === id)!;

describe('conjuntos de penas embutidos', () => {
  it('tem os três conjuntos na ordem standard, light, heavy', () => {
    expect(PEN_SETS.map((s) => s.id)).toEqual(['standard', 'light', 'heavy']);
    expect(penSetById('heavy')?.id).toBe('heavy');
    expect(penSetById('sheet')).toBeUndefined();
    expect(penSetById('nao-existe')).toBeUndefined();
  });

  it('anteprojeto: corte e projeção um nível mais leves, com mínimo 1', () => {
    const light = byId('light');
    expect(light.categories.wall).toEqual({ cutWeight: 4, projectionWeight: 1 });
    expect(light.categories.door).toEqual({ cutWeight: 2, projectionWeight: 1 });
    expect(light.categories.annotation).toEqual({ cutWeight: 1, projectionWeight: 1 });
  });

  it('executivo: corte um nível mais forte e projeção igual ao padrão', () => {
    const heavy = byId('heavy');
    expect(heavy.categories.wall).toEqual({ cutWeight: 6, projectionWeight: 2 });
    expect(heavy.categories.door).toEqual({ cutWeight: 4, projectionWeight: 2 });
    expect(heavy.categories.lot).toEqual({ cutWeight: 2, projectionWeight: 3 });
  });

  it('nenhum conjunto liga o estilo de prancha (o campo fica só nos arquivos salvos)', () => {
    expect(byId('standard').estiloPrancha).toBe(false);
    expect(byId('light').estiloPrancha).toBe(false);
    expect(byId('heavy').estiloPrancha).toBe(false);
  });

  it('não compartilha referência com os estilos padrão', () => {
    const standard = byId('standard');
    expect(standard.categories).not.toBe(DEFAULT_CATEGORY_STYLES);
    expect(standard.categories.wall).not.toBe(DEFAULT_CATEGORY_STYLES.wall);
    const antes = DEFAULT_CATEGORY_STYLES.wall.cutWeight;
    standard.categories.wall.cutWeight = 9;
    try {
      expect(DEFAULT_CATEGORY_STYLES.wall.cutWeight).toBe(antes);
    } finally {
      standard.categories.wall.cutWeight = antes;
    }
  });

  it('reconhece o padrão do Hestia e o conjunto executivo', () => {
    expect(penSetMatching(graphicsOf({}))).toBe('standard');
    const heavy = byId('heavy');
    const g: ProjectGraphics = {
      ...graphicsOf({}),
      lineWeights: heavy.lineWeights,
      categories: heavy.categories,
    };
    expect(penSetMatching(g)).toBe('heavy');
  });

  it('devolve null quando os pesos não são de nenhum conjunto', () => {
    const g: ProjectGraphics = {
      ...graphicsOf({}),
      categories: { ...graphicsOf({}).categories, wall: { cutWeight: 16, projectionWeight: 2 } },
    };
    expect(penSetMatching(g)).toBeNull();
  });
});
