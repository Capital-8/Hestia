import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, type Project, type Wall } from '@hestia/model';
import { joinStatus } from './joins.ts';
import { levelFrames } from './resolveFrames.ts';

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** A: (0,0)-(3,0), altura `ha`, base 0. B: (3,0)-(3,3), com `extra`. Piso opcional cobrindo o ponto médio de B (3; 1,5), topo em `floorTop`. */
function build(ha: number, extra: Partial<Wall>, floorTop?: number): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, height: ha }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0 }, b: { x: 3, y: 3 }, height: 3, ...extra }) });
  if (floorTop !== undefined) s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: rect(2, 0, 4, 3), heightOffset: floorTop }) });
  return s.project;
}
const statusB = (p: Project) => joinStatus(levelFrames(p, 'lv_0'), 'B', 'a').kind;

describe('junção usa a faixa vertical real (com anexos)', () => {
  it('regressão: sem anexo, A [0; 2] e B [0; 3] se encontram (par)', () => {
    expect(statusB(build(2, {}))).toBe('pair');
  });

  it('regressão: sem anexo, A [0; 2] e B com base em 2,1 ([2,1; 5,1]) não se encontram (livre)', () => {
    expect(statusB(build(2, { baseOffset: 2.1 }))).toBe('free');
  });

  it('só se encontra pela cota real: B base 2,1 anexada a piso de topo 1 vira [1; 5,1] e cruza A [0; 2]', () => {
    const p = build(2, { baseOffset: 2.1, attachBottomToFloor: true }, 1);
    expect(statusB(p)).toBe('pair');
    expect(levelFrames(p, 'lv_0').find((f) => f.wall.id === 'B')!.z!.z0).toBeCloseTo(1, 9);
  });

  it('deixa de se encontrar: B [0; 3] anexada a piso de topo 2,5 vira [2,5; 3] e não cruza A [0; 2]', () => {
    const p = build(2, { attachBottomToFloor: true }, 2.5);
    expect(statusB(p)).toBe('free');
    const z = levelFrames(p, 'lv_0').find((f) => f.wall.id === 'B')!.z!;
    expect(z.z0).toBeCloseTo(2.5, 9);
    expect(z.top).toBeCloseTo(3, 9);
  });
});
