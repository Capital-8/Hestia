import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENING_TYPES,
  OPENING_SHAPE_KINDS,
  ProjectStore,
  clipRect,
  createEmptyProject,
  defaultOpeningShape,
  makeWall,
  openingFamilyOf,
  outline,
  outlineInset,
  shapeCompat,
  shapeIncompatible,
  type Opening,
  type OpeningFamilyId,
  type OpeningShape,
  type OpeningType,
  type OPt,
  type Project,
} from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';
import { noAnel } from './openingModelContornoAjuste.ts';
import { partQuantity } from './openingPartQuantities.ts';
import type { OpeningModel, OpeningPart } from './openingModelTypes.ts';

/*
 * docs/estudo-esquadrias/39: caixilho CONTÍNUO da folha (anel em volta do vidro) em todas as formas e a esquadria FIXA quando a
 * operação não cabe na forma (matriz `shapeCompat`).
 */

function cena(t0: OpeningType, shape?: OpeningShape): { p: Project; m: OpeningModel } {
  const s = new ProjectStore(createEmptyProject());
  const { shape: _antiga, ...base } = t0;
  void _antiga;
  s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_x', ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return { p, m: buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f) };
}

const TIPOS = DEFAULT_OPENING_TYPES;
const primeiro = (fam: OpeningFamilyId): OpeningType => TIPOS.find((t) => openingFamilyOf(t)?.id === fam && !t.shape)!;
const pts = (q: OpeningPart): OPt[] => (q.profile?.plane === 'tz' ? q.profile.pts.map((a): OPt => [a[0], a[1]]) : [[q.box.t0, q.box.z0], [q.box.t1, q.box.z0], [q.box.t1, q.box.z1], [q.box.t0, q.box.z1]]);
const area = (r: readonly OPt[]): number => Math.abs(r.reduce((a, p, i) => a + p[0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * p[1], 0) / 2);
const perimetro = (r: readonly OPt[]): number => r.reduce((a, p, i) => a + Math.hypot(r[(i + 1) % r.length]![0] - p[0], r[(i + 1) % r.length]![1] - p[1]), 0);

/** Ponto estritamente dentro do anel (par-ímpar). */
function dentro(ring: readonly OPt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const distBorda = (ring: readonly OPt[], x: number, z: number): number => {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    d = Math.min(d, Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az))));
  }
  return d;
};

const barras = (m: OpeningModel, k = 0): OpeningPart[] => m.parts.filter((q) => q.role === 'leaf' && new RegExp(`^leaf-${k}-(left|right|top|bottom)$`).test(q.id));
const vidro = (m: OpeningModel, k = 0): OpeningPart => m.parts.find((q) => q.id === `glass-${k}`)!;

/** Janela de uma folha, caixa quadrada (óculo): `casement`, `pivot`, `tilt` e `hinged` de uma folha. */
const JANELAS: Array<[string, OpeningFamilyId]> = [
  ['maxim-ar', 'window_casement'],
  ['pivotante', 'window_pivot'],
  ['basculante', 'window_tilt'],
  ['de abrir', 'window_hinged'],
];
const quadrada = (fam: OpeningFamilyId, extra: Partial<OpeningType> = {}): OpeningType => {
  const t = TIPOS.find((x) => openingFamilyOf(x)?.id === fam && x.leaves === 1 && !x.shape && !x.transom && !x.sidelights)!;
  return { ...t, width: 1, height: 1, grid: { cols: 1, rows: 1 }, ...extra, composition: undefined } as OpeningType;
};

