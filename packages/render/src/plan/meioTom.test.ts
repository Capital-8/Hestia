import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Id, type Project } from '@hestia/model';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';

/*
 * Meio-tom da disciplina no desenho (decisão 0060 §4.3, etapa 3.2). Valores LITERAIS calculados à mão:
 * cor = mistura do cinza da planta (#7a828c) com o papel (#fbfbfa) em 35 % -> #a7acb3; peso de projeção mínimo = 1 px.
 * Projeto: duas paredes retas no lv_0 (w0 em y = 0, w1 em y = 3). Sem meio-tom o desenho é o de hoje; com w1 em
 * meio-tom ela sai da geometria normal e volta como contorno atenuado, sem preenchimento nem hachura.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
const COR_MEIO_TOM = '#a7acb3';

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(4, 0) }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 3), b: P(4, 3) }) });
  return s.project;
}

const entrada = (p: Project, extra: Partial<PlanInput> = {}): PlanInput => ({
  project: p,
  levelId: 'lv_0',
  resolved: resolveLevel(p, 'lv_0'),
  below: null,
  viewport: { cx: 2, cy: 1.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
  ...extra,
});

describe('meio-tom no desenho da planta', () => {
  it('sem meio-tom (ausente ou conjunto vazio) o resultado é idêntico: o golden não muda', () => {
    const p = projeto();
    const semCampo = buildPlanGeometry(entrada(p));
    const conjuntoVazio = buildPlanGeometry(entrada(p, { halftone: new Set<Id>() }));
    expect(conjuntoVazio).toEqual(semCampo);
    expect(semCampo.strokes.some((s) => s.color === COR_MEIO_TOM)).toBe(false);
  });

  it('elemento em meio-tom sai atenuado: peso 1 px e cor literal, sem preenchimento nem hachura', () => {
    const ops = buildPlanGeometry(entrada(projeto(), { halftone: new Set(['w1']) }));
    const atenuados = ops.strokes.filter((s) => s.color === COR_MEIO_TOM);
    expect(atenuados.length).toBeGreaterThan(0);
    for (const s of atenuados) {
      expect(s.widthPx).toBe(1);
      expect(s.alpha).toBe(1);
      expect(s.closed).toBe(true);
    }
    // O meio-tom é só contorno: nenhum preenchimento dele e, por consequência, nenhuma hachura de corte.
    expect(ops.fills.filter((f) => f.color === COR_MEIO_TOM)).toEqual([]);
    expect(ops.fills.filter((f) => f.hatch && f.color === COR_MEIO_TOM)).toEqual([]);
  });

  it('meio-tom fica atrás do desenho normal (primeiro nos traços)', () => {
    const ops = buildPlanGeometry(entrada(projeto(), { halftone: new Set(['w1']) }));
    const primeiroMeioTom = ops.strokes.findIndex((s) => s.color === COR_MEIO_TOM);
    const primeiroNormal = ops.strokes.findIndex((s) => s.color !== COR_MEIO_TOM);
    expect(primeiroMeioTom).toBe(0);
    expect(primeiroNormal).toBeGreaterThan(primeiroMeioTom);
  });

  it('o oculto vence o tom: em hidden e halftone, o elemento não volta atenuado', () => {
    const ops = buildPlanGeometry(entrada(projeto(), { halftone: new Set(['w1']), hidden: new Set(['w1']) }));
    expect(ops.strokes.some((s) => s.color === COR_MEIO_TOM)).toBe(false);
  });
});

describe('chave do quadro: muda quando o conjunto de meio-tom muda', () => {
  const estado = (p: Project, halftone?: ReadonlySet<Id>): PlanViewState => ({
    project: p, version: 1, levelId: 'lv_0', v: { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 }, theme: LIGHT, dark: false, gpu: false, showGrid: false,
    showUnderlay: false, showRoofProjection: false, thinLines: false, selection: [], hover: null, preview: [], inference: null, resolve: (id) => resolveLevel(p, id),
    ...(halftone ? { halftone } : {}),
  });

  it('conjuntos diferentes mudam a chave; o mesmo conjunto e o vazio mantêm a de hoje', () => {
    const p = projeto();
    const sem = planFrameUpdateOf(estado(p));
    expect(planFrameUpdateOf(estado(p, new Set<Id>())).geometryKey).toBe(sem.geometryKey);
    const a = planFrameUpdateOf(estado(p, new Set(['w1'])));
    const b = planFrameUpdateOf(estado(p, new Set(['w0'])));
    expect(a.geometryKey).not.toBe(sem.geometryKey);
    expect(b.geometryKey).not.toBe(a.geometryKey);
    expect(a.overlayKey).not.toBe(sem.overlayKey);
    expect(planFrameUpdateOf(estado(p, new Set(['w1']))).geometryKey).toBe(a.geometryKey);
  });
});
