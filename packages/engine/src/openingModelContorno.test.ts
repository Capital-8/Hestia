import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, outline, outlineInset, ringSignedArea, type Opening, type OpeningShape, type OpeningType, type OPt, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { contornoDoModelo, fatiasDaTravessa } from './openingModelContorno.ts';
import { openingPlanPaths } from './openingPlan.ts';
import { slicePartsAtZ } from './openingModelTransforms.ts';
import { CLOSED, type OpeningModel, type OpeningPart } from './openingModelTypes.ts';
import { EX1, cenaComposicao } from './openingModelFixture.ts';
import { buildOpeningPartsSchedule, modelQuantities, partQuantity } from './openingPartQuantities.ts';

/** Parede de 4 m com um vão de `base` (tipo do catálogo) no meio, com a forma (e ajustes) dados ao tipo. */
function cena(base: string, shape?: OpeningShape, extra: Partial<OpeningType> = {}): { p: Project; m: OpeningModel } {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes[base]!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', ...extra, ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return { p, m: buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f) };
}

const parte = (m: OpeningModel, id: string): OpeningPart => {
  const x = m.parts.find((q) => q.id === id);
  if (!x) throw new Error(`peça '${id}' ausente: ${m.parts.map((q) => q.id).join(', ')}`);
  return x;
};

/** Ponto dentro do polígono (par-ímpar), com folga `tol` na borda. */
function dentro(ring: readonly OPt[], x: number, z: number, tol = 1e-6): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  if (c) return true;
  // na borda (dentro da tolerância)
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
const ARCO: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };

describe('recuo e faixa do contorno (model)', () => {
  it('arco pleno: recuo concêntrico, topo recua d e área bate com a fórmula', () => {
    const w = 1;
    const h = 1.6;
    const d = 0.05;
    const r = outlineInset({ kind: 'round', width: w, height: h }, d);
    const R = w / 2 - d;
    const exata = (w - 2 * d) * (h - w / 2) + (Math.PI * R * R) / 2;
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(h - d, 9);
    expect(Math.abs(ringSignedArea(r) / exata - 1)).toBeLessThan(0.002);
  });
  it('recuo zero e base sem recuo reproduz o contorno', () => {
    for (const shape of [ARCO, { kind: 'segmental', width: 1.2, height: 1.5, rise: 0.2 }, { kind: 'pointed', width: 0.9, height: 2.1, rise: 0.6 }] as OpeningShape[]) {
      const a = ringSignedArea(outlineInset(shape, 0));
      expect(Math.abs(a / ringSignedArea(outline(shape)) - 1)).toBeLessThan(1e-6);
    }
  });
  it('recuo que consome a forma devolve []', () => {
    expect(outlineInset(ARCO, 0.5)).toEqual([]);
  });
});

describe('vão retangular ou sem forma: peças idênticas', () => {
  it('forma ausente e rect dão o mesmo modelo, e contornoDoModelo devolve o mesmo objeto', () => {
    for (const base of ['ot_p90', 'ot_p160', 'ot_j120', 'ot_jf_80x60']) {
      const a = cena(base);
      const b = cena(base, { kind: 'rect', width: 1, height: 1 });
      expect(JSON.stringify(b.m)).toBe(JSON.stringify(a.m));
      expect(contornoDoModelo(a.m, undefined)).toBe(a.m);
      expect(contornoDoModelo(a.m, { kind: 'rect', width: 1, height: 1 })).toBe(a.m);
    }
  });
  it('forma inválida (flecha acima de w/2) mantém as peças retangulares', () => {
    const a = cena('ot_p90');
    const b = cena('ot_p90', { kind: 'segmental', width: 0.9, height: 2.1, rise: 5 });
    expect(JSON.stringify(b.m)).toBe(JSON.stringify(a.m));
  });
});

