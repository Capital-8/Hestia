import { describe, expect, it } from 'vitest';
import { isBeam, isColumn, makeBeam, makeColumn } from '@hestia/model';
import { buildColumnFeatures } from './structuralAlignFeatures.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

describe('alinhar elementos estruturais (pilar, viga e autoproteção)', () => {
  it('buildColumnFeatures usa distância ao segmento finito (ponto distante no eixo retorna vazio)', () => {
    const ctx = makeEnv();
    const col = makeColumn({
      id: 'col1',
      typeId: 'ct_conc_20x40',
      levelId: 'lv_0',
      at: { x: 0, y: 0 },
      rotation: 0,
    });
    ctx.store.exec({ type: 'addColumn', column: col });

    const saved = ctx.store.project.elements.col1;
    if (!isColumn(saved)) throw new Error('expected column');

    const near = buildColumnFeatures(ctx.store.project, saved, { x: 0, y: 0.01 }, 0.01);
    expect(near.some((f) => f.kind === 'eixoPilar')).toBe(true);

    const farAlongAxis = buildColumnFeatures(ctx.store.project, saved, { x: 10, y: 0 }, 0.01);
    expect(farAlongAxis).toEqual([]);
  });

  it('face do pilar como referência + ponta da viga como destino estica só a ponta da viga (pilar fica parado)', () => {
    const ctx = makeEnv();
    ctx.options.alignPrefer = 'faces';
    ctx.store.exec({
      type: 'addColumn',
      column: makeColumn({
        id: 'col1',
        typeId: 'ct_conc_20x40', // largura X = 0.2 -> face direita em x = 0.1
        levelId: 'lv_0',
        at: { x: 0, y: 0 },
        rotation: 0,
      }),
    });
    ctx.store.exec({
      type: 'addBeam',
      beam: makeBeam({
        id: 'beam1',
        typeId: 'bt_conc_15x40', // largura Y = 0.15
        levelId: 'lv_0',
        a: { x: 2, y: 0 },
        b: { x: 6, y: 0 },
      }),
    });

    const t = tool('align', ctx.env);
    clickAt(t, 0.1, 0.12); // face direita do pilar (fora dos eixos x=0 e y=0)
    clickAt(t, 2, 0.04); // extremidade 'a' da viga (mais perto da ponta que do eixo y=0)

    const col = ctx.store.project.elements.col1;
    const beam = ctx.store.project.elements.beam1;
    if (!isColumn(col) || !isBeam(beam)) throw new Error('expected column and beam');
    expect(col.at).toEqual({ x: 0, y: 0 });
    expect(beam.a.x).toBeCloseTo(0.1, 9);
    expect(beam.a.y).toBeCloseTo(0, 9);
    expect(beam.b).toEqual({ x: 6, y: 0 });
  });

  it('impede auto-referência ao clicar duas feições do mesmo pilar', () => {
    const ctx = makeEnv();
    ctx.options.alignPrefer = 'faces';
    ctx.store.exec({
      type: 'addColumn',
      column: makeColumn({
        id: 'col1',
        typeId: 'ct_conc_20x40',
        levelId: 'lv_0',
        at: { x: 1, y: 1 },
        rotation: 0,
      }),
    });

    const t = tool('align', ctx.env);
    clickAt(t, 1.1, 1.12); // face direita (x = 1.1)
    clickAt(t, 0.9, 1.12); // face esquerda (x = 0.9) do mesmo pilar

    const col = ctx.store.project.elements.col1;
    if (!isColumn(col)) throw new Error('expected column');
    expect(col.at).toEqual({ x: 1, y: 1 });
  });
});
