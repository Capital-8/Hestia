import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { LIGHT } from './types.ts';

/** Projeto com um L: parede A (4 m) e parede B (3 m) saindo do fim de A. */
function lProject(detail: 'coarse' | 'medium' | 'fine' = 'medium', extra: Partial<Project['settings']> = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'a', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'b', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 3 } }) });
  s.exec({ type: 'setSettings', patch: { detail, ...extra } });
  return s.project;
}

function draw(p: Project, zoom: number) {
  const resolved = resolveLevel(p, 'lv_0', new Map());
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
    resolved,
    below: null,
    viewport: { cx: 2, cy: 1.5, zoom, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
  };
  return buildPlanDrawList(input);
}

const hatched = (dl: ReturnType<typeof draw>): number => dl.fills.filter((f) => f.hatch).length;

describe('nível de detalhe da planta (H3)', () => {
  it('grosseiro: um preenchimento por cluster, sem hachura e sem linhas de camada', () => {
    const coarse = draw(lProject('coarse'), 100);
    expect(coarse.fills).toHaveLength(1);
    expect(hatched(coarse)).toBe(0);
    expect(coarse.strokes.length).toBeLessThan(draw(lProject('medium'), 100).strokes.length);
  });
  it('médio: um preenchimento por material; hachura só com zoom a partir de 40 px/m', () => {
    const medium = draw(lProject('medium'), 100);
    expect(medium.fills.length).toBeGreaterThan(1);
    expect(hatched(medium)).toBeGreaterThan(0);
    expect(hatched(draw(lProject('medium'), 10))).toBe(0);
  });
  it('fino: mais linhas que o médio e hachura mesmo em zoom baixo', () => {
    const medium = draw(lProject('medium'), 10);
    const fine = draw(lProject('fine'), 10);
    expect(fine.strokes.length).toBeGreaterThan(medium.strokes.length);
    expect(hatched(medium)).toBe(0);
    expect(hatched(fine)).toBeGreaterThan(0);
  });
  it('ordem em um L simples: grosseiro < médio <= fino em traços', () => {
    const counts = (d: 'coarse' | 'medium' | 'fine') => draw(lProject(d), 100).strokes.length;
    expect(counts('coarse')).toBeLessThan(counts('medium'));
    expect(counts('medium')).toBeLessThanOrEqual(counts('fine'));
  });
});

describe('etiquetas e depuração no desenho da planta', () => {
  it('desligadas por padrão: nenhum rótulo de tipo nem de junção', () => {
    expect(draw(lProject(), 100).labels).toHaveLength(0);
  });
  it('etiquetas de parede ligadas: o código de cada parede aparece', () => {
    const labels = draw(lProject('medium', { showTags: true }), 100).labels.map((l) => l.text);
    expect(labels.filter((t) => t === 'PA-14')).toHaveLength(2);
  });
  it('depuração de junção ligada: marcador B·1 no canto', () => {
    const labels = draw(lProject('medium', { debugJoins: true }), 100).labels.map((l) => l.text);
    expect(labels).toEqual(['B·1']);
  });
});
