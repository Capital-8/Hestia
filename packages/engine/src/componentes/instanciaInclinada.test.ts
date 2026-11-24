import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, levelElevation, matrizDoComponente, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { malhaDoComponente, resolverComponente } from './instancia.ts';
import { malhaDasPecas } from './malha.ts';

/** Projeto com o armário de referência; a instância fica em (1, 2) no nível 0. */
function projeto(): Project {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return p;
}

function comp(p: Project, extra: Partial<Component> = {}): Component {
  return {
    id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1,
    x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'M', ...extra,
  };
}

/** Limites (mín, máx) de um eixo dos vértices planos `positions` (eixo: 0 = x, 1 = y, 2 = z). */
function limites(positions: number[], eixo: number): [number, number] {
  const valores = positions.filter((_, i) => i % 3 === eixo);
  return [Math.min(...valores), Math.max(...valores)];
}

describe('malha da instância com inclinação 3D (B3b)', () => {
  it('a malha é a matriz da instância aplicada à malha local (posição com translação, altura do nível)', () => {
    const p = projeto();
    const c = comp(p, { inclinacao: [Math.PI / 2, 0.3] });
    const res = resolverComponente(p, c);
    const local = malhaDasPecas(res.pecas).solidas.positions;
    const mundo = malhaDoComponente(p, c, res).solidas.positions;
    const m = matrizDoComponente({ ...c, z: levelElevation(p, c.levelId) + c.z });
    expect(mundo.length).toBe(local.length);
    for (let i = 0; i < local.length; i += 3) {
      const [x, y, z] = [local[i]!, local[i + 1]!, local[i + 2]!];
      expect(mundo[i]).toBeCloseTo(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, 9);
      expect(mundo[i + 1]).toBeCloseTo(m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, 9);
      expect(mundo[i + 2]).toBeCloseTo(m[2]! * x + m[6]! * y + m[10]! * z + m[14]!, 9);
    }
  });

  it('inclinação de π/2 em Y põe o eixo Z local no X do mundo e o X local no Z (negativo)', () => {
    const p = projeto();
    const c = comp(p, { inclinacao: [Math.PI / 2, 0] });
    const res = resolverComponente(p, c);
    const local = malhaDasPecas(res.pecas).solidas.positions;
    const mundo = malhaDoComponente(p, c, res).solidas.positions;
    const [lxMin, lxMax] = limites(local, 0);
    const [lzMin, lzMax] = limites(local, 2);
    const [mxMin, mxMax] = limites(mundo, 0);
    const [mzMin, mzMax] = limites(mundo, 2);
    const elevacao = levelElevation(p, c.levelId);
    expect(mxMin).toBeCloseTo(c.x + lzMin, 6);
    expect(mxMax).toBeCloseTo(c.x + lzMax, 6);
    expect(mzMin).toBeCloseTo(elevacao - lxMax, 6);
    expect(mzMax).toBeCloseTo(elevacao - lxMin, 6);
  });

  it('sem inclinação ou com [0, 0] a malha é exatamente a de sempre', () => {
    const p = projeto();
    const semCampo = malhaDoComponente(p, comp(p));
    const zero = malhaDoComponente(p, comp(p, { inclinacao: [0, 0] }));
    expect(zero.solidas.positions).toEqual(semCampo.solidas.positions);
    expect(zero.solidas.normals).toEqual(semCampo.solidas.normals);
    expect(zero.solidas.indices).toEqual(semCampo.solidas.indices);
    expect(zero.vazios.positions).toEqual(semCampo.vazios.positions);
  });

  it('espelhada e inclinada: os triângulos trocam de orientação como na instância espelhada sem inclinação', () => {
    const p = projeto();
    const espelhada = malhaDoComponente(p, comp(p, { mirrored: true }));
    const espelhadaInclinada = malhaDoComponente(p, comp(p, { mirrored: true, inclinacao: [0, 0] }));
    expect(espelhadaInclinada.solidas.indices).toEqual(espelhada.solidas.indices);
  });
});
