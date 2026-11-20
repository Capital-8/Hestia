import { describe, expect, it } from 'vitest';
import type { MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeFloor, makeLevel, makeRoom, makeWall, type Project, type Wall } from '@hestia/model';
import { resolveLevel } from './resolve.ts';
import { resolveRooms } from './rooms.ts';
import { juncaoInclinadaDaParede } from './junctionLevel.ts';
import { quantifyLevel } from './quantities.ts';
import { paredesParceiras } from './resolveParceiras.ts';
import { outerPerimeter } from './enclosed.ts';

const butt = { kind: 'butt', flip: false } as const;
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const maxY = (mp: MultiPolygon): number => Math.max(...mp.flat(2).map((pt) => pt.y));
const camada0MaxY = (p: Project, lv: string, id: string): number => maxY(resolveLevel(p, lv, new Map()).walls[id]!.layers[0]!.fragment);

function niveis(): Project {
  const base = createEmptyProject();
  base.levels = [
    makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }),
    makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }),
    makeLevel({ id: 'lv_2', name: 'Pavimento 3', elevation: 6 }),
    makeLevel({ id: 'lv_3', name: 'Pavimento 4', elevation: 9 }),
  ];
  return base;
}

describe('parceira com anexo: a faixa REAL decide a sobreposição', () => {
  // W1 (de 1,03 a 7,10 em y = 3,96) em lv_2 (6 a 9 m nominal); W2 (lv_1, 3 a 6 m) termina em (7,10; 3,96).
  // Piso de lv_2 com a face superior em 6 + heightOffset; W1 com base anexada ao piso.
  function build(offset: number): Project {
    const s = new ProjectStore(niveis());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_2', a: { x: 1.03, y: 3.96 }, b: { x: 7.1, y: 3.96 }, topLevelId: 'lv_3', attachBottomToFloor: true, joinStart: butt, joinEnd: butt }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W2', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 6.86, y: 2.57 }, b: { x: 7.1, y: 3.96 }, topLevelId: 'lv_2', joinStart: butt, joinEnd: butt }) });
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_2', boundary: rect(0, 3, 8, 5), heightOffset: offset }) });
    return s.project;
  }

  it('piso a 5,5 m (6 - 0,5): a base real de W1 é 5,5, ela entra em 5,5 a 6 com W2 (3 a 6) e W2 para na face de W1 em y = 3,96 - 0,092 = 3,868', () => {
    const p = build(-0.5);
    expect(paredesParceiras(p, 'lv_1').map((w) => w.id)).toEqual(['W1']);
    expect(camada0MaxY(p, 'lv_1', 'W2')).toBeCloseTo(3.868, 6);
  });

  it('piso a 6,05 m: a base real é 6,05, nada em comum com W2 (topo em 6): sem parceira, W2 livre em y = 3,9757', () => {
    const p = build(0.05);
    expect(paredesParceiras(p, 'lv_1')).toEqual([]);
    expect(camada0MaxY(p, 'lv_1', 'W2')).toBeCloseTo(3.9757, 3);
  });

  it('o dono continua sendo lv_2: W1 só aparece no nível dela e no quantitativo dela, uma vez', () => {
    const p = build(-0.5);
    expect(Object.keys(resolveLevel(p, 'lv_1', new Map()).walls)).toEqual(['W2']);
    expect(quantifyLevel(p, resolveLevel(p, 'lv_1')).walls.map((w) => w.wallId)).toEqual(['W2']);
    expect(quantifyLevel(p, resolveLevel(p, 'lv_2')).walls.map((w) => w.wallId)).toEqual(['W1']);
  });
});

