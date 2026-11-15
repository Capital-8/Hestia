import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { meshVolume, noFailed, type NoFail, noWallMesh, polyArea, wallTiltNo, type Mesh, type NoResult, type NoWall } from './wallTiltNo.ts';

/**
 * S5 / N1 · nó de N >= 3 paredes inclinadas. H = 3, t = 0,2, comprimento 4 m. Valores de referência calculados à mão
 * (cruzamento das retas das faces vizinhas em cada cota), nunca pelo código testado. Tilt positivo = topo à esquerda da
 * direção que sai do nó.
 */
const W = (id: string, angleDeg: number, tiltDeg: number, extra: Partial<NoWall> = {}): NoWall => ({ id, angleDeg, tiltDeg, thickness: 0.2, length: 4, ...extra });
const ok = (r: NoResult | NoFail): NoResult => {
  if (noFailed(r)) throw new Error(`falhou: ${JSON.stringify(r)}`);
  return r;
};
const near = (p: Vec2, x: number, y: number): void => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

/** Toda aresta (vértices soldados por posição) em exatamente 2 triângulos, em sentidos opostos. */
function closed(m: Mesh): boolean {
  const id = new Map<string, number>();
  const vid = (k: number): number => {
    const key = m.v[k]!.map((x: number) => x.toFixed(6)).join(',');
    if (!id.has(key)) id.set(key, id.size);
    return id.get(key)!;
  };
  const dir = new Map<string, number>();
  for (const tri of m.t) {
    const t = tri.map(vid);
    for (let j = 0; j < 3; j++) {
      const u = t[j]!, w = t[(j + 1) % 3]!;
      if (u !== w) dir.set(`${u}>${w}`, (dir.get(`${u}>${w}`) ?? 0) + 1);
    }
  }
  for (const [k, n] of dir) {
    const [u, w] = k.split('>');
    if (n !== 1 || dir.get(`${w}>${u}`) !== 1) return false;
  }
  return dir.size > 0;
}
const volumeOf = (r: NoResult): number => r.order.reduce((s, id) => s + meshVolume(noWallMesh(r, id)), 0);
/** Volume exato (regrado) = Simpson das áreas dos laços em 3 níveis, somado nas paredes. */
const simpson = (r: NoResult): number => {
  const H = r.zs[2]! - r.zs[0]!;
  let v = 0;
  for (const id of r.order) v += (H / 6) * (polyArea(r.levels[0]!.loops.get(id)!) + 4 * polyArea(r.levels[1]!.loops.get(id)!) + polyArea(r.levels[2]!.loops.get(id)!));
  return v;
};

