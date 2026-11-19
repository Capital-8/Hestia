import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeWall } from '@hestia/model';
import { componentSnapGeometry, componentSnapIndex } from './componentSnap.ts';

const tem = (g: ReturnType<typeof componentSnapGeometry>, x: number, y: number): boolean => g.points.some((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9);

describe('captura do terreno e da região no motor das ferramentas', () => {
  it('T8: vértices e arestas da borda e as fontes como extremidade', () => {
    const g = componentSnapGeometry(projetoTerreno('T8'), 'lv_0');
    for (const [x, y] of [[5, 5], [15, 5], [15, 15], [5, 15]] as const) expect(tem(g, x, y), `borda ${x},${y}`).toBe(true);
    expect(tem(g, 10, 10)).toBe(true);
    expect(tem(g, 0, 0)).toBe(true);
    expect(g.segments.length).toBeGreaterThanOrEqual(4);
    expect(g.points.some((q) => q.kind === 'midpoint' && q.x === 10 && q.y === 5)).toBe(true);
  });

  it('sem kernel e sem borda do modelo: a envoltória das fontes é a borda de captura (T1: 4 arestas)', () => {
    const g = componentSnapGeometry(projetoTerreno('T1'), 'lv_0');
    expect(g.segments).toHaveLength(4);
    expect(g.points.filter((q) => q.kind === 'endpoint')).toHaveLength(4);
  });

  it('região (T5): vértices e arestas do contorno chegam à captura', () => {
    const g = componentSnapGeometry(projetoTerreno('T5'), 'lv_0');
    for (const [x, y] of [[5, 5], [15, 5], [15, 15], [5, 15]] as const) expect(tem(g, x, y)).toBe(true);
    expect(g.segments.length).toBeGreaterThanOrEqual(8);
  });

  it('outro nível não recebe a captura do terreno', () => {
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P1', elevation: 3 }) });
    expect(componentSnapGeometry(s.project, 'lv_1').points).toHaveLength(0);
  });

  it('índice por assinatura: editar uma parede não refaz o índice; editar o terreno refaz', () => {
    const p0 = projetoTerreno('T3');
    const i0 = componentSnapIndex(p0, 'lv_0');
    const s = new ProjectStore(p0);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    expect(componentSnapIndex(s.project, 'lv_0')).toBe(i0);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'addPonto', x: 3, y: 3, z: 1 }] } as never);
    expect(componentSnapIndex(s.project, 'lv_0')).not.toBe(i0);
  });

  it('editar um terreno não refaz o apoio do outro', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T1');
    adicionarFixtureTerreno(s, 'T3');
    const p0 = s.project;
    const pontos = componentSnapGeometry(p0, 'lv_0').points;
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'addPonto', x: 3, y: 3, z: 1 }] } as never);
    const p1 = componentSnapGeometry(s.project, 'lv_0');
    expect(p1.points).not.toBe(pontos);
    const doT1 = (g: typeof p1) => g.points.filter((q) => q.hostId === 'tn_t1');
    expect(doT1(p1)[0]).toBe(doT1({ points: pontos, segments: [] })[0]);
  });
});
