import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import {
  createEmptyProject,
  makeWall,
  ProjectStore,
  type CellNode,
  type OpeningComposition,
  type Project,
  type OpeningType,
  type SplitNode,
} from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { mix } from '../plan/color.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

/* Elevação e corte de uma composição (porta + bandeira de vidro): vidro com a cor de vidro, travessa com a profundidade
 * do quadro (0,09) e alizar do conjunto. Espelha o Ex. 2 da spec F1 (vão 0,98 × 2,60). */

const v = (x: number, y: number): Vec2 => ({ x, y });
const GLASS_T = '#bfe3f5';
const BAT = { presetId: 'prf_mad_batente_5x9' };
const DIV = { presetId: 'prf_mad_divisor_5x9' };

const leaf = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'leaf', family: 'door_swing', plan: 'swing', leaves: 1, options: {} } });
const glass = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'glass', glass: { kind: 'clear', thickness: 0.012, mounting: 'rebate' } } });
const composicao: OpeningComposition = {
  version: 1,
  nominal: { ref: 'leaf', width: 0.9, height: 2.1, gap: { w: 0.08, h: 0.05 } },
  frame: { style: 'rebate', profile: BAT, depthMode: 'core' },
  layout: {
    kind: 'split',
    id: 'rows',
    axis: 'rows',
    divider: DIV,
    children: [
      { size: { mode: 'fill' }, node: leaf('folha') },
      { size: { mode: 'fixed', value: 0.4 }, node: glass('band') },
    ],
  } as SplitNode,
  casing: { faces: 'both', width: 0.07, thickness: 0.015, setback: 0 },
};

