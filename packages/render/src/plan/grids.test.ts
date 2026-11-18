import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, DEFAULT_GRID_TYPE_ID, type Grid, type GridType, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { comprimento, eixoDaGrade, gridOps, pedacos, trecho } from './grids.ts';
import { DARK, LIGHT } from './types.ts';

const tipoBase = (over: Partial<GridType> = {}): GridType => ({
  id: 'gt_teste',
  name: 'Teste',
  centerSegment: 'continuous',
  endLengthMm: 25,
  weightMm: 0.25,
  color: null,
  pattern: 'solid',
  centerWeightMm: 0.18,
  centerColor: null,
  centerPattern: 'solid',
  bubbleDiameterMm: 8,
  bubbleTextMm: 3,
  ...over,
});

const grade = (over: Partial<Grid> = {}): Grid => ({
  id: 'g1',
  name: '1',
  typeId: 'gt_teste',
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  sag: 0,
  bubbleStart: false,
  bubbleEnd: true,
  order: 0,
  ...over,
});

/** Projeto com uma grade e um tipo de teste (o padrão do Hestia fica de fora, como no arquivo novo). */
function projeto(g: Grid, t: GridType = tipoBase()): Project {
  return { ...createEmptyProject(), grids: [g], gridTypes: { [t.id]: t } };
}

/** Comprimento total (m) que os traços cobrem. */
const coberto = (strokes: { pts: { x: number; y: number }[] }[]): number => strokes.reduce((acc, s) => acc + comprimento(s.pts), 0);

describe('grade: eixo', () => {
  it('reta usa os dois pontos', () => {
    expect(eixoDaGrade(grade())).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('arco com flecha positiva abaula à esquerda de início→fim', () => {
    const eixo = eixoDaGrade(grade({ sag: 1 }));
    expect(eixo.length).toBeGreaterThan(2);
    expect(Math.max(...eixo.map((q) => q.y))).toBeCloseTo(1, 2);
    expect(eixo[0]!.x).toBeCloseTo(0, 9);
    expect(eixo.at(-1)!.x).toBeCloseTo(10, 9);
  });

  it('multissegmento mantém o vértice do meio', () => {
    const eixo = eixoDaGrade(grade({ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }));
    expect(eixo).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]);
    expect(comprimento(eixo)).toBeCloseTo(7, 9);
  });
});

describe('grade: trecho e padrão de traço', () => {
  it('trecho pega a parte entre duas distâncias, pelos vértices do meio', () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
    expect(trecho(pts, 2, 5)).toEqual([{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }]);
  });

  it('traço-ponto tem pedaços longos e pontinhos (muito curtos)', () => {
    const mmM = 100 / 1000;
    const pedaços = pedacos([{ x: 0, y: 0 }, { x: 10, y: 0 }], 'dashdot', mmM);
    const tamanhos = pedaços.map((pc) => comprimento(pc));
    expect(Math.max(...tamanhos)).toBeCloseTo(12 * mmM, 9);
    // O pontinho (0,6 mm de papel) é bem menor que o traço longo (12 mm).
    expect(tamanhos.some((l) => l > 0 && l < (12 * mmM) / 4)).toBe(true);
  });

  it('linha sólida sai inteira, sem cortes', () => {
    expect(pedacos([{ x: 0, y: 0 }, { x: 10, y: 0 }], 'solid', 0.1)).toHaveLength(1);
  });
});

