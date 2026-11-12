import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { DEFAULT_AREA_GRAPHICS, floorViewId, migrateProject, ProjectStore, withViewPatchOfTest, type Project } from '@hestia/model';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { areaPlanProfile, FLOOR_PLAN_PROFILE, LIGHT } from './types.ts';

/**
 * Raia E: a planta de área desenha as etiquetas de elemento (`ElementTag`) SÓ da própria vista. A migração 23 → 24 copiou
 * as do nível para as plantas que as desenhavam (id `<id>__<idDaVista>`); antes o desenho as lia da planta de piso na
 * hora de desenhar. Os projetos são os do ouro (v23): 03 (herda) e 04 (própria e vazia), com uma etiqueta "PE-19" no nível.
 */

const DIR = new URL('../../../../tests/vistas-ouro/projetos/', import.meta.url);
const bruto = (f: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Record<string, unknown>;
const migrado = (f: string): Project => migrateProject(bruto(f));
const V = { cx: 5, cy: 3, zoom: 100, width: 1200, height: 800 };
const PISO = floorViewId('lv_0');

function entrada(p: Project, viewId: string, over: Partial<PlanInput> = {}): PlanInput {
  return { project: p, levelId: 'lv_0', resolved: resolveLevel(p, 'lv_0', new Map()), below: null, viewId, viewport: V, theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false, ...over };
}
const etiquetas = (p: Project, viewId: string, over: Partial<PlanInput> = {}) => buildPlanGeometry(entrada(p, viewId, over)).labels.filter((l) => l.text === 'PE-19');
/** Traços de chamada das etiquetas (do ponto de ancoragem até a etiqueta, em (5, -0.6)). */
const chamadas = (p: Project, viewId: string) => buildPlanGeometry(entrada(p, viewId)).strokes.filter((s) => !s.closed && s.pts.length === 2 && s.pts.some((q) => q.x === 5 && q.y === -0.6));

describe('planta de área: etiquetas de elemento só da vista (raia E)', () => {
  it('conjunto próprio: desenha a etiqueta própria e a cópia do nível, na posição de sempre', () => {
    const p = migrado('04-area-anotacoes-proprias.json');
    const labels = etiquetas(p, 'ap_propria');
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l.at).toEqual({ x: 5, y: -0.6 });
    expect(chamadas(p, 'ap_propria')).toHaveLength(2);
  });

  it('`annotations: {}`: desenha só a cópia do nível', () => {
    const p = migrado('04-area-anotacoes-proprias.json');
    expect(etiquetas(p, 'ap_vazia')).toHaveLength(1);
  });

  it('planta que herdava: a etiqueta sai uma vez (a cópia), não mais duas', () => {
    const p = migrado('03-area-herda-anotacoes.json');
    expect(etiquetas(p, 'ap_herda')).toHaveLength(1);
    expect(chamadas(p, 'ap_herda')).toHaveLength(1);
  });

  it('etiqueta criada no piso depois da migração não aparece na área; a área é independente', () => {
    const s = new ProjectStore(migrado('04-area-anotacoes-proprias.json'));
    s.exec({ type: 'addTag', levelId: 'lv_0', viewId: PISO, item: { id: 'tg_novo', hostId: 'h_s', at: { x: 9, y: 9 }, property: 'type' } });
    expect(etiquetas(s.project, PISO)).toHaveLength(2);
    expect(etiquetas(s.project, 'ap_propria')).toHaveLength(2);
    expect(etiquetas(s.project, 'ap_propria').filter((l) => l.at.x === 9)).toHaveLength(0);
    expect(etiquetas(s.project, PISO).filter((l) => l.at.x === 9)).toHaveLength(1);
    // O contrário também: etiqueta criada na área não vai para o piso.
    s.exec({ type: 'addTag', levelId: 'lv_0', viewId: 'ap_vazia', item: { id: 'tg_da_area', hostId: 'h_s', at: { x: 8, y: 8 }, property: 'type' } });
    expect(etiquetas(s.project, 'ap_vazia').filter((l) => l.at.x === 8)).toHaveLength(1);
    expect(etiquetas(s.project, PISO).filter((l) => l.at.x === 8)).toHaveLength(0);
  });

  it('ocultar a cópia na área não afeta o piso nem a etiqueta própria; ocultar no piso não afeta a área', () => {
    const p = migrado('04-area-anotacoes-proprias.json');
    const naArea = withViewPatchOfTest(p, 'ap_propria', { hidden: { elements: ['tg_n0__ap_propria'] } });
    expect(etiquetas(naArea, 'ap_propria', { hidden: new Set(['tg_n0__ap_propria']) })).toHaveLength(1);
    expect(etiquetas(naArea, PISO)).toHaveLength(1);
    const noPiso = withViewPatchOfTest(p, PISO, { hidden: { elements: ['tg_n0'] } });
    expect(etiquetas(noPiso, 'ap_propria', { hidden: new Set(['tg_n0']) })).toHaveLength(2);
  });

  it('planta sem cópias (showAnnotations desligado na migração) não desenha etiqueta do piso', () => {
    const raw = bruto('04-area-anotacoes-proprias.json') as { areaPlans: Array<{ graphics: Record<string, unknown> }> };
    for (const a of raw.areaPlans) a.graphics = { ...a.graphics, showAnnotations: false };
    const p = migrateProject(raw);
    expect(etiquetas(p, 'ap_propria')).toHaveLength(0);
    expect(etiquetas(p, 'ap_vazia')).toHaveLength(0);
    expect(etiquetas(p, PISO)).toHaveLength(1);
  });

  it('a etiqueta do piso sem cópia na área não aparece nem com o perfil de área pedindo etiquetas', () => {
    // Projeto onde a área não tem cópia mas o perfil liga as etiquetas: o desenho não vai ao piso buscar.
    const p = migrado('04-area-anotacoes-proprias.json');
    const semCopia = withViewPatchOfTest(p, 'ap_vazia', { annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } });
    expect(etiquetas(semCopia, 'ap_vazia')).toHaveLength(0);
    expect(etiquetas(semCopia, PISO)).toHaveLength(1);
  });

  it('o perfil da planta de área não pede as etiquetas do nível (o piso e a cobertura continuam pedindo)', () => {
    expect(areaPlanProfile({ graphics: { ...DEFAULT_AREA_GRAPHICS, showAnnotations: true } }).elementTags).toBe(false);
    expect(FLOOR_PLAN_PROFILE.elementTags).toBe(true);
  });
});
