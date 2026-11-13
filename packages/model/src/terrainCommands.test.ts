import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { t } from './i18n.ts';
import { isTerrain, isTerrainRegion, makeTerrain, makeTerrainRegion } from './terrain.ts';
import type { OpTerreno, Terrain, TerrainRegion } from './terrainTypes.ts';
import { TERRENO_LIMITES } from './terrainTypes.ts';

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];
const msg = (k: Parameters<typeof t>[1], params?: Record<string, string | number>): string => t('pt', k, params);
const T = (s: ProjectStore, id = 'tn1'): Terrain => s.project.elements[id] as Terrain;
const R = (s: ProjectStore, id = 'tr1'): TerrainRegion => s.project.elements[id] as TerrainRegion;

function comTerreno(extra: Partial<Terrain> = {}): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0', pontos: [0, 0, 1, 10, 0, 2, 5, 8, 3], ...extra }) });
  return s;
}
function comRegiao(): ProjectStore {
  const s = comTerreno();
  s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'plataforma', cota: 2 }) });
  return s;
}

describe('addTerrain', () => {
  it('cria o terreno com ordem, copia as listas e desfaz e refaz', () => {
    const origem = makeTerrain({ id: 'tn1', levelId: 'lv_0', pontos: [0, 0, 1] });
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: origem });
    expect(isTerrain(s.project.elements['tn1'])).toBe(true);
    expect(T(s).order).toBe(s.project.nextOrder - 1);
    expect(T(s).pontos).toEqual([0, 0, 1]);
    expect(T(s).pontos).not.toBe(origem.pontos);
    s.undo();
    expect(s.project.elements['tn1']).toBeUndefined();
    s.redo();
    expect(T(s).pontos).toEqual([0, 0, 1]);
  });

  it('normaliza a borda horária para anti-horária', () => {
    const s = comTerreno({ borda: [0, 0, 5, 8, 10, 0] });
    expect(T(s).borda).toEqual([10, 0, 5, 8, 0, 0]);
  });

  it('recusa terreno inválido e nível inexistente sem mexer no projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const antes = s.project.nextOrder;
    expect(() => s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'x', levelId: 'lv_0', pontos: [Number.NaN, 0, 0] }) })).toThrow(msg('md_tn_numero'));
    expect(() => s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'x', levelId: 'nao_existe' }) })).toThrow();
    expect(s.project.elements['x']).toBeUndefined();
    expect(s.project.nextOrder).toBe(antes);
    expect(s.canUndo).toBe(false);
  });
});

describe('updateTerrain', () => {
  it('muda os campos simples, preserva fontes e ordem, e desfaz e refaz', () => {
    const s = comTerreno();
    const ordem = T(s).order;
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { name: 'Gleba', intervaloCurvas: 0.5, mestraCada: 4, espessuraBase: 5, mostrarExistente: true, color: '#aabbcc', materialId: 'mat_x' } });
    expect(T(s)).toMatchObject({ name: 'Gleba', intervaloCurvas: 0.5, mestraCada: 4, espessuraBase: 5, mostrarExistente: true, color: '#aabbcc', materialId: 'mat_x', order: ordem, kind: 'terrain' });
    expect(T(s).pontos).toEqual([0, 0, 1, 10, 0, 2, 5, 8, 3]);
    s.undo();
    expect(T(s)).toMatchObject({ name: 'Terreno', intervaloCurvas: 1, mestraCada: 5 });
    s.redo();
    expect(T(s).name).toBe('Gleba');
  });

  it('recusa valor fora da faixa, id que não é terreno e nível inexistente', () => {
    const s = comTerreno();
    expect(() => s.exec({ type: 'updateTerrain', id: 'tn1', patch: { intervaloCurvas: 0.01 } })).toThrow(msg('md_tn_intervalo', { min: TERRENO_LIMITES.intervaloMin }));
    expect(() => s.exec({ type: 'updateTerrain', id: 'nada', patch: { name: 'x' } })).toThrow(msg('md_cmd_terrain_missing'));
    expect(() => s.exec({ type: 'updateTerrain', id: 'tn1', patch: { levelId: 'nao_existe' } })).toThrow();
    expect(T(s).intervaloCurvas).toBe(1);
  });

  it('troca o nível do terreno', () => {
    const s = comTerreno();
    const outro = s.project.levels.find((l) => l.id !== 'lv_0')!.id;
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { levelId: outro } });
    expect(T(s).levelId).toBe(outro);
  });
});

