import { describe, expect, it } from 'vitest';
import { intersection, multiArea } from '@hestia/geom';
import {
  DEFAULT_OPENING_TYPES,
  buildTemplate,
  createEmptyProject,
  makeWall,
  openingAngle2d,
  openingAngle3d,
  openingFamilyOf,
  openingTypeIssue,
  ProjectStore,
  type Opening,
  type OpeningType,
  type Project,
} from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import type { OpeningGeometry } from './types.ts';
import { buildOpeningModel, partTransformed, slicePartsAtZ } from './openingModel.ts';
import { CLOSED, type OpeningModel, type OpeningPart, type PartBox } from './openingModelTypes.ts';
import { openingPlanPaths, type OpeningPlanOptions, type OpeningPlanPath } from './openingPlan.ts';
import { buildOpeningSchedule } from './openingSchedule.ts';

interface Cena {
  p: Project;
  o: Opening;
  g: OpeningGeometry;
  t: OpeningType;
}

/** Parede de 8 m com um vão no meio: comporta o portão de 3 m e todos os demais tipos do catálogo. */
function cena(base: string, flips: { flipHand?: boolean; flipFacing?: boolean } = {}): Cena {
  const s = new ProjectStore(createEmptyProject());
  const t = s.project.openingTypes[base];
  if (!t) throw new Error(`tipo padrão ausente: ${base}`);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }) });
  s.exec({
    type: 'addOpening',
    opening: {
      id: 'v',
      kind: t.kind,
      typeId: base,
      hostId: 'w',
      offset: 4,
      flipHand: flips.flipHand ?? false,
      flipFacing: flips.flipFacing ?? false,
      sillOverride: null,
      mark: '',
    },
  });
  const p = s.project;
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  return { p, o, g: openingGeometry(p, o, f), t: p.openingTypes[base]! };
}

const modelo = (c: Cena): OpeningModel => buildOpeningModel(c.p, c.o, c.g, frameOfWall(c.p, 'w')!);
const de = (parts: OpeningPart[], role: OpeningPart['role']): OpeningPart[] => parts.filter((x) => x.role === role);
const combos = [
  { flipHand: false, flipFacing: false },
  { flipHand: false, flipFacing: true },
  { flipHand: true, flipFacing: false },
  { flipHand: true, flipFacing: true },
];

let expectedFamily = new Map<string, string>();

