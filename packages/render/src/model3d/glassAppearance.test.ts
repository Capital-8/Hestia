import { describe, expect, it } from 'vitest';
import { frameOfWall, openingGeometry } from '@hestia/engine';
import { compositionSpan, createEmptyProject, makeWall, ProjectStore, view3dOf, type CasingSpec, type CellNode, type CompositionNode, type Opening, type OpeningComposition, type OpeningGlassKind, type OpeningType, type Project, type SplitNode } from '@hestia/model';
import { caixasEPrismasDaAbertura } from './aberturas3d.ts';
import { APARENCIA_VIDRO, materialDoVidro, materialNoProjeto } from './glassAppearance.ts';
import { openingPieces } from './openingParts.ts';

/*
 * Tipo de vidro (`glassKind`) no 3D: porta e janela simples e células de vidro da composição. O incolor (ou sem tipo) mantém
 * o material do projeto; os demais tipos desenham uma cópia do material com a aparência do tipo, sem tocar no projeto.
 */

const H = 3;
const CASING: CasingSpec = { faces: 'both', width: 0.07, thickness: 0.015, setback: 0 };
const BAT = { presetId: 'prf_mad_batente_5x9' };
const DIV = { presetId: 'prf_mad_divisor_5x9' };
const leafC = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'leaf', family: 'door_swing', plan: 'swing', leaves: 1, options: {} } });
const glassC = (id: string, kind: OpeningGlassKind): CellNode => ({ kind: 'cell', id, content: { kind: 'glass', glass: { kind, thickness: 0.012, mounting: 'rebate' } } });
const fixo = (value: number, node: CompositionNode) => ({ size: { mode: 'fixed' as const, value }, node });
const fill = (node: CompositionNode) => ({ size: { mode: 'fill' as const }, node });
const split = (id: string, axis: 'cols' | 'rows', children: SplitNode['children']): SplitNode => ({ kind: 'split', id, axis, divider: DIV, children });
const comp = (layout: CompositionNode): OpeningComposition => ({
  version: 1,
  nominal: { ref: 'leaf', width: 0.9, height: 2.1, gap: { w: 0.08, h: 0.05 } },
  frame: { style: 'rebate', profile: BAT, depthMode: 'core' },
  layout,
  casing: CASING,
});

/** Parede de 4 m com o vão `v` (offset 2) no tipo `ot_x`, derivado de `base` com `extra`. */
function cena(base: string, extra: Partial<OpeningType>) {
  const s = new ProjectStore(createEmptyProject());
  const t = s.project.openingTypes[base]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', ...extra } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p = s.project;
  return { p, o: p.elements.v as Opening, f: frameOfWall(p, 'w')! };
}

/** Peças de vidro do vão, pelo caminho de geometria. */
function vidros(p: Project, o: Opening, f: NonNullable<ReturnType<typeof frameOfWall>>) {
  return openingPieces(p, o, openingGeometry(p, o, f), f, H, false).filter((x) => x.role === 'glass');
}

/** Ids de material das peças de vidro. */
const idsDeVidro = (p: Project, o: Opening, f: NonNullable<ReturnType<typeof frameOfWall>>): string[] => vidros(p, o, f).map((x) => x.materialId);

const PORTA = { leafStyle: 'glass' as const };

describe('materialDoVidro e tabela de aparência', () => {
  it('incolor ou sem tipo mantém o material do projeto', () => {
    expect(materialDoVidro('mat_vidro', 'clear')).toBe('mat_vidro');
    expect(materialDoVidro('mat_vidro')).toBe('mat_vidro');
    expect('clear' in APARENCIA_VIDRO).toBe(false);
  });

  it('tipos não incolores têm id próprio e aparência distinta', () => {
    expect(materialDoVidro('mat_vidro', 'bronze')).toBe('mat_vidro#bronze');
    const cores = Object.values(APARENCIA_VIDRO).map((a) => `${a.color}|${a.opacity}`);
    expect(new Set(cores).size).toBe(cores.length);
  });
});

describe('materialNoProjeto', () => {
  it('devolve cópia com a aparência do tipo, sem gravar no projeto', () => {
    const { p } = cena('ot_p90', PORTA);
    const base = p.materials['mat_vidro']!;
    const m = materialNoProjeto(p.materials, 'mat_vidro#frosted')!;
    expect(m.color).toBe(APARENCIA_VIDRO.frosted.color);
    expect(m.opacity).toBe(APARENCIA_VIDRO.frosted.opacity);
    expect(m.gloss).toBe(APARENCIA_VIDRO.frosted.gloss);
    expect(p.materials['mat_vidro']).toBe(base);
    expect(p.materials['mat_vidro']!.color).toBe('#a9d6e5');
    expect('mat_vidro#frosted' in p.materials).toBe(false);
  });

  it('cache por tipo: mesmo tipo reaproveita a cópia, tipos diferentes nunca se misturam', () => {
    const { p } = cena('ot_p90', PORTA);
    const a1 = materialNoProjeto(p.materials, 'mat_vidro#bronze');
    const a2 = materialNoProjeto(p.materials, 'mat_vidro#bronze');
    const b = materialNoProjeto(p.materials, 'mat_vidro#smoke');
    expect(a2).toBe(a1);
    expect(b).not.toBe(a1);
    expect(b!.id).toBe('mat_vidro#smoke');
    expect(b!.opacity).toBe(APARENCIA_VIDRO.smoke.opacity);
    expect(a1!.opacity).toBe(APARENCIA_VIDRO.bronze.opacity);
  });

  it('id desconhecido continua indefinido', () => {
    const { p } = cena('ot_p90', PORTA);
    expect(materialNoProjeto(p.materials, 'mat_inexistente#bronze')).toBeUndefined();
    expect(materialNoProjeto(p.materials, 'mat_vidro#clear')).toBeUndefined();
  });
});

