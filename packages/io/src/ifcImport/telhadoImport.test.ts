import { describe, expect, it } from 'vitest';
import type { Project, Roof } from '@hestia/model';
import { importIfc } from './index.ts';
import { ifcBoxes, meshProduct } from './ifcTestKit.ts';

const telhados = (p: Project): Roof[] => Object.values(p.elements).filter((e): e is Roof => e.kind === 'roof');
const genericos = (p: Project): string[] => Object.values(p.elements).filter((e) => e.kind === 'generic').map((e) => (e as { sourceClass: string }).sourceClass);

/** Chapa retangular 6 x 4 m subindo para +y: 4 m em planta, 0,8 m de subida (20%), cota de beiral 3 m. */
const chapa = (): [number[][], number[][]] => [
  [[0, 0, 3], [6, 0, 3], [6, 4, 3.8], [0, 4, 3.8]],
  [[1, 2, 3], [1, 3, 4]],
];

describe('addRoofs: águas planas', () => {
  it('IFCROOF de uma chapa inclinada vira telhado de uma água livre', () => {
    const [v, f] = chapa();
    const { project, report } = importIfc(ifcBoxes([], meshProduct(1, 'IFCROOF', 'Cobertura', v, f, '.NOTDEFINED.')));
    const r = telhados(project);
    expect(r).toHaveLength(1);
    expect(r[0]!.shape).toBe('free');
    expect(r[0]!.planes).toHaveLength(1);
    expect(r[0]!.planes[0]!.percent).toBeCloseTo(20, 2);
    expect(r[0]!.planes[0]!.up.y).toBeCloseTo(1, 6);
    expect(r[0]!.boundary).toHaveLength(4);
    expect(r[0]!.heightOffset + (project.levels.find((l) => l.id === r[0]!.levelId)?.elevation ?? 0)).toBeCloseTo(3, 3);
    expect(report.imported.telhados).toBe(1);
    expect(genericos(project)).toEqual([]);
  });

  it('IFCSLAB ROOF inclinada vira telhado (não laje horizontal)', () => {
    const [v, f] = chapa();
    const { project, report } = importIfc(ifcBoxes([], meshProduct(1, 'IFCSLAB', 'Telha', v, f, '.ROOF.')));
    expect(telhados(project)).toHaveLength(1);
    expect(report.imported.lajes).toBeUndefined();
  });

  it('IFCSLAB ROOF horizontal continua laje', () => {
    const { project } = importIfc(ifcBoxes([{ id: 1, type: 'IFCSLAB', name: 'Cob', x: 0, y: 0, z: 3, dx: 6, dy: 4, dz: 0.2, tail: '.ROOF.' }]));
    expect(telhados(project)).toHaveLength(0);
    expect(Object.values(project.elements).some((e) => e.kind === 'slab')).toBe(true);
  });

  it('duas águas num só produto (cumeeira): não converte; laje de telhado vira genérico com aviso', () => {
    const v = [[0, 0, 3], [6, 0, 3], [6, 2, 4], [0, 2, 4], [6, 4, 3], [0, 4, 3]];
    const f = [[1, 2, 3], [1, 3, 4], [4, 3, 5], [4, 5, 6]];
    const { project, report } = importIfc(ifcBoxes([], meshProduct(1, 'IFCSLAB', 'Duas aguas', v, f, '.ROOF.')));
    expect(telhados(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['IFCSLAB']);
    expect(report.warnings.some((w) => w.includes('Duas aguas'))).toBe(true);
  });

  it('contorno côncavo (L) não converte', () => {
    const z = (y: number): number => 3 + y * 0.2;
    const v = [[0, 0, z(0)], [6, 0, z(0)], [6, 2, z(2)], [2, 2, z(2)], [2, 5, z(5)], [0, 5, z(5)]];
    const f = [[1, 2, 3], [1, 3, 4], [1, 4, 5], [1, 5, 6]];
    const { project } = importIfc(ifcBoxes([], meshProduct(1, 'IFCROOF', 'L', v, f, '.NOTDEFINED.')));
    expect(telhados(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['IFCROOF']);
  });

  it('inclinação acima de 300% não converte', () => {
    const v = [[0, 0, 0], [1, 0, 0], [1, 1, 5], [0, 1, 5]];
    const { project } = importIfc(ifcBoxes([], meshProduct(1, 'IFCROOF', 'Muito inclinada', v, [[1, 2, 3], [1, 3, 4]], '.NOTDEFINED.')));
    expect(telhados(project)).toHaveLength(0);
  });
});
