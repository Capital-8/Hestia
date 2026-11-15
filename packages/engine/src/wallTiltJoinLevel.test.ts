import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { analyzeLevelTilt, projetoTemParedeInclinada, wallTiltJoinIssues } from './wallTiltJoinLevel.ts';
import { levelFrames } from './resolveFrames.ts';
import { junctionLevel } from './junctionLevel.ts';
import { resolveLevel, resolveLevelTs } from './resolve.ts';
import { instalarDespachoKernel, removerDespachoKernel } from './kernelDespacho.ts';
import { despachanteDeJuncao, despachanteDeNivel } from './resolveDespacho.ts';
import { syntheticProject } from './fixtureSintetica.ts';

/** F2.4 · junção inclinada de um nível: topologia só da base, avisos e guarda do kernel. */

afterEach(() => removerDespachoKernel());

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
const miter = { kind: 'miter' as const, flip: false };
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number; kind?: 'miter' | 'butt' }

function build(walls: W[], height = 3): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: w.kind ?? 'miter', flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const A15: W = { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 };
const B15: W = { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 15 };
void miter;

describe('F2.4 · analyzeLevelTilt', () => {
  it('canto 15°/15° (H=3): anel do topo com o canto em (-0,8038; -0,8038) e espessura horizontal 0,2071', () => {
    const p = build([A15, B15]);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', 3], ['B', 3]]));
    expect(an.avisos).toEqual([]);
    const a = an.joins.get('A')!;
    expect(a.H).toBe(3);
    const L = a.layers[0]!;
    // anel da parede A: [a-baixo, b-baixo, b-cima, a-cima]; vértices do canto (b) no topo
    expect(L.pH[1]!.x).toBeCloseTo(-0.7003199592523598, 9);
    expect(L.pH[1]!.y).toBeCloseTo(-0.7003199592523598, 9);
    expect(L.pH[2]!.x).toBeCloseTo(-0.9073751953343764, 9);
    expect(L.pH[2]!.y).toBeCloseTo(-0.9073751953343764, 9);
    expect(L.p0[1]!.y).toBeCloseTo(0.10352761804100830, 9);
    expect(L.raw[1]!.y).toBeCloseTo(0.1, 12);
  });

  it('sem parede inclinada: nenhuma junção, nenhum aviso, nenhum cálculo (caminho de hoje)', () => {
    const p = build([{ ...A15, tilt: 0 }, { ...B15, tilt: 0 }]);
    expect(projetoTemParedeInclinada(p)).toBe(false);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'));
    expect(an.joins.size).toBe(0);
    expect(an.avisos).toEqual([]);
    expect(wallTiltJoinIssues(p)).toEqual([]);
    for (const w of Object.values(junctionLevel(p, 'lv_0').walls)) expect(w.tilt).toBeUndefined();
  });

  it('arco inclinado ligado a outra parede: plano B, sem junção e com o aviso arcoInclinadoSemJuncao', () => {
    const R = 5, c = R * Math.SQRT2;
    const p = build([
      { id: 'A', a: { x: 0, y: 0 }, b: { x: c, y: 0 }, sag: R * (1 - Math.SQRT1_2), tilt: 15 },
      { id: 'B', a: { x: c, y: 0 }, b: { x: c, y: -4 } },
    ]);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', 3], ['B', 3]]));
    expect(an.joins.size).toBe(0);
    expect(an.avisos).toEqual([{ code: 'arcoInclinadoSemJuncao', wallId: 'A' }]);
    const issues = wallTiltJoinIssues(p);
    expect(issues.map((i) => [i.code, i.elementId, i.severity])).toEqual([['arcoInclinadoSemJuncao', 'A', 'warning']]);
    expect(issues[0]!.message).toContain('"A"');
    expect(junctionLevel(p, 'lv_0').walls.get('A')?.tilt).toBeUndefined();
  });

  it('cruzamento fora da parede (-45°/-45°, L=2, H=6): plano B (encosto, sem degradar o conjunto) e avisa inclinacaoInviavelNaJuncao', () => {
    const p = build([
      { id: 'A', a: { x: 2, y: 0 }, b: { x: 0, y: 0 }, tilt: -45 },
      { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 2 }, tilt: -45 },
    ], 6);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', 6], ['B', 6]]));
    expect(an.joins.size).toBe(2); // C1: o par vira encosto (face da vizinha em toda a altura), não corte vertical na base
    expect(an.avisos).toEqual([{ code: 'inclinacaoInviavelNaJuncao', wallId: 'A' }, { code: 'inclinacaoInviavelNaJuncao', wallId: 'B' }]);
    expect(wallTiltJoinIssues(p).map((i) => i.code)).toEqual(['inclinacaoInviavelNaJuncao', 'inclinacaoInviavelNaJuncao']);
    // a mesma geometria com H=1 cabe: a inviabilidade depende da altura REAL (topo anexado a piso/telhado)
    const ok = analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', 1], ['B', 1]]));
    expect(ok.joins.size).toBe(2);
  });

  it('parede cujo topo cruza uma terceira parede NÃO ganha junção nova (topologia só da base)', () => {
    const C: W = { id: 'C', a: { x: 2, y: -1.5 }, b: { x: 2, y: -0.5 } };
    const sem = analyzeLevelTilt(levelFrames(build([A15, B15]), 'lv_0'), new Map([['A', 3], ['B', 3]]));
    const com = analyzeLevelTilt(levelFrames(build([A15, B15, C]), 'lv_0'), new Map([['A', 3], ['B', 3], ['C', 3]]));
    expect([...com.joins.keys()].sort()).toEqual(['A', 'B']);
    expect(com.joins.get('A')).toEqual(sem.joins.get('A'));
    expect(com.joins.get('B')).toEqual(sem.joins.get('B'));
    expect(com.avisos).toEqual([]);
  });
});

describe('F2.4 · guarda do kernel (E5): projeto com parede inclinada resolve no TS mesmo com as fatias ligadas', () => {
  const ligadas = { fatiaA: true, fatiaB: true, sombra: false };
  it('com parede inclinada o Rust nem é consultado (resolver, junção, pisos, lajes e quantidades)', () => {
    const p = build([A15, B15]);
    const espiao = vi.fn(() => null);
    const d = instalarDespachoKernel({ gerenciador: espiao, config: () => ligadas });
    const ts = vi.fn(() => resolveLevelTs(p, 'lv_0', new Map()));
    const r = despachanteDeNivel()!(p, 'lv_0', {}, ts);
    expect(ts).toHaveBeenCalledTimes(1);
    expect(r.walls.A!.tilt).toBe(15);
    const tsJ = vi.fn(() => junctionLevel(p, 'lv_0'));
    despachanteDeJuncao()!(p, 'lv_0', tsJ);
    expect(tsJ).toHaveBeenCalledTimes(1);
    expect(d.quantificar(p, 'lv_0', 'paredes')).toBeNull();
    expect(d.resolverPisos(p, 'lv_0', () => [])).toEqual([]);
    expect(d.resolverLajes(p, 'lv_0', () => [])).toEqual([]);
    expect(espiao).not.toHaveBeenCalled();
    expect(resolveLevel(p, 'lv_0').walls.A!.tilt).toBe(15);
  });

  it('controle: sem parede inclinada e wasm ainda sem carregar, a fatia ligada continua pendente (não vai ao TS)', () => {
    const p = syntheticProject(2);
    instalarDespachoKernel({ gerenciador: () => null, config: () => ligadas });
    expect(() => despachanteDeNivel()!(p, p.levels[0]!.id, {}, () => resolveLevelTs(p, p.levels[0]!.id, new Map()))).toThrow();
  });
});
