import { describe, expect, it } from 'vitest';
import { simplifyMesh } from './simplify';
import type { ImportedMeshDef } from './types';

/** Esfera UV com n x n quadrados, dois materiais (hemisferios), UV em repeticoes. */
function sphere(n: number, r = 1): ImportedMeshDef {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (Math.PI * i) / n;
    for (let j = 0; j <= n; j++) {
      const ph = (2 * Math.PI * j) / n;
      const x = Math.sin(th) * Math.cos(ph);
      const y = Math.sin(th) * Math.sin(ph);
      const z = Math.cos(th);
      pos.push(x * r, y * r, z * r);
      nor.push(x, y, z);
      uv.push((j / n) * 4, (i / n) * 4);
    }
  }
  const lower: number[] = [];
  const upper: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      const t = i < n / 2 ? upper : lower;
      t.push(a, c, b, b, c, d);
    }
  }
  return {
    id: 's',
    name: 's',
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uv),
    indices: new Uint32Array([...upper, ...lower]),
    groups: [
      { start: 0, count: upper.length, materialIndex: 0 },
      { start: upper.length, count: lower.length, materialIndex: 2 },
    ],
  };
}

function bbox(p: Float32Array) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      mn[a] = Math.min(mn[a]!, p[i + a]!);
      mx[a] = Math.max(mx[a]!, p[i + a]!);
    }
  }
  return { mn, mx };
}

describe('simplifyMesh', () => {
  const big = sphere(120); // ~28.800 triangulos
  const total = big.indices.length / 3;

  it('devolve a mesma malha quando ja esta na meta', () => {
    expect(simplifyMesh(big, total + 10)).toBe(big);
  });

  it('reduz perto da meta', () => {
    for (const target of [2000, 5000]) {
      const s = simplifyMesh(big, target);
      const t = s.indices.length / 3;
      expect(t).toBeLessThanOrEqual(target * 1.15);
      expect(t).toBeGreaterThan(target * 0.5);
    }
  });

  it('nao cria triangulos degenerados e os indices sao validos', () => {
    const s = simplifyMesh(big, 1500);
    const nv = s.positions.length / 3;
    for (let t = 0; t < s.indices.length; t += 3) {
      const a = s.indices[t]!;
      const b = s.indices[t + 1]!;
      const c = s.indices[t + 2]!;
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(a).not.toBe(c);
      expect(Math.max(a, b, c)).toBeLessThan(nv);
      const u = [0, 1, 2].map((k) => s.positions[b * 3 + k]! - s.positions[a * 3 + k]!);
      const v = [0, 1, 2].map((k) => s.positions[c * 3 + k]! - s.positions[a * 3 + k]!);
      const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      expect(Math.hypot(cr[0]!, cr[1]!, cr[2]!)).toBeGreaterThan(0);
    }
  });

  it('preserva bbox dentro de tolerancia', () => {
    const s = simplifyMesh(big, 3000);
    const a = bbox(big.positions);
    const b = bbox(s.positions);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(a.mn[k]! - b.mn[k]!)).toBeLessThan(0.15);
      expect(Math.abs(a.mx[k]! - b.mx[k]!)).toBeLessThan(0.15);
    }
  });

  it('preserva grupos de material consistentes, normais unitarias e UVs', () => {
    const s = simplifyMesh(big, 3000);
    expect(s.groups.map((g) => g.materialIndex)).toEqual([0, 2]);
    let end = 0;
    for (const g of s.groups) {
      expect(g.start).toBe(end);
      expect(g.count % 3).toBe(0);
      end += g.count;
    }
    expect(end).toBe(s.indices.length);
    expect(s.normals.length).toBe(s.positions.length);
    for (let i = 0; i < s.normals.length; i += 3) {
      expect(Math.hypot(s.normals[i]!, s.normals[i + 1]!, s.normals[i + 2]!)).toBeCloseTo(1, 4);
      // normais apontam para fora (como na esfera): n . p > 0
      expect(s.normals[i]! * s.positions[i]! + s.normals[i + 1]! * s.positions[i + 1]! + s.normals[i + 2]! * s.positions[i + 2]!).toBeGreaterThan(0);
    }
    expect(s.uvs.length).toBe((s.positions.length / 3) * 2);
    for (const v of s.uvs) {
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(4 + 1e-6);
    }
  });

  it('mantem uvs vazio quando nao ha UV', () => {
    const d = { ...big, uvs: new Float32Array(0) };
    expect(simplifyMesh(d, 2000).uvs.length).toBe(0);
  });
});
