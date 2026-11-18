import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { boundaryKindsOf } from '@hestia/engine/src/roofShapes.ts';
import { ProjectStore, createEmptyProject, makeRoof, type Project, type Roof } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { roofFills, roofSelectionOps } from './roofs.ts';
import { DARK, LIGHT, type StrokeOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

const P = (x: number, y: number) => ({ x, y });
const VIEW: Viewport = { cx: 4, cy: 3, zoom: 100, width: 800, height: 600 };
const RECT = [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)];

/** Projeto com um telhado; `roof` é o que `makeRoof` monta (sem a ordem, que o comando põe). */
function projetoCom(roof: ReturnType<typeof makeRoof>): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof });
  return s.project;
}

function input(p: Project, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
}

describe('símbolo "define inclinação" coerente com o motor', () => {
  it('telhado criado com makeRoof de forma gable e 4 arestas a 30 %: só as beiradas recebem triângulo cheio', () => {
    const p = projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RECT, heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }));
    // Arestas 0 e 2 seguem x (beiradas); 1 e 3 são empenas, pela leitura do motor.
    const kinds = boundaryKindsOf(p.elements.r as Roof);
    expect(kinds).toEqual(['eave', 'gable', 'eave', 'gable']);

    const o = roofSelectionOps(p, 'lv_0', ['r'], null, LIGHT, VIEW);
    expect(o.fills.filter((f) => f.color === LIGHT.accent)).toHaveLength(2);
    expect(o.strokes.filter((s) => s.closed && s.pts.length === 3 && s.color === LIGHT.inkSoft)).toHaveLength(2);

    // Os percentuais saem no meio das arestas de beiral (0 e 2), e não nas empenas.
    const at = o.labels.filter((l) => l.text === '30 %').map((l) => l.at);
    expect(at).toHaveLength(2);
    expect(at[0]!.x).toBeCloseTo(4, 9);
    expect(at[0]!.y).toBeCloseTo(-0.3, 9);
    expect(at[1]!.x).toBeCloseTo(4, 9);
    expect(at[1]!.y).toBeCloseTo(6.3, 9);
  });

  it('o contorno selecionado tracejado nas empenas segue o motor (2 corridas tracejadas, uma em cada empena)', () => {
    const p = projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RECT, heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }));
    const o = roofSelectionOps(p, 'lv_0', ['r'], null, LIGHT, VIEW);
    expect(o.strokes.filter((s) => s.dash && s.color === LIGHT.select)).toHaveLength(2);
  });
});

describe('planta pronta sem rosa (a pegada rosa é só do modo de edição)', () => {
  const FOOT = [P(0, 0), P(4, 0), P(4, 2), P(0, 2)];
  const EAVE = [P(-0.5, -0.5), P(4.5, -0.5), P(4.5, 2.5), P(-0.5, 2.5)];
  const roofCom = (over: Partial<Parameters<typeof makeRoof>[0]>) =>
    projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: EAVE, footprint: FOOT, edgeOverhangs: [0.5, 0.5, 0.5, 0.5], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0), ...over }));
  const rosas = (strokes: StrokeOp[], tema: typeof LIGHT) => strokes.filter((s) => s.color === tema.roofFootprint);

  it.each([
    ['claro', LIGHT, false],
    ['escuro', DARK, true],
  ] as const)('tema %s: com balanço, visível, oculto, projetado ou na planta inteira, nenhum traço rosa', (_n, tema, dark) => {
    const p = roofCom({});
    expect(rosas(roofFills(p, 'lv_0', tema, dark, 'medium', VIEW).strokes, tema)).toHaveLength(0);
    const oculto = roofFills(p, 'lv_0', tema, dark, 'medium', VIEW, { hidden: new Set(['r']), showProjection: true }).strokes;
    expect(rosas(oculto, tema)).toHaveLength(0);
    expect(oculto.filter((s) => s.dash && s.closed)).toHaveLength(1);
    expect(rosas(buildPlanDrawList(input(p)).strokes, tema)).toHaveLength(0);
  });

  it('projeção de telhado oculto é traço de projeção na tinta, com ou sem balanço', () => {
    for (const p of [roofCom({}), roofCom({ edgeOverhangs: [0, 0, 0, 0], boundary: FOOT })]) {
      const proj = roofFills(p, 'lv_0', LIGHT, false, 'medium', VIEW, { hidden: new Set(['r']), showProjection: true }).strokes.filter((s) => s.dash && s.closed);
      expect(proj.length).toBeGreaterThan(0);
      expect(proj.every((s) => s.color === LIGHT.ink)).toBe(true);
    }
  });

  it('os tokens do modo de edição permanecem (#c2185b claro, #ff6fb0 escuro)', () => {
    expect(LIGHT.roofFootprint).toBe('#c2185b');
    expect(DARK.roofFootprint).toBe('#ff6fb0');
  });
});
