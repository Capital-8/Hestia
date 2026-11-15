import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type Project } from '@hestia/model';
import { buildLevelSolidsComCaixas } from './paredesInstanciadas3d.ts';
import { buildLevelSolids, type SolidBatch } from './solids.ts';

/** Nível do projeto (caminho do app: motor -> caixas instanciadas/geometria), parede reta 4 m inclinada, H=3, t=0,2. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
function proj(tilt: number, kind?: 'window' | 'door', plano?: 'vertical' | 'inclinado'): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  base.openingTypes.ot_jan = { ...base.openingTypes.ot_j120!, id: 'ot_jan', width: 1.2, height: 1.0, sill: 1.0, leaves: 0 };
  base.openingTypes.ot_por = { ...base.openingTypes.ot_p80!, id: 'ot_por', width: 0.9, height: 2.1, sill: 0, leaves: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt }) });
  if (kind) s.exec({ type: 'addOpening', opening: { id: 'o1', kind, typeId: kind === 'window' ? 'ot_jan' : 'ot_por', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(plano ? { plano } : {}) } as Opening });
  return s.project;
}
const vol = (bs: SolidBatch[]): number => {
  let v = 0;
  for (const b of bs) {
    const P = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
    for (let i = 0; i < b.indices.length; i += 3) {
      const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)] as [number[], number[], number[]];
      v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
    }
  }
  return v;
};
/** Volume do que o app desenha para a parede: mesmo caminho do `scene3d` (caixas se couber, senão geometria). */
function volApp(p: Project): { caixas: number; v: number } {
  const r = buildLevelSolidsComCaixas(resolveLevel(p, 'lv_0'), undefined, false);
  return { caixas: r.caixas.length, v: vol(r.batches) };
}

describe('parede inclinada no caminho do app (projeto -> motor -> sólido)', () => {
  it('parede inclinada nunca vira caixa vertical instanciada', () => {
    expect(volApp(proj(20)).caixas).toBe(0);
    expect(volApp(proj(20, 'window')).caixas).toBe(0);
    expect(volApp(proj(20, 'door')).caixas).toBe(0);
    expect(buildLevelSolids(resolveLevel(proj(20), 'lv_0')).batches.length).toBeGreaterThan(0);
  });
  it('janela (padrão) na parede 15°: tiltCuts e volume retirado 0,2400; topo do vão 1,9659', () => {
    const cheia = volApp(proj(15)).v;
    const rl = resolveLevel(proj(15, 'window'), 'lv_0');
    expect(rl.walls.w1!.tiltCuts).toHaveLength(1);
    expect(cheia - volApp(proj(15, 'window')).v).toBeCloseTo(0.24, 4);
    const c = rl.walls.w1!.tiltCuts![0]!;
    // Planta: o retângulo do furo é o de sempre (centro no offset, meia largura 0,6).
    expect(c.cx).toBeCloseTo(2, 6);
    expect(c.halfW).toBeCloseTo(0.6, 6);
    expect(c.z0).toBeCloseTo(1, 6);
    expect(c.z1).toBeCloseTo(2, 6);
  });
  it('porta (padrão) e janela com plano vertical: sem corte inclinado', () => {
    expect(resolveLevel(proj(15, 'door'), 'lv_0').walls.w1!.tiltCuts).toBeUndefined();
    expect(resolveLevel(proj(15, 'window', 'vertical'), 'lv_0').walls.w1!.tiltCuts).toBeUndefined();
    expect(resolveLevel(proj(15, 'door', 'inclinado'), 'lv_0').walls.w1!.tiltCuts).toHaveLength(1);
  });
});
