import { describe, expect, it } from 'vitest';
import {
  posarArrastado as posarArrastadoReal,
  type CaixaLocal,
  type Corpo,
  type EntradaArrasto,
  type FaceDeParede,
  type OpcoesArrasto,
  type Pose,
  type ResultadoArrasto,
} from '@hestia/engine';
import { createEmptyProject, type Component, type Id, type Project } from '@hestia/model';
import { Arrasto3D, type DepsArrasto3D } from './arrasto3d.ts';

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [1, 1, 1] };

/** Projeto mínimo com componentes soltos na origem dos ids, sem família real (o arrasto só lê a pose). */
function projetoCom(poses: Record<Id, { x: number; y: number; rotation?: number }>): Project {
  const p = createEmptyProject();
  let ordem = 1;
  for (const [id, pose] of Object.entries(poses)) {
    const c: Component = {
      id,
      kind: 'component',
      familyId: 'f',
      typeId: null,
      levelId: 'lv_0',
      order: ordem++,
      x: pose.x,
      y: pose.y,
      z: 0,
      rotation: pose.rotation ?? 0,
      mirrored: false,
      mark: id,
    };
    p.elements[id] = c;
  }
  return p;
}

/** Dependências de teste: o encaixe devolve a pose desejada e o entorno fica vazio. */
function deps(overrides: Partial<DepsArrasto3D> = {}): DepsArrasto3D {
  return {
    caixaLocalDoComponente: () => CAIXA,
    corposDoNivel: () => [],
    facesDasParedes: () => [],
    posarArrastado: (entrada) => ({ pose: entrada.alvo.pose, colisoes: { moveis: [], paredes: [] }, guias: [] }),
    ...overrides,
  };
}

/** Encaixe simulado: registra a entrada e devolve a pose que o teste mandar. */
function encaixeFixo(pose: Pose, extra: Partial<ResultadoArrasto> = {}): { deps: Partial<DepsArrasto3D>; vistos: OpcoesArrasto[] } {
  const vistos: OpcoesArrasto[] = [];
  return {
    vistos,
    deps: {
      posarArrastado: (_entrada: EntradaArrasto, opcoes: OpcoesArrasto = {}) => {
        vistos.push(opcoes);
        return { pose, colisoes: { moveis: [], paredes: [] }, guias: [], ...extra };
      },
    },
  };
}

