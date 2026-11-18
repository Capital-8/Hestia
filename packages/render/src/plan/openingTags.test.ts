import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, makeWall, type Opening, type Project, type Wall } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { openingTagLabels } from './openingTags.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';

const wall = (): Wall => ({ ...makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), order: 1 });
const door = (extra: Partial<Opening> = {}): Opening => ({ id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 1.2, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...extra });
const window = (extra: Partial<Opening> = {}): Opening => ({ id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'w', offset: 2.8, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...extra });

function project(openings: Opening[]): Project {
  const p = createEmptyProject();
  const w = wall();
  p.elements[w.id] = w;
  for (const o of openings) p.elements[o.id] = o;
  return p;
}

const paint = defaultPaint('annotation', 100);

describe('etiquetas de portas e janelas', () => {
  it('sem showOpeningTags não devolve rótulo nenhum', () => {
    expect(openingTagLabels(project([door(), window()]), 'lv_0', paint, 100)).toHaveLength(0);
  });

  it('com showOpeningTags, um rótulo por esquadria com o código do tipo', () => {
    const p = project([door(), window()]);
    p.settings = { ...p.settings, showOpeningTags: true };
    const labels = openingTagLabels(p, 'lv_0', paint, 100);
    expect(labels).toHaveLength(2);
    expect(labels.map((l) => l.text).sort()).toEqual(['J-01', 'P-02']);
  });

  it('a porta recebe a etiqueta do lado oposto ao da abertura', () => {
    const p = project([door({ flipFacing: false })]);
    p.settings = { ...p.settings, showOpeningTags: true };
    const labels = openingTagLabels(p, 'lv_0', paint, 100);
    expect(labels[0]!.at.y).toBeLessThan(-0.1);
  });

  it('a janela de fachada recebe a etiqueta do lado externo da parede', () => {
    const p = project([window()]);
    p.settings = { ...p.settings, showOpeningTags: true };
    const labels = openingTagLabels(p, 'lv_0', paint, 100);
    expect(labels[0]!.at.y).toBeGreaterThan(0.15);
  });

  it('sem código no tipo, usa o nome', () => {
    const p = project([door()]);
    p.settings = { ...p.settings, showOpeningTags: true };
    p.openingTypes = { ...p.openingTypes, ot_p80: { ...p.openingTypes.ot_p80!, code: '', name: 'Porta curta' } };
    expect(openingTagLabels(p, 'lv_0', paint, 100).map((l) => l.text)).toEqual(['Porta curta']);
  });

  it('abertura oculta não recebe etiqueta', () => {
    const p = project([door(), window()]);
    p.settings = { ...p.settings, showOpeningTags: true };
    const labels = openingTagLabels(p, 'lv_0', paint, 100, new Set(['d']));
    expect(labels.map((l) => l.text)).toEqual(['J-01']);
  });

  it('o desenho da planta inclui a etiqueta quando a configuração está ligada', () => {
    const p = project([door()]);
    p.settings = { ...p.settings, showOpeningTags: true };
    p.nextOrder = 2;
    const input: PlanInput = {
      project: p,
      levelId: 'lv_0',
      resolved: resolveLevel(p, 'lv_0', new Map()),
      below: null,
      viewport: { cx: 2, cy: 0, zoom: 100, width: 800, height: 600 },
      theme: LIGHT,
      dark: false,
      selection: [],
      hover: null,
      preview: [],
      inference: null,
      showGrid: false,
    };
    expect(buildPlanDrawList(input).labels.map((l) => l.text)).toContain('P-02');
  });
});