describe('porta em arco pleno (sem bandeira): a folha segue o arco', () => {
  const { m } = cena('ot_p90', ARCO);
  const w = m.width;
  const h = m.height;
  const contorno = outline({ kind: 'round', width: w, height: h });
  it('batente: ombreiras até o arranque e travessa em arco no mesmo grupo', () => {
    const head = parte(m, 'head');
    expect(head.profile?.plane).toBe('tz');
    const fatias = fatiasDaTravessa(cena('ot_p90').m.parts.find((q) => q.id === 'head')!);
    expect(fatias.length).toBeGreaterThan(1); // rebaixo do batedor = mais de uma fatia
    const zc = h - w / 2;
    expect(parte(m, 'jamb-left').box.z1).toBeCloseTo(zc, 9);
    expect(parte(m, 'jamb-right').box.z1).toBeCloseTo(zc, 9);
    expect(m.parts.filter((q) => q.role === 'head').every((q) => q.group === 'head')).toBe(true);
  });
  it('volume da travessa = anel semicircular x profundidade, fatia a fatia', () => {
    const fatias = fatiasDaTravessa(cena('ot_p90').m.parts.find((q) => q.id === 'head')!);
    const R = w / 2;
    const esperado = fatias.reduce((s, f) => s + ((Math.PI / 2) * ((R - f.a) ** 2 - (R - f.b) ** 2) * (f.s1 - f.s0)) * -1, 0) * -1;
    const real = m.parts.filter((q) => q.role === 'head').reduce((s, q) => s + partQuantity(q).volume, 0);
    // cordas de 1 mm ficam por dentro do arco: erro < 0,3 %
    expect(real).toBeLessThanOrEqual(esperado + 1e-12);
    expect(Math.abs(real / esperado - 1)).toBeLessThan(0.003);
  });
  it('a folha vira prisma tz recortado pelo arco e fica dentro do vão', () => {
    const leaf = parte(m, 'leaf-0');
    expect(leaf.profile?.plane).toBe('tz');
    expect(leaf.motion).toBeDefined();
    for (const [x, z] of tzPts(leaf)) expect(dentro(contorno, x, z)).toBe(true);
    expect(leaf.box.z1).toBeLessThan(h);
  });
  it('toda peça de arco/vidro/folha/alizar fica dentro do contorno do vão', () => {
    for (const q of m.parts.filter((x) => x.profile?.plane === 'tz' && x.role !== 'handle')) for (const [x, z] of tzPts(q)) expect(dentro(contorno, x, z)).toBe(true);
  });
  it('a caixa de cada prisma é a envolvente exata do polígono', () => {
    for (const q of m.parts.filter((x) => x.profile?.plane === 'tz' && x.role !== 'handle')) {
      const xs = tzPts(q).map((p) => p[0]);
      const zs = tzPts(q).map((p) => p[1]);
      expect(q.box.t0).toBeCloseTo(Math.min(...xs), 12);
      expect(q.box.t1).toBeCloseTo(Math.max(...xs), 12);
      expect(q.box.z0).toBeCloseTo(Math.min(...zs), 12);
      expect(q.box.z1).toBeCloseTo(Math.max(...zs), 12);
    }
  });
});

describe('porta com bandeira: folha retangular embaixo e bandeira em arco', () => {
  const { m } = cena('ot_p90', { kind: 'round', width: 0.9, height: 2.6 }, { height: 2.6, transom: { height: 0.6, fixed: true } });
  it('folha e barra da bandeira continuam caixas; o vidro da bandeira segue o arco', () => {
    // composição de 2 células (folha + bandeira): ids da composição
    expect(parte(m, 'leaf-c1').profile).toBeUndefined();
    const g = parte(m, 'glass-transom');
    expect(g.profile?.plane).toBe('tz');
    const topo = Math.max(...tzPts(g).map((p) => p[1]));
    expect(topo).toBeCloseTo(m.height - 0.05, 3); // recuo do batente (J) no topo
    expect(g.box.t1 - g.box.t0).toBeLessThan(0.9 - 0.1 + 1e-9); // mais estreito que a luz retangular no topo
  });
});