describe('S5 · nó em Y (3 paredes a 120°)', () => {
  const zs = [0, 1.5, 3];
  /**
   * Dedução: a parede i sai do nó na direção θi; com tilt τ o eixo se desloca d = z·tanτ à esquerda e a meia espessura
   * horizontal vira h = (t/2)/cosτ. Face esquerda da parede 0 (0°): y = d + h. Face direita da parede 1 (120°, normal
   * esquerda (−sen120°, cos120°)): −0,866025·x − 0,5·y = d − h. Logo x = (0,5·h − 1,5·d)/0,866025 e y = d + h.
   * Em z=0: h = 0,1/cos15° = 0,1035276180 e |canto| = h/sen60° = 0,1195433963 (= (t/(2cos15°))/sen60°).
   * Com tilt igual os três cantos giram 120° entre si (simetria C3): a distância ao nó é a mesma para os três em cada cota
   * (0,1195433963 / 0,8126878559 / 1,6121334727 em z = 0 / 1,5 / 3).
   */
  it('tilt 15° nas três: cantos nas três cotas e simetria C3', () => {
    const r = ok(wallTiltNo([W('w0', 0, 15), W('w1', 120, 15), W('w2', 240, 15)], zs));
    expect(r.bars).toBeNull();
    const c = (id: string, i: number): Vec2 => r.levels[i]!.corners.get(id)!.l;
    near(c('w0', 0), 0.0597716981, 0.103527618);
    near(c('w1', 0), -0.1195433963, 0);
    near(c('w2', 0), 0.0597716981, -0.103527618);
    near(c('w0', 1), -0.6363807246, 0.5054514067);
    near(c('w1', 1), -0.1195433963, -0.8038475773);
    near(c('w2', 1), 0.7559241209, 0.2983961706);
    near(c('w0', 2), -1.3325331473, 0.9073751953);
    near(c('w1', 2), -0.1195433963, -1.6076951546);
    near(c('w2', 2), 1.4520765435, 0.7003199593);
    [0.1195433963, 0.8126878559, 1.6121334727].forEach((d, i) => {
      for (const id of ['w0', 'w1', 'w2']) expect(Math.hypot(c(id, i).x, c(id, i).y)).toBeCloseTo(d, 6);
    });
  });

  it('fresta 0 e sobreposição 0: canto esquerdo de uma = canto direito da seguinte; malhas fechadas; volume', () => {
    const r = ok(wallTiltNo([W('w0', 0, 15), W('w1', 120, 15), W('w2', 240, 15)], zs));
    for (const lv of r.levels) {
      near(lv.corners.get('w0')!.l, lv.corners.get('w1')!.r.x, lv.corners.get('w1')!.r.y);
      near(lv.corners.get('w1')!.l, lv.corners.get('w2')!.r.x, lv.corners.get('w2')!.r.y);
      near(lv.corners.get('w2')!.l, lv.corners.get('w0')!.r.x, lv.corners.get('w0')!.r.y);
    }
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
    // Simpson das áreas (calculado à parte, em 3 níveis): 10,7558989357 m3; a malha tem as faces laterais de 2 triângulos.
    expect(simpson(r)).toBeCloseTo(10.7558989357, 6);
    expect(volumeOf(r)).toBeGreaterThan(10.6);
    expect(Math.abs(volumeOf(r) - simpson(r)) / simpson(r)).toBeLessThan(0.01);
  });

  /** Tilts 10 / 20 / 30: cantos assimétricos, pelo cruzamento das retas à mão (mesma fórmula do S1, y = d + h, face direita da seguinte). */
  it('tilts diferentes 10/20/30: cantos assimétricos', () => {
    const r = ok(wallTiltNo([W('a', 0, 10), W('b', 120, 20), W('c', 240, 30)], zs));
    const L = (id: string, i: number): Vec2 => r.levels[i]!.corners.get(id)!.l;
    near(L('a', 0), 0.0642549819, 0.1015426612);
    near(L('b', 0), -0.128106999, 0.0090522766);
    near(L('c', 0), 0.0747076506, -0.1015426612);
    near(L('a', 1), -0.7188636009, 0.3660331323);
    near(L('b', 1), 0.0566855319, -1.4029284786);
    near(L('c', 1), 1.2274112952, 0.1629478099);
    near(L('a', 2), -1.5019821838, 0.6305236033);
    near(L('b', 2), 0.2414780628, -2.8149092335);
    near(L('c', 2), 2.3801149399, 0.4274382809);
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
  });
});

describe('S5 · nó em T (haste a 90° sobre a barra colinear)', () => {
  const zs = [0, 1.4, 2.8];
  it('barra A 10° / C −10° (mesmo plano), haste B 20°: haste encosta na face da barra', () => {
    // A face esquerda de A: y = z·tan10° + 0,1/cos10°; a direita de C (direção 180°, esquerda = −y): y = −z·tan(−10°) + ... = a mesma reta.
    const r = ok(wallTiltNo([W('A', 0, 10), W('B', 90, 20), W('C', 180, -10)], zs));
    expect(r.bars).toEqual(['A', 'C']);
    const A = (i: number) => r.levels[i]!.corners.get('A')!, B = (i: number) => r.levels[i]!.corners.get('B')!, C = (i: number) => r.levels[i]!.corners.get('C')!;
    near(A(0).r, 0, -0.1015426612); near(A(0).l, 0, 0.1015426612);
    near(B(0).r, 0.1064177772, 0.1015426612); near(B(0).l, -0.1064177772, 0.1015426612);
    near(A(1).r, 0, 0.1453151120); near(A(1).l, 0, 0.3484004340);
    near(B(1).r, -0.4031405510, 0.3484004340); near(B(1).l, -0.6159761050, 0.3484004340);
    near(C(1).r, 0, 0.3484004340); near(C(1).l, 0, 0.1453151120);
    near(A(2).r, 0, 0.3921728850); near(A(2).l, 0, 0.5952582070);
    near(B(2).r, -0.9126988790, 0.5952582070); near(B(2).l, -1.1255344330, 0.5952582070);
    near(C(2).r, 0, 0.5952582070); near(C(2).l, 0, 0.3921728850);
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
    // Sem fresta: o canto da haste está sobre a face da barra (A e C na mesma reta): y igual nos dois lados.
    for (let i = 0; i < 3; i++) expect(B(i).r.y).toBeCloseTo(A(i).l.y, 9);
  });

  it('barra com tilts diferentes (A 10°, C −5°) e haste vertical: degrau no plano da barra, a haste o acompanha', () => {
    const r = ok(wallTiltNo([W('A', 0, 10), W('B', 90, 0), W('C', 180, -5)], zs));
    const A = (i: number) => r.levels[i]!.corners.get('A')!, B = (i: number) => r.levels[i]!.corners.get('B')!, C = (i: number) => r.levels[i]!.corners.get('C')!;
    near(B(0).r, 0.1, 0.1015426612); near(B(0).l, -0.1, 0.1003819840);
    near(B(1).r, 0.1, 0.3484004340); near(B(1).l, -0.1, 0.2228661130);
    near(C(1).r, 0, 0.2228661130); near(C(1).l, 0, 0.0221021450);
    near(B(2).r, 0.1, 0.5952582070); near(B(2).l, -0.1, 0.3453502420);
    near(A(2).l, 0, 0.5952582070); near(C(2).r, 0, 0.3453502420);
    // A haste recebe o degrau (C.r e A.l) como vértices extras: laço de 6 vértices, sem fresta nem sobreposição.
    expect(r.levels[2]!.loops.get('B')!.length).toBe(6);
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
    expect(Math.abs(volumeOf(r) - simpson(r)) / simpson(r)).toBeLessThan(0.01);
  });

  it('haste que não alcança o corpo da outra metade da barra: falha tipada', () => {
    const r = wallTiltNo([W('A', 0, 10), W('B', 90, 20), W('C', 180, -2)], zs);
    expect(noFailed(r) && r.fail).toBe('parede-curta');
  });
});

