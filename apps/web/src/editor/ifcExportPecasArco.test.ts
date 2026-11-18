import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { buildOpeningModel, frameOfWall, openingGeometry, partQuantity, type OpeningPart } from '@hestia/engine';
import { parseStep } from '@hestia/io';
import { ifcGeometryOf, projectIfc } from './ifcExport.ts';

/*
 * Peças da esquadria em arco no IFC (docs/estudo-esquadrias/30, seção "Peças em arco no IFC"). Ida e volta: o texto STEP sai
 * do exportador e é lido de volta pelo leitor do importador. Para cada peça confere-se a caixa do mundo (valida o plano da
 * extrusão) e o volume do sólido exportado contra `partQuantity` do engine.
 */

type Ent = NonNullable<ReturnType<ReturnType<typeof parseStep>['entities']['get']>>;
type Arg = Ent['args'][number];
type Stp = ReturnType<typeof parseStep>;
type Box3 = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

const NOW = new Date('2026-10-22T12:00:00Z');

/** Parede de 4 m com um vão `base` (tipo do catálogo) no meio, com a forma dada. */
function cena(base: string, shape: OpeningShape): Project {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes[base]!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', shape } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  return s.project;
}

/** Peças do engine para o vão, com o mesmo filtro do exportador (sem cavidade, tracejada, verga nem soleira embutida). */
function pecasExportadas(p: Project): OpeningPart[] {
  const o = p.elements['v'] as Opening;
  const f = frameOfWall(p, 'w')!;
  const model = buildOpeningModel(p, o, openingGeometry(p, o, f), f);
  return model.parts.filter((q) => {
    if (q.role === 'pocket' || q.dashed || q.role === 'lintel' || q.role === 'sillBeam') return false;
    const b = q.box;
    return b.t1 - b.t0 > 1e-6 && b.s1 - b.s0 > 1e-6 && b.z1 - b.z0 > 1e-6;
  });
}

const refOf = (v: Arg | undefined): number => {
  if (v?.k !== 'ref') throw new Error('referência STEP esperada');
  return v.id;
};
const numOf = (v: Arg | undefined): number => {
  if (v?.k !== 'num') throw new Error('número STEP esperado');
  return v.v;
};
const listOf = (v: Arg | undefined): Arg[] => (v?.k === 'list' ? v.items : []);
const coordsOf = (st: Stp, id: number): number[] => listOf(st.entities.get(id)!.args[0]).map(numOf);
const dirOf = (st: Stp, id: number): [number, number, number] => {
  const [x, y, z] = coordsOf(st, id);
  const n = Math.hypot(x!, y!, z!);
  return [x! / n, y! / n, z! / n];
};
const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** Geometria de um IFCEXTRUDEDAREASOLID lida do texto: pontos no mundo (eixos do Position), volume e caixa. */
function solidoLido(st: Stp, id: number): { volume: number; caixa: Box3; pontos: number } {
  const ext = st.entities.get(id)!;
  expect(ext.type).toBe('IFCEXTRUDEDAREASOLID');
  const prof = st.entities.get(refOf(ext.args[0]))!;
  expect(prof.type).toBe('IFCARBITRARYCLOSEDPROFILEDEF');
  const curve = st.entities.get(refOf(prof.args[2]))!;
  expect(curve.type).toBe('IFCPOLYLINE');
  const ring = listOf(curve.args[0]).map((r) => coordsOf(st, refOf(r)));
  const pos = st.entities.get(refOf(ext.args[1]))!;
  const o = coordsOf(st, refOf(pos.args[0]));
  // `$` no Axis ou no RefDirection é o padrão IFC: Z = (0,0,1), X = (1,0,0).
  const zAxis = pos.args[1]?.k === 'ref' ? dirOf(st, pos.args[1].id) : [0, 0, 1];
  const xAxis = pos.args[2]?.k === 'ref' ? dirOf(st, pos.args[2].id) : [1, 0, 0];
  const yAxis = cross(zAxis, xAxis);
  const depth = numOf(ext.args[3]);
  expect(dirOf(st, refOf(ext.args[2]))).toEqual([0, 0, 1]);
  const pts: number[][] = [];
  for (const [x, y] of ring as Array<[number, number]>) {
    for (const k of [0, depth]) {
      pts.push([0, 1, 2].map((i) => o[i]! + x * xAxis[i]! + y * yAxis[i]! + k * zAxis[i]!));
    }
  }
  const caixa: Box3 = {
    x0: Math.min(...pts.map((q) => q[0]!)), x1: Math.max(...pts.map((q) => q[0]!)),
    y0: Math.min(...pts.map((q) => q[1]!)), y1: Math.max(...pts.map((q) => q[1]!)),
    z0: Math.min(...pts.map((q) => q[2]!)), z1: Math.max(...pts.map((q) => q[2]!)),
  };
  let s2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % ring.length]!;
    s2 += x0! * y1! - x1! * y0!;
  }
  return { volume: Math.abs(s2) / 2 * depth, caixa, pontos: ring.length };
}

/** Sólidos do corpo da esquadria (porta ou janela) no texto, na ordem em que o exportador os escreveu. */
function sólidosDaEsquadria(st: Stp): number[] {
  const hosts = [...(st.types.get('IFCDOOR') ?? []), ...(st.types.get('IFCWINDOW') ?? [])];
  expect(hosts.length).toBe(1);
  const pds = st.entities.get(refOf(hosts[0]!.args[6]))!;
  const rep = st.entities.get(refOf(listOf(pds.args[2])[0]))!;
  return listOf(rep.args[3]).map((r) => refOf(r));
}

