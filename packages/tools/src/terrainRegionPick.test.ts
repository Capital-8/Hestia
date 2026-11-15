import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, resolveFloors, resolveSlabs, servicoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab } from '@hestia/model';
import { centroDoContorno, elementoDeContornoSobPonto, terrenoSobPonto, terrenosSobPontos, verticesForaDoTerreno } from './terrainRegionPick.ts';

afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number) => ({ x, y });
const quadrado = (a: number, b: number) => [v(a, a), v(b, a), v(b, b), v(a, b)];

function cena() {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, 'T1');
  return s;
}

describe('terrenoSobPonto / terrenosSobPontos', () => {
  it('sem kernel: vale a envoltória das fontes (dentro devolve o terreno; fora, null)', () => {
    const { project } = cena();
    expect(terrenoSobPonto(project, v(10, 10))).toBe('tn_t1');
    expect(terrenoSobPonto(project, v(30, 10))).toBeNull();
    expect(terrenosSobPontos(project, [v(1, 1), v(-1, 1), v(19, 19)])).toEqual(['tn_t1', null, 'tn_t1']);
    expect(terrenosSobPontos(project, [])).toEqual([]);
  });

  it('com a borda do modelo, só a borda conta', () => {
    const s = cena();
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t1', ops: [{ op: 'setBorda', xy: [0, 0, 10, 0, 10, 10, 0, 10] }] });
    expect(terrenoSobPonto(s.project, v(5, 5))).toBe('tn_t1');
    expect(terrenoSobPonto(s.project, v(15, 15))).toBeNull();
  });

  it('com kernel: quem responde é o kernel (null no ponto = fora de todo terreno)', () => {
    const { project } = cena();
    const spy = vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockImplementation((_p, pts) => pts.map((q) => (q.x < 5 ? null : { z: 10, declividade: 0, terrenoId: 'tn_t1' })));
    expect(terrenosSobPontos(project, [v(1, 1), v(10, 10)])).toEqual([null, 'tn_t1']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('terreno com menos de 3 pontos não contém ninguém', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: { id: 'tn_v', kind: 'terrain', levelId: 'lv_0', name: 'V', pontos: [0, 0, 1], curvas: [], quebras: [], intervaloCurvas: 1, mestraCada: 5, espessuraBase: 3, mostrarExistente: false, linhasRotulo: [], pontosCotados: [] } });
    expect(terrenoSobPonto(s.project, v(0, 0))).toBeNull();
  });
});

describe('verticesForaDoTerreno', () => {
  it('conta só os vértices fora de todo terreno', () => {
    const { project } = cena();
    expect(verticesForaDoTerreno(project, quadrado(5, 15))).toBe(0);
    expect(verticesForaDoTerreno(project, quadrado(10, 25))).toBe(3);
    expect(verticesForaDoTerreno(project, [])).toBe(0);
  });
});

describe('elementoDeContornoSobPonto (laje e piso)', () => {
  it('piso: contorno resolvido e face inferior; laje vence o piso quando os dois estão sob o ponto', () => {
    const s = cena();
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: quadrado(2, 8) }) });
    const piso = elementoDeContornoSobPonto(s.project, 'lv_0', v(5, 5), 0.01)!;
    expect(piso.tipo).toBe('piso');
    expect(piso.faceInferior).toBeCloseTo(resolveFloors(s.project, 'lv_0')[0]!.bottomZ, 9);
    expect(piso.contorno).toHaveLength(4);
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', heightOffset: 3, boundary: quadrado(3, 7) }) });
    const laje = elementoDeContornoSobPonto(s.project, 'lv_0', v(5, 5), 0.01)!;
    expect(laje.tipo).toBe('laje');
    expect(laje.faceInferior).toBeCloseTo(resolveSlabs(s.project, 'lv_0')[0]!.bottomZ, 9);
    expect(laje.id).toBe('l1');
  });

  it('nada sob o clique, ou nível errado: null', () => {
    const s = cena();
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: quadrado(3, 7) }) });
    expect(elementoDeContornoSobPonto(s.project, 'lv_0', v(15, 15), 0.01)).toBeNull();
    expect(elementoDeContornoSobPonto(s.project, 'lv_1', v(5, 5), 0.01)).toBeNull();
  });

  it('laje com furo: o contorno copiado é o externo (a região é um polígono sem furos)', () => {
    const s = cena();
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: quadrado(2, 12), holes: [[v(5, 5), v(7, 5), v(7, 7), v(5, 7)]] }) });
    const el = elementoDeContornoSobPonto(s.project, 'lv_0', v(10, 10), 0.01)!;
    expect(el.contorno).toHaveLength(4);
    expect(el.contorno.every((q) => q.x === 2 || q.x === 12)).toBe(true);
  });
});

describe('centroDoContorno', () => {
  it('média dos vértices', () => {
    expect(centroDoContorno(quadrado(0, 10))).toEqual({ x: 5, y: 5 });
  });
});
