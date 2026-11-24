import { describe, expect, it } from 'vitest';
import { filetarCaminho, resolverCaminho } from './corposCaminho.ts';

type V3 = [number, number, number];

function pontosDe(flat: number[]): V3[] {
  const r: V3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) r.push([flat[i] ?? 0, flat[i + 1] ?? 0, flat[i + 2] ?? 0]);
  return r;
}
function comprimento(flat: number[]): number {
  const p = pontosDe(flat);
  let s = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1] ?? [0, 0, 0];
    const b = p[i] ?? [0, 0, 0];
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return s;
}
function dir(a: V3, b: V3): V3 {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}
function ok(r: ReturnType<typeof filetarCaminho>) {
  if (!r.ok) throw new Error(r.erro);
  return r.caminho;
}
const em = (p: V3[], i: number): V3 => p[i] ?? [NaN, NaN, NaN];

describe('filetarCaminho', () => {
  it('N2: cotovelo 90° R100 tem eixo de 957,08 mm', () => {
    const P: V3[] = [[0, 0, 0], [0, 0, 0.5], [0.5, 0, 0.5]];
    // a polilinha é inscrita no arco: com 64 passos o erro cai abaixo de 0,05 mm
    const fino = ok(filetarCaminho(P, [0.1], 64));
    expect(Math.abs(comprimento(fino.pontos) * 1000 - 957.08)).toBeLessThan(0.05);
    const c = ok(filetarCaminho(P, [0.1], 12));
    expect(Math.abs(comprimento(c.pontos) * 1000 - 957.08)).toBeLessThan(0.5);
    expect(c.vertices).toEqual([0, c.pontos.length / 3 - 1]);
  });

  it('tangência e equidistância ao centro', () => {
    const P: V3[] = [[0, 0, 0], [0, 0, 0.5], [0.5, 0, 0.5]];
    const R = 0.1;
    const p = pontosDe(ok(filetarCaminho(P, [R], 12)).pontos);
    const d1 = dir(em(P, 0), em(P, 1));
    const d2 = dir(em(P, 1), em(P, 2));
    const retoIn = dir(em(p, 0), em(p, 1));
    const retoOut = dir(em(p, 13), em(p, 14));
    for (let k = 0; k < 3; k++) {
      expect(retoIn[k]).toBeCloseTo(d1[k] ?? 0, 6);
      expect(retoOut[k]).toBeCloseTo(d2[k] ?? 0, 6);
    }
    const arco = p.slice(1, 14);
    expect(arco).toHaveLength(13);
    const C: V3 = [0.1, 0, 0.4];
    for (const q of arco) expect(Math.hypot(q[0] - C[0], q[1] - C[1], q[2] - C[2])).toBeCloseTo(R, 9);
    // a corda inicial e a final formam meio passo angular com as tangentes (arco simétrico)
    const ini = dir(em(arco, 0), em(arco, 1));
    const fim = dir(em(arco, 11), em(arco, 12));
    const meio = Math.PI / 2 / 12 / 2;
    expect(Math.acos(ini[0] * d1[0] + ini[1] * d1[1] + ini[2] * d1[2])).toBeCloseTo(meio, 6);
    expect(Math.acos(fim[0] * d2[0] + fim[1] * d2[1] + fim[2] * d2[2])).toBeCloseTo(meio, 6);
    expect(em(arco, 0)[2]).toBeCloseTo(0.4, 9);
    expect(em(arco, 12)[0]).toBeCloseTo(0.1, 9);
  });

  it('desvios de 45° e 135°: A e B à distância t, no círculo', () => {
    for (const graus of [45, 135]) {
      const phi = (graus * Math.PI) / 180;
      const R = 0.05;
      const P: V3[] = [[0, 0, 0], [1, 0, 0], [1 + Math.cos(phi), Math.sin(phi), 0]];
      const p = pontosDe(ok(filetarCaminho(P, [R], 16)).pontos);
      const t = R * Math.tan(phi / 2);
      expect(em(p, 1)[0]).toBeCloseTo(1 - t, 9);
      const B = em(p, p.length - 2);
      expect(Math.hypot(B[0] - 1, B[1])).toBeCloseTo(t, 9);
      const C: V3 = [1 - t, R, 0];
      for (const q of p.slice(1, -1)) expect(Math.hypot(q[0] - C[0], q[1] - C[1], q[2])).toBeCloseTo(R, 9);
    }
  });

  it('três vértices com curvas encadeadas', () => {
    const P: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]];
    const c = ok(filetarCaminho(P, [0.2, 0.2], 8));
    expect(c.pontos.length / 3).toBe(2 + 9 + 9);
    expect(c.vertices).toEqual([0, 19]);
  });

  it('canto vivo mantém o vértice', () => {
    const c = ok(filetarCaminho([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [0], 12));
    expect(c.pontos).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
    expect(c.vertices).toEqual([0, 1, 2]);
  });

  it('recusa curvas sobrepostas e retorno de 180°', () => {
    const r = filetarCaminho([[0, 0, 0], [0.1, 0, 0], [0.1, 0.1, 0], [0.2, 0.1, 0]], [0.08, 0.08], 12);
    expect(r).toEqual({ ok: false, erro: 'curvas se sobrepõem no trecho 2' });
    expect(filetarCaminho([[0, 0, 0], [1, 0, 0], [0, 0, 0]], [0.1], 12).ok).toBe(false);
    expect(filetarCaminho([[0, 0, 0], [1, 0, 0], [0, 0, 0]], [0], 12).ok).toBe(true);
  });

  it('colinear ignora o raio; segmento nulo é erro', () => {
    const c = ok(filetarCaminho([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [0.3], 12));
    expect(c.pontos).toHaveLength(9);
    expect(filetarCaminho([[0, 0, 0], [0, 0, 0], [1, 0, 0]], [], 12).ok).toBe(false);
  });

  it('caminho 3D não coplanar com Z', () => {
    const P: V3[] = [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1]];
    const p = pontosDe(ok(filetarCaminho(P, [0.1, 0.1], 10)).pontos);
    expect(new Set(p.map((q) => q[2].toFixed(6))).size).toBeGreaterThan(2);
    expect(new Set(p.map((q) => q[1].toFixed(6))).size).toBeGreaterThan(2);
  });
});

describe('resolverCaminho', () => {
  const av = (e: string): number | null => (e === 'x' ? null : Number(e));
  it('converte mm em m e filete', () => {
    const r = resolverCaminho({ pontos: [['0', '0', '0'], ['0', '0', '500'], ['500', '0', '500']], raios: ['100'], segmentosPorCurva: '64' }, av);
    expect(r.ok && Math.abs(comprimento(r.caminho.pontos) * 1000 - 957.08) < 0.05).toBe(true);
  });
  it('fórmula inválida e raio negativo viram erro', () => {
    expect(resolverCaminho({ pontos: [['0', '0', '0'], ['x', '0', '1']] }, av).ok).toBe(false);
    expect(resolverCaminho({ pontos: [['0', '0', '0'], ['1', '0', '0'], ['1', '1', '0']], raios: ['-5'] }, av).ok).toBe(false);
  });
});
