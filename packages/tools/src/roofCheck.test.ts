import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeRoof, ProjectStore, type Roof } from '@hestia/model';
import { addSegs, newDraft, setSegSlope, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter } from './perimeterCommit.ts';
import { roofCheck, roofPatchProblem, roofProblem, roofStepMessage } from './roofCheck.ts';

const RECT = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];

/** Pegada e inclinações do telhado com canto reentrante de projeto.hestia.json (degrau de 0,83 m entre beiral e empena). */
const PROJETO_FOOTPRINT = [
  { x: 39.261789, y: -3.683495 },
  { x: 42.032474, y: -3.683495 },
  { x: 42.031474, y: 0.223953 },
  { x: 35.5494415, y: -0.684715 },
  { x: 35.5303785, y: -4.909743000000001 },
  { x: 39.261789, y: -4.910743 },
];
const PROJETO_SLOPES: Array<number | null> = [null, 30, 30, 30, null, 30];

describe('recusa de alteração de telhado', () => {
  it('a mensagem da mansarda segue as unidades do projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    s.exec({
      type: 'addRoof',
      roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', slopePercent: 30, shape: 'hip', boundary: RECT, mansard: { lowerPercent: 100, upperPercent: 30, run: 4 } }),
    });
    expect(roofPatchProblem(s.project, ['r1'], { slopePercent: 30 })).toContain('400,0 cm');
  });

  it('roofCheck aceita contorno com degrau (projeto.hestia.json) e expõe steps para confirmação', () => {
    const s = new ProjectStore(createEmptyProject());
    const segs: NewSeg[] = PROJETO_FOOTPRINT.map((a, i) => ({ a, b: PROJETO_FOOTPRINT[(i + 1) % PROJETO_FOOTPRINT.length]! }));
    let draft = addSegs(newDraft('roof'), segs);
    PROJETO_SLOPES.forEach((sl, i) => {
      draft = setSegSlope(draft, draft.segs[i]!.id, sl === null ? { definesSlope: false } : { definesSlope: true, slopePct: sl });
    });
    const commit = commitPerimeter(s.project, draft, { typeId: 'rt_ceramica', levelId: 'lv_0', overhang: 0.5 });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.steps?.length).toBeGreaterThan(0);
    const added = (commit.commands[0] as { roof: Parameters<typeof makeRoof>[0] }).roof;
    // `makeRoof` devolve `Omit<Roof, 'order'>`; `roofCheck` pede o `Roof` completo, com a ordem.
    const roof: Roof = { ...makeRoof(added), order: 1 };
    const check = roofCheck(s.project, [roof]);
    expect(check.problem).toBeNull();
    expect(roofProblem(s.project, [roof])).toBeNull();
    expect(check.steps.length).toBeGreaterThan(0);
    const maxDz = Math.max(...check.steps.map((x) => x.dz));
    expect(maxDz).toBeCloseTo(0.83, 2);
    const msg = roofStepMessage(s.project, roof, check.steps, 'pt');
    expect(msg).toContain('0,83 m');
    expect(msg).toContain('beiral e empena');
  });
});