describe('junção inclinada entre níveis', () => {
  // W1 (lv_0, de (0,0) a (5,0), 0 a 6 m, vertical) e W2 (lv_1, de (5,0) a (5,4), 3 a 6 m, inclinada 10 graus).
  function build(): Project {
    const s = new ProjectStore(niveis());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, height: 6 }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W2', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 5, y: 0 }, b: { x: 5, y: 4 }, height: 3, tilt: 10 }) });
    return s.project;
  }

  it('W2 (10 graus, H = 3) ganha junção com W1 de outro nível: o topo se desloca para a esquerda 3 x tan 10 = 0,528981 m', () => {
    const j = juncaoInclinadaDaParede(build(), 'lv_1', 'W2')!;
    expect(j.H).toBeCloseTo(3, 9);
    const l = j.layers[0]!;
    // Vértice na face de dentro da parede, na altura de W1: x vai de 5 - 0,092 (/cos 10 na espessura) ao deslocamento de topo.
    expect(l.pH[0]!.x - l.p0[0]!.x).toBeCloseTo(-0.528981, 5);
    expect(l.pH[0]!.y).toBeCloseTo(0.092, 4);
  });

  it('W1 (vertical, mais alta que a parceira inclinada): não é refeita nem recebe cunha; junções só do nível dono', () => {
    const p = build();
    expect(juncaoInclinadaDaParede(p, 'lv_0', 'W1')).toBeUndefined();
    expect(juncaoInclinadaDaParede(p, 'lv_1', 'W1')).toBeUndefined();
    expect(Object.keys(resolveLevel(p, 'lv_1', new Map()).walls)).toEqual(['W2']);
  });
});

describe('ambiente fechado por parede de outro nível', () => {
  // Sala de 4 x 4 m no nível 2 (6 m): eixos a 0,092 das faces (parede de 0,184 m), faces internas em x, y = 0 e 4.
  function build(topoD: string): Project {
    const s = new ProjectStore(niveis());
    const w = (id: string, a: [number, number], b: [number, number], lv: string, extra: Partial<Wall> = {}) =>
      s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: lv, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, height: 3, ...extra }) });
    w('A', [-0.092, -0.092], [4.092, -0.092], 'lv_2');
    w('B', [4.092, -0.092], [4.092, 4.092], 'lv_2');
    w('C', [4.092, 4.092], [-0.092, 4.092], 'lv_2');
    // D é do nível 1 (3 m), com o topo no nível pedido: em lv_3 (9 m) ela cobre o nível 2 inteiro.
    w('D', [-0.092, 4.092], [-0.092, -0.092], 'lv_1', { topLevelId: topoD });
    s.exec({ type: 'addRoom', room: makeRoom({ id: 'r', levelId: 'lv_2', name: 'Sala', number: '201', point: { x: 2, y: 2 } }) });
    return s.project;
  }

  it('D no nível 1 com topo no nível 3: o ambiente do nível 2 existe e tem 16 m2 (4 x 4)', () => {
    const r = resolveRooms(build('lv_3'), 'lv_2')[0]!;
    expect(r.problem).toBeNull();
    expect(r.area).toBeCloseTo(16, 6);
    expect(r.perimeter).toBeCloseTo(16, 6);
  });

  it('D com topo em lv_2 (6 m): não chega ao plano de corte do nível 2, o circuito fica aberto', () => {
    const r = resolveRooms(build('lv_2'), 'lv_2')[0]!;
    expect(r.problem).toBe('aberto');
    expect(r.area).toBe(0);
  });

  it('D não é duplicada nem muda de dono: o nível 2 resolve 3 paredes e o contorno externo usa as 4', () => {
    const p = build('lv_3');
    expect(Object.keys(resolveLevel(p, 'lv_2', new Map()).walls).sort()).toEqual(['A', 'B', 'C']);
    expect(quantifyLevel(p, resolveLevel(p, 'lv_1')).walls.map((x) => x.wallId)).toEqual(['D']);
    const ring = outerPerimeter(p, 'lv_2', { x: 2, y: 2 })!;
    const xs = ring.map((q) => q.x);
    // Face externa de D (esquerda) em x = -0,184; face externa de B em x = 4,184: largura 4,368.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.368, 6);
  });
});
