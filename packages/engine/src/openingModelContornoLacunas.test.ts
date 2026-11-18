import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, outline, type Opening, type OpeningShape, type OpeningType, type OPt, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningGeometry } from './types.ts';
import type { OpeningModel, OpeningPart } from './openingModelTypes.ts';
import { modelQuantities, partQuantity } from './openingPartQuantities.ts';
import { openingShapeIssues } from './openingShapeIssues.ts';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';

/** Parede de 4 m com um vão de `base` (tipo do catálogo) no meio; o tipo ganha forma e ajustes. */
function cena(base: string, shape?: OpeningShape, extra: Partial<OpeningType> = {}): { p: Project; m: OpeningModel; g: OpeningGeometry } {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes[base]!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', ...extra, ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  const g = openingGeometry(p, p.elements.v as Opening, f);
  return { p, g, m: buildOpeningModel(p, p.elements.v as Opening, g, f) };
}

/** Ponto dentro do polígono (par-ímpar), com folga `tol` na borda. */
function dentro(ring: readonly OPt[], x: number, z: number, tol = 1e-6): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  if (c) return true;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    if (Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az))) <= tol) return true;
  }
  return false;
}

const tzPts = (p: OpeningPart): OPt[] => p.profile!.pts.map((q): OPt => [q[0], q[1]]);
const prismas = (m: OpeningModel): OpeningPart[] => m.parts.filter((x) => x.profile?.plane === 'tz' && x.role !== 'handle');
const contornoDe = (m: OpeningModel, forma: OpeningShape): OPt[] => outline({ ...forma, width: m.width, height: m.height } as OpeningShape);
const area = (r: readonly OPt[]): number => Math.abs(r.reduce((a, p, i) => a + p[0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * p[1], 0) / 2);

/** Todo prisma do modelo (em toda posição do curso das folhas que deslizam) cabe no contorno. */
function tudoDentro(m: OpeningModel, forma: OpeningShape, fracoes = [0, 0.25, 0.5, 0.75, 1]): void {
  const contorno = contornoDe(m, forma);
  for (const q of prismas(m)) {
    for (const f of q.motion?.kind === 'slide' ? fracoes : [0]) {
      const dt = q.motion?.kind === 'slide' ? q.motion.dt * q.motion.travel * f : 0;
      const dz = q.motion?.kind === 'slide' ? q.motion.dz * q.motion.travel * f : 0;
      for (const [x, z] of tzPts(q)) expect(dentro(contorno, x + dt, z + dz, 1e-5), `${q.id} f=${f} (${x.toFixed(3)}, ${z.toFixed(3)})`).toBe(true);
    }
  }
}

const volumeDe = (m: OpeningModel, role: OpeningPart['role']): number => m.parts.filter((q) => q.role === role).reduce((s, q) => s + partQuantity(q).volume, 0);

describe('janela de correr em arco: trilho e folhas que deslizam sob o arco', () => {
  const formas: Array<[string, OpeningShape, Partial<OpeningType>]> = [
    ['arco pleno', { kind: 'round', width: 1.2, height: 1.4 }, { height: 1.4 }],
    ['abatido', { kind: 'segmental', width: 1.2, height: 1.2, rise: 0.3 }, {}],
    ['ogival', { kind: 'pointed', width: 1.2, height: 1.5, rise: 0.8 }, { height: 1.5 }],
    ['círculo', { kind: 'circle', width: 1.2, height: 1.2 }, {}],
  ];
  for (const [nome, forma, extra] of formas) {
    it(`${nome}: tudo dentro do contorno em todo o curso e trilho em faixa única`, () => {
      const { m } = cena('ot_j120', forma, extra);
      tudoDentro(m, forma);
      const topo = m.parts.filter((q) => q.id.startsWith('track-head'));
      expect(topo.length).toBeGreaterThan(0);
      expect(topo.every((q) => q.profile?.plane === 'tz')).toBe(true);
      // não é mais um pedaço central solto: o trilho cobre quase toda a largura do arco no arranque
      const t0 = Math.min(...topo.map((q) => q.box.t0));
      const t1 = Math.max(...topo.map((q) => q.box.t1));
      expect(t1 - t0).toBeGreaterThan(m.width * 0.8);
    });
  }

  it('arco pleno: o trilho é a faixa de 10 mm do arco (volume = área x profundidade)', () => {
    const { m } = cena('ot_j120', { kind: 'round', width: 1.2, height: 1.2 });
    const trilho = m.parts.find((q) => q.id === 'track-head')!;
    const R = m.width / 2;
    const dOut = m.height - 1.146; // topo do trilho
    const esperado = (Math.PI / 2) * ((R - dOut) ** 2 - (R - dOut - 0.01) ** 2);
    const q = partQuantity(trilho);
    expect(Math.abs(q.faceArea / esperado - 1)).toBeLessThan(0.01);
    expect(q.volume).toBeCloseTo(q.faceArea * (trilho.box.s1 - trilho.box.s0), 12);
    expect(m.parts.find((x) => x.id === 'track-sill')!.profile).toBeUndefined(); // trilho de baixo fica reto na base reta
  });

  it('círculo: os dois trilhos seguem a elipse (metade de cima e de baixo)', () => {
    const { m } = cena('ot_j120', { kind: 'circle', width: 1.2, height: 1.2 });
    const cima = m.parts.filter((q) => q.id.startsWith('track-head'));
    const baixo = m.parts.filter((q) => q.id.startsWith('track-sill'));
    expect(cima).toHaveLength(2);
    expect(baixo).toHaveLength(2);
    expect(cima.every((q) => q.box.z0 >= m.height / 2 - 1e-9)).toBe(true);
    expect(baixo.every((q) => q.box.z1 <= m.height / 2 + 1e-9)).toBe(true);
  });

  it('a folha que desliza é mais baixa que a retangular nas pontas e a fixa só segue o arco', () => {
    const forma: OpeningShape = { kind: 'round', width: 1.2, height: 1.2 };
    const { m } = cena('ot_j120', forma);
    const reto = cena('ot_j120').m;
    const movel = m.parts.find((q) => q.id === 'glass-1')!;
    const fixo = m.parts.find((q) => q.id === 'glass-0')!;
    expect(movel.motion?.kind).toBe('slide');
    expect(movel.profile?.plane).toBe('tz');
    expect(fixo.motion).toBeUndefined();
    // a travessa fina de cima da folha móvel não cabe sob o arco nas duas pontas do curso: sai; a fixa continua
    expect(m.parts.some((q) => q.id === 'leaf-1-top')).toBe(false);
    expect(m.parts.some((q) => q.id === 'leaf-0-top')).toBe(true);
    // volume de vidro cai em relação ao retangular, e a folha móvel perde mais que a fixa (cabe nas duas pontas do curso)
    expect(volumeDe(m, 'glass')).toBeLessThan(volumeDe(reto, 'glass'));
    expect(partQuantity(movel).faceArea).toBeLessThan(partQuantity(fixo).faceArea + 1e-9);
    expect(modelQuantities(m).byRole.glass!.faceArea).toBeLessThan(area(contornoDe(m, forma)));
  });
});

/** Tipo de porta com bandeira em arco (composição) e janela fixa em arco, com a divisão decorativa pedida. */
const comPadrao = (kind: NonNullable<OpeningType['muntinPattern']>['kind'], on: 'all' | 'transom', cols = 3, rows = 2) => ({ muntinPattern: { kind, cols, rows, on } }) as Partial<OpeningType>;

describe('bandeira em arco com divisões decorativas', () => {
  const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.6 };
  const bandeira = (kind: NonNullable<OpeningType['muntinPattern']>['kind'], cols = 3, rows = 2) =>
    cena('ot_p90', FORMA, { height: 2.6, transom: { height: 0.6, fixed: true }, ...comPadrao(kind, 'transom', cols, rows) });

  for (const kind of ['colonial', 'mullions', 'cross', 'prairie', 'diamond', 'fan'] as const) {
    it(`${kind}: barras recortadas pelo vidro da bandeira, dentro do contorno, volume = área x profundidade`, () => {
      const { m } = bandeira(kind);
      const vidro = m.parts.find((q) => q.id === 'glass-transom')!;
      const barras = m.parts.filter((q) => q.role === 'muntin' && q.id.startsWith(`muntin-glass-transom-${kind}-`));
      expect(barras.length).toBeGreaterThan(0);
      const anel = tzPts(vidro);
      for (const b of barras) {
        expect(b.profile?.plane).toBe('tz');
        for (const [x, z] of tzPts(b)) expect(dentro(anel, x, z, 1e-6), `${b.id}`).toBe(true);
        const q = partQuantity(b);
        expect(q.volume).toBeCloseTo(q.faceArea * (b.box.s1 - b.box.s0), 12);
        expect(q.faceArea).toBeGreaterThan(1e-6);
      }
      tudoDentro(m, FORMA);
      // a soma das áreas das barras cabe no vidro (e não o cobre)
      const soma = barras.reduce((s, b) => s + partQuantity(b).faceArea, 0);
      expect(soma).toBeLessThan(partQuantity(vidro).faceArea);
      // a folha retangular de baixo não ganha divisões
      expect(m.parts.some((q) => q.id.startsWith('muntin-leaf'))).toBe(false);
    });
  }

  it('leque: cols - 1 raios a partir do centro do arco, cada um alinhado a k pi / cols; rows - 1 arcos', () => {
    const { m } = bandeira('fan', 4, 3);
    const cz = m.height - m.width / 2;
    const barras = m.parts.filter((q) => q.id.startsWith('muntin-glass-transom-fan-'));
    const raios = barras.slice(0, 3);
    expect(barras).toHaveLength(3 + 2);
    raios.forEach((b, k) => {
      const pts = tzPts(b);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const ang = Math.atan2(cy - cz, cx);
      const esperado = ((k + 1) * Math.PI) / 4;
      expect(Math.abs(Math.atan2(Math.sin(ang - esperado), Math.cos(ang - esperado)))).toBeLessThan(0.03);
    });
    // os arcos concêntricos têm o centro no mesmo ponto: distâncias do centro quase constantes
    for (const arco of barras.slice(3)) {
      const rs = tzPts(arco).map((p) => Math.hypot(p[0], p[1] - cz));
      expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(0.03); // espessura da faixa
    }
  });

  it('montantes: cols - 1 barras verticais igualmente espaçadas; cruz: montante central e travessa partida no arranque', () => {
    const mont = bandeira('mullions', 4, 1).m.parts.filter((q) => q.id.startsWith('muntin-glass-transom-mullions-'));
    expect(mont).toHaveLength(3);
    const xs = mont.map((q) => (q.box.t0 + q.box.t1) / 2).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(xs[2]! - xs[1]!, 6);
    const cruz = bandeira('cross').m.parts.filter((q) => q.id.startsWith('muntin-glass-transom-cross-'));
    expect(cruz).toHaveLength(3); // montante + duas metades da travessa (sem sobreposição)
  });

  it('o padrão com on = all troca a grade da janela e não mexe no que não é vidro', () => {
    const forma: OpeningShape = { kind: 'round', width: 1.2, height: 1.4 };
    const base = cena('ot_j120', forma, { height: 1.4, grid: { cols: 2, rows: 2 } }).m;
    const dia = cena('ot_j120', forma, { height: 1.4, grid: { cols: 2, rows: 2 }, ...comPadrao('diamond', 'all') }).m;
    expect(base.parts.some((q) => /^muntin-(v|h)-/.test(q.id) || q.id.startsWith('muntin-0-'))).toBe(true);
    expect(dia.parts.some((q) => q.role === 'muntin' && !q.id.includes('-diamond-'))).toBe(false);
    expect(dia.parts.filter((q) => q.id.includes('-diamond-')).length).toBeGreaterThan(4);
    tudoDentro(dia, forma);
    for (const id of ['jamb-left', 'head', 'track-head']) expect(JSON.stringify(dia.parts.find((q) => q.id === id))).toBe(JSON.stringify(base.parts.find((q) => q.id === id)));
  });

  it('colonial com on = all é a grade que já existia (mesmo modelo)', () => {
    const forma: OpeningShape = { kind: 'round', width: 1.2, height: 1.4 };
    const a = cena('ot_j120', forma, { height: 1.4, grid: { cols: 2, rows: 2 } }).m;
    const b = cena('ot_j120', forma, { height: 1.4, grid: { cols: 2, rows: 2 }, ...comPadrao('colonial', 'all') }).m;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('vão retangular com o padrão gravado fica idêntico (o campo só vale com forma)', () => {
    for (const base of ['ot_p90', 'ot_j120', 'ot_jf_80x60']) {
      const a = cena(base);
      const b = cena(base, undefined, comPadrao('fan', 'all'));
      const c = cena(base, { kind: 'rect', width: 1, height: 1 }, comPadrao('diamond', 'transom'));
      expect(JSON.stringify(b.m)).toBe(JSON.stringify(a.m));
      expect(JSON.stringify(c.m)).toBe(JSON.stringify(a.m));
    }
  });
});

describe('esquadria menor que o vão bruto (roughOversize) com forma', () => {
  const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };

  it('regra: a esquadria tem a forma na largura e altura dela; o furo (vão bruto) é maior e as peças ficam dentro dos dois', () => {
    for (const oversize of [{ w: 0.06, h: 0.03 }, { w: 0.06, h: 0.06 }, { w: 0.1, h: 0 }]) {
      const { m, g } = cena('ot_p90', FORMA, { roughOversize: oversize });
      expect(m.width).toBeCloseTo(0.9, 9);
      expect(g.roughWidth).toBeCloseTo(0.9 + oversize.w, 9);
      tudoDentro(m, FORMA);
      const furo = outline(g.forma!);
      for (const q of prismas(m)) for (const [x, z] of tzPts(q)) expect(dentro(furo, x, z, 1e-5), `${q.id} no furo`).toBe(true);
      // o batente sobe até o arranque da ESQUADRIA e o topo da travessa é o da esquadria
      expect(m.parts.find((q) => q.id === 'jamb-left')!.box.z1).toBeCloseTo(m.height - m.width / 2, 9);
      expect(Math.max(...m.parts.filter((q) => q.role === 'head').map((q) => q.box.z1))).toBeCloseTo(m.height, 3);
    }
  });

  it('volume e área: mesma esquadria com e sem folga de vão bruto dão as mesmas peças', () => {
    const a = cena('ot_p90', FORMA);
    const b = cena('ot_p90', FORMA, { roughOversize: { w: 0.06, h: 0.06 } });
    expect(JSON.stringify(b.m)).toBe(JSON.stringify(a.m));
    expect(modelQuantities(b.m).byRole.leaf!.volume).toBeLessThan(modelQuantities(cena('ot_p90').m).byRole.leaf!.volume);
  });

  it('janela de correr em arco com folga: tudo dentro do contorno da esquadria e do furo em todo o curso', () => {
    const forma: OpeningShape = { kind: 'round', width: 1.2, height: 1.2 };
    const { m, g } = cena('ot_j120', forma, { roughOversize: { w: 0.04, h: 0.02 } });
    tudoDentro(m, forma);
    const furo = outline(g.forma!);
    for (const q of prismas(m)) for (const [x, z] of tzPts(q)) expect(dentro(furo, x, z, 1e-5)).toBe(true);
  });

  it('a flecha que deixa de caber na esquadria cai em retângulo COM AVISO; o furo segue a forma', () => {
    const forma: OpeningShape = { kind: 'segmental', width: 0.9, height: 2.1, rise: 0.47 }; // 0,47 <= 0,5 (vão bruto), > 0,45 (esquadria)
    const extra = { roughOversize: { w: 0.1, h: 0 } };
    const { p, m, g } = cena('ot_p90', forma, extra);
    expect(g.forma).toBeDefined(); // o furo na parede segue a forma
    expect(formaDaEsquadria(forma, m.width, m.height)).toBeNull();
    const reto = cena('ot_p90', undefined, extra).m;
    expect(JSON.stringify(m)).toBe(JSON.stringify(reto));
    const av = openingShapeIssues(p, 'pt');
    expect(av.map((i) => i.code)).toEqual(['forma-esquadria-retangular']);
    expect(av[0]).toMatchObject({ severity: 'warning', elementId: 'v' });
    expect(av[0]!.message).toContain('rise-invalid');
    expect(openingShapeIssues(p, 'en')[0]!.message).toContain('rough opening');
  });

  it('sem folga o mesmo tipo cabe: sem aviso e com peças em arco', () => {
    const { p, m } = cena('ot_p90', { kind: 'segmental', width: 0.9, height: 2.1, rise: 0.4 });
    expect(openingShapeIssues(p)).toEqual([]);
    expect(prismas(m).length).toBeGreaterThan(0);
  });

  it('vão retangular com folga de vão bruto: peças idênticas com e sem rect', () => {
    for (const base of ['ot_p90', 'ot_j120']) {
      const extra = { roughOversize: { w: 0.05, h: 0.05 } };
      expect(JSON.stringify(cena(base, { kind: 'rect', width: 1, height: 1 }, extra).m)).toBe(JSON.stringify(cena(base, undefined, extra).m));
    }
  });
});
