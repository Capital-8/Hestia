import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, ProjectStore, clipRect, ringSignedArea, createEmptyProject, makeWall, outline, type Opening, type OpeningShape, type OpeningType, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';
import { noAnel } from './openingModelContornoAjuste.ts';
import { modelQuantities } from './openingPartQuantities.ts';
import type { OpeningModel, OpeningPart, PartRole } from './openingModelTypes.ts';

/*
 * docs/estudo-esquadrias/37: com forma, a esquadria mantém TODAS as peças e configurações que tem sem forma; só o contorno
 * externo acompanha a forma. 162 tipos do catálogo x arco pleno, abatido, ogival e círculo.
 */

function cena(t0: OpeningType, shape?: OpeningShape): { p: Project; m: OpeningModel } {
  const s = new ProjectStore(createEmptyProject());
  const { shape: _antiga, ...base } = t0; // o baseline "sem forma" tira a forma que o tipo do catálogo já traga
  void _antiga;
  s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_x', ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return { p, m: buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f) };
}

type Forma = 'round' | 'segmental' | 'pointed' | 'circle';
const FORMAS: Forma[] = ['round', 'segmental', 'pointed', 'circle'];
function forma(t: OpeningType, k: Forma): OpeningShape {
  switch (k) {
    case 'round': return { kind: 'round', width: t.width, height: t.height };
    case 'segmental': return { kind: 'segmental', width: t.width, height: t.height, rise: Math.min(0.2, t.width / 4) };
    case 'pointed': return { kind: 'pointed', width: t.width, height: t.height, rise: t.width / 2 };
    default: return { kind: 'circle', width: t.width, height: t.height };
  }
}

const TIPOS = DEFAULT_OPENING_TYPES;
/** Papéis que, no círculo, o batente em anel reúne (ombreiras, travessa e soleira do batente viram metades de anel). */
const MOLDURA: ReadonlySet<PartRole> = new Set<PartRole>(['jamb', 'head', 'sillFrame']);
const porPapel = (m: OpeningModel): Map<string, number> => {
  const out = new Map<string, number>();
  for (const q of m.parts) out.set(q.role, (out.get(q.role) ?? 0) + 1);
  return out;
};
const pts = (q: OpeningPart): Array<[number, number]> => (q.profile?.plane === 'tz' ? q.profile.pts : [[q.box.t0, q.box.z0], [q.box.t1, q.box.z0], [q.box.t1, q.box.z1], [q.box.t0, q.box.z1]]);