const familia = (id: string): string => {
  if (expectedFamily.size === 0) {
    expectedFamily = new Map([
      ['ot_p70', 'door_swing'],
      ['ot_p80', 'door_swing'],
      ['ot_p90', 'door_swing'],
      ['ot_p160', 'door_double'],
      ['ot_pc160', 'door_sliding'],
      ['ot_pp80', 'door_pivot'],
      ['ot_vao90', 'door_void'],
      ['ot_pvv90', 'door_dblact'],
      ['ot_pe80', 'door_pocket'],
      ['ot_pd120', 'door_bifold'],
      ['ot_ps90', 'door_accordion'],
      ['ot_pg300', 'door_garage'],
      ['ot_j120', 'window_sliding'],
      ['ot_j150', 'window_sliding'],
      ['ot_j60', 'window_casement'],
      ['ot_j200', 'window_sliding'],
      ['ot_jfixa60', 'window_fixed'],
      ['ot_j240', 'window_sliding'],
      ['ot_jv120', 'window_void'],
      ['ot_ja120', 'window_hinged'],
      ['ot_jg90', 'window_hung'],
      ['ot_jp80', 'window_pivot'],
      ['ot_jv80', 'window_louver'],
      ['ot_jb80', 'window_tilt'],
      // Catálogo brasileiro (catalogoPortas.ts e catalogoJanelas.ts).
      ['ot_pgiro60', 'door_swing'],
      ['ot_pgiro70', 'door_swing'],
      ['ot_pgiro80', 'door_swing'],
      ['ot_pgiro90', 'door_swing'],
      ['ot_pgiro100', 'door_swing'],
      ['ot_pgiro2_120', 'door_double'],
      ['ot_pgiro2_140', 'door_double'],
      ['ot_pgiro2_160', 'door_double'],
      ['ot_pgiro2_180', 'door_double'],
      ['ot_pbalcao120', 'door_double'],
      ['ot_pbalcao150', 'door_double'],
      ['ot_pbalcao200', 'door_double'],
      ['ot_pcorrer160', 'door_sliding'],
      ['ot_pcorrer180', 'door_sliding'],
      ['ot_pembutir80', 'door_pocket'],
      ['ot_pembutir90', 'door_pocket'],
      ['ot_ppiv100', 'door_pivot'],
      ['ot_ppiv120', 'door_pivot'],
      ['ot_pcamarao2_160', 'door_bifold'],
      ['ot_pcamarao4_240', 'door_bifold'],
      ['ot_pvai80', 'door_dblact'],
      ['ot_pvai90', 'door_dblact'],
      ['ot_pvai100', 'door_dblact'],
      ['ot_psanf60', 'door_accordion'],
      ['ot_psanf70', 'door_accordion'],
      ['ot_psanf80', 'door_accordion'],
      ['ot_psanf90', 'door_accordion'],
      ['ot_pvid72_8', 'door_swing'],
      ['ot_pvid72_10', 'door_swing'],
      ['ot_pvid82_8', 'door_swing'],
      ['ot_pvid82_10', 'door_swing'],
      ['ot_pvid92_8', 'door_swing'],
      ['ot_pvid92_10', 'door_swing'],
      ['ot_pf30_80', 'door_swing'],
      ['ot_pf30_90', 'door_swing'],
      ['ot_pf60_80', 'door_swing'],
      ['ot_pf60_90', 'door_swing'],
      ['ot_pf90_80', 'door_swing'],
      ['ot_pf90_90', 'door_swing'],
      ['ot_pf120_80', 'door_swing'],
      ['ot_pf120_90', 'door_swing'],
      ['ot_pbasc250', 'door_garage'],
      ['ot_penrol280', 'door_garage'],
      ['ot_jc2_120x100', 'window_sliding'],
      ['ot_jc2_150x120', 'window_sliding'],
      ['ot_jc2_120x150', 'window_sliding'],
      ['ot_jc3_150x100', 'window_sliding'],
      ['ot_jc3_200x120', 'window_sliding'],
      ['ot_jc4_200x100', 'window_sliding'],
      ['ot_jc4_200x120', 'window_sliding'],
      ['ot_jc4_240x120', 'window_sliding'],
      ['ot_jm_40x40', 'window_casement'],
      ['ot_jm_50x50', 'window_casement'],
      ['ot_jm_80x60', 'window_casement'],
      ['ot_jm_80x80', 'window_casement'],
      ['ot_jm_100x100', 'window_casement'],
      ['ot_jb_40x40', 'window_tilt'],
      ['ot_jb_60x40', 'window_tilt'],
      ['ot_jb_80x40', 'window_tilt'],
      ['ot_jb_100x40', 'window_tilt'],
      ['ot_jb_60x60', 'window_tilt'],
      ['ot_jb_80x60', 'window_tilt'],
      ['ot_jb_100x60', 'window_tilt'],
      ['ot_jb_100x100', 'window_tilt'],
      ['ot_jpv_60x60', 'window_pivot'],
      ['ot_jpv_80x80', 'window_pivot'],
      ['ot_jpv_100x100', 'window_pivot'],
      ['ot_jpv_120x120', 'window_pivot'],
      ['ot_jg_60x120', 'window_hung'],
      ['ot_jg_80x120', 'window_hung'],
      ['ot_jg_100x150', 'window_hung'],
      ['ot_jab_60x60', 'window_hinged'],
      ['ot_jab_80x80', 'window_hinged'],
      ['ot_jab_100x100', 'window_hinged'],
      ['ot_jab2_150x120', 'window_hinged'],
      ['ot_jf_80x60', 'window_fixed'],
      ['ot_jf_120x120', 'window_fixed'],
      ['ot_jven_120x100', 'window_louver'],
      ['ot_jven_150x100', 'window_louver'],
      ['ot_jban_90x40', 'window_fixed'],
      ['ot_jban_90x60', 'window_fixed'],
      ['ot_jbanh_100x50', 'window_casement'],
      // Composições (catalogoComposicoes.ts).
      ['ot_pband40_90', 'door_swing'],
      ['ot_pband60_90', 'door_swing'],
      ['ot_plat40e_80', 'door_swing'],
      ['ot_plat40d_80', 'door_swing'],
      ['ot_plat40e_90', 'door_swing'],
      ['ot_plat40d_90', 'door_swing'],
      ['ot_plat2_80', 'door_swing'],
      ['ot_plat2_90', 'door_swing'],
      ['ot_pband_lat2_90', 'door_swing'],
      ['ot_ppainel_90', 'door_swing'],
      ['ot_pbalcao_band120', 'door_double'],
      ['ot_pcorrer_band160', 'door_sliding'],
      ['ot_pband40_alu_90', 'door_swing'],
      ['ot_pband40_pvc_90', 'door_swing'],
      ['ot_plat2_alu_90', 'door_swing'],
      ['ot_jcomb_fa150x120', 'window_hinged'],
      ['ot_jcomb_fc180x120', 'window_sliding'],
      ['ot_jabr_fa160x120', 'window_hinged'],
      ['ot_jband_100x150', 'window_hinged'],
      ['ot_jcorrer_band200x150', 'window_sliding'],
      ['ot_jalta_80x210', 'window_hinged'],
      ['ot_jcomb_madeira_150x120', 'window_hinged'],
      ['ot_jcomb_pvc_150x120', 'window_hinged'],
      ['ot_jalta_madeira_80x210', 'window_hinged'],
    ]);
  }
  return expectedFamily.get(id)!;
};

