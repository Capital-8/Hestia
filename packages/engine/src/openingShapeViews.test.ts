import { describe, expect, it } from 'vitest';
import { openingSymbolPaths, type OpeningSymbolInput } from '@hestia/geom';
import { type OpeningShape, type OPt } from '@hestia/model/src/openingShape.ts';
import {
  cutHalfWidth,
  elevationOutline,
  openingPlanSymbolPaths,
  verticalCutProfile,
  type OpeningPlace,
} from './openingShapeViews.ts';

/** Vão de 1,20 m x 1,50 m, centro em along = 2, soleira em 0,90 m. Uma forma de cada família. */
const W = 1.2;
const H = 1.5;
const along = 2;
const sill = 0.9;
const place: OpeningPlace = { along, sill };
const shapes: Record<'rect' | 'round' | 'segmental' | 'pointed' | 'circle', OpeningShape> = {
  rect: { kind: 'rect', width: W, height: H },
  round: { kind: 'round', width: W, height: H },
  segmental: { kind: 'segmental', width: W, height: H, rise: 0.3 },
  pointed: { kind: 'pointed', width: W, height: H, rise: 0.8 },
  circle: { kind: 'circle', width: W, height: H },
};
/** Formas com base reta (a elipse tem só um vértice na base). */
const withBase: OpeningShape[] = [shapes.rect, shapes.round, shapes.segmental, shapes.pointed];

/** Todo ponto do anel tem o espelho em torno de `along`, na mesma cota. */
const mirrored = (ring: readonly OPt[]): boolean =>
  ring.every(([x, z]) => ring.some(([x2, z2]) => Math.abs(x2 - (2 * along - x)) < 1e-9 && Math.abs(z2 - z) < 1e-9));

/** Largura total do vão em uma cota absoluta. */
const widthAt = (shape: OpeningShape, cutZ: number, tol?: number): number => 2 * cutHalfWidth(shape, place, cutZ, tol);

describe('elevação', () => {
  it('rect: contorno deslocado pela posição e pela soleira; o retângulo sai com 4 pontos', () => {
    const ring = elevationOutline(shapes.rect, place);
    expect(ring).toEqual([
      [along + W / 2, sill],
      [along + W / 2, sill + H],
      [along - W / 2, sill + H],
      [along - W / 2, sill],
    ]);
  });

  it('todas as formas: base em z = soleira, topo em z = soleira + h, largura total = w', () => {
    for (const shape of Object.values(shapes)) {
      const ring = elevationOutline(shape, place);
      const xs = ring.map((p) => p[0]);
      const zs = ring.map((p) => p[1]);
      expect(Math.min(...zs)).toBeCloseTo(sill, 9);
      expect(Math.max(...zs)).toBeCloseTo(sill + H, 5);
      expect(Math.min(...xs)).toBeCloseTo(along - W / 2, 9);
      expect(Math.max(...xs)).toBeCloseTo(along + W / 2, 9);
    }
  });

  it('todas as formas são simétricas em torno da posição do vão', () => {
    for (const shape of Object.values(shapes)) {
      expect(mirrored(elevationOutline(shape, place))).toBe(true);
    }
  });

  it('o anel é aberto, com o mesmo número de pontos que o contorno relativo ao vão', () => {
    const ring = elevationOutline(shapes.pointed, place);
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(elevationOutline(shapes.pointed, { along: 0, sill: 0 }).length);
  });
});

