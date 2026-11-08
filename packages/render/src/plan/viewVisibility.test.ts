import { describe, expect, it } from 'vitest';
import { pointInMulti, type Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeRoom, makeWall, type Id, type Opening, type Project } from '@hestia/model';
import { buildPlanGeometry, buildPlanScreenOverlay, buildPlanSelectionOverlay, type PlanInput } from './build.ts';
import { planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';
import type { PlanOps } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };
const P = (x: number, y: number): Vec2 => ({ x, y });
const AZUL = '#2563eb';

/** Azul do Reveal: traço de 2 px na cor combinada. */
const azuis = (ops: PlanOps): number => ops.strokes.filter((s) => s.color === AZUL && s.widthPx === 2).length;

/** Sala 6 × 4 com porta na parede de baixo, um ambiente no centro e um piso longe das paredes. */
function cena(): Project {
  const s = new ProjectStore(createEmptyProject());
  const corners = [P(0, 0), P(6, 0), P(6, 4), P(0, 4)];
  corners.forEach((a, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: corners[(i + 1) % 4]! }) }));
  const porta: Opening = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w0', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: porta });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: P(3, 2) }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [P(10, 10), P(12, 10), P(12, 12), P(10, 12)] }) });
  return s.project;
}

function entrada(p: Project, over: Partial<PlanInput> = {}): PlanInput {
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

/** Há preenchimento cobrindo o ponto? */
const coberto = (ops: PlanOps, x: number, y: number): boolean => ops.fills.some((f) => pointInMulti({ x, y }, f.polygons));

/** Traços abertos do símbolo de abertura perto do centro (porta em (3, 0)). */
const simboloDaPorta = (ops: PlanOps): number =>
  ops.strokes.filter((s) => !s.closed && s.pts.every((q) => Math.hypot(q.x - 3, q.y) <= 1.2)).length;

const p = cena();

describe('Hide in View na planta: o oculto não é desenhado', () => {
  it('parede oculta some da geometria, inclusive a silhueta (a junção dos vizinhos fecha sem ela)', () => {
    expect(coberto(buildPlanGeometry(entrada(p)), 6, 2)).toBe(true);
    expect(coberto(buildPlanGeometry(entrada(p, { hidden: new Set(['w1']) })), 6, 2)).toBe(false);
  });

  it('piso oculto some do preenchimento', () => {
    expect(coberto(buildPlanGeometry(entrada(p)), 11, 11)).toBe(true);
    expect(coberto(buildPlanGeometry(entrada(p, { hidden: new Set(['f1']) })), 11, 11)).toBe(false);
  });

  it('abertura oculta some do símbolo; a parede que a hospeda continua desenhada', () => {
    expect(simboloDaPorta(buildPlanGeometry(entrada(p)))).toBeGreaterThan(0);
    const oculta = buildPlanGeometry(entrada(p, { hidden: new Set(['d1']) }));
    expect(simboloDaPorta(oculta)).toBe(0);
    expect(coberto(oculta, 1, 0)).toBe(true);
  });

  it('ambiente oculto some do preenchimento e da etiqueta', () => {
    const com = buildPlanGeometry(entrada(p));
    expect(com.labels.map((l) => l.text)).toContain('Sala');
    const sem = buildPlanGeometry(entrada(p, { hidden: new Set(['r1']) }));
    expect(sem.labels.map((l) => l.text)).not.toContain('Sala');
    expect(coberto(sem, 3, 2)).toBe(false);
  });

  it('seleção de elemento oculto não deixa destaque na sobreposição', () => {
    const ov = buildPlanSelectionOverlay(entrada(p, { hidden: new Set(['w1']), selection: ['w1'] }));
    expect(ov.strokes.filter((s) => s.color === LIGHT.select)).toHaveLength(0);
    expect(ov.fills.filter((f) => f.color === LIGHT.select)).toHaveLength(0);
  });
});

describe('Reveal na planta: o oculto volta ao desenho normal com borda azul', () => {
  it('parede revelada continua na geometria e ganha contorno azul de 2 px na sobreposição', () => {
    const revealed = new Set<Id>(['w1']);
    expect(coberto(buildPlanGeometry(entrada(p, { revealed })), 6, 2)).toBe(true);
    expect(azuis(buildPlanSelectionOverlay(entrada(p, { revealed })))).toBeGreaterThan(0);
  });

  it('categoria oculta (vários ids) some; revelada, os elementos voltam com o contorno azul', () => {
    const paredes = ['w0', 'w1', 'w2', 'w3'];
    const oculta = buildPlanGeometry(entrada(p, { hidden: new Set(paredes) }));
    expect(coberto(oculta, 6, 2)).toBe(false);
    expect(azuis(buildPlanSelectionOverlay(entrada(p, { hidden: new Set(paredes) })))).toBe(0);
    const revelada = entrada(p, { revealed: new Set(paredes) });
    expect(coberto(buildPlanGeometry(revelada), 6, 2)).toBe(true);
    expect(azuis(buildPlanScreenOverlay(revelada))).toBeGreaterThanOrEqual(paredes.length);
  });

  it('o Reveal vale para piso, ambiente e abertura (borda azul), sem sumir do desenho normal', () => {
    const revealed = new Set<Id>(['f1', 'r1', 'd1']);
    const geo = buildPlanGeometry(entrada(p, { revealed }));
    expect(coberto(geo, 11, 11)).toBe(true);
    expect(geo.labels.map((l) => l.text)).toContain('Sala');
    expect(simboloDaPorta(geo)).toBeGreaterThan(0);
    expect(azuis(buildPlanScreenOverlay(entrada(p, { revealed })))).toBeGreaterThan(0);
  });

  it('o id em hidden e em revealed não é escondido (o Reveal vence o Hide in View)', () => {
    const ambos = new Set<Id>(['w1']);
    expect(coberto(buildPlanGeometry(entrada(p, { hidden: ambos, revealed: ambos })), 6, 2)).toBe(true);
    expect(azuis(buildPlanScreenOverlay(entrada(p, { hidden: ambos, revealed: ambos })))).toBeGreaterThan(0);
  });
});

describe('PlanFrame: hidden/revealed entram na chave das camadas', () => {
  const estado = (over: Partial<PlanViewState> = {}): PlanViewState => ({
    project: p,
    version: 1,
    levelId: 'lv_0',
    v: VIEW,
    theme: LIGHT,
    dark: false,
    gpu: true,
    showGrid: false,
    showUnderlay: false,
    showRoofProjection: true,
    thinLines: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    resolve: () => resolveLevel(p, 'lv_0', new Map()),
    ...over,
  });

  it('mudar o Hide in View ou o Reveal muda a chave da geometria e a da sobreposição', () => {
    const base = planFrameUpdateOf(estado());
    const oculto = planFrameUpdateOf(estado({ hidden: new Set(['w1']) }));
    const revelado = planFrameUpdateOf(estado({ revealed: new Set(['w1']) }));
    expect(oculto.geometryKey).not.toBe(base.geometryKey);
    expect(oculto.overlayKey).not.toBe(base.overlayKey);
    expect(revelado.geometryKey).not.toBe(base.geometryKey);
    expect(revelado.overlayKey).not.toBe(base.overlayKey);
    expect(planFrameUpdateOf(estado({ hidden: new Set(['w1']) })).geometryKey).toBe(oculto.geometryKey);
  });
});

/** Todos os ids do projeto menos os isolados: é o `hidden` que o Isolar produz. */
const isolando = (...manter: Id[]): Set<Id> => new Set(Object.keys(p.elements).filter((id) => !manter.includes(id)));

describe('Elemento hospedado tem visibilidade própria (planta)', () => {
  it('ocultar a parede mantém o símbolo da porta', () => {
    const ops = buildPlanGeometry(entrada(p, { hidden: new Set(['w0']) }));
    expect(simboloDaPorta(ops)).toBeGreaterThan(0);
    expect(coberto(ops, 1, 0)).toBe(false);
  });

  it('isolar a porta mostra só a porta: sem parede, sem piso', () => {
    const ops = buildPlanGeometry(entrada(p, { hidden: isolando('d1') }));
    expect(simboloDaPorta(ops)).toBeGreaterThan(0);
    expect(coberto(ops, 1, 0)).toBe(false);
    expect(coberto(ops, 6, 2)).toBe(false);
    expect(coberto(ops, 11, 11)).toBe(false);
  });

  it('isolar as paredes mostra as paredes sem a esquadria', () => {
    const ops = buildPlanGeometry(entrada(p, { hidden: isolando('w0', 'w1', 'w2', 'w3') }));
    expect(coberto(ops, 6, 2)).toBe(true);
    expect(simboloDaPorta(ops)).toBe(0);
  });

  it('isolar parede + porta mostra os dois', () => {
    const ops = buildPlanGeometry(entrada(p, { hidden: isolando('w0', 'd1') }));
    expect(coberto(ops, 1, 0)).toBe(true);
    expect(simboloDaPorta(ops)).toBeGreaterThan(0);
    expect(coberto(ops, 6, 2)).toBe(false);
  });
});