const multi = (ring: Array<{ t: number; s: number }>): Array<Array<Array<{ x: number; y: number }>>> => [
  [ring.map((p) => ({ x: p.t, y: p.s }))],
];

/** Interseção real (perfil em L incluído) na faixa de z comum às duas peças. */
function temIntersecao(m: OpeningModel, a: OpeningPart, b: OpeningPart): boolean {
  const z0 = Math.max(a.box.z0, b.box.z0);
  const z1 = Math.min(a.box.z1, b.box.z1);
  if (z1 - z0 <= 1e-9) return false;
  const passos = Math.max(2, Math.min(60, Math.ceil((z1 - z0) / 0.01)));
  for (let i = 0; i <= passos; i++) {
    const z = z0 + ((z1 - z0) * i) / passos;
    const corte = slicePartsAtZ(m, z, CLOSED);
    const ra = corte.find((x) => x.part.id === a.id)?.ring;
    const rb = corte.find((x) => x.part.id === b.id)?.ring;
    if (ra && rb && multiArea(intersection(multi(ra), multi(rb))) > 1e-7) return true;
  }
  return false;
}

/** As 12 arestas da caixa orientada continuam com as três medidas originais (movimento é isometria). */
function tamanhoPreservado(part: OpeningPart, state: { angle: number; slide: number }): void {
  const ob = partTransformed(part, state);
  const b = part.box;
  const esperado = [b.t1 - b.t0, b.s1 - b.s0, b.z1 - b.z0].sort((x, y) => x - y);
  const arestas: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const medidas = arestas
    .map(([i, j]) => {
      const a = ob.corners[i]!;
      const c = ob.corners[j]!;
      return Math.hypot(a.t - c.t, a.s - c.s, a.z - c.z);
    })
    .sort((x, y) => x - y);
  for (let k = 0; k < medidas.length; k++) expect(medidas[k], `${part.id} aresta ${k}`).toBeCloseTo(esperado[Math.floor(k / 4)]!, 9);
}