describe('os 162 tipos do catálogo', { timeout: 60000 }, () => {
  it('o catálogo tem 162 tipos', () => expect(TIPOS).toHaveLength(162));

  it('com forma nenhuma peça some, a não ser a que fica toda fora do contorno', () => {
    const sumiu: string[] = [];
    for (const t of TIPOS) {
      const sem = cena(t).m;
      for (const k of FORMAS) {
        const { m: com } = cena(t, forma(t, k));
        const ids = new Set(com.parts.map((q) => q.id));
        const s = formaDaEsquadria(forma(t, k), com.width, com.height);
        const ring = s ? outline(s) : null;
        for (const q of sem.parts) {
          if (ids.has(q.id)) continue;
          if (k === 'circle' && MOLDURA.has(q.role)) continue; // viram as metades do anel (grupo 'frame-ring')
          if (q.role === 'casing' && k === 'circle') continue;
          const b = q.box;
          const dentro = ring ? clipRect(ring, b.t0, b.t1, b.z0, b.z1) : [];
          if (dentro.length >= 3 && Math.abs(ringSignedArea(dentro)) > 2e-5) sumiu.push(`${t.id}/${k}: ${q.id}`);
        }
        if (k === 'circle' && ring && sem.parts.some((q) => q.role === 'head')) expect(com.parts.filter((q) => q.group === 'frame-ring').length, `${t.id} anel`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(sumiu).toEqual([]);
  });

  it('com forma todas as peças de preenchimento e ferragem ficam dentro do contorno', () => {
    const fora: string[] = [];
    for (const t of TIPOS) {
      for (const k of FORMAS) {
        const { m } = cena(t, forma(t, k));
        const s = formaDaEsquadria(forma(t, k), m.width, m.height);
        if (!s) continue;
        const ring = outline(s);
        for (const q of m.parts) {
          if (!(['glass', 'leaf', 'leafPanel', 'muntin', 'bead', 'mullion', 'transom', 'handle', 'hinge'] as PartRole[]).includes(q.role)) continue;
          if (pts(q).some(([x, z]) => !noAnel(ring, x, z, 2e-3))) fora.push(`${t.id}/${k}: ${q.id}`);
        }
      }
    }
    expect(fora).toEqual([]);
  });

  it('o vão retangular é idêntico ao de antes (forma ausente ou rect)', () => {
    for (const t of TIPOS) {
      const a = cena(t).m;
      const b = cena(t, { kind: 'rect', width: t.width, height: t.height }).m;
      expect(JSON.stringify(b), t.id).toBe(JSON.stringify(a));
    }
  });

  it('volume coerente: com forma o volume total não passa o do retangular e não perde mais que o tamanho do arco', () => {
    const ruins: string[] = [];
    for (const t of TIPOS) {
      const sem = modelQuantities(cena(t).m);
      for (const k of FORMAS) {
        const { m } = cena(t, forma(t, k));
        const q = modelQuantities(m);
        const vol = (x: typeof q): number => Object.values(x.byRole).reduce((s, r) => s + (r.volume ?? 0), 0);
        const v = vol(q);
        const v0 = vol(sem);
        if (v > v0 * 1.35 + 1e-6 || (k !== 'circle' && v < v0 * 0.35)) ruins.push(`${t.id}/${k}: ${v0.toFixed(4)} -> ${v.toFixed(4)}`);
      }
    }
    expect(ruins).toEqual([]);
  });
});

describe('o que a forma não pode tirar (casos de referência)', () => {
  it('porta almofadada em arco: almofadas e ferragens continuam', () => {
    const t = TIPOS.find((x) => x.id === 'ot_pgiro90')!;
    const sem = porPapel(cena(t).m);
    const com = porPapel(cena(t, forma(t, 'round')).m);
    for (const r of ['leaf', 'leafPanel', 'handle', 'hinge']) expect(com.get(r)).toBe(sem.get(r));
  });
  it('porta de embutir e portão de correr em arco mantêm a folha (a interseção do curso não a apaga)', () => {
    for (const id of ['ot_pembutir80', 'ot_pg300']) {
      const t = TIPOS.find((x) => x.id === id)!;
      expect(cena(t, forma(t, 'round')).m.parts.filter((q) => q.role === 'leaf').length).toBe(cena(t).m.parts.filter((q) => q.role === 'leaf').length);
    }
  });
  it('dobradiça que o arco deixaria de fora desce para dentro do contorno', () => {
    const t = TIPOS.find((x) => x.id === 'ot_p90')!;
    const sem = cena(t).m.parts.filter((q) => q.role === 'hinge');
    const com = cena(t, forma(t, 'round')).m.parts.filter((q) => q.role === 'hinge');
    expect(com).toHaveLength(sem.length);
    expect(Math.max(...com.map((q) => q.box.z1))).toBeLessThanOrEqual(Math.max(...sem.map((q) => q.box.z1)));
  });
});

describe('cada controle do diálogo continua alterando o modelo com forma', () => {
  const base = TIPOS.find((x) => x.id === 'ot_pgiro90')!;
  const sig = (m: OpeningModel): string => JSON.stringify(m.parts.map((q) => [q.id, q.role, q.box, q.profile?.pts.length ?? 0]));
  const com = (extra: Partial<OpeningType>, k: Forma = 'round'): OpeningModel => cena({ ...base, ...extra }, forma({ ...base, ...extra }, k)).m;
  const ref = com({});
  it.each(['round', 'segmental', 'pointed', 'circle'] as Forma[])('estilo da folha muda as peças (%s)', (k) => {
    const estilos = (['flush', 'panel', 'glass', 'louver', 'grille'] as const).map((leafStyle) => sig(com({ leafStyle }, k)));
    expect(new Set(estilos).size).toBe(5);
  });
  it('maçaneta, dobradiças, número de folhas, bandeira e abrir/correr alteram o modelo', () => {
    expect(sig(com({ handle: 'pull' }))).not.toBe(sig(ref));
    expect(com({ hinges: 4 }).parts.filter((q) => q.role === 'hinge')).toHaveLength(4);
    expect(com({ width: 1.4, leaves: 2 }).parts.filter((q) => q.role === 'leaf')).toHaveLength(2);
    expect(com({ height: 2.7, transom: { height: 0.6, fixed: true } }).parts.some((q) => q.id.includes('transom'))).toBe(true);
    expect(sig(com({ plan: 'sliding', leaves: 2, width: 1.6 }))).not.toBe(sig(com({ plan: 'double', leaves: 2, width: 1.6 })));
  });
});