describe('editTerrainFontes: cada operação, com desfazer e refazer', () => {
  /** Aplica uma operação, confere o resultado e o desfazer e o refazer. */
  function caso(inicial: Partial<Terrain>, op: OpTerreno, confere: (t: Terrain) => void): void {
    const s = comTerreno(inicial);
    const antes = structuredClone(T(s));
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [op] });
    confere(T(s));
    s.undo();
    expect(T(s)).toEqual(antes);
    s.redo();
    confere(T(s));
  }
  const curvas = [{ z: 2, xy: [0, 0, 5, 5], fechada: false }, { z: 3, xy: [1, 1, 4, 1, 4, 4], fechada: true }];
  const quebras = [{ xyz: [0, 0, 1, 5, 5, 2] }, { xyz: [1, 0, 1, 1, 5, 2] }];

  it('addPonto', () => caso({}, { op: 'addPonto', x: 7, y: 7, z: 9 }, (t) => expect(t.pontos).toEqual([0, 0, 1, 10, 0, 2, 5, 8, 3, 7, 7, 9])));
  it('movePonto', () => caso({}, { op: 'movePonto', i: 1, x: 11, y: 1, z: 2.5 }, (t) => expect(t.pontos).toEqual([0, 0, 1, 11, 1, 2.5, 5, 8, 3])));
  it('removePonto', () => caso({}, { op: 'removePonto', i: 0 }, (t) => expect(t.pontos).toEqual([10, 0, 2, 5, 8, 3])));
  it('addCurva', () => caso({ curvas }, { op: 'addCurva', z: 4, xy: [0, 0, 9, 9], fechada: false }, (t) => expect(t.curvas).toHaveLength(3)));
  it('setCurvaZ', () => caso({ curvas }, { op: 'setCurvaZ', i: 1, z: 7.5 }, (t) => expect(t.curvas.map((c) => c.z)).toEqual([2, 7.5])));
  it('moveVerticeCurva', () => caso({ curvas }, { op: 'moveVerticeCurva', i: 1, j: 2, x: 5, y: 5 }, (t) => expect(t.curvas[1]!.xy).toEqual([1, 1, 4, 1, 5, 5])));
  it('removeCurva', () => caso({ curvas }, { op: 'removeCurva', i: 0 }, (t) => expect(t.curvas).toEqual([curvas[1]])));
  it('addQuebra', () => caso({ quebras }, { op: 'addQuebra', xyz: [0, 0, 0, 3, 3, 3] }, (t) => expect(t.quebras).toHaveLength(3)));
  it('moveVerticeQuebra', () => caso({ quebras }, { op: 'moveVerticeQuebra', i: 0, j: 1, x: 6, y: 6, z: 2.2 }, (t) => expect(t.quebras[0]!.xyz).toEqual([0, 0, 1, 6, 6, 2.2])));
  it('removeQuebra', () => caso({ quebras }, { op: 'removeQuebra', i: 1 }, (t) => expect(t.quebras).toEqual([quebras[0]])));
  it('setBorda define (normalizando o sentido) e remove com null', () => {
    caso({}, { op: 'setBorda', xy: [0, 0, 5, 8, 10, 0] }, (t) => expect(t.borda).toEqual([10, 0, 5, 8, 0, 0]));
    caso({ borda: [0, 0, 10, 0, 5, 8] }, { op: 'setBorda', xy: null }, (t) => expect('borda' in t).toBe(false));
  });
  it('setLinhasRotulo', () => caso({}, { op: 'setLinhasRotulo', v: [0, 0, 5, 5, 1, 1, 2, 2] }, (t) => expect(t.linhasRotulo).toEqual([0, 0, 5, 5, 1, 1, 2, 2])));
  it('setPontosCotados', () => caso({}, { op: 'setPontosCotados', v: [1, 1, 2, 2] }, (t) => expect(t.pontosCotados).toEqual([1, 1, 2, 2])));
  it('substituirFontes troca pontos, curvas e quebras e mantém o resto', () =>
    caso({ curvas, quebras, borda: [0, 0, 10, 0, 5, 8], linhasRotulo: [0, 0, 1, 1] }, { op: 'substituirFontes', pontos: [1, 1, 1], curvas: [], quebras: [{ xyz: [0, 0, 0, 2, 2, 2] }] }, (t) => {
      expect(t.pontos).toEqual([1, 1, 1]);
      expect(t.curvas).toEqual([]);
      expect(t.quebras).toEqual([{ xyz: [0, 0, 0, 2, 2, 2] }]);
      expect(t.borda).toEqual([0, 0, 10, 0, 5, 8]);
      expect(t.linhasRotulo).toEqual([0, 0, 1, 1]);
    }));

  it('várias operações valem em sequência, num só passo de desfazer', () => {
    const s = comTerreno();
    s.exec({
      type: 'editTerrainFontes',
      terrenoId: 'tn1',
      ops: [
        { op: 'removePonto', i: 0 }, // sobram (10,0,2) e (5,8,3)
        { op: 'movePonto', i: 0, x: 11, y: 0, z: 2 }, // o índice vale depois da remoção
        { op: 'addPonto', x: 1, y: 1, z: 1 },
      ],
    });
    expect(T(s).pontos).toEqual([11, 0, 2, 5, 8, 3, 1, 1, 1]);
    s.undo();
    expect(T(s).pontos).toEqual([0, 0, 1, 10, 0, 2, 5, 8, 3]);
    s.undo();
    expect(s.project.elements['tn1']).toBeUndefined(); // o único passo anterior era a criação do terreno
  });

  it('índice fora da lista, operação desconhecida e resultado inválido são recusados sem mudar nada', () => {
    const s = comTerreno();
    const antes = structuredClone(T(s));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'removePonto', i: 3 }] })).toThrow(msg('md_tn_cmd_indice', { n: 1 }));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'addPonto', x: 1, y: 1, z: 1 }, { op: 'setCurvaZ', i: 0, z: 1 }] })).toThrow(msg('md_tn_cmd_indice', { n: 2 }));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'explodir' } as never] })).toThrow(msg('md_tn_cmd_op', { n: 1 }));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'addPonto', x: Number.NaN, y: 0, z: 0 }] })).toThrow(msg('md_tn_numero'));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'setBorda', xy: [0, 0, 1, 1] }] })).toThrow(msg('md_tn_borda_pontos'));
    expect(() => s.exec({ type: 'editTerrainFontes', terrenoId: 'nada', ops: [] })).toThrow(msg('md_cmd_terrain_missing'));
    expect(T(s)).toEqual(antes);
  });
});