/** Caixas das folhas fechadas do modelo (união das peças `leaf` de cada folha). */
function folhasFechadas(m: OpeningModel): PartBox[] {
  const porFolha = new Map<number, PartBox>();
  for (const p of m.parts) {
    if (p.role !== 'leaf' || p.leaf === undefined) continue;
    const atual = porFolha.get(p.leaf);
    porFolha.set(
      p.leaf,
      atual
        ? {
            t0: Math.min(atual.t0, p.box.t0),
            t1: Math.max(atual.t1, p.box.t1),
            s0: Math.min(atual.s0, p.box.s0),
            s1: Math.max(atual.s1, p.box.s1),
            z0: Math.min(atual.z0, p.box.z0),
            z1: Math.max(atual.z1, p.box.z1),
          }
        : p.box,
    );
  }
  return [...porFolha.values()];
}

const mesmaCaixa = (a: PartBox, b: PartBox): boolean =>
  Math.abs(a.t0 - b.t0) < 1e-6 && Math.abs(a.t1 - b.t1) < 1e-6 && Math.abs(a.s0 - b.s0) < 1e-6 && Math.abs(a.s1 - b.s1) < 1e-6;

const plano = (over: Partial<OpeningPlanOptions> = {}): OpeningPlanOptions => ({
  detail: 'mid',
  angle: Math.PI / 2,
  planDisplay: 'symbolic',
  showSwing: true,
  swingStyle: 'arc',
  cutZ: 1,
  ...over,
});

const boxOf = (p: OpeningPlanPath): PartBox => ({
  t0: Math.min(...p.pts.map((q) => q.t)),
  t1: Math.max(...p.pts.map((q) => q.t)),
  s0: Math.min(...p.pts.map((q) => q.s)),
  s1: Math.max(...p.pts.map((q) => q.s)),
  z0: 0,
  z1: 1,
});

const areaComum = (a: PartBox, b: PartBox): number =>
  Math.max(0, Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0)) * Math.max(0, Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0));

describe('catálogo completo: padrões do tipo', () => {
  it('são 130 tipos, cada um na família esperada e sem problema de tipo', () => {
    expect(DEFAULT_OPENING_TYPES).toHaveLength(130);
    expect(new Set(DEFAULT_OPENING_TYPES.map((t) => t.id)).size).toBe(130);
    for (const t of DEFAULT_OPENING_TYPES) {
      expect(openingFamilyOf(t)?.id, t.id).toBe(familia(t.id));
      expect(openingTypeIssue(t), t.id).toBeNull();
    }
  });
});