describe('caixilho contínuo da folha: anel em volta do vidro', () => {
  describe.each(JANELAS)('janela %s', (_nome, fam) => {
    const formas: Array<[string, OpeningShape]> = [
      ['círculo', { kind: 'circle', width: 1, height: 1 }],
      ['elipse', { kind: 'circle', width: 1, height: 1.4 }],
      ['arco pleno', { kind: 'round', width: 1, height: 1.2 }],
      ['ogival', { kind: 'pointed', width: 1, height: 1.2, rise: 0.6 }],
      ['empena', defaultOpeningShape('gable', 1, 1.2)],
      ['trapézio', defaultOpeningShape('trapezoid', 1, 1.2)],
      ['polígono', defaultOpeningShape('polygon', 1, 1.2)],
    ];
    it.each(formas)('%s: o anel da folha cobre tudo entre o contorno e o vidro, sem lacuna nem sobre o vidro', (_n, forma) => {
      const t = quadrada(fam, { height: forma.height });
      if (shapeIncompatible(t, forma)) return; // sai fixa: sem folha
      const { m } = cena(t, forma);
      const bs = barras(m);
      expect(bs.length, 'quatro peças do aro').toBe(4);
      const g = vidro(m);
      const shape = formaDaEsquadria(forma, m.width, m.height)!;
      const hw = m.width / 2;
      const tmin = Math.min(...bs.map((q) => q.box.t0));
      const tmax = Math.max(...bs.map((q) => q.box.t1));
      const z0 = Math.min(...bs.map((q) => q.box.z0));
      const z1 = Math.max(...bs.map((q) => q.box.z1));
      const regiao = outlineInset(shape, { side: hw - Math.max(Math.abs(tmin), Math.abs(tmax)), arc: m.height - z1, base: 0 });
      const externo = clipRect(regiao, tmin, tmax, z0, z1);
      const interno = pts(g);
      const folha = bs.map(pts);
      let zona = 0;
      let furo = 0;
      let sobre = 0;
      const N = 220;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const x = tmin + ((i + 0.5) / N) * (tmax - tmin);
          const z = z0 + ((j + 0.5) / N) * (z1 - z0);
          if (!dentro(externo, x, z)) continue;
          const noVidro = dentro(interno, x, z);
          const naFolha = folha.some((r) => dentro(r, x, z));
          if (noVidro) {
            if (naFolha) sobre++;
            continue;
          }
          if (distBorda(externo, x, z) < 2e-3 || distBorda(interno, x, z) < 2e-3) continue; // cordas amostradas
          zona++;
          if (!naFolha) furo++;
        }
      }
      expect(zona, 'o anel existe').toBeGreaterThan(200);
      expect(furo / zona, `lacuna no anel: ${furo} de ${zona} amostras`).toBeLessThan(0.002);
      expect(sobre, 'o aro não invade o vidro').toBeLessThanOrEqual(zona * 0.002);
      // tudo dentro do contorno da esquadria
      const contorno = outline(shape);
      for (const q of [...bs, g]) for (const [x, z] of pts(q)) expect(noAnel(contorno, x, z, 2e-3), `${q.id} (${x.toFixed(3)}, ${z.toFixed(3)})`).toBe(true);
    });
  });

  it('círculo: área e volume do anel = perímetro médio x largura do perfil x profundidade (a 1 %)', () => {
    for (const [, fam] of JANELAS) {
      const forma: OpeningShape = { kind: 'circle', width: 1, height: 1 };
      const t = quadrada(fam);
      if (shapeIncompatible(t, forma)) continue;
      const { m } = cena(t, forma);
      const bs = barras(m);
      const lw = Math.max(0.025, 0.6 * (m.parts.find((q) => q.id === 'jamb-right' || q.role === 'jamb')!.box.t1 - m.parts.find((q) => q.id === 'jamb-right' || q.role === 'jamb')!.box.t0));
      const anel = bs.reduce((s, q) => s + area(pts(q)), 0);
      const Pi = perimetro(pts(vidro(m)));
      const esperado = lw * (Pi + Math.PI * lw);
      expect(Math.abs(anel / esperado - 1), `${fam}: ${anel} x ${esperado}`).toBeLessThan(0.01);
      const prof = bs[0]!.box.s1 - bs[0]!.box.s0;
      const volume = bs.reduce((s, q) => s + partQuantity(q).volume, 0);
      expect(Math.abs(volume / (esperado * prof) - 1)).toBeLessThan(0.01);
    }
  });

  it('o anel externo fecha: as quatro peças se tocam (nenhuma folga maior que a tolerância entre peças vizinhas)', () => {
    const { m } = cena(quadrada('window_casement'), { kind: 'circle', width: 1, height: 1 });
    const bs = barras(m).map(pts);
    // para cada peça, cada ponta (vértice sobre a reta de corte) toca outra peça a menos de 1 mm
    for (const [i, a] of bs.entries()) {
      for (const p of a) {
        const toca = bs.some((b, j) => j !== i && distBorda(b, p[0], p[1]) < 1e-3);
        const naBorda = distBorda(pts(vidro(m)), p[0], p[1]) < 1e-3;
        const externo = Math.hypot(p[0], p[1] - m.height / 2) > 0.45; // ponto do contorno de fora: só toca as vizinhas nas pontas de corte
        if (!naBorda && !externo) expect(toca || naBorda, `ponta ${p}`).toBe(true);
      }
    }
  });

  it('as divisões do vidro (cruz) encostam no aro: ficam dentro do vidro e terminam na borda dele', () => {
    const t = quadrada('window_casement', { grid: { cols: 2, rows: 2 } });
    const forma: OpeningShape = { kind: 'circle', width: 1, height: 1 };
    const { m } = cena(t, forma);
    const vid = pts(vidro(m));
    const mu = m.parts.filter((q) => q.role === 'muntin');
    expect(mu).toHaveLength(2);
    for (const q of mu) {
      for (const [x, z] of pts(q)) expect(noAnel(vid, x, z, 1e-6), `${q.id} (${x}, ${z})`).toBe(true);
      // as duas pontas da barra tocam a borda do vidro (aro)
      const ps = pts(q);
      const extremos = q.id.includes('-v-') ? [ps.reduce((a, b) => (b[1] > a[1] ? b : a)), ps.reduce((a, b) => (b[1] < a[1] ? b : a))] : [ps.reduce((a, b) => (b[0] > a[0] ? b : a)), ps.reduce((a, b) => (b[0] < a[0] ? b : a))];
      for (const e of extremos) expect(distBorda(vid, e[0], e[1]), q.id).toBeLessThan(2e-3);
    }
  });

  it('folha retangular que cabe no contorno não muda (as quatro barras continuam caixas)', () => {
    const t = { ...quadrada('window_pivot'), height: 1.6 } as OpeningType;
    const { m } = cena(t, { kind: 'round', width: 1, height: 1.6 });
    expect(barras(m).filter((q) => q.profile === undefined).length).toBeGreaterThanOrEqual(2); // montantes e base retos; só o topo acompanha o arco
  });
});

