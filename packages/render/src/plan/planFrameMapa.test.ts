import { afterEach, describe, expect, it } from 'vitest';
import { resolveLevel, definirMapaCorteAterro } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeTerrain, type Project } from '@hestia/model';
import { planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';

const estado = (p: Project): PlanViewState => ({
  project: p, version: 1, levelId: 'lv_0', v: { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 }, theme: LIGHT, dark: false, gpu: false, showGrid: false,
  showUnderlay: false, showRoofProjection: false, thinLines: false, selection: [], hover: null, preview: [], inference: null, resolve: (id) => resolveLevel(p, id),
});

afterEach(() => definirMapaCorteAterro(false));

describe('chave da geometria da planta e o mapa de corte e aterro', () => {
  it('ligar o mapa muda a chave da geometria (sem isso a planta não se repinta ao ligar, E2E Q1b)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0' }) });
    const desligado = planFrameUpdateOf(estado(s.project)).geometryKey;
    definirMapaCorteAterro(true);
    const ligado = planFrameUpdateOf(estado(s.project)).geometryKey;
    expect(ligado).not.toBe(desligado);
    definirMapaCorteAterro(false);
    expect(planFrameUpdateOf(estado(s.project)).geometryKey).toBe(desligado);
  });

  it('sem terreno no projeto a chave não depende do mapa', () => {
    const p = createEmptyProject();
    const a = planFrameUpdateOf(estado(p)).geometryKey;
    definirMapaCorteAterro(true);
    expect(planFrameUpdateOf(estado(p)).geometryKey).toBe(a);
  });
});