describe('Arrasto3D', () => {
  it('sem encaixe, o deslocamento do ponteiro move só o líder', () => {
    const p = projetoCom({ c1: { x: 1, y: 2 } });
    const arrasto = new Arrasto3D({ projeto: p, ids: ['c1'], levelId: 'lv_0', ponteiro: { x: 0, y: 0 }, deps: deps() });
    const r = arrasto.mover({ x: 2, y: 3 }, { semEncaixe: false });
    expect(r.poses.get('c1')).toEqual({ x: 3, y: 5, rotation: 0 });
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.colisoes).toEqual([]);
  });

  it('com semEncaixe, o encaixe não altera a pose desejada', () => {
    const p = projetoCom({ c1: { x: 0, y: 0 } });
    const vistos: OpcoesArrasto[] = [];
    const simulado: Partial<DepsArrasto3D> = {
      posarArrastado: (entrada: EntradaArrasto, opcoes: OpcoesArrasto = {}) => {
        vistos.push(opcoes);
        const pose = opcoes.semEncaixe ? entrada.alvo.pose : { x: 99, y: 99, rotation: 0, mirrored: false, z: 0 };
        return { pose, colisoes: { moveis: [], paredes: [] }, guias: [] };
      },
    };
    const arrasto = new Arrasto3D({ projeto: p, ids: ['c1'], levelId: 'lv_0', ponteiro: { x: 0, y: 0 }, deps: { ...deps(), ...simulado } });
    const r = arrasto.mover({ x: 1, y: 1 }, { semEncaixe: true });
    expect(r.poses.get('c1')).toEqual({ x: 1, y: 1, rotation: 0 });
    expect(vistos).toEqual([{ semEncaixe: true }]);
  });

  it('conjunto de 3 membros anda rigidamente com o líder', () => {
    const p = projetoCom({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, c: { x: 0, y: 1 } });
    const arrasto = new Arrasto3D({ projeto: p, ids: ['a', 'b', 'c'], levelId: 'lv_0', ponteiro: { x: 0, y: 0 }, deps: deps() });
    const r = arrasto.mover({ x: 2, y: 3 }, { semEncaixe: false });
    expect(r.poses.get('a')).toEqual({ x: 2, y: 3, rotation: 0 });
    expect(r.poses.get('b')).toEqual({ x: 3, y: 3, rotation: 0 });
    expect(r.poses.get('c')).toEqual({ x: 2, y: 4, rotation: 0 });
  });

  it('líder encaixado na parede girando 90° gira os outros em torno da pose inicial dele', () => {
    const p = projetoCom({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, c: { x: 0, y: 1 } });
    const simulado = encaixeFixo({ x: 5, y: 5, rotation: Math.PI / 2, mirrored: false, z: 0 });
    const arrasto = new Arrasto3D({ projeto: p, ids: ['a', 'b', 'c'], levelId: 'lv_0', ponteiro: { x: 0, y: 0 }, deps: { ...deps(), ...simulado.deps } });
    const r = arrasto.mover({ x: 0, y: 0 }, { semEncaixe: false });
    // b = (5, 5) + R(90°) · (1, 0) = (5, 6); c = (5, 5) + R(90°) · (0, 1) = (4, 5).
    expect(r.poses.get('a')).toEqual({ x: 5, y: 5, rotation: Math.PI / 2 });
    expect(r.poses.get('b')?.x).toBeCloseTo(5, 10);
    expect(r.poses.get('b')?.y).toBeCloseTo(6, 10);
    expect(r.poses.get('b')?.rotation).toBeCloseTo(Math.PI / 2, 10);
    expect(r.poses.get('c')?.x).toBeCloseTo(4, 10);
    expect(r.poses.get('c')?.y).toBeCloseTo(5, 10);
    expect(r.poses.get('c')?.rotation).toBeCloseTo(Math.PI / 2, 10);
  });

  it('repassa parede, vizinho e colisões do encaixe simulado', () => {
    const p = projetoCom({ a: { x: 0, y: 0 } });
    const simulado = encaixeFixo(
      { x: 3, y: 4, rotation: 0.5, mirrored: false, z: 0 },
      { parede: 2, vizinho: 'b', colisoes: { moveis: ['c', 'd'], paredes: [0] } },
    );
    const arrasto = new Arrasto3D({ projeto: p, ids: ['a'], levelId: 'lv_0', ponteiro: { x: 0, y: 0 }, deps: { ...deps(), ...simulado.deps } });
    const r = arrasto.mover({ x: 0, y: 0 }, { semEncaixe: false });
    expect(r.poses.get('a')).toEqual({ x: 3, y: 4, rotation: 0.5 });
    expect(r.parede).toBe(2);
    expect(r.vizinho).toBe('b');
    expect(r.colisoes).toEqual(['c', 'd']);
  });

  it('desempenho (não bloqueante): 60 passos com 40 corpos e 12 faces', () => {
    const p = projetoCom({ lider: { x: 0, y: 0 } });
    const outros: Corpo[] = Array.from({ length: 40 }, (_, i) => ({
      id: 'o' + i,
      pose: { x: 100 + i * 2, y: 100, rotation: 0, mirrored: false, z: 0 },
      caixa: CAIXA,
    }));
    const faces: FaceDeParede[] = Array.from({ length: 12 }, (_, i) => ({
      a: { x: i * 5, y: 200 },
      b: { x: i * 5 + 4, y: 200 },
    }));
    const arrasto = new Arrasto3D({
      projeto: p,
      ids: ['lider'],
      levelId: 'lv_0',
      ponteiro: { x: 0, y: 0 },
      deps: deps({ corposDoNivel: () => outros, facesDasParedes: () => faces, posarArrastado: posarArrastadoReal }),
    });
    const inicio = performance.now();
    for (let i = 0; i < 60; i++) arrasto.mover({ x: i * 0.01, y: i * 0.01 }, { semEncaixe: false });
    const total = performance.now() - inicio;
    // A meta é < 50 ms; o teste não bloqueia o portão por tempo (máquina de CI lenta).
    expect(total).toBeLessThan(1000);
  });
});