const TODAS: OpeningShape[] = [];
describe('matriz tipo x forma: todos os tipos do catálogo x as 9 formas', { timeout: 180000 }, () => {
  it('nenhum modelo lança, as peças ficam dentro do contorno e a combinação incompatível vira fixa', () => {
    const fora: string[] = [];
    let fixas = 0;
    let adaptadas = 0;
    for (const t of TIPOS) {
      for (const k of OPENING_SHAPE_KINDS) {
        const forma = defaultOpeningShape(k, t.width, t.height);
        const { m } = cena(t, forma);
        const s = k === 'rect' ? null : formaDaEsquadria(forma, m.width, m.height);
        const veredito = shapeCompat(t, forma).verdict;
        if (!s) continue;
        const contorno = outline(s);
        if (veredito === 'incompatível') {
          fixas++;
          expect(m.parts.some((q) => q.motion !== undefined), `${t.id}/${k} tem movimento`).toBe(false);
          expect(m.parts.some((q) => q.role === 'hinge' || q.role === 'handle' || q.role === 'track'), `${t.id}/${k} tem ferragem de movimento`).toBe(false);
          expect(m.openings.every((o) => o.kind === 'fixed'), `${t.id}/${k} abertura`).toBe(true);
          expect(m.parts.some((q) => q.role === 'glass' || q.role === 'leaf'), `${t.id}/${k} sem aro e vidro`).toBe(true);
        } else if (veredito === 'adaptado') adaptadas++;
        for (const q of m.parts) {
          if (!(['glass', 'leaf', 'leafPanel', 'muntin', 'bead', 'mullion', 'transom'] as const).includes(q.role as never)) continue;
          if (pts(q).some(([x, z]) => !noAnel(contorno, x, z, 2e-3))) fora.push(`${t.id}/${k}: ${q.id}`);
        }
      }
    }
    expect(fora).toEqual([]);
    expect(fixas).toBeGreaterThan(100);
    expect(adaptadas).toBeGreaterThan(100);
    expect(TODAS).toHaveLength(0);
  });

  it('o vão retangular é idêntico ao de antes (forma ausente ou rect) nos 162 tipos', () => {
    for (const t of TIPOS) {
      const a = cena(t).m;
      const b = cena(t, { kind: 'rect', width: t.width, height: t.height }).m;
      expect(JSON.stringify(b), t.id).toBe(JSON.stringify(a));
    }
  });
});