describe('catálogo completo: modelo único', () => {
  it('ids únicos e estáveis, caixas válidas e tudo dentro do vão exceto acabamentos, trilho e cavidade', () => {
    const fora = new Set<OpeningPart['role']>(['casing', 'sillBoard', 'lintel', 'sillBeam', 'pocket', 'track']);
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        const caso = `${base} hand=${flips.flipHand} facing=${flips.flipFacing}`;
        expect(new Set(m.parts.map((x) => x.id)).size, caso).toBe(m.parts.length);
        expect(m, caso).toEqual(modelo(c));
        for (const p of m.parts) {
          expect(p.box.t1 - p.box.t0, `${caso} ${p.id}`).toBeGreaterThan(1e-9);
          expect(p.box.s1 - p.box.s0, `${caso} ${p.id}`).toBeGreaterThan(1e-9);
          expect(p.box.z1 - p.box.z0, `${caso} ${p.id}`).toBeGreaterThan(1e-9);
          if (fora.has(p.role)) continue;
          expect(Math.abs(p.box.t0), `${caso} ${p.id}`).toBeLessThanOrEqual(c.g.width / 2 + 1e-9);
          expect(Math.abs(p.box.t1), `${caso} ${p.id}`).toBeLessThanOrEqual(c.g.width / 2 + 1e-9);
          expect(p.box.z0, `${caso} ${p.id}`).toBeGreaterThanOrEqual(-1e-9);
          expect(p.box.z1, `${caso} ${p.id}`).toBeLessThanOrEqual(c.g.height + 1e-9);
        }
      }
    }
  }, 120_000); // Catálogo brasileiro completo (130 tipos) é lento por natureza; passa dos 5 s padrão.

  it('folha fechada não tem volume comum com batente/caixilho em nenhuma família', () => {
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        const caso = `${base} hand=${flips.flipHand} facing=${flips.flipFacing}`;
        const fixos = m.parts.filter((p) => p.role === 'jamb' || p.role === 'stop' || p.role === 'head' || p.role === 'sillFrame');
        for (const folha of m.parts.filter((p) => p.role === 'leaf' || p.role === 'leafPanel')) {
          for (const fixo of fixos) expect(temIntersecao(m, folha, fixo), `${caso} ${folha.id} × ${fixo.id}`).toBe(false);
        }
      }
    }
  }, 60_000); // Com o catálogo brasileiro (130 tipos × 4 combinações): ~10 s isolado; sob carga da suíte passa dos 30 s.

  it('movimento aberto preserva o tamanho de cada peça e a folha lateral fica no lado side', () => {
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        const graus = openingAngle3d(c.t);
        const angle = (graus * Math.PI) / 180;
        const state = { angle, slide: 1 };
        for (const p of m.parts) if (p.motion) tamanhoPreservado(p, state);
        for (const o of m.openings) {
          if (o.kind !== 'side') continue;
          const folhas = m.parts.filter((p) => p.leaf === o.leaf && (p.role === 'leaf' || p.role === 'glass' || p.role === 'leafPanel'));
          for (const p of folhas) {
            const motion = p.motion;
            if (!motion || motion.kind !== 'rotate' || motion.axis !== 'z') continue;
            const ob = partTransformed(p, { angle: Math.PI / 2, slide: 0 });
            expect(Math.sign(ob.center.s - motion.s), `${base} ${p.id}`).toBe(o.side);
          }
        }
      }
    }
  }, 30_000); // Com o catálogo brasileiro (130 tipos) passa dos 5 s padrão sob carga da suíte.

  it('correr, guilhotina e dobrável continuam no vão; embutir fica na cavidade; seccionada sobe H', () => {
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        const family = openingFamilyOf(c.t)?.id;
        const angle = (openingAngle3d(c.t) * Math.PI) / 180;
        for (const p of m.parts) {
          const motion = p.motion;
          if (!motion) continue;
          const ob = partTransformed(p, { angle, slide: 1 });
          const caso = `${base} hand=${flips.flipHand} facing=${flips.flipFacing} ${p.id}`;
          if (motion.kind === 'fold') {
            expect(ob.bounds.t0, caso).toBeGreaterThanOrEqual(-c.g.width / 2 - 1e-9);
            expect(ob.bounds.t1, caso).toBeLessThanOrEqual(c.g.width / 2 + 1e-9);
            expect(ob.bounds.z0, caso).toBeGreaterThanOrEqual(-1e-9);
            expect(ob.bounds.z1, caso).toBeLessThanOrEqual(c.g.height + 1e-9);
          } else if (motion.kind === 'slide' && family === 'door_pocket' && p.role === 'leaf') {
            const pocket = de(m.parts, 'pocket')[0]!;
            expect(ob.bounds.t0, caso).toBeGreaterThanOrEqual(pocket.box.t0 - 1e-9);
            expect(ob.bounds.t1, caso).toBeLessThanOrEqual(pocket.box.t1 + 1e-9);
            expect(ob.bounds.s0, caso).toBeGreaterThanOrEqual(pocket.box.s0 - 1e-9);
            expect(ob.bounds.s1, caso).toBeLessThanOrEqual(pocket.box.s1 + 1e-9);
          } else if (motion.kind === 'slide' && family === 'door_garage') {
            // Portão seccionado: faixas e almofadas recolhem para cima por H (spec E §3.5), fora do vão por projeto.
            expect(ob.center.z - partTransformed(p, CLOSED).center.z, caso).toBeCloseTo(c.g.height, 9);
          } else if (motion.kind === 'slide') {
            expect(ob.bounds.t0, caso).toBeGreaterThanOrEqual(-c.g.width / 2 - 1e-9);
            expect(ob.bounds.t1, caso).toBeLessThanOrEqual(c.g.width / 2 + 1e-9);
            expect(ob.bounds.z0, caso).toBeGreaterThanOrEqual(-1e-9);
            expect(ob.bounds.z1, caso).toBeLessThanOrEqual(c.g.height + 1e-9);
          }
        }
      }
    }
  }, 30_000); // Com o catálogo brasileiro (130 tipos) passa dos 5 s padrão sob carga da suíte.
});