describe('janela em arco (correr de 2 folhas) e círculo', () => {
  it('vidro e travessa superior da folha seguem o arco; ombreiras vão ao arranque', () => {
    const { m } = cena('ot_j120', { kind: 'round', width: 1.2, height: 1.2 + 0.0 });
    const g = parte(m, 'glass-0');
    expect(g.profile?.plane).toBe('tz');
    const top = parte(m, 'leaf-0-top');
    expect(top.profile?.plane).toBe('tz');
    // a faixa da travessa tem espessura radial constante: o topo da luz do vidro encosta no fundo da travessa
    const gz = Math.max(...tzPts(g).map((p) => p[1]));
    const tz1 = Math.max(...tzPts(top).map((p) => p[1]));
    expect(tz1).toBeGreaterThan(gz);
    expect(parte(m, 'jamb-left').box.z1).toBeCloseTo(0.6, 9);
  });
  it('círculo: batente em duas metades e vidro elíptico recuado; sem peça fora do círculo', () => {
    const forma: OpeningShape = { kind: 'circle', width: 1, height: 1 };
    const { m } = cena('ot_jm_100x100', forma);
    const metades = m.parts.filter((q) => q.group === 'frame-ring');
    expect(metades.map((q) => q.id).sort()).toEqual(['jamb-left', 'jamb-right']);
    const contorno = outline({ kind: 'circle', width: m.width, height: m.height });
    for (const q of m.parts.filter((x) => x.profile?.plane === 'tz' && x.role !== 'handle')) for (const [x, z] of tzPts(q)) expect(dentro(contorno, x, z, 1e-5)).toBe(true);
    const q = modelQuantities(m);
    // área da luz do vidro ~ elipse recuada pela largura do batente (J = 0,05): pi (0,5 - 0,05)^2
    const luz = Math.abs(ringSignedArea(outlineInset({ kind: 'circle', width: m.width, height: m.height }, 0.05)));
    expect(q.byRole.glass!.faceArea).toBeLessThanOrEqual(luz + 1e-9);
    expect(q.byRole.glass!.faceArea).toBeGreaterThan(luz * 0.8); // o vidro fica dentro da folha, que também é recuada
  });
});

describe('planta: corte horizontal em arco', () => {
  const { m } = cena('ot_p90', ARCO);
  const h = m.height;
  it('acima do arranque a travessa dá dois anéis (um por perna) e perto do topo um só', () => {
    const rings = (z: number) => slicePartsAtZ(m, z, CLOSED).filter((r) => r.part.role === 'head');
    const entre = rings((h - m.width / 2 + h - 0.05) / 2 + 0.02);
    // cota onde o arco ainda tem vão livre no meio: duas pernas
    expect(entre.length).toBeGreaterThanOrEqual(2);
    const xs = entre.map((r) => r.ring.map((p) => p.t));
    expect(xs.every((t) => Math.min(...t) * Math.max(...t) >= 0)).toBe(true); // nenhum anel atravessa t = 0
    const topo = rings(h - 0.02);
    expect(new Set(topo.map((r) => r.part.id)).size).toBe(topo.length); // um anel por peça (as fatias do rebaixo são peças)
    for (const r of topo) {
      expect(Math.min(...r.ring.map((p) => p.t))).toBeLessThan(0);
      expect(Math.max(...r.ring.map((p) => p.t))).toBeGreaterThan(0);
    }
  });
  it('abaixo do arranque o corte é o das ombreiras, como no vão retangular', () => {
    const a = slicePartsAtZ(m, 1.0, CLOSED).map((r) => r.part.id).sort();
    const b = slicePartsAtZ(cena('ot_p90').m, 1.0, CLOSED).map((r) => r.part.id).sort();
    expect(a).toEqual(b);
  });
});

describe('planta: folha e símbolo', () => {
  it('a folha cortada acima do arranque tem a largura do arco naquela cota (porta fechada e aberta 90 graus)', () => {
    const { m } = cena('ot_p90', ARCO);
    const z = 1.9;
    const zc = m.height - m.width / 2;
    const rr = m.width / 2 - (m.height - 2.061); // raio do recuo da folha (topo da folha a 2,061)
    const metade = Math.sqrt(rr * rr - (z - zc) ** 2);
    const folha = slicePartsAtZ(m, z, CLOSED).find((r) => r.part.id === 'leaf-0')!;
    const ts = folha.ring.map((p) => p.t);
    expect((Math.max(...ts) - Math.min(...ts)) / 2).toBeCloseTo(metade, 4);
    const aberta = slicePartsAtZ(m, z, { angle: Math.PI / 2, slide: 0 }).find((r) => r.part.id === 'leaf-0')!;
    expect(aberta.ring).toHaveLength(4);
    // a folha gira em torno da dobradiça: a corda no corte tem o mesmo comprimento
    const comprimento = Math.hypot(aberta.ring[0]!.t - aberta.ring[1]!.t, aberta.ring[0]!.s - aberta.ring[1]!.s);
    expect(comprimento).toBeCloseTo(2 * metade, 4);
  });
  it('openingPlanPaths com a porta em arco não lança e corta o batente em cota baixa como no retangular', () => {
    const { m } = cena('ot_p90', ARCO);
    const opts = { detail: 'mid', angle: Math.PI / 2, planDisplay: 'symbolic', showSwing: true, swingStyle: 'arc', cutZ: 1 } as const;
    const arco = openingPlanPaths(m, opts);
    const reto = openingPlanPaths(cena('ot_p90').m, opts);
    expect(arco.length).toBe(reto.length);
    expect(openingPlanPaths(m, { ...opts, cutZ: 2.0 }).length).toBeGreaterThan(0);
  });
});

