import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeTerrain, ProjectStore } from '@hestia/model';
import { geometriaDoItemDeTerreno, itemDeTerrenoDoId, itemDeTerrenoNoPonto, itensDeTerrenoNaJanela, removerItensDeTerreno } from './terrainItensPick.ts';

function projeto() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0', pontos: [0, 0, 1, 10, 0, 1, 10, 10, 1], linhasRotulo: [1, 1, 3, 1], pontosCotados: [5, 5, 8, 8] }) });
  return s.project;
}

describe('itens de anotação do terreno', () => {
  it('interpreta o id sintético', () => {
    expect(itemDeTerrenoDoId('tn1#cotado:3')).toEqual({ terrenoId: 'tn1', tipo: 'cotado', i: 3 });
    expect(itemDeTerrenoDoId('tn1')).toBeNull();
  });
  it('acha a cota de ponto a 12 px e a linha de rótulo a 6 px (mpp = 0,01 m)', () => {
    const p = projeto();
    expect(itemDeTerrenoNoPonto(p, 'lv_0', { x: 5.1, y: 5 }, 0.01)).toBe('tn1#cotado:0');
    expect(itemDeTerrenoNoPonto(p, 'lv_0', { x: 5.2, y: 5 }, 0.01)).toBeNull();
    expect(itemDeTerrenoNoPonto(p, 'lv_0', { x: 2, y: 1.05 }, 0.01)).toBe('tn1#rotulo:0');
    expect(itemDeTerrenoNoPonto(p, 'lv_0', { x: 2, y: 1.2 }, 0.01)).toBeNull();
    expect(itemDeTerrenoNoPonto(p, 'lv_x', { x: 5, y: 5 }, 0.01)).toBeNull();
  });
  it('geometria para o realce', () => {
    const p = projeto();
    expect(geometriaDoItemDeTerreno(p, 'tn1#cotado:1')).toEqual({ ponto: { x: 8, y: 8 } });
    expect(geometriaDoItemDeTerreno(p, 'tn1#rotulo:0')).toEqual({ a: { x: 1, y: 1 }, b: { x: 3, y: 1 } });
    expect(geometriaDoItemDeTerreno(p, 'tn1#cotado:9')).toBeNull();
  });
  it('janela: contém (esquerda para direita) e cruza (direita para esquerda)', () => {
    const p = projeto();
    expect(itensDeTerrenoNaJanela(p, 'lv_0', { x: 4, y: 4 }, { x: 6, y: 6 })).toEqual(['tn1#cotado:0']);
    expect(itensDeTerrenoNaJanela(p, 'lv_0', { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([]);
    expect(itensDeTerrenoNaJanela(p, 'lv_0', { x: 2, y: 2 }, { x: 0, y: 0 })).toEqual(['tn1#rotulo:0']);
  });
  it('remove só os índices pedidos, um comando por terreno', () => {
    const p = projeto();
    const c = removerItensDeTerreno(p, ['tn1#cotado:0', 'tn1#rotulo:0', 'outro']);
    expect(c).toEqual([{ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'setPontosCotados', v: [8, 8] }, { op: 'setLinhasRotulo', v: [] }] }]);
  });
});
