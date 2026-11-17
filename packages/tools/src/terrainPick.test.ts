import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno, type CurvaNivelTN, type LinhaPlantaTN } from '@hestia/engine';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { pickTerrenoAt, pickTerrenosInBox, linhasDoTerreno, type LinhasDoTerreno } from './terrainPick.ts';

const T3 = 'tn_t3';
const borda: LinhaPlantaTN = { terrenoId: T3, fechada: true, pontos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
const curva: CurvaNivelTN = { terrenoId: T3, z: 3, mestra: false, fechada: true, pontos: [{ x: 6, y: 6 }, { x: 14, y: 6 }, { x: 14, y: 14 }, { x: 6, y: 14 }] };
const kernel: LinhasDoTerreno = { bordas: [borda], curvas: [curva] };
const semKernel: LinhasDoTerreno = { bordas: null, curvas: null };

describe('pickTerrenoAt: pela borda e pelas curvas, nunca pelo interior', () => {
  const p = projetoTerreno('T3');
  it('clique na borda e numa curva seleciona o terreno', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 0.05 }, 0.2, undefined, kernel)).toBe(T3);
    expect(pickTerrenoAt(p, 'lv_0', { x: 6.1, y: 10 }, 0.2, undefined, kernel)).toBe(T3);
  });
  it('clique no INTERIOR (longe da borda e das curvas) não seleciona', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 3, y: 10 }, 0.2, undefined, kernel)).toBeNull();
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 10 }, 0.2, undefined, kernel)).toBeNull();
  });
  it('fora da tolerância não seleciona; oculto não é alvo; outro nível não', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 0.5 }, 0.2, undefined, kernel)).toBeNull();
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 0 }, 0.2, new Set([T3]), kernel)).toBeNull();
    expect(pickTerrenoAt(p, 'lv_1', { x: 10, y: 0 }, 0.2, undefined, kernel)).toBeNull();
  });
  it('sem kernel vale a envoltória das fontes (a borda de reserva)', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 0.05 }, 0.2, undefined, semKernel)).toBe(T3);
    expect(pickTerrenoAt(p, 'lv_0', { x: 6.1, y: 10 }, 0.2, undefined, semKernel)).toBeNull();
  });
  it('projeto sem terreno: nada e sem consulta ao kernel', () => {
    const v = createEmptyProject();
    expect(linhasDoTerreno(v, 'lv_0')).toEqual(semKernel);
    expect(pickTerrenoAt(v, 'lv_0', { x: 0, y: 0 }, 1)).toBeNull();
  });
});

describe('região (T5): pelo contorno', () => {
  const p = projetoTerreno('T5');
  const linhas: LinhasDoTerreno = { bordas: [{ ...borda, terrenoId: 'tn_t5' }], curvas: [] };
  it('contorno seleciona a região; o interior da região não seleciona nada', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 5.05 }, 0.2, undefined, linhas)).toBe('rg_t5');
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 10 }, 0.2, undefined, linhas)).toBeNull();
  });
  it('a borda do terreno vence a região quando está mais perto', () => {
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 0.05 }, 0.2, undefined, linhas)).toBe('tn_t5');
  });
  it('empate: a região, que está por cima, vence', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    const colada: LinhasDoTerreno = { bordas: [{ terrenoId: 'tn_t5', fechada: true, pontos: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }] }], curvas: [] };
    expect(pickTerrenoAt(s.project, 'lv_0', { x: 10, y: 5 }, 0.2, undefined, colada)).toBe('rg_t5');
  });
});

describe('pickTerrenosInBox', () => {
  const p = projetoTerreno('T3');
  it('janela (esquerda para a direita) pega o terreno só se a borda toda está dentro', () => {
    expect(pickTerrenosInBox(p, 'lv_0', { x: -1, y: -1 }, { x: 21, y: 21 }, undefined, kernel)).toEqual([T3]);
    expect(pickTerrenosInBox(p, 'lv_0', { x: -1, y: -1 }, { x: 10, y: 21 }, undefined, kernel)).toEqual([]);
  });
  it('cruzamento (direita para a esquerda) pega se toca borda ou curva', () => {
    expect(pickTerrenosInBox(p, 'lv_0', { x: 25, y: 10 }, { x: 19, y: 12 }, undefined, kernel)).toEqual([T3]);
    expect(pickTerrenosInBox(p, 'lv_0', { x: 12, y: 8 }, { x: 8, y: 9 }, undefined, kernel)).toEqual([]);
    expect(pickTerrenosInBox(p, 'lv_0', { x: 8, y: 5 }, { x: 4, y: 7 }, undefined, kernel)).toEqual([T3]);
  });
  it('caixa inteira dentro do terreno, sem tocar linha nenhuma, não seleciona (interior)', () => {
    expect(pickTerrenosInBox(p, 'lv_0', { x: 9, y: 9 }, { x: 11, y: 11 }, undefined, kernel)).toEqual([]);
    expect(pickTerrenosInBox(p, 'lv_0', { x: 11, y: 11 }, { x: 9, y: 9 }, undefined, kernel)).toEqual([]);
  });
  it('oculto e outro nível ficam de fora; região entra pelo contorno', () => {
    expect(pickTerrenosInBox(p, 'lv_0', { x: -1, y: -1 }, { x: 21, y: 21 }, new Set([T3]), kernel)).toEqual([]);
    expect(pickTerrenosInBox(p, 'lv_1', { x: -1, y: -1 }, { x: 21, y: 21 }, undefined, kernel)).toEqual([]);
    const q = projetoTerreno('T5');
    expect(pickTerrenosInBox(q, 'lv_0', { x: 4, y: 4 }, { x: 16, y: 16 }, undefined, semKernel)).toEqual(['rg_t5']);
    expect(pickTerrenosInBox(q, 'lv_0', { x: 16, y: 10 }, { x: 14, y: 11 }, undefined, semKernel)).toEqual(['rg_t5']);
  });
});