describe('corte horizontal: meia-largura na cota', () => {
  it('na base (cota da soleira) a largura é w nas formas com base reta', () => {
    for (const shape of withBase) expect(widthAt(shape, sill)).toBeCloseTo(W, 9);
  });

  it('no topo: retângulo mantém w (topo reto); arcos fecham em 0 (só o ápice toca a cota)', () => {
    expect(widthAt(shapes.rect, sill + H)).toBeCloseTo(W, 9);
    for (const shape of [shapes.round, shapes.segmental, shapes.pointed]) expect(widthAt(shape, sill + H)).toBeCloseTo(0, 9);
  });

  it('elipse: 0 na base (só um vértice), w no equador', () => {
    expect(widthAt(shapes.circle, sill)).toBeCloseTo(0, 9);
    expect(widthAt(shapes.circle, sill + H / 2)).toBeCloseTo(W, 5);
  });

  it('fora do vão (abaixo da soleira ou acima do topo) a meia-largura é 0', () => {
    for (const shape of Object.values(shapes)) {
      expect(cutHalfWidth(shape, place, sill - 0.1)).toBe(0);
      expect(cutHalfWidth(shape, place, sill + H + 0.1)).toBe(0);
    }
  });

  it('retângulo: a meia-largura é w/2 em toda a altura', () => {
    for (const z of [0.1, 0.5, 1.0, 1.4]) expect(cutHalfWidth(shapes.rect, place, sill + z)).toBeCloseTo(W / 2, 9);
  });

  it('acima da nascença a meia-largura não cresce, e abaixo dela é w/2 (arcos com base)', () => {
    for (const shape of [shapes.round, shapes.segmental, shapes.pointed]) {
      let prev = Infinity;
      for (let z = 0; z <= H; z += 0.02) {
        const hc = cutHalfWidth(shape, place, sill + z);
        expect(hc).toBeLessThanOrEqual(prev + 1e-9);
        prev = hc;
      }
    }
  });

  it('arco pleno (round): depois da nascença, meia-largura = raiz(R² - (z - zc)²) com R = w/2 e zc = h - R', () => {
    const R = W / 2;
    const zc = H - R;
    const z = zc + 0.3;
    expect(cutHalfWidth(shapes.round, place, sill + z, 1e-6)).toBeCloseTo(Math.sqrt(R * R - 0.3 * 0.3), 5);
  });

  it('arco abatido (segmental): arco de flecha f, com nascença em h - f e meia-largura w/2 nela', () => {
    const f = 0.3;
    const R = (W * W / 4 + f * f) / (2 * f);
    const zc = H - R;
    const zs = H - f;
    expect(cutHalfWidth(shapes.segmental, place, sill + zs, 1e-6)).toBeCloseTo(W / 2, 5);
    const z = 1.35;
    expect(cutHalfWidth(shapes.segmental, place, sill + z, 1e-6)).toBeCloseTo(Math.sqrt(R * R - (z - zc) ** 2), 5);
  });

  it('ogival (pointed): a meia-largura segue o arco de centro do lado oposto', () => {
    const f = 0.8;
    const half = W / 2;
    const r = (f * f + half * half) / (2 * half);
    const cx = half - r;
    const zs = H - f;
    const z = 1.2;
    expect(cutHalfWidth(shapes.pointed, place, sill + z, 1e-6)).toBeCloseTo(cx + Math.sqrt(r * r - (z - zs) ** 2), 5);
  });

  it('elipse: meia-largura = a·raiz(1 - ((z - b)/b)²), com a = w/2 e b = h/2', () => {
    const a = W / 2;
    const b = H / 2;
    const z = 1.125;
    expect(cutHalfWidth(shapes.circle, place, sill + z, 1e-6)).toBeCloseTo(a * Math.sqrt(1 - ((z - b) / b) ** 2), 5);
  });
});

