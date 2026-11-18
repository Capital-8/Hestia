import { describe, expect, it } from 'vitest';
import { resolverZoom } from './zoomOps.ts';
import { resolveLevel, resolveRooms, type ResolvedRoom } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeRoom, makeWall, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { belowRoomOps, roomNameText, roomOps, roomSelectionOps } from './rooms.ts';
import { DARK, LIGHT } from './types.ts';
import { defaultPaint } from './style.ts';
import type { Viewport } from '../viewport.ts';

const P = (x: number, y: number) => ({ x, y });
const VIEW = (zoom: number): Viewport => ({ cx: 3, cy: 2, zoom, width: 800, height: 600 });

/** Quatro paredes de um retângulo 6 × 4 (eixo) no nível térreo, com um ambiente no centro. */
function sala(name = 'Sala', number = '101', extra: Partial<Parameters<typeof makeRoom>[0]> = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  const corners = [P(0, 0), P(6, 0), P(6, 4), P(0, 4)];
  corners.forEach((a, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: corners[(i + 1) % 4]! }) }));
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name, number, point: P(3, 2), ...extra }) });
  return s.project;
}

function input(p: Project, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW(100),
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

describe('ambiente na planta (D1, E3)', () => {
  it('etiqueta da planta de piso mostra só o nome (decisão 0037)', () => {
    expect(roomNameText({ name: 'Sala', number: '101', area: 20 } as ResolvedRoom)).toBe('Sala');
    expect(roomNameText({ name: '', number: '7', area: 1.5 } as ResolvedRoom)).toBe('Ambiente 7');
    expect(roomNameText({ name: '', area: 1.5 } as ResolvedRoom)).toBe('Ambiente');
  });

  it('desenha o preenchimento e a etiqueta do ambiente, sem número nem área', () => {
    const p = sala();
    const ops = resolverZoom(roomOps(p, 'lv_0', LIGHT, false, 'fine', 100, undefined, defaultPaint('room', 100)), 50);
    expect(ops.fills).toHaveLength(1);
    expect(ops.labels).toHaveLength(1);
    expect(ops.labels[0]!.fontPx).toBeGreaterThan(0);
    expect(ops.labels[0]!.text).toBe('Sala');
  });

  it('a etiqueta não muda com o detalhe: fino, médio e grosso mostram o nome', () => {
    const p = sala();
    const paint = defaultPaint('room', 100);
    for (const detail of ['fine', 'medium', 'coarse'] as const) {
      expect(roomOps(p, 'lv_0', LIGHT, false, detail, 100, undefined, paint).labels[0]!.text).toBe('Sala');
    }
  });

  it('ambiente oculto ou sem circuito não é desenhado', () => {
    const p = sala();
    const paint = defaultPaint('room', 100);
    expect(roomOps(p, 'lv_0', LIGHT, false, 'fine', 100, new Set(['r1']), paint).fills).toHaveLength(0);
    const aberto = sala('Sala', '101', { point: P(20, 20) });
    expect(roomOps(aberto, 'lv_0', LIGHT, false, 'fine', 100, undefined, paint).fills).toHaveLength(0);
  });

  it('cor própria do ambiente só vale na planta de área; a planta de piso usa o padrão; no tema escuro o preenchimento muda', () => {
    const paint = defaultPaint('room', 100);
    const claro = roomOps(sala('Sala', '101', { color: '#ff0000' }), 'lv_0', LIGHT, false, 'fine', 100, undefined, paint).fills[0]!.color;
    const escuro = roomOps(sala(), 'lv_0', DARK, true, 'fine', 100, undefined, paint).fills[0]!.color;
    expect(claro).toMatch(/^#/);
    expect(claro).toBe(roomOps(sala(), 'lv_0', LIGHT, false, 'fine', 100, undefined, paint).fills[0]!.color);
    expect(escuro).not.toBe(claro);
  });

  it('seleção destaca o contorno do ambiente selecionado e o hover, e nada sem seleção', () => {
    const p = sala();
    expect(roomSelectionOps(p, 'lv_0', [], null, LIGHT).fills).toHaveLength(0);
    const sel = roomSelectionOps(p, 'lv_0', ['r1'], null, LIGHT);
    expect(sel.fills).toHaveLength(1);
    expect(sel.strokes.length).toBeGreaterThan(0);
    expect(roomSelectionOps(p, 'lv_0', [], 'r1', LIGHT).fills[0]!.alpha).toBeLessThan(sel.fills[0]!.alpha);
  });

  it('entra na lista de desenho da planta, com a etiqueta', () => {
    const p = sala();
    const dl = buildPlanDrawList(input(p));
    expect(dl.labels.some((l) => l.text === 'Sala')).toBe(true);
    expect(dl.labels.some((l) => l.text.includes('101'))).toBe(false);
    expect(resolveRooms(p, 'lv_0')).toHaveLength(1);
  });
});

describe('ambientes do subpavimento (D3)', () => {
  /** Planta do pavimento 2 (lv_1) com o térreo (lv_0) logo abaixo, como o app monta. */
  const acima = (p: Project, belowRooms?: ResolvedRoom[]) =>
    input(p, {
      levelId: 'lv_1',
      resolved: resolveLevel(p, 'lv_1', new Map()),
      below: { ...resolveLevel(p, 'lv_0', new Map()), levelId: 'lv_0' },
      belowRooms,
    });

  it('belowRoomOps: um preenchimento e um contorno por anel, sem etiqueta; sem circuito não entra', () => {
    const p = sala();
    const rooms = resolveRooms(p, 'lv_0');
    const ops = belowRoomOps(rooms, DARK);
    expect(ops.fills).toHaveLength(1);
    expect(ops.fills[0]!.color).toBe(DARK.underlay);
    expect(ops.strokes.length).toBeGreaterThan(0);
    expect(ops.strokes.every((s) => s.color === DARK.underlay)).toBe(true);
    expect(ops.labels).toHaveLength(0);
    expect(belowRoomOps([{ ...rooms[0]!, polygon: null }], DARK).fills).toHaveLength(0);
  });

  it('sem belowRooms, o ambiente do nível abaixo não aparece na planta', () => {
    const p = sala();
    const contorno = JSON.stringify([resolveRooms(p, 'lv_0')[0]!.polygon]);
    const dl = buildPlanDrawList(acima(p));
    expect(dl.fills.some((f) => JSON.stringify(f.polygons) === contorno)).toBe(false);
    expect(dl.labels.some((l) => l.text === 'Sala')).toBe(false);
  });

  it('com belowRooms, o ambiente de baixo aparece apagado e sem etiqueta', () => {
    const p = sala();
    const rooms = resolveRooms(p, 'lv_0');
    const dl = buildPlanDrawList(acima(p, rooms));
    const i = dl.fills.findIndex((f) => f.color === LIGHT.underlay && f.alpha === 0.22 && JSON.stringify(f.polygons) === JSON.stringify([rooms[0]!.polygon]));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(dl.labels.some((l) => l.text === 'Sala')).toBe(false);
  });
});