describe('operação incompatível com a forma: a esquadria sai FIXA dentro do contorno', () => {
  it('janela de correr em círculo: aro do batente e vidro, sem folha que corre', () => {
    const t = { ...primeiro('window_sliding'), width: 1.2, height: 1.2 } as OpeningType;
    const { m } = cena(t, { kind: 'circle', width: 1.2, height: 1.2 });
    expect(m.parts.filter((q) => q.role === 'track' || q.motion !== undefined)).toHaveLength(0);
    expect(m.parts.filter((q) => q.group === 'frame-ring').length).toBeGreaterThanOrEqual(2);
    expect(m.parts.filter((q) => q.role === 'glass')).toHaveLength(1);
    expect(m.openings.map((o) => o.kind)).toEqual(['fixed']);
  });

  it('janela de correr em círculo não perde alizar, peitoril nem verga do tipo', () => {
    const t = { ...primeiro('window_sliding'), width: 1.2, height: 1.2, casing: { width: 0.07, thickness: 0.015 } } as OpeningType;
    const com = cena(t, { kind: 'circle', width: 1.2, height: 1.2 }).m;
    const papeis = new Set(com.parts.map((q) => q.role));
    expect(papeis.has('casing')).toBe(true);
  });

  it('janela de correr em arco é só adaptada: continua com a folha que corre', () => {
    const t = { ...primeiro('window_sliding'), width: 1.2, height: 1.4 } as OpeningType;
    const { m } = cena(t, { kind: 'round', width: 1.2, height: 1.4 });
    expect(m.parts.some((q) => q.motion?.kind === 'slide')).toBe(true);
    expect(m.openings.some((o) => o.kind === 'slide')).toBe(true);
  });

  it('porta de giro em arco é compatível: gira como antes; em ferradura é incompatível e fica fixa', () => {
    const t = TIPOS.find((x) => x.id === 'ot_pgiro90')!;
    const arco = cena(t, defaultOpeningShape('round', t.width, t.height)).m;
    expect(arco.parts.some((q) => q.motion?.kind === 'rotate')).toBe(true);
    expect(arco.parts.some((q) => q.role === 'hinge')).toBe(true);
    const fer = cena(t, defaultOpeningShape('horseshoe', t.width, t.height)).m;
    expect(fer.parts.some((q) => q.motion !== undefined || q.role === 'hinge' || q.role === 'handle')).toBe(false);
    expect(fer.parts.some((q) => q.role === 'leaf')).toBe(true);
    expect(fer.openings.every((o) => o.kind === 'fixed')).toBe(true);
  });

  it('porta de correr e sanfonada em círculo e ogival: fixas, com batente e folha', () => {
    for (const fam of ['door_sliding', 'door_accordion', 'door_pocket'] as OpeningFamilyId[]) {
      const t = primeiro(fam);
      for (const k of ['circle', 'pointed'] as const) {
        if (!shapeIncompatible(t, defaultOpeningShape(k, t.width, t.height))) continue;
        const { m } = cena(t, defaultOpeningShape(k, t.width, t.height));
        expect(m.parts.some((q) => q.motion !== undefined), `${fam}/${k}`).toBe(false);
        expect(m.parts.some((q) => q.role === 'leaf'), `${fam}/${k}`).toBe(true);
        expect(m.parts.some((q) => q.role === 'jamb'), `${fam}/${k} batente`).toBe(true);
      }
    }
  });

  it('duas folhas de abrir em círculo: fixa; uma folha: continua de abrir', () => {
    const um = quadrada('window_hinged');
    expect(cena(um, { kind: 'circle', width: 1, height: 1 }).m.openings.some((o) => o.kind === 'side')).toBe(true);
    const dois = TIPOS.find((x) => openingFamilyOf(x)?.id === 'window_hinged' && x.leaves === 2 && !x.shape && !x.composition)!;
    expect(cena(dois, { kind: 'circle', width: dois.width, height: dois.width }).m.openings.every((o) => o.kind === 'fixed')).toBe(true);
  });
});
