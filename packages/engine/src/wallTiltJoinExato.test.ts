import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { levelFrames } from './resolveFrames.ts';
import { analyzeLevelTilt, wallTiltJoinIssues } from './wallTiltJoinLevel.ts';

/** C1: critério EXATO da junção inclinada (cenário do navegador: wt_conc15 multicamada, 4 m, H=2,8). */
type P = { x: number; y: number };
const L = (tA: number, tB: number, wt = 'wt_conc15', cmp = 4): Project => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: wt, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: cmp, y: 0 }, ...(tA ? { tilt: tA } : {}) }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: wt, levelId: 'lv_0', a: { x: cmp, y: 0 }, b: { x: cmp, y: cmp }, ...(tB ? { tilt: tB } : {}) }) });
  return s.project;
};
const line = (tA: number, tB: number, h = 2.8): Project => {
  const s = new ProjectStore(createEmptyProject());
  const ws: Array<[string, P, P, number]> = [['A', { x: 0, y: 0 }, { x: 4, y: 0 }, tA], ['B', { x: 4, y: 0 }, { x: 8, y: 0 }, tB]];
  for (const [id, a, b, t] of ws) s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_conc15', levelId: 'lv_0', height: h, a, b, ...(t ? { tilt: t } : {}) }) });
  return s.project;
};
const an = (p: Project) => analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', 2.8], ['B', 2.8]]));

describe('C1 · junção inclinada exata (cenários P1/P3 do navegador)', () => {
  const casos: Array<[number, number]> = [[15, 30], [-15, -30], [15, -30], [20, 0], [-20, 0], [0, 20], [0, -20], [30, 15], [-30, 15]];
  for (const [a, b] of casos) {
    it(`L ${a}°/${b}°: junção das duas paredes, camadas com anéis válidos e sem aviso`, () => {
      const r = an(L(a, b));
      expect(r.avisos).toEqual([]);
      expect([...r.joins.keys()].sort()).toEqual(['A', 'B']);
      for (const j of r.joins.values()) for (const l of j.layers) { expect(l.p0.length).toBe(l.raw.length); expect(l.pH.length).toBe(l.raw.length); }
      expect(wallTiltJoinIssues(L(a, b))).toEqual([]);
    });
  }
  it('controle 0°/0°: nada muda (sem junção inclinada, sem avisos)', () => {
    const r = an(L(0, 0));
    expect(r.joins.size).toBe(0);
    expect(r.avisos).toEqual([]);
  });
  it('anel do topo segue o cruzamento dos eixos da tabela do S1: nó (4 − z·tanθB, z·tanθA)', () => {
    const [tA, tB] = [15, 30];
    const j = an(L(tA, tB)).joins.get('A')!;
    const core = j.layers.find((l) => l.layerIndex === 2)!;
    const H = j.H, D = Math.PI / 180;
    // vértices do lado do nó (x > 3) na cota H: o ponto médio do eixo cai sobre o cruzamento dos eixos
    const no = { x: 4 - H * Math.tan(tB * D), y: H * Math.tan(tA * D) };
    const near = core.pH.filter((q) => Math.hypot(q.x - no.x, q.y - no.y) < 0.5);
    expect(near.length).toBeGreaterThanOrEqual(2);
    // o cruzamento dos eixos fica entre os vértices de canto da camada (dentro de meia espessura horizontal)
    const my = near.reduce((u, q) => u + q.y, 0) / near.length;
    expect(Math.abs(my - no.y)).toBeLessThan(0.12);
    expect(Math.max(...near.map((q) => q.x))).toBeGreaterThan(no.x - 0.05);
  });
  it('cruzamento fora da parede (curta) vai para plano B: encosto, junção das duas e aviso visível', () => {
    const st = new ProjectStore(createEmptyProject());
    st.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_conc15', levelId: 'lv_0', height: 6, a: { x: 2, y: 0 }, b: { x: 0, y: 0 }, tilt: -45 }) });
    st.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_conc15', levelId: 'lv_0', height: 6, a: { x: 0, y: 0 }, b: { x: 0, y: 2 }, tilt: -45 }) });
    const r = analyzeLevelTilt(levelFrames(st.project, 'lv_0'), new Map([['A', 6], ['B', 6]]));
    expect(r.joins.size).toBe(2);
    expect(r.avisos.map((a) => a.code)).toEqual(['inclinacaoInviavelNaJuncao', 'inclinacaoInviavelNaJuncao']);
  });
});

describe('C1 · continuação com inclinações diferentes', () => {
  it('em linha, 15° e 0°, H=2,8: aviso próprio com degrau H·|tan a − tan b|, sem inclinacaoInviavelNaJuncao', () => {
    const r = an(line(15, 0));
    expect(r.joins.size).toBe(0);
    expect(r.avisos.length).toBe(1);
    expect(r.avisos[0]!.code).toBe('inclinacoesDiferentesEmContinuacao');
    expect(r.avisos[0]!.valor).toBeCloseTo(2.8 * Math.tan(Math.PI / 12), 9);
    const msgs = wallTiltJoinIssues(line(15, 0), 'pt');
    expect(msgs.map((i) => i.code)).toEqual(['inclinacoesDiferentesEmContinuacao']);
    expect(msgs[0]!.message).toContain('0,75'); // valor formatado pelo sistema de unidades, em metros
    expect(wallTiltJoinIssues(line(15, 0), 'en')[0]!.message).toContain('step');
  });
  it('mesma inclinação em linha: sem degrau, sem aviso', () => {
    const r = an(line(15, 15));
    expect(r.avisos).toEqual([]);
  });
  it('degrau dentro da tolerância de 5 mm: sem aviso', () => {
    expect(an(line(15, 15.05)).avisos).toEqual([]);
  });
});