describe('S5 · nó em X (4 paredes a 90°)', () => {
  const zs = [0, 1.4, 2.8];
  it('barra A 10° / C −10°, hastes B 5° e D 15°', () => {
    const r = ok(wallTiltNo([W('A', 0, 10), W('B', 90, 5), W('C', 180, -10), W('D', 270, 15)], zs));
    expect(r.bars).toEqual(['A', 'C']);
    const k = (id: string, i: number) => r.levels[i]!.corners.get(id)!;
    near(k('B', 0).r, 0.100381984, 0.1015426612); near(k('B', 0).l, -0.100381984, 0.1015426612);
    near(k('D', 0).r, -0.1035276180, -0.1015426612); near(k('D', 0).l, 0.1035276180, -0.1015426612);
    near(k('B', 1).r, -0.022102145, 0.348400434); near(k('B', 1).l, -0.222866113, 0.348400434);
    near(k('D', 1).r, 0.271601251, 0.145315112); near(k('D', 1).l, 0.478656487, 0.145315112);
    near(k('B', 2).r, -0.144586274, 0.595258207); near(k('B', 2).l, -0.34535024, 0.595258207);
    near(k('D', 2).r, 0.646730121, 0.392172885); near(k('D', 2).l, 0.853785357, 0.392172885);
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
    // As hastes encostam nas faces da barra: B no lado esquerdo de A (y = A.l.y), D no lado direito (y = A.r.y).
    for (let i = 0; i < 3; i++) {
      expect(k('B', i).r.y).toBeCloseTo(k('A', i).l.y, 9);
      expect(k('D', i).r.y).toBeCloseTo(k('A', i).r.y, 9);
    }
  });

  it('X simétrico vertical: cantos em ±0,1 e volume = soma das paredes', () => {
    const r = ok(wallTiltNo([W('A', 0, 0), W('B', 90, 0), W('C', 180, 0), W('D', 270, 0)], zs));
    expect(r.bars).toEqual(['A', 'C']);
    near(r.levels[2]!.corners.get('B')!.r, 0.1, 0.1);
    near(r.levels[2]!.corners.get('B')!.l, -0.1, 0.1);
    // Barra A+C: 2 · 4 · 0,2 · 2,8 = 4,48; hastes B e D: 2 · (4 − 0,1) · 0,2 · 2,8 = 4,368.
    expect(volumeOf(r)).toBeCloseTo(4.48 + 4.368, 6);
  });
});

