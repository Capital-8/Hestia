import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeLevel, makeStair, makeWall, type Id, type Project } from '@hestia/model';
import { PlanFrame, planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';
import { planViewOf } from './view.ts';
import type { PlanOps } from './types.ts';
import type { Viewport } from '../viewport.ts';

const V: Viewport = { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 };

/** Pavimento com quatro paredes e uma escada que sobe ao pavimento de cima (hospedeira do guarda-corpo). */
function base(): Project {
  const store = new ProjectStore(createEmptyProject('Camada do guarda-corpo'));
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Terreo', elevation: 0 }) });
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Superior', elevation: 3 }) });
  const c: Array<[[number, number], [number, number]]> = [[[0, 0], [4, 0]], [[4, 0], [4, 4]], [[4, 4], [0, 4]], [[0, 4], [0, 0]]];
  c.forEach(([[ax, ay], [bx, by]], j) => store.exec({ type: 'addWall', wall: makeWall({ id: `w${j}`, typeId: 'wt_ext19', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by } }) }));
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [] }) });
  return store.project;
}

const lado = { lance: true, patamar: true };
function ligar(p: Project): Project {
  const store = new ProjectStore(p);
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  return store.project;
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
  return { geometria: u.geometryKey, guarda: u.guardaKey, u };
};

describe('guarda-corpo: camada e chave próprias na planta', () => {
  it('ligar ou editar o guarda-corpo não muda a chave do resto da planta, e muda a do guarda-corpo', () => {
    const p0 = base();
    const a = chaves(p0, { version: 1 });
    const p1 = ligar(p0);
    const b = chaves(p1, { version: 2 });
    expect(b.geometria).toBe(a.geometria);
    expect(b.guarda).not.toBe(a.guarda);
    // Editar o guarda-corpo (aqui, o tipo) também só muda a dele.
    const store = new ProjectStore(p1);
    store.exec({ type: 'updateElements', ids: ['gc'], patch: { typeId: 'gct_vidro' } });
    const c = chaves(store.project, { version: 3 });
    expect(c.geometria).toBe(a.geometria);
    expect(c.guarda).not.toBe(b.guarda);
  });

  it('editar uma parede muda a chave do resto e mantém a do guarda-corpo (nem o kernel é consultado de novo)', () => {
    const p1 = ligar(base());
    const a = chaves(p1, { version: 2 });
    const editada = editarParede(p1, 0.5);
    const b = chaves(editada, { version: 3 });
    expect(b.geometria).not.toBe(a.geometria);
    expect(b.guarda).toBe(a.guarda);
  });

  it('mexer na escada hospedeira muda a chave do guarda-corpo', () => {
    const p1 = ligar(base());
    const a = chaves(p1, { version: 2 });
    const store = new ProjectStore(p1);
    store.exec({ type: 'updateElements', ids: ['st'], patch: { baseOffset: 0.1 } });
    expect(chaves(store.project, { version: 3 }).guarda).not.toBe(a.guarda);
  });

  it('ocultar o guarda-corpo só muda a chave dele; ocultar uma parede não muda a dele', () => {
    const p1 = ligar(base());
    const a = chaves(p1);
    const semGuarda = chaves(p1, { hidden: new Set(['gc']) });
    expect(semGuarda.geometria).toBe(a.geometria);
    expect(semGuarda.guarda).not.toBe(a.guarda);
    const semParede = chaves(p1, { hidden: new Set(['w0']) });
    expect(semParede.geometria).not.toBe(a.geometria);
    expect(semParede.guarda).toBe(a.guarda);
    // Revelar (borda azul do modo Reveal) entra na chave do guarda-corpo, não na do resto.
    const revelado = chaves(p1, { hidden: new Set(['gc']), revealed: new Set(['gc']) });
    expect(revelado.geometria).toBe(a.geometria);
    expect(revelado.guarda).not.toBe(semGuarda.guarda);
  });

  it('a camada do guarda-corpo é desenhada pelo quadro à parte e a geometria do nível não a refaz', () => {
    const p0 = base();
    const p1 = ligar(p0);
    const camadas: string[] = [];
    const frame = new PlanFrame({ setSlot: (slot: string): void => void camadas.push(slot), setBackground: (): void => {} });
    frame.update(chaves(p0, { version: 1 }).u);
    camadas.length = 0;
    frame.update(chaves(p1, { version: 2 }).u);
    expect(camadas).toContain('strokesGuarda');
    expect(camadas).not.toContain('strokesBase');
    expect(camadas).not.toContain('fillsBase');
    camadas.length = 0;
    frame.update(chaves(editarParede(p1, 0.5), { version: 3 }).u);
    expect(camadas).toContain('strokesBase');
    expect(camadas).not.toContain('strokesGuarda');
  });

  it('a vista do nível é reaproveitada quando só um guarda-corpo muda', () => {
    const p0 = base();
    const v0 = planViewOf(p0, 'lv_0');
    expect(planViewOf(ligar(p0), 'lv_0')).toBe(v0);
    expect(planViewOf(editarParede(p0, 0.5), 'lv_0')).not.toBe(v0);
  });

  it('com o guarda-corpo fora da geometria (`guardaCorpo: sem`), a geometria é a mesma do projeto sem guarda-corpo', () => {
    const p0 = base();
    const sem = (p: Project): PlanOps => chaves(p).u.geometry();
    expect(sem(ligar(p0)).strokes.length).toBe(sem(p0).strokes.length);
  });
});
