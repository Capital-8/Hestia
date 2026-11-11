import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arestasPorAngulo } from './arestasRapidas3d.ts';

function viaThree(pos: number[], idx: number[] | null, ang: number): number[] {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (idx) g.setIndex(idx);
  const e = new THREE.EdgesGeometry(g, ang);
  return Array.from(e.getAttribute('position').array);
}

/** Gerador pseudoaleatório determinístico. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function cubo(cx: number, cy: number, cz: number, l: number): { pos: number[]; idx: number[] } {
  const v: number[][] = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) v.push([cx + x * l, cy + y * l, cz + z * l]);
  const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const idx: number[] = [];
  for (const q of f) idx.push(q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!);
  return { pos: v.flat(), idx };
}

describe('arestasPorAngulo: igual ao THREE.EdgesGeometry', () => {
  it('cubo indexado e vários cubos juntos', () => {
    const c = cubo(0, 0, 0, 1);
    expect(arestasPorAngulo(c.pos, c.idx, 28)).toEqual(viaThree(c.pos, c.idx, 28));
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < 20; i++) {
      const k = cubo(i * 1.5, (i % 3) * 0.7, 0.123 * i, 0.5 + (i % 4) * 0.1);
      idx.push(...k.idx.map((x) => x + pos.length / 3));
      pos.push(...k.pos);
    }
    expect(arestasPorAngulo(pos, idx, 28)).toEqual(viaThree(pos, idx, 28));
  });

  it('malha sem índices (3 vértices por triângulo) com faces coplanares, degeneradas e duplicadas', () => {
    const r = rng(7);
    const pos: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = [Math.round(r() * 6) / 2, Math.round(r() * 6) / 2, Math.round(r() * 2) / 2];
      const b = [Math.round(r() * 6) / 2, Math.round(r() * 6) / 2, Math.round(r() * 2) / 2];
      const c = [Math.round(r() * 6) / 2, Math.round(r() * 6) / 2, Math.round(r() * 2) / 2];
      pos.push(...a, ...b, ...c);
    }
    for (const ang of [1, 10, 28, 60, 89]) expect(arestasPorAngulo(pos, null, ang)).toEqual(viaThree(pos, null, ang));
  });

  it('coordenadas fracionárias e negativas, vértices a menos de 1e-4 (mesmo hash)', () => {
    const r = rng(11);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < 200; i++) {
      pos.push((r() - 0.5) * 40, (r() - 0.5) * 40, r() * 9);
      if (i % 3 === 0 && i > 0) pos.push(pos[pos.length - 3]! + 3e-5, pos[pos.length - 2]!, pos[pos.length - 1]!);
    }
    const n = pos.length / 3;
    for (let t = 0; t < 400; t++) idx.push(Math.floor(r() * n), Math.floor(r() * n), Math.floor(r() * n));
    expect(arestasPorAngulo(pos, idx, 28)).toEqual(viaThree(pos, idx, 28));
  });
});