describe('grade: desenho', () => {
  it('reta contínua cobre a linha inteira, com o peso do tipo em mm de papel', () => {
    const o = gridOps(projeto(grade({ bubbleEnd: false })), 100, 50, LIGHT);
    expect(coberto(o.strokes)).toBeCloseTo(10, 6);
    expect(o.strokes[0]!.papel).toEqual({ mm: 0.25, escala: 100 });
    expect(o.strokes[0]!.widthPx).toBeCloseTo((0.25 * 50 * 100) / 1000, 9);
    expect(o.strokes[0]!.color).toBe(LIGHT.ink);
  });

  it("segmento central 'none' deixa só as pontas, de endLengthMm de papel cada uma", () => {
    const t = tipoBase({ centerSegment: 'none', endLengthMm: 25 });
    const o = gridOps(projeto(grade({ bubbleEnd: false }), t), 100, 50, LIGHT);
    expect(coberto(o.strokes)).toBeCloseTo(5, 6);
    // Nenhum traço passa do meio da linha: o centro some.
    expect(o.strokes.some((s) => s.pts.some((q) => q.x > 2.6 && q.x < 7.4))).toBe(false);
  });

  it("segmento central 'none' em grade curta: as pontas tomam a linha toda, sem sobrar centro", () => {
    const t = tipoBase({ centerSegment: 'none', endLengthMm: 25 });
    const curta = grade({ points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], bubbleEnd: false });
    const o = gridOps(projeto(curta, t), 100, 50, LIGHT);
    expect(coberto(o.strokes)).toBeCloseTo(3, 6);
  });

  it("segmento central 'custom' desenha o centro com o traço próprio", () => {
    const t = tipoBase({ centerSegment: 'custom', endLengthMm: 25, centerWeightMm: 0.13, centerColor: '#ff0000' });
    const o = gridOps(projeto(grade({ bubbleEnd: false }), t), 100, 50, LIGHT);
    expect(coberto(o.strokes)).toBeCloseTo(10, 6);
    const centro = o.strokes.find((s) => s.color === '#ff0000');
    expect(centro?.papel?.mm).toBe(0.13);
    expect(o.strokes.filter((s) => s.color !== '#ff0000').every((s) => s.papel?.mm === 0.25)).toBe(true);
  });

  it('bolha no fim: círculo tangente à ponta e nome centrado nele; sem bolha no início', () => {
    const o = gridOps(projeto(grade({ bubbleStart: false, bubbleEnd: true })), 100, 50, LIGHT);
    expect(o.labels).toHaveLength(1);
    const lab = o.labels[0]!;
    expect(lab.text).toBe('1');
    expect(lab.center).toBe(true);
    // Raio = 4 mm de papel a 1:100 = 0,4 m, afastado da ponta (10, 0) no sentido da linha.
    expect(lab.at.x).toBeCloseTo(10.4, 9);
    expect(lab.at.y).toBeCloseTo(0, 9);
    expect(lab.papel).toEqual({ escala: 100, fontMm: 3 });
    const circ = o.strokes.find((s) => s.closed)!;
    expect(circ.pts.some((q) => Math.abs(q.x - 10) < 1e-9 && Math.abs(q.y) < 1e-9)).toBe(true);
  });

  it('bolhas nas duas pontas, cada uma para fora da sua ponta', () => {
    const o = gridOps(projeto(grade({ bubbleStart: true, bubbleEnd: true })), 100, 50, LIGHT);
    const xs = o.labels.map((l) => l.at.x).sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(-0.4, 9);
    expect(xs[1]).toBeCloseTo(10.4, 9);
  });

  it('cor do tipo null segue a tinta do tema, nos dois temas; cor fixa vale', () => {
    const claro = gridOps(projeto(grade()), 100, 50, LIGHT);
    const escuro = gridOps(projeto(grade()), 100, 50, DARK);
    expect(claro.strokes[0]!.color).toBe(LIGHT.ink);
    expect(escuro.strokes[0]!.color).toBe(DARK.ink);
    const fixa = gridOps(projeto(grade(), tipoBase({ color: '#00aa00' })), 100, 50, LIGHT);
    expect(fixa.strokes[0]!.color).toBe('#00aa00');
  });

  it('grade selecionada sai na cor de seleção do tema, bolha inclusa', () => {
    const o = gridOps(projeto(grade()), 100, 50, LIGHT, ['g1']);
    expect(o.strokes.every((s) => s.color === LIGHT.select)).toBe(true);
    expect(o.labels).toHaveLength(1);
  });

  it('grade cujo tipo sumiu não sai', () => {
    const p = { ...createEmptyProject(), grids: [grade({ typeId: 'nao_existe' })] };
    expect(gridOps(p, 100, 50, LIGHT).strokes).toHaveLength(0);
  });

  it('a grade aparece na planta de qualquer nível, por baixo das anotações e por cima do modelo', () => {
    const p = { ...projeto(grade({ typeId: DEFAULT_GRID_TYPE_ID, bubbleEnd: true })), gridTypes: undefined };
    const input: PlanInput = {
      project: p,
      levelId: 'lv_0',
      resolved: resolveLevel(p, 'lv_0', new Map()),
      below: null,
      viewport: { cx: 2, cy: 1.5, zoom: 50, width: 800, height: 600 },
      theme: LIGHT,
      dark: false,
      selection: [],
      hover: null,
      preview: [],
      inference: null,
      showGrid: false,
    };
    const dl = buildPlanDrawList(input);
    expect(dl.labels.some((l) => l.text === '1' && l.center)).toBe(true);
    const outro = buildPlanDrawList({ ...input, levelId: 'lv_1', resolved: resolveLevel(p, 'lv_1', new Map()) });
    expect(outro.labels.some((l) => l.text === '1' && l.center)).toBe(true);
  });
});
