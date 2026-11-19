import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Component } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { moveisSnapDoComponente } from './moveisSnapPlanta.ts';

describe('captura dos móveis: peças projetadas', () => {
  it('pé de 50 mm (350,350) num móvel em (2,1) dá cantos em (2,35; 1,35) e (2,4; 1,4) e meio em (2,375; 1,35)', () => {
    const p = createEmptyProject('t');
    const f = structuredClone(FAMILIA_ARMARIO);
    Object.assign(f, {
      id: 'fam_pe', parametros: f.parametros.filter((q) => ['L', 'A', 'P'].includes(q.id)), planos: [], aninhados: [], ferragens: [], tipos: [], tipoPadrao: undefined, caixaria: undefined, conectores: undefined, escolhas: undefined,
      pecas: [{ id: 'pe', nome: 'pe', papel: 'bloco', eixo: 'z', origem: ['350', '350', '0'], tamanho: ['50', '50'], espessura: '700' }],
    });
    aplicar(p, { type: 'upsertFamily', family: f });
    const c: Component = { id: 'c1', kind: 'component', familyId: 'fam_pe', typeId: null, levelId: p.levels[0]!.id, order: 1, x: 2, y: 1, z: 0, rotation: 0, mirrored: false, mark: 'c1' } as Component;
    const g = moveisSnapDoComponente(p, c);
    const tem = (x: number, y: number, kind: string) => g.points.some((q) => q.kind === kind && Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6);
    expect(tem(2.35, 1.35, 'endpoint')).toBe(true);
    expect(tem(2.4, 1.4, 'endpoint')).toBe(true);
    expect(tem(2.375, 1.35, 'midpoint')).toBe(true);
  });
});