/** Tolerância de volume: perímetro da seção x profundidade x 1 µm (arredondamento da escrita). Caixa: sua própria área de face. */
function tolerancia(q: OpeningPart): number {
  const b = q.box;
  if (!q.profile) return ((b.t1 - b.t0) * (b.s1 - b.s0) + (b.s1 - b.s0) * (b.z1 - b.z0) + (b.t1 - b.t0) * (b.z1 - b.z0)) * 1e-6 + 1e-12;
  const pts = q.profile.pts;
  let perimetro = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    perimetro += Math.hypot(x1 - x0, y1 - y0);
  }
  const profundidade = q.profile.plane === 'tz' ? b.s1 - b.s0 : q.profile.plane === 'ts' ? b.z1 - b.z0 : b.t1 - b.t0;
  return perimetro * profundidade * 1e-6 + 1e-12;
}

const CASOS: Array<[string, string, OpeningShape]> = [
  ['porta, arco pleno (meia-lua do topo)', 'ot_p90', { kind: 'round', width: 0.9, height: 2.1 }],
  ['porta, arco abatido', 'ot_p90', { kind: 'segmental', width: 0.9, height: 2.1, rise: 0.3 }],
  ['janela, arco pleno (meia-lua)', 'ot_j120', { kind: 'round', width: 1.2, height: 1.2 }],
  ['janela, arco abatido', 'ot_j120', { kind: 'segmental', width: 1.2, height: 1.2, rise: 0.3 }],
];

describe('peças em arco no IFC (vão com forma)', () => {
  for (const [nome, base, shape] of CASOS) {
    it(`${nome}: cada peça sai com o perfil real, caixa e volume batendo com o engine`, () => {
      const p = cena(base, shape);
      const pecas = pecasExportadas(p);
      const text = projectIfc(p, NOW);
      const st = parseStep(text);
      const sol = sólidosDaEsquadria(st);

      // Número de peças: uma por peça do modelo que não é cavidade, tracejada, verga ou soleira embutida.
      expect(sol.length).toBe(pecas.length);
      // O vão é de forma: as peças recortadas pelo contorno têm seção própria (não só a caixa).
      expect(pecas.filter((q) => q.profile).length).toBeGreaterThan(0);

      pecas.forEach((q, i) => {
        const lido = solidoLido(st, sol[i]!);
        const b = q.box;
        // A caixa do mundo do sólido exportado é a caixa da peça: confirma o plano e o eixo da extrusão.
        expect(lido.caixa.x0, `${q.id} t0`).toBeCloseTo(b.t0, 6);
        expect(lido.caixa.x1, `${q.id} t1`).toBeCloseTo(b.t1, 6);
        expect(lido.caixa.y0, `${q.id} s0`).toBeCloseTo(b.s0, 6);
        expect(lido.caixa.y1, `${q.id} s1`).toBeCloseTo(b.s1, 6);
        expect(lido.caixa.z0, `${q.id} z0`).toBeCloseTo(b.z0, 6);
        expect(lido.caixa.z1, `${q.id} z1`).toBeCloseTo(b.z1, 6);
        // Volume do sólido exportado = volume da peça no engine (seção x extrusão). A escrita arredonda coordenadas em
        // 1 µm (`num`): o erro de volume é no máximo perímetro da seção x profundidade x 1 µm. Erro de eixo ou de plano
        // seria ordens de grandeza maior.
        const vol = partQuantity(q).volume;
        expect(Math.abs(lido.volume - vol), `${q.id} volume`).toBeLessThanOrEqual(tolerancia(q));
        if (q.profile) expect(lido.pontos, `${q.id} vértices`).toBeGreaterThanOrEqual(q.profile.pts.length);
      });
    });
  }

  it('peça de vidro e folha em arco: volume menor que a caixa envolvente (o arco corta a caixa)', () => {
    for (const [, base, shape] of CASOS) {
      const p = cena(base, shape);
      const st = parseStep(projectIfc(p, NOW));
      const sol = sólidosDaEsquadria(st);
      pecasExportadas(p).forEach((q, i) => {
        if (!q.profile || (q.role !== 'glass' && q.role !== 'leaf')) return;
        const b = q.box;
        const caixa = (b.t1 - b.t0) * (b.s1 - b.s0) * (b.z1 - b.z0);
        expect(solidoLido(st, sol[i]!).volume).toBeLessThan(caixa - 1e-9);
      });
    }
  });

  it('os vãos de forma têm peças de batente, folha e vidro com seção real', () => {
    const papeis = new Set<string>();
    for (const [, base, shape] of CASOS) {
      for (const q of pecasExportadas(cena(base, shape))) if (q.profile) papeis.add(q.role);
    }
    expect(papeis.has('jamb') || papeis.has('head')).toBe(true);
    expect(papeis.has('leaf')).toBe(true);
    expect(papeis.has('glass')).toBe(true);
  });

  it('a geometria do exportador traz o contorno do vão e as peças com a mesma contagem do modelo', () => {
    const p = cena('ot_p90', { kind: 'round', width: 0.9, height: 2.1 });
    const g = ifcGeometryOf(p).openings.find((o) => o.openingId === 'v')!;
    expect(g.forma).toBeDefined();
    expect(g.parts!.filter((q) => q.profile).length).toBeGreaterThan(0);
    expect(g.parts!.length).toBe(pecasExportadas(p).length);
  });
});