describe('corte vertical: perfil no plano de corte', () => {
  it('retângulo: um intervalo da soleira ao topo, dentro da largura; vazio fora', () => {
    expect(verticalCutProfile(shapes.rect, place, along + 0.2)).toEqual([[sill, sill + H]]);
    expect(verticalCutProfile(shapes.rect, place, along - 0.5)).toEqual([[sill, sill + H]]);
    expect(verticalCutProfile(shapes.rect, place, along + 0.7)).toEqual([]);
  });

  it('todas as formas: no eixo do vão o perfil vai da base ao topo h', () => {
    for (const shape of Object.values(shapes)) {
      const prof = verticalCutProfile(shape, place, along);
      expect(prof).toHaveLength(1);
      expect(prof[0]![0]).toBeCloseTo(sill, 9);
      expect(prof[0]![1]).toBeCloseTo(sill + H, 5);
    }
  });

  it('arco pleno: no plano a t do eixo, o topo é zc + raiz(R² - t²), e a base continua na soleira', () => {
    const R = W / 2;
    const zc = H - R;
    const t = 0.5;
    const prof = verticalCutProfile(shapes.round, place, along + t, 1e-6);
    expect(prof).toHaveLength(1);
    expect(prof[0]![0]).toBeCloseTo(sill, 9);
    expect(prof[0]![1]).toBeCloseTo(sill + zc + Math.sqrt(R * R - t * t), 5);
  });

  it('arcos com base: a base do perfil é sempre a soleira, e o topo nunca passa de h', () => {
    for (const shape of [shapes.round, shapes.segmental, shapes.pointed]) {
      for (const t of [-0.55, -0.3, 0, 0.2, 0.45]) {
        const prof = verticalCutProfile(shape, place, along + t);
        expect(prof).toHaveLength(1);
        expect(prof[0]![0]).toBeCloseTo(sill, 9);
        expect(prof[0]![1]).toBeLessThanOrEqual(sill + H + 1e-9);
      }
    }
  });

  it('elipse: no plano a t, um intervalo entre as duas bordas (b ± b·raiz(1 - (t/a)²))', () => {
    const a = W / 2;
    const b = H / 2;
    const t = 0.3;
    const prof = verticalCutProfile(shapes.circle, place, along + t, 1e-6);
    expect(prof).toHaveLength(1);
    const d = b * Math.sqrt(1 - (t / a) ** 2);
    expect(prof[0]![0]).toBeCloseTo(sill + b - d, 5);
    expect(prof[0]![1]).toBeCloseTo(sill + b + d, 5);
  });

  it('elipse fora da largura: vazio', () => {
    expect(verticalCutProfile(shapes.circle, place, along + 0.8)).toEqual([]);
  });
});

