import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLot } from '@hestia/model';
import { categoryIdsOf } from './viewVisibility.ts';

describe('visibilidade do terreno: categorias site e lot', () => {
  it('site reúne o terreno e as regiões; lot reúne o lote; uma não pega a outra', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], lados: [0, 1, 2, 3].map(() => ({ papel: 'lateral' as const, recuo: 0 })) }) });
    expect(categoryIdsOf(s.project, ['site']).sort()).toEqual(['rg_t5', 'tn_t5']);
    expect(categoryIdsOf(s.project, ['lot'])).toEqual(['lt1']);
  });
});