describe('S5 · casos degenerados e falhas tipadas', () => {
  const zs = [0, 1.5, 3];
  it('duas paredes quase colineares (178°) + uma terceira: barra com plano e sem NaN', () => {
    const r = ok(wallTiltNo([W('A', 0, 5), W('B', 90, 0), W('C', 178, -5)], zs));
    expect(r.bars).toEqual(['A', 'C']);
    for (const lv of r.levels) for (const c of lv.corners.values()) for (const p of [c.l, c.r]) expect(Number.isFinite(p.x + p.y)).toBe(true);
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
  });
  it('parede curta: o cruzamento cai além do comprimento', () => {
    const r = wallTiltNo([W('w0', 0, 30, { length: 0.5 }), W('w1', 120, 30), W('w2', 240, 30)], zs);
    expect(noFailed(r) && r.fail).toBe('parede-curta');
  });
  it('duas paredes na mesma direção: sobrepostas', () => {
    const r = wallTiltNo([W('a', 0, 0), W('b', 1, 0), W('c', 180, 0)], zs);
    expect(noFailed(r) && r.fail).toBe('sobrepostas');
  });
  it('cone agudo: lacuna quase fechada leva o canto externo longe demais', () => {
    const r = wallTiltNo([W('a', 0, 0), W('b', 2.2, 0), W('c', 180, 0)], zs);
    expect(noFailed(r) && r.fail).toBe('ponta-longa');
  });
  it('menos de 3 paredes e tilt de 90° são tipados', () => {
    expect(noFailed(wallTiltNo([W('a', 0, 0), W('b', 90, 0)], zs))).toBe(true);
    const r = wallTiltNo([W('a', 0, 90), W('b', 120, 0), W('c', 240, 0)], zs);
    expect(noFailed(r) && r.fail).toBe('degenerado');
  });
  it('nó em Y com uma parede vertical e duas inclinadas (misto)', () => {
    const r = ok(wallTiltNo([W('a', 0, 0), W('b', 120, 15), W('c', 240, -15)], zs));
    for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
  });
});

describe('S5 · fuzz de 300 nós (semente 20261115)', () => {
  it('nunca NaN; viáveis têm malha fechada e cantos compartilhados; inviáveis falham tipados; < 3 ms por nó', () => {
    let s = 20261115;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const tipos = new Set(['poucas-paredes', 'sobrepostas', 'ponta-longa', 'parede-curta', 'degenerado', 'nucleo-invalido']);
    let viaveis = 0;
    const falhas = new Map<string, number>();
    const t0 = performance.now();
    const nos: NoWall[][] = [];
    for (let k = 0; k < 300; k++) {
      const n = 3 + Math.floor(rnd() * 3);
      const colinear = rnd() < 0.3;
      const ws: NoWall[] = [];
      const ang0 = rnd() * 360;
      for (let i = 0; i < n; i++) {
        let a = ang0 + (360 / n) * i + (rnd() - 0.5) * 60;
        if (colinear && i === 2) a = ang0 + 180 + (rnd() - 0.5) * 3;
        ws.push({ id: `w${i}`, angleDeg: a, tiltDeg: (rnd() - 0.5) * 60, thickness: 0.1 + rnd() * 0.3, length: 1 + rnd() * 4 });
      }
      nos.push(ws);
    }
    const H = 3;
    const res = nos.map((ws) => wallTiltNo(ws, [0, H / 2, H]));
    const ms = (performance.now() - t0) / nos.length;
    res.forEach((r) => {
      if (noFailed(r)) {
        expect(tipos.has(r.fail)).toBe(true);
        falhas.set(r.fail, (falhas.get(r.fail) ?? 0) + 1);
        return;
      }
      viaveis++;
      for (const lv of r.levels) {
        for (const c of lv.corners.values()) expect(Number.isFinite(c.l.x + c.l.y + c.r.x + c.r.y)).toBe(true);
        for (const lp of lv.loops.values()) expect(lp.every((p) => Number.isFinite(p.x + p.y))).toBe(true);
      }
      if (!r.bars) {
        for (const lv of r.levels) {
          r.order.forEach((id, i) => {
            const nx = lv.corners.get(r.order[(i + 1) % r.order.length]!)!;
            expect(Math.hypot(lv.corners.get(id)!.l.x - nx.r.x, lv.corners.get(id)!.l.y - nx.r.y)).toBeLessThan(1e-9);
          });
        }
      }
      for (const id of r.order) expect(closed(noWallMesh(r, id))).toBe(true);
    });
    expect(viaveis).toBeGreaterThan(60);
    expect(ms).toBeLessThan(3);
    console.info(`S5 fuzz: ${viaveis} viáveis de 300; falhas ${JSON.stringify(Object.fromEntries(falhas))}; ${ms.toFixed(2)} ms/nó (análise)`);
  });
});