// Mesmo motivo do bloco anterior: o catálogo brasileiro passa dos 5 s padrão sob a carga da suíte completa.
describe('catálogo completo: planta', { timeout: 30_000 }, () => {
  it('low/mid/high: pontos finitos e nenhum traço com menos de dois pontos', () => {
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        const angle = (openingAngle2d(c.t) * Math.PI) / 180;
        for (const detail of ['low', 'mid', 'high'] as const) {
          const paths = openingPlanPaths(m, plano({ detail, angle }));
          const caso = `${base} ${detail}`;
          for (const p of paths) {
            expect(p.pts.length, caso).toBeGreaterThanOrEqual(2);
            for (const q of p.pts) {
              expect(Number.isFinite(q.t), caso).toBe(true);
              expect(Number.isFinite(q.s), caso).toBe(true);
            }
          }
        }
      }
    }
  });

  it('mid/high: o arco do giro parte da folha fechada e a ponta aberta fica a radius da dobradiça', () => {
    const giros = ['ot_p90', 'ot_p160', 'ot_pvv90'];
    for (const base of giros) {
      for (const flips of combos) {
        const c = cena(base, flips);
        const m = modelo(c);
        for (const detail of ['mid', 'high'] as const) {
          const paths = openingPlanPaths(m, plano({ detail, angle: Math.PI / 2 }));
          const arcos = paths.filter((p) => p.role === 'swing');
          expect(arcos.length, `${base} ${detail}`).toBeGreaterThanOrEqual(m.openings.length);
          for (const o of m.openings) {
            const arco = arcos.find((p) => {
              const first = p.pts[0]!;
              return Math.abs(first.t - o.latchT) < 1e-9 && Math.abs(first.s - o.pivot.s) < 1e-9;
            });
            expect(arco, `${base} ${detail} arco do trinco`).toBeDefined();
            const last = arco!.pts.at(-1)!;
            expect(Math.hypot(last.t - o.pivot.t, last.s - o.pivot.s), `${base} ${detail}`).toBeCloseTo(o.radius, 9);
          }
        }
      }
    }
  });

  it('mid/high: o arco da pivotante parte dos cantos fechados e preserva o raio do canto', () => {
    for (const base of ['ot_pp80', 'ot_jp80']) {
      for (const flips of combos) {
        const m = modelo(cena(base, flips));
        for (const detail of ['mid', 'high'] as const) {
          const paths = openingPlanPaths(m, plano({ detail, angle: Math.PI / 2 }));
          const arcos = paths.filter((p) => p.role === 'swing');
          const o = m.openings[0]!;
          const caixa = de(m.parts, 'leaf').length > 0 ? de(m.parts, 'leaf') : de(m.parts, 'glass');
          const t0 = Math.min(...caixa.map((p) => p.box.t0));
          const t1 = Math.max(...caixa.map((p) => p.box.t1));
          for (const t of [t0, t1]) {
            const arco = arcos.find((p) => Math.abs(p.pts[0]!.t - t) < 1e-9 && Math.abs(p.pts[0]!.s - o.pivot.s) < 1e-9)!;
            expect(arco, `${base} ${detail} canto ${t}`).toBeDefined();
            const last = arco.pts.at(-1)!;
            expect(Math.hypot(last.t - o.pivot.t, last.s - o.pivot.s), `${base} ${detail} canto ${t}`).toBeCloseTo(Math.abs(t - o.pivot.t), 9);
          }
        }
      }
    }
  });

  it('mid/high: a folha fechada não cruza o batente/caixilho em nenhuma família', () => {
    for (const base of DEFAULT_OPENING_TYPES.map((t) => t.id)) {
      for (const flips of combos) {
        const m = modelo(cena(base, flips));
        const fechadas = folhasFechadas(m);
        const cutZ = cena(base, flips).g.height / 2;
        for (const detail of ['low', 'mid', 'high'] as const) {
          const paths = openingPlanPaths(m, plano({ detail, angle: (openingAngle2d(cena(base, flips).t) * Math.PI) / 180, cutZ }));
          const fixos = paths.filter((p) => p.closed && (p.role === 'jamb' || p.role === 'stop' || p.role === 'head' || p.role === 'sillFrame'));
          const folhas = paths.filter((p) => p.closed && p.role === 'leaf' && fechadas.some((b) => mesmaCaixa(b, boxOf(p))));
          for (const folha of folhas) {
            for (const fixo of fixos) expect(areaComum(boxOf(folha), boxOf(fixo)), `${base} ${detail} ${folha.role} × ${fixo.role}`).toBeCloseTo(0, 12);
          }
        }
      }
    }
  });

  it('janelas têm as linhas das faces (e a guilhotina, as duas folhas defasadas)', () => {
    const janelas = DEFAULT_OPENING_TYPES.filter((t) => t.kind === 'window');
    for (const t of janelas) {
      const m = modelo(cena(t.id));
      const family = openingFamilyOf(t)?.id;
      for (const detail of ['low', 'mid', 'high'] as const) {
        const paths = openingPlanPaths(m, plano({ detail, angle: (openingAngle2d(t) * Math.PI) / 180 }));
        if (family === 'window_void') {
          // Vão livre: as duas linhas das faces são tracejadas (sem batente nem vidro).
          expect(paths.filter((p) => !p.closed && p.role === 'mark' && p.dash).length, `${t.id} ${detail}`).toBe(2);
          continue;
        }
        if (family === 'window_hung') {
          expect(paths.filter((p) => !p.closed && p.role === 'leaf').length, `${t.id} ${detail}`).toBeGreaterThanOrEqual(2);
          continue;
        }
        expect(paths.filter((p) => !p.closed && p.role === 'jamb').length, `${t.id} ${detail}`).toBeGreaterThanOrEqual(2);
        expect(paths.filter((p) => !p.closed && p.role === 'glass').length, `${t.id} ${detail}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a janela de abrir usa o ângulo 2D de 60° quando o tipo não define outro', () => {
    const c = cena('ot_ja120');
    const semAngulo = { ...c.t, angle2d: undefined };
    expect(openingAngle2d(semAngulo)).toBe(60);
    const paths = openingPlanPaths(modelo(c), plano({ angle: (60 * Math.PI) / 180 }));
    expect(paths.filter((p) => p.role === 'leaf' && p.closed).length).toBeGreaterThanOrEqual(2);
  });
});

describe('catálogo completo: quadro', () => {
  it('o mostruário tem uma linha por tipo usado e áreas coerentes', () => {
    const p = buildTemplate('esquadrias');
    const s = buildOpeningSchedule(p);
    expect(s.rows).toHaveLength(DEFAULT_OPENING_TYPES.length);
    expect(s.totals.count).toBe(DEFAULT_OPENING_TYPES.length);
    expect(s.totals.doorCount).toBe(DEFAULT_OPENING_TYPES.filter((t) => t.kind === 'door').length);
    expect(s.totals.windowCount).toBe(DEFAULT_OPENING_TYPES.filter((t) => t.kind === 'window').length);
    const soma = s.rows.reduce((a, r) => a + r.unitArea, 0);
    expect(s.totals.totalArea).toBeCloseTo(soma, 9);
    for (const r of s.rows) {
      expect(r.count).toBe(1);
      expect(r.unitArea).toBeCloseTo(r.width * r.height, 9);
      expect(r.totalArea).toBeCloseTo(r.unitArea * r.count, 9);
      expect(r.familyName.length).toBeGreaterThan(0);
      expect(r.code.length).toBeGreaterThan(0);
    }
  });
});
