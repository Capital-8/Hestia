import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno, resolveLevel } from '@hestia/engine';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, ProjectStore, createEmptyProject, makeLevel, makeWall, type Id, type Project, type Terrain } from '@hestia/model';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { buildPlanHoverOverlay, buildPlanSelectionOverlay } from './planOverlay.ts';
import { planFrameUpdateOf } from './planFrame.ts';
import { RESERVA_TRACO, type DadosTerreno } from './terreno.ts';
import { ocultosDoTerreno, terrenoOpsDaPlanta } from './terrenoCamada.ts';
import { mesmoSemGuardaCorpo } from './versoesPlanta.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';

function entrada(p: Project, levelId: Id, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p, levelId, resolved: resolveLevel(p, levelId, new Map()), below: null, viewport: { cx: 10, cy: 10, zoom: 20, width: 800, height: 600 },
    theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false, ...over,
  };
}
const reserva = (p: Project, levelId: Id, over: Partial<PlanInput> = {}) => buildPlanGeometry(entrada(p, levelId, over)).strokes.filter((s) => s.dash?.[0] === RESERVA_TRACO[0] && s.dash?.[1] === RESERVA_TRACO[1]);
const comNivel1 = (p: Project): Project => {
  const s = new ProjectStore(p);
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 1', elevation: 3 }) });
  return s.project;
};
const dados: DadosTerreno = { propostas: [], existentes: null, bordas: [], cotas: () => null };

describe('planta: camada do terreno', () => {
  it('sem kernel: envoltória tracejada de reserva e o contorno da região, sem exceção', () => {
    const p = projetoTerreno('T5');
    const g = buildPlanGeometry(entrada(p, 'lv_0'));
    expect(reserva(p, 'lv_0')).toHaveLength(1);
    expect(g.fills).toHaveLength(1);
    expect(g.strokes).toHaveLength(2);
  });

  it('em outro nível o terreno NÃO aparece', () => {
    const p = comNivel1(projetoTerreno('T5'));
    const g = buildPlanGeometry(entrada(p, 'lv_1'));
    expect(g.strokes).toHaveLength(0);
    expect(g.fills).toHaveLength(0);
  });

  it('categoria site desligada: nada do terreno', () => {
    const p = projetoTerreno('T5');
    const off = { ...defaultPaint('site', 20), visible: false };
    expect(terrenoOpsDaPlanta(entrada(p, 'lv_0'), off, 100, dados).strokes).toHaveLength(0);
    expect([...(ocultosDoTerreno(p, 'lv_0', undefined, undefined, false) ?? [])].sort()).toEqual(['rg_t5', 'tn_t5']);
    expect(ocultosDoTerreno(p, 'lv_0', undefined, undefined, true)).toBeUndefined();
    expect([...(ocultosDoTerreno(p, 'lv_0', new Set(['a', 'b']), new Set(['b']), true) ?? [])]).toEqual(['a']);
  });

  it('oculto na vista some; planta de área não desenha terreno', () => {
    const p = projetoTerreno('T5');
    expect(reserva(p, 'lv_0', { hidden: new Set(['tn_t5']) })).toHaveLength(0);
    const area = { name: 'a', levelId: 'lv_0', scale: 100, graphics: DEFAULT_AREA_GRAPHICS, tagFields: DEFAULT_TAG_FIELDS } as unknown as PlanInput['areaPlan'];
    expect(terrenoOpsDaPlanta(entrada(p, 'lv_0', { areaPlan: area }), defaultPaint('site', 20), 100, dados).strokes).toHaveLength(0);
  });

  it('projeto sem terreno: nada e o kernel nem é consultado', () => {
    const p = createEmptyProject();
    const lancou: DadosTerreno = { propostas: null, existentes: null, bordas: null, cotas: () => { throw new Error('consultou'); } };
    expect(terrenoOpsDaPlanta(entrada(p, 'lv_0'), defaultPaint('site', 20), 100, lancou).strokes).toHaveLength(0);
  });

  it('dois terrenos: cada um desenha só o seu', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T1');
    adicionarFixtureTerreno(s, 'T3');
    expect(reserva(s.project, 'lv_0')).toHaveLength(2);
  });

  it('seleção e hover do terreno e da região realçam só o contorno', () => {
    const p = projetoTerreno('T5');
    const sel = buildPlanSelectionOverlay(entrada(p, 'lv_0', { selection: ['rg_t5'] }));
    expect(sel.strokes.some((s) => s.widthPx === 2.5 && s.closed && s.pts.length === 4 && s.pts[0]!.x === 5)).toBe(true);
    const hov = buildPlanHoverOverlay(entrada(p, 'lv_0', { hover: 'tn_t5' }));
    expect(hov.strokes.some((s) => s.widthPx === 2 && s.closed)).toBe(true);
  });
});

describe('chaves e vista com terreno', () => {
  const chave = (p: Project, version: number) => planFrameUpdateOf({
    project: p, version, levelId: 'lv_0', v: { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 }, theme: LIGHT, dark: false, gpu: true, showGrid: false, showUnderlay: false, showRoofProjection: true, thinLines: false,
    selection: [], hover: null, preview: [], inference: null, resolve: (id: Id) => resolveLevel(p, id, new Map()),
  }).geometryKey;

  it('editar o terreno muda a chave da geometria; renomear parede também; o mesmo projeto, não', () => {
    const p0 = projetoTerreno('T5');
    expect(chave(p0, 1)).toBe(chave(p0, 1));
    const s = new ProjectStore(p0);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t5', ops: [{ op: 'addPonto', x: 3, y: 3, z: 1 }] } as never);
    expect(chave(s.project, 2)).not.toBe(chave(p0, 1));
  });

  it('mesmoSemGuardaCorpo ignora terreno e região, mas não parede', () => {
    const p0 = projetoTerreno('T5');
    const s = new ProjectStore(p0);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t5', ops: [{ op: 'addPonto', x: 3, y: 3, z: 1 }] } as never);
    expect(mesmoSemGuardaCorpo(p0, s.project)).toBe(true);
    expect((s.project.elements.tn_t5 as Terrain).pontos.length).toBe(15);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    expect(mesmoSemGuardaCorpo(p0, s.project)).toBe(false);
  });
});