function store(): ProjectStore {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const tipo: OpeningType = { ...base.openingTypes.ot_p90!, id: 'ot_comp', nominalRef: 'leaf', composition: composicao };
  s.exec({ type: 'upsertOpeningType', openingType: tipo });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  s.exec({
    type: 'addOpening',
    opening: { id: 'p', kind: 'door', typeId: 'ot_comp', hostId: 'frente', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  return s;
}

const faixa = (polys: MultiPolygon, eixo: 'x' | 'y'): [number, number] => {
  const xs = polys.flat(2).map((q) => q[eixo]);
  return [Math.min(...xs), Math.max(...xs)];
};
const perto = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** Elevação: vista da face (linha paralela à parede, em y = −2). */
function elevacao(): SectionInput {
  const project = store().project;
  return {
    project,
    section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }),
    viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
  };
}

/** Corte transversal à parede (linha vertical em x = 3). */
function transversal(): SectionInput {
  const project = store().project;
  return {
    project,
    section: computeSection(project, { a: v(3, -1), b: v(3, 1), depth: 3 }),
    viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
  };
}

describe('elevação · composição com bandeira', () => {
  const draw = buildSectionDrawList(elevacao());

  it('a bandeira de vidro sai com a cor de vidro, entre z 2,15 e 2,55', () => {
    const vidro = draw.fills.filter((f) => f.color === GLASS_T);
    const bandeira = vidro.find((f) => perto(faixa(f.polygons, 'y')[0], 2.15) && perto(faixa(f.polygons, 'y')[1], 2.55));
    expect(bandeira, 'vidro da bandeira').toBeDefined();
  });

  it('a travessa interna aparece como peça de quadro entre z 2,10 e 2,15 (não é vidro)', () => {
    const travessa = draw.fills.find((f) => perto(faixa(f.polygons, 'y')[0], 2.1) && perto(faixa(f.polygons, 'y')[1], 2.15));
    expect(travessa, 'travessa interna').toBeDefined();
    expect(travessa!.color).not.toBe(GLASS_T);
  });

  it('alizar do conjunto: uma silhueta por face (externa e interna), em volta do vão 1,02 × 2,62 (1,048 na face de abertura)', () => {
    const alizar = draw.fills.filter((f) => {
      const [y0, y1] = faixa(f.polygons, 'y');
      const [x0, x1] = faixa(f.polygons, 'x');
      // Face em que a porta abre: o alizar começa fora do rebaixo (1,02 + 2 × 0,014 = 1,048); a outra, na luz (1,02).
      return perto(y0, 0) && perto(y1, 2.62) && (perto(x1 - x0, 1.02) || perto(x1 - x0, 1.048));
    });
    expect(alizar).toHaveLength(2);
    for (const f of alizar) expect(f.polygons).toHaveLength(1);
  });

  it('a folha segue como folha de porta, sem vidro na faixa da folha', () => {
    const folha = draw.fills.find((f) => perto(faixa(f.polygons, 'y')[1], 2.111));
    expect(folha).toBeDefined();
    expect(folha!.color).not.toBe(GLASS_T);
  });
});

describe('corte transversal · travessa da composição', () => {
  const draw = buildSectionDrawList(transversal());

  it('a travessa interna tem a profundidade da verga/soleira do quadro (mesma largura no corte) entre z 2,10 e 2,15', () => {
    const travessa = draw.fills.find((f) => perto(faixa(f.polygons, 'y')[0], 2.1) && perto(faixa(f.polygons, 'y')[1], 2.15));
    const cabeceira = draw.fills.find((f) => perto(faixa(f.polygons, 'y')[0], 2.55) && perto(faixa(f.polygons, 'y')[1], 2.6));
    expect(travessa, 'travessa no corte').toBeDefined();
    expect(cabeceira, 'cabeceira no corte').toBeDefined();
    const [x0, x1] = faixa(travessa!.polygons, 'x');
    const [h0, h1] = faixa(cabeceira!.polygons, 'x');
    expect(x1 - x0).toBeGreaterThan(0.05);
    expect(x1 - x0).toBeCloseTo(h1 - h0, 6);
  });
});

describe('folha com material próprio (leafMaterialId) na seção', () => {
  const corte = (p: Project): SectionInput => ({
    project: p,
    section: computeSection(p, { a: v(3, -1), b: v(3, 1), depth: 3 }),
    viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
  });
  /** Porta da composição com o material de folha dado (undefined = o tipo não informa). */
  const comFolha = (leafMaterialId: string | undefined): Project => {
    const s = store();
    const base = s.project.openingTypes.ot_comp!;
    return { ...s.project, openingTypes: { ...s.project.openingTypes, ot_comp: { ...base, leafMaterialId } } };
  };
  const hachuras = (p: Project): string[] => buildSectionDrawList(corte(p)).fills.flatMap((f) => (f.hatch ? [f.hatch.color] : []));

  it('corte: a folha de alumínio leva a hachura do alumínio, e o batente segue com a de madeira', () => {
    const p = comFolha('mat_aluminio');
    const cores = hachuras(p);
    expect(cores).toContain(mix(p.materials['mat_aluminio']!.color, '#000000', 0.45));
    expect(cores).toContain(mix(p.materials['mat_madeira']!.color, '#000000', 0.45));
  });

  it('sem leafMaterialId, a folha segue o batente: nenhuma hachura de alumínio (regressão)', () => {
    const semCampo = hachuras(comFolha(undefined));
    expect(semCampo).not.toContain(mix(comFolha(undefined).materials['mat_aluminio']!.color, '#000000', 0.45));
    expect(semCampo).toEqual(hachuras(comFolha('mat_madeira')));
  });

  it('elevação de janela: a folha com material próprio muda a cor da folha; sem o campo, a cor é a do batente', () => {
    const cores = (leafMaterialId: string | undefined): string[] => {
      const s = store();
      const base = s.project.openingTypes.ot_j150!;
      s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_wl', leafMaterialId } });
      s.exec({ type: 'addOpening', opening: { id: 'jan', kind: 'window', typeId: 'ot_wl', hostId: 'frente', offset: 5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
      const p = s.project;
      const draw = buildSectionDrawList({ ...corte(p), section: computeSection(p, { a: v(0, -2), b: v(6, -2), depth: 8 }) });
      return [...new Set(draw.fills.map((f) => f.color))].sort();
    };
    // A porta da cena já é de madeira: a janela usa PVC, que só aparece se a folha dela mudar de cor.
    expect(cores('mat_pvc')).not.toEqual(cores(undefined));
    expect(cores(undefined)).toEqual(cores('mat_aluminio'));
  });
});
