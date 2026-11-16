import { describe, expect, it, vi } from 'vitest';
import { resolveLevel, servicoMassa } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeMass, makeWall, type Id, type Project } from '@hestia/model';
import { ocultosDaMassa } from './massa.ts';
import { PlanFrame, planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const V: Viewport = { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 };

/** Pavimento com quatro paredes e uma massa circular no térreo. */
function base(): Project {
  const store = new ProjectStore(createEmptyProject('Camada da massa'));
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Superior', elevation: 3 }) });
  const c: Array<[[number, number], [number, number]]> = [[[0, 0], [4, 0]], [[4, 0], [4, 4]], [[4, 4], [0, 4]], [[0, 4], [0, 0]]];
  c.forEach(([[ax, ay], [bx, by]], j) => store.exec({ type: 'addWall', wall: makeWall({ id: `w${j}`, typeId: 'wt_ext19', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by } }) }));
  return store.project;
}

function comMassa(p: Project, raio = 2): Project {
  const s = new ProjectStore(p);
  s.exec({ type: 'addMass', mass: makeMass({ id: 'ms', levelId: 'lv_0', name: 'Coluna', origem: { x: 10, y: 10 }, secoes: [{ z: 0, perfil: { forma: 'circulo', raio }, rotacao: 0, escala: 1, dx: 0, dy: 0 }, { z: 6, perfil: { forma: 'circulo', raio }, rotacao: 0, escala: 1, dx: 0, dy: 0 }] }) });
  return s.project;
}

function editarMassa(p: Project, raio: number): Project {
  const m = p.elements.ms;
  if (!m || m.kind !== 'mass') throw new Error('massa de teste não encontrada');
  return { ...p, elements: { ...p.elements, ms: { ...m, secoes: m.secoes.map((s) => ({ ...s, perfil: { forma: 'circulo', raio } })) } } };
}

function editarParede(p: Project, dx: number): Project {
  const w = p.elements.w0;
  if (!w || w.kind !== 'wall') throw new Error('parede de teste não encontrada');
  return { ...p, elements: { ...p.elements, w0: { ...w, b: { x: w.b.x + dx, y: w.b.y } } } };
}

const chaves = (project: Project, over: Partial<PlanViewState> = {}) => {
  const u = planFrameUpdateOf({
    project, version: 1, levelId: 'lv_0', v: V, theme: LIGHT, dark: false, gpu: true, showGrid: false, showUnderlay: false, showRoofProjection: true, thinLines: false,
    selection: [], hover: null, preview: [], inference: null, resolve: (id: Id) => resolveLevel(project, id, new Map()), ...over,
  });
  return { geometria: u.geometryKey, massa: u.massaKey ?? '', u };
};

describe('massa: camada e chave próprias na planta', () => {
  it('sem massa no projeto a chave da camada é a vazia e não muda com edições de parede', () => {
    const p0 = base();
    const a = chaves(p0, { version: 1 });
    const b = chaves(editarParede(p0, 0.5), { version: 2 });
    expect(b.massa).toBe(a.massa);
  });

  it('editar uma massa muda a chave dela e não a geometria do resto da planta', () => {
    const p1 = comMassa(base());
    const a = chaves(p1, { version: 2 });
    const b = chaves(editarMassa(p1, 3), { version: 3 });
    expect(b.geometria).toBe(a.geometria);
    expect(b.massa).not.toBe(a.massa);
  });

  it('editar uma parede não muda a chave da massa', () => {
    const p1 = comMassa(base());
    const a = chaves(p1, { version: 2 });
    const b = chaves(editarParede(p1, 0.5), { version: 3 });
    expect(b.massa).toBe(a.massa);
    expect(b.geometria).not.toBe(a.geometria);
  });

  it('ocultar a massa na vista muda a chave dela', () => {
    const p1 = comMassa(base());
    const a = chaves(p1);
    const oculta = chaves(p1, { hidden: new Set(['ms']) });
    expect(oculta.massa).not.toBe(a.massa);
  });

  it('o quadro desenha a massa na camada de linhas acima da geometria e não refaz a geometria ao editá-la', () => {
    const p0 = comMassa(base());
    const camadas: string[] = [];
    const frame = new PlanFrame({ setSlot: (slot: string): void => void camadas.push(slot), setBackground: (): void => {} });
    frame.update(chaves(p0, { version: 1 }).u);
    camadas.length = 0;
    frame.update(chaves(editarMassa(p0, 3), { version: 2 }).u);
    expect(camadas).toContain('strokesGuarda');
    expect(camadas).not.toContain('strokesBase');
    expect(camadas).not.toContain('fillsBase');
  });
});

describe('massa: ocultação e reserva', () => {
  it('categoria desligada oculta todas as massas do projeto; oculta na vista sai só se não revelada', () => {
    const p = comMassa(base());
    expect(ocultosDaMassa(p, undefined, undefined, false)).toEqual(new Set(['ms']));
    expect(ocultosDaMassa(p, new Set(['ms']), undefined, true)).toEqual(new Set(['ms']));
    expect(ocultosDaMassa(p, new Set(['ms']), new Set(['ms']), true)).toBeUndefined();
  });

  it('sem kernel, a camada não lança e desenha só o contorno da base tracejado', () => {
    const p = comMassa(base());
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    const camada = chaves(p).u.massa!();
    expect(camada.strokes).toHaveLength(1);
    expect(camada.strokes[0]!.dash).toBeDefined();
  });
});