describe('regiões de terreno', () => {
  it('addTerrainRegion cria, normaliza o sentido e desfaz e refaz', () => {
    const s = comTerreno();
    s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: [...tri].reverse() }) });
    expect(isTerrainRegion(R(s))).toBe(true);
    expect(R(s).contorno).toEqual(tri);
    expect(R(s).permeavel).toBe(true);
    s.undo();
    expect(s.project.elements['tr1']).toBeUndefined();
    s.redo();
    expect(R(s).terrenoId).toBe('tn1');
  });

  it('o padrão de `permeavel` é false na plataforma e na nivelada', () => {
    expect(makeTerrainRegion({ id: 'a', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'plataforma' }).permeavel).toBe(false);
    expect(makeTerrainRegion({ id: 'a', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'nivelada' }).permeavel).toBe(false);
    expect(makeTerrainRegion({ id: 'a', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri }).permeavel).toBe(true);
  });

  it('addTerrainRegion recusa terreno inexistente e região inválida', () => {
    const s = comTerreno();
    expect(() => s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'nada', contorno: tri }) })).toThrow(msg('md_tn_reg_terreno'));
    expect(() => s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, inclinacao: 2 }) })).toThrow();
    expect(() => s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'nao_existe', terrenoId: 'tn1', contorno: tri }) })).toThrow();
    expect(s.project.elements['tr1']).toBeUndefined();
  });

  it('updateTerrainRegion muda o patch, mantém contorno e dono, e desfaz e refaz', () => {
    const s = comRegiao();
    s.exec({ type: 'updateTerrainRegion', id: 'tr1', patch: { papel: 'nivelada', cota: 5, inclinacao: 0.1, direcao: 1, taludeCorte: 1.5, taludeAterro: 2, permeavel: true, name: 'Nivelada', color: '#123456' } });
    expect(R(s)).toMatchObject({ papel: 'nivelada', cota: 5, inclinacao: 0.1, direcao: 1, taludeCorte: 1.5, taludeAterro: 2, permeavel: true, name: 'Nivelada', terrenoId: 'tn1', kind: 'terrainRegion' });
    expect(R(s).contorno).toHaveLength(3);
    s.undo();
    expect(R(s)).toMatchObject({ papel: 'plataforma', cota: 2 });
    s.redo();
    expect(R(s).cota).toBe(5);
    expect(() => s.exec({ type: 'updateTerrainRegion', id: 'tr1', patch: { taludeCorte: 11 } })).toThrow();
    expect(() => s.exec({ type: 'updateTerrainRegion', id: 'tn1', patch: { cota: 1 } })).toThrow(msg('md_cmd_terrain_region_missing'));
  });

  it('setTerrainRegionContorno troca o contorno (normaliza o sentido), recusa inválido, desfaz e refaz', () => {
    const s = comRegiao();
    const novo = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }];
    s.exec({ type: 'setTerrainRegionContorno', id: 'tr1', contorno: [...novo].reverse() });
    expect(R(s).contorno).toEqual(novo);
    expect(() => s.exec({ type: 'setTerrainRegionContorno', id: 'tr1', contorno: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }] })).toThrow(msg('md_tn_reg_simples'));
    s.undo();
    expect(R(s).contorno).toEqual(tri);
    s.redo();
    expect(R(s).contorno).toHaveLength(4);
  });
});

describe('apagar terreno apaga as regiões', () => {
  it('leva só as regiões do terreno apagado e o desfazer devolve tudo', () => {
    const s = comRegiao();
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn2', levelId: 'lv_0' }) });
    s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr2', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri }) });
    s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr3', levelId: 'lv_0', terrenoId: 'tn2', contorno: tri }) });
    const antes = structuredClone(s.project.elements);
    s.exec({ type: 'deleteElements', ids: ['tn1'] });
    expect(Object.keys(s.project.elements).sort()).toEqual(['tn2', 'tr3']);
    s.undo();
    expect(s.project.elements).toEqual(antes);
    s.redo();
    expect(Object.keys(s.project.elements).sort()).toEqual(['tn2', 'tr3']);
  });

  it('apagar só a região mantém o terreno', () => {
    const s = comRegiao();
    s.exec({ type: 'deleteElements', ids: ['tr1'] });
    expect(s.project.elements['tn1']).toBeDefined();
    expect(s.project.elements['tr1']).toBeUndefined();
  });
});
