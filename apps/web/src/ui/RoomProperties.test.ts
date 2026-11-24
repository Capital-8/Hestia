import { describe, expect, it } from 'vitest';
import type { ResolvedRoom } from '@hestia/engine';
import { createEmptyProject, makeRoom, makeWall, ProjectStore, type Room } from '@hestia/model';
import {
  applyLabelFieldsToLevelCommand,
  roomWarning,
  roomsWithCircuitOnLevel,
  TAG_FIELD_OPTIONS,
  toggleRoomLabelFieldsCommand,
  toggleTagField,
} from './RoomProperties.tsx';

const base = { roomId: 'r', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 0, y: 0 }, polygon: null, area: 0, perimeter: 0, ceilingHeight: 2.8, volume: 0, floorFinish: '', wallFinish: '', ceilingFinish: '', problem: null } as ResolvedRoom;

/**
 * Do níveis com um retângulo fechado de paredes: r1/r2 no térreo (circuito), r3 fora do circuito no térreo
 * e r4 no primeiro andar. Serve para provar que "aplicar ao nível" não atravessa níveis nem ambientes sem circuito.
 */
function projetoComAmbientes(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const retangulo = (levelId: string, x: number): void => {
    const c = [
      { x, y: 0 },
      { x: x + 6, y: 0 },
      { x: x + 6, y: 4 },
      { x, y: 4 },
    ];
    c.forEach((p, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w_${levelId}_${i}`, typeId: 'wt_alv14', levelId, a: p, b: c[(i + 1) % 4]! }) }));
  };
  retangulo('lv_0', 0);
  retangulo('lv_1', 10);
  for (const [id, levelId, point] of [
    ['r1', 'lv_0', { x: 1, y: 1 }],
    ['r2', 'lv_0', { x: 4, y: 3 }],
    ['r3', 'lv_0', { x: 30, y: 30 }],
    ['r4', 'lv_1', { x: 13, y: 2 }],
  ] as const) s.exec({ type: 'addRoom', room: makeRoom({ id, levelId, point, name: id, number: id }) });
  return s;
}

const roomOf = (s: ProjectStore, id: string): Room => s.project.elements[id] as Room;

describe('aviso do ambiente no painel de propriedades (E/G)', () => {
  it('sem aviso quando o ambiente tem circuito e é único', () => {
    expect(roomWarning({ ...base, polygon: [[]], problem: null })).toBeNull();
  });

  it('ponto fora de circuito e circuito aberto têm texto próprio', () => {
    expect(roomWarning({ ...base, problem: 'fora' })).toContain('Sem circuito fechado');
    expect(roomWarning({ ...base, problem: 'aberto' })).toContain('Circuito aberto');
  });

  it('ambiente duplicado no mesmo circuito aponta o outro', () => {
    expect(roomWarning({ ...base, polygon: [[]], duplicateOf: 'rm_2' })).toContain('rm_2');
  });
});

describe('campos da etiqueta nesta planta de área', () => {
  it('liga e desliga um campo mantendo a ordem do bloco', () => {
    expect(toggleTagField(['name', 'area'], 'number')).toEqual(['name', 'number', 'area']);
    expect(toggleTagField(['name', 'number', 'area'], 'number')).toEqual(['name', 'area']);
  });

  it('não deixa a lista de campos vazia', () => {
    expect(toggleTagField(['name'], 'name')).toEqual(['name']);
  });

  it('oferece todos os campos do modelo, na ordem de exibição', () => {
    expect(TAG_FIELD_OPTIONS.map((o) => o.field)).toEqual(['name', 'number', 'area', 'category', 'level', 'perimeter', 'volume', 'custom']);
  });
});

describe('campos do rótulo compartilhado (todas as vistas)', () => {
  it('alternar um campo executa setRoomLabel, grava os campos e preserva a posição', () => {
    const s = projetoComAmbientes();
    s.exec({ type: 'setRoomLabel', id: 'r1', position: { x: 2, y: 3 }, fields: ['name'] });
    const cmd = toggleRoomLabelFieldsCommand(roomOf(s, 'r1'), 'area');
    expect(cmd).toEqual({ type: 'setRoomLabel', id: 'r1', position: { x: 2, y: 3 }, fields: ['name', 'area'] });
    s.exec(cmd, 'Alterar campos do rótulo');
    expect(roomOf(s, 'r1').labelFields).toEqual(['name', 'area']);
    expect(roomOf(s, 'r1').labelPosition).toEqual({ x: 2, y: 3 });
    expect(s.undoLabel).toBe('Alterar campos do rótulo');
  });

  it('sem posição gravada, passa null e continua sem posição', () => {
    const s = projetoComAmbientes();
    const cmd = toggleRoomLabelFieldsCommand(roomOf(s, 'r1'), 'number');
    expect(cmd.position).toBeNull();
    s.exec(cmd);
    expect(roomOf(s, 'r1').labelFields).toEqual(['name', 'number']);
    expect(roomOf(s, 'r1').labelPosition).toBeUndefined();
    expect(cmd.fields).not.toHaveLength(0);
    expect(toggleRoomLabelFieldsCommand(roomOf(s, 'r2'), 'name').fields).toEqual(['name']);
  });

  it('aplica os campos só aos ambientes com circuito do mesmo nível', () => {
    const s = projetoComAmbientes();
    const ids = roomsWithCircuitOnLevel(s.project, 'lv_0').map((r) => r.id);
    expect(ids).toEqual(['r1', 'r2']);
    const cmd = applyLabelFieldsToLevelCommand(s.project, 'lv_0', ['name', 'area']);
    expect(cmd).toEqual({ type: 'updateElements', ids: ['r1', 'r2'], patch: { labelFields: ['name', 'area'] } });
    s.exec(cmd, 'Alterar campos do rótulo');
    expect(roomOf(s, 'r1').labelFields).toEqual(['name', 'area']);
    expect(roomOf(s, 'r2').labelFields).toEqual(['name', 'area']);
    expect(roomOf(s, 'r3').labelFields).toBeUndefined();
    expect(roomOf(s, 'r4').labelFields).toBeUndefined();
  });
});