describe('símbolo em planta no corte horizontal', () => {
  const win = (over: Partial<OpeningSymbolInput> = {}): OpeningSymbolInput => ({
    kind: 'window',
    center: { x: 0, y: 0 },
    u: { x: 1, y: 0 },
    n: { x: 0, y: 1 },
    width: W,
    thickness: 0.14,
    sHi: 0.07,
    sLo: -0.07,
    leaves: 2,
    plan: 'sliding',
    flipHand: false,
    flipFacing: false,
    ...over,
  });
  const door = (over: Partial<OpeningSymbolInput> = {}): OpeningSymbolInput => win({ kind: 'door', width: 0.9, leaves: 1, plan: 'swing', ...over });
  const rectFor = (i: OpeningSymbolInput): OpeningShape => ({ kind: 'rect', width: i.width, height: H });
  const roundFor = (i: OpeningSymbolInput): OpeningShape => ({ kind: 'round', width: i.width, height: H });
  const cutAbove = sill + 1.2; // local 1,20 m: acima da nascença do arco pleno (zc = 0,90)
  const hcRound = Math.sqrt(0.36 - 0.09); // meia-largura do arco pleno em local 1,20 m, com w = 1,20 m

  it('forma retangular: igual ao símbolo atual, para janela e porta de todas as famílias', () => {
    const inputs: OpeningSymbolInput[] = [
      win(),
      win({ leaves: 1, plan: 'fixed' }),
      win({ leaves: 1, plan: 'casement', flipFacing: true }),
      win({ leaves: 0 }),
      door(),
      door({ leaves: 2, plan: 'swing' }),
      door({ leaves: 1, plan: 'pivot', flipHand: true }),
      door({ leaves: 0 }),
    ];
    for (const i of inputs) {
      expect(openingPlanSymbolPaths(i, rectFor(i), place, cutAbove)).toEqual(openingSymbolPaths(i));
    }
  });

  it('arco pleno: caixilho (faces e ombreiras) na meia-largura da cota; folhas e arcos iguais ao atual', () => {
    const i = win();
    const base = openingSymbolPaths(i);
    const out = openingPlanSymbolPaths(i, roundFor(i), place, cutAbove, 1e-6);
    expect(out).toHaveLength(base.length);
    // Faces (0, 1) e ombreiras (2, 3) nas extremidades da meia-largura real.
    for (const k of [0, 1, 2, 3]) {
      const s = out[k]!;
      expect(s.pts).toHaveLength(2);
      expect(Math.abs(s.pts[0]!.x)).toBeCloseTo(hcRound, 5);
      expect(Math.abs(s.pts[1]!.x)).toBeCloseTo(hcRound, 5);
    }
    // Folhas e setas (4 em diante) são as do símbolo atual.
    expect(out.slice(4)).toEqual(base.slice(4));
  });

  it('o caixilho segue a cota: as ombreiras ficam em ±meia-largura e as pontas mantêm sHi e sLo', () => {
    const i = win({ sHi: 0.1, sLo: -0.04 });
    const out = openingPlanSymbolPaths(i, roundFor(i), place, cutAbove, 1e-6);
    const jambs = out.filter((s) => s.weight === 1.4);
    const baseJambs = openingSymbolPaths(i).filter((s) => s.weight === 1.4);
    expect(jambs).toHaveLength(2);
    jambs.forEach((j, k) => {
      expect(j.pts[0]!.x).toBeCloseTo(j.pts[1]!.x, 9);
      expect(Math.abs(j.pts[0]!.x)).toBeCloseTo(hcRound, 5);
      // As pontas continuam nas faces do vão (mesma coordenada s do símbolo atual).
      expect(j.pts.map((p) => p.y)).toEqual(baseJambs[k]!.pts.map((p) => p.y));
    });
  });

  it('abaixo da nascença o arco pleno tem w/2 e o símbolo é o retangular', () => {
    const i = win();
    expect(openingPlanSymbolPaths(i, roundFor(i), place, sill + 0.3, 1e-6)).toEqual(openingSymbolPaths(i));
  });

  it('vão livre em arco: as duas linhas tracejadas da verga seguem a meia-largura da cota', () => {
    const i = win({ leaves: 0 });
    const out = openingPlanSymbolPaths(i, roundFor(i), place, cutAbove, 1e-6);
    expect(out).toHaveLength(2);
    for (const s of out) {
      expect(s.dash).toBeDefined();
      expect(Math.abs(s.pts[0]!.x)).toBeCloseTo(hcRound, 5);
      expect(Math.abs(s.pts[1]!.x)).toBeCloseTo(hcRound, 5);
    }
  });

  it('porta com folha não tem caixilho: o símbolo em arco é o mesmo', () => {
    const i = door();
    expect(openingPlanSymbolPaths(i, roundFor({ ...i }), place, cutAbove, 1e-6)).toEqual(openingSymbolPaths(i));
  });

  it('parede girada: as ombreiras continuam em ±meia-largura ao longo de u', () => {
    const i = win({ u: { x: 0, y: 1 }, n: { x: -1, y: 0 } });
    const out = openingPlanSymbolPaths(i, roundFor(i), place, cutAbove, 1e-6);
    const jambs = out.filter((s) => s.weight === 1.4);
    expect(jambs).toHaveLength(2);
    for (const j of jambs) for (const p of j.pts) expect(Math.abs(p.y)).toBeCloseTo(hcRound, 5);
  });

  it('cota fora do vão: o caixilho some (o chamador não desenha o vão nessa cota)', () => {
    const i = win();
    const out = openingPlanSymbolPaths(i, roundFor(i), place, sill + H + 0.2, 1e-6);
    expect(out.some((s) => s.weight === 1.4)).toBe(false);
    expect(out).toHaveLength(openingSymbolPaths(i).length - 4);
  });

  it('largura do símbolo diferente da forma do vão lança erro', () => {
    expect(() => openingPlanSymbolPaths(win(), { kind: 'round', width: 1.0, height: H }, place, cutAbove)).toThrow();
  });
});