describe('alizar em arco', () => {
  it('travessa do alizar vira faixa em arco por fora do vão; laterais sobem até o arranque; soleira fica reta', () => {
    for (const base of ['ot_p90', 'ot_j120'] as const) {
      const { m } = cenaComposicao(base, EX1, { shape: base === 'ot_p90' ? { kind: 'round', width: 0.9, height: 2.1 } : { kind: 'round', width: 1.2, height: 1.2 } });
      const cab = m.parts.filter((q) => q.id.startsWith('casing-head'));
      expect(cab).toHaveLength(2); // uma por face
      for (const q of cab) {
        expect(q.profile?.plane).toBe('tz');
        expect(q.group).toMatch(/^casing-/);
        // por fora do vão: o ápice passa da altura da esquadria
        expect(q.box.z1).toBeGreaterThan(m.height);
      }
      const lat = m.parts.filter((q) => /^casing-(left|right)-/.test(q.id));
      const piso = cab.reduce((s, q) => Math.min(s, ...q.profile!.pts.map((p) => p[1])), Infinity);
      for (const q of lat) expect(q.box.z1).toBeCloseTo(piso, 9);
      if (base === 'ot_j120') expect(m.parts.filter((q) => q.id.startsWith('casing-sill')).every((q) => !q.profile)).toBe(true);
    }
  });
  it('sem forma o alizar é o de sempre', () => {
    const a = cenaComposicao('ot_p90', EX1).m;
    expect(a.parts.filter((q) => q.role === 'casing').every((q) => !q.profile)).toBe(true);
  });
});

describe('quantitativo das peças', () => {
  it('caixa: volume = t x s x z; vão retangular com e sem rect dão os mesmos totais', () => {
    const a = modelQuantities(cena('ot_p90').m);
    const b = modelQuantities(cena('ot_p90', { kind: 'rect', width: 1, height: 1 }).m);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const leaf = cena('ot_p90').m.parts.find((q) => q.id === 'leaf-0')!;
    expect(partQuantity(leaf).volume).toBeCloseTo((leaf.box.t1 - leaf.box.t0) * (leaf.box.s1 - leaf.box.s0) * (leaf.box.z1 - leaf.box.z0), 12);
  });
  it('arco: a folha tem menos volume que a retangular e área = área do polígono', () => {
    const rect = partQuantity(cena('ot_p90').m.parts.find((q) => q.id === 'leaf-0')!);
    const arco = cena('ot_p90', ARCO).m.parts.find((q) => q.id === 'leaf-0')!;
    const q = partQuantity(arco);
    expect(q.volume).toBeLessThan(rect.volume);
    expect(q.faceArea).toBeCloseTo(Math.abs(ringSignedArea(tzPts(arco))), 12);
    expect(q.perimeter).toBeGreaterThan(0);
  });
  it('quadro de peças: uma linha por tipo, totais = unitário x quantidade', () => {
    const { p } = cena('ot_j120', { kind: 'round', width: 1.2, height: 1.2 });
    const rows = buildOpeningPartsSchedule(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.glassArea).toBeGreaterThan(0);
    expect(rows[0]!.totalGlassArea).toBeCloseTo(rows[0]!.glassArea * rows[0]!.count, 12);
    const rect = buildOpeningPartsSchedule(cena('ot_j120').p)[0]!;
    expect(rows[0]!.glassArea).toBeLessThan(rect.glassArea);
  });
});