describe('porta simples', () => {
  it('sem tipo e incolor geram as mesmas peças de vidro (material do projeto)', () => {
    const sem = cena('ot_p90', PORTA);
    const clear = cena('ot_p90', { ...PORTA, glassKind: 'clear' });
    expect(idsDeVidro(sem.p, sem.o, sem.f)).toEqual(['mat_vidro']);
    expect(idsDeVidro(clear.p, clear.o, clear.f)).toEqual(['mat_vidro']);
    expect(JSON.stringify(vidros(clear.p, clear.o, clear.f))).toBe(JSON.stringify(vidros(sem.p, sem.o, sem.f)));
  });

  it('tipos diferentes geram peças de vidro com material de aparência distinta', () => {
    const bronze = cena('ot_p90', { ...PORTA, glassKind: 'bronze' });
    const frosted = cena('ot_p90', { ...PORTA, glassKind: 'frosted' });
    const mb = materialNoProjeto(bronze.p.materials, idsDeVidro(bronze.p, bronze.o, bronze.f)[0]!)!;
    const mf = materialNoProjeto(frosted.p.materials, idsDeVidro(frosted.p, frosted.o, frosted.f)[0]!)!;
    expect(mb.id).toBe('mat_vidro#bronze');
    expect(mf.id).toBe('mat_vidro#frosted');
    expect(mb.color).not.toBe(mf.color);
    expect(mb.opacity).not.toBe(mf.opacity);
  });

  it('caminho de caixas: a peça de vidro leva o id do tipo', () => {
    const { p, o, f } = cena('ot_p90', { ...PORTA, glassKind: 'laminated' });
    const a = caixasEPrismasDaAbertura(p, o, f, 0, H, view3dOf(p))!;
    const ids = [...a.caixas.map((c) => c.materialId), ...a.prismas.map((c) => c.materialId)];
    expect(ids).toContain('mat_vidro#laminated');
  });
});

describe('janela simples', () => {
  it('incolor é idêntico ao sem tipo; outro tipo muda a aparência do vidro', () => {
    const sem = cena('ot_j120', {});
    const clear = cena('ot_j120', { glassKind: 'clear' });
    const green = cena('ot_j120', { glassKind: 'green' });
    const ids = idsDeVidro(sem.p, sem.o, sem.f);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === 'mat_vidro')).toBe(true);
    expect(JSON.stringify(vidros(clear.p, clear.o, clear.f))).toBe(JSON.stringify(vidros(sem.p, sem.o, sem.f)));
    const mg = materialNoProjeto(green.p.materials, idsDeVidro(green.p, green.o, green.f)[0]!)!;
    expect(mg.id).toBe('mat_vidro#green');
    expect(mg.color).toBe(APARENCIA_VIDRO.green.color);
    expect(mg.opacity).not.toBe(p0(sem).opacity);
  });
});

/** Material base do projeto, para comparar com o tipo. */
function p0(c: { p: Project }) {
  return c.p.materials['mat_vidro']!;
}

describe('célula de vidro da composição', () => {
  const layout = (kLat: OpeningGlassKind, kBand: OpeningGlassKind): CompositionNode =>
    split('rows', 'rows', [
      fill(split('cols', 'cols', [fixo(0.4, glassC('lat-e', kLat)), fill(leafC('folha')), fixo(0.4, glassC('lat-d', 'clear'))])),
      fixo(0.4, glassC('band', kBand)),
    ]);
  const compCena = (kLat: OpeningGlassKind, kBand: OpeningGlassKind) => {
    const c = comp(layout(kLat, kBand));
    return cena('ot_p90', { width: compositionSpan(c).width, height: compositionSpan(c).height, composition: c });
  };

  it('cada célula usa o seu tipo; a célula incolor fica no material do projeto', () => {
    const { p, o, f } = compCena('bronze', 'frosted');
    const ids = idsDeVidro(p, o, f);
    expect(ids).toHaveLength(3);
    expect(ids.filter((id) => id === 'mat_vidro#bronze')).toHaveLength(1);
    expect(ids.filter((id) => id === 'mat_vidro#frosted')).toHaveLength(1);
    expect(ids.filter((id) => id === 'mat_vidro')).toHaveLength(1);
  });

  it('composição toda incolora: os ids são os de antes (mat_vidro)', () => {
    const { p, o, f } = compCena('clear', 'clear');
    expect(idsDeVidro(p, o, f).every((id) => id === 'mat_vidro')).toBe(true);
  });
});
