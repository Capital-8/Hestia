import { describe, expect, it } from 'vitest';
import { multiArea, pointInMulti, union, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { computeSection, type SectionOpening, type SectionResult } from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeFloor, makeRoof, makeSlab, makeStair, makeWall, type Project, type StairCurve, type StairRun } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { AVISO, AVISO_ALPHA } from '../aviso.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { ownerOf, pickSection, sectionItems } from './pick.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const RECT: Vec2[] = [v(0, 0), v(6, 0), v(6, 4), v(0, 4)];
const DEPTH = 20;

/**
 * Ponto interior de um multipolígono visível: o centro da caixa; se não cair dentro (faixa fina de telhado em V),
 * o ponto médio entre dois vértices não vizinhos do mesmo anel, que fica longe da borda.
 */
function interior(m: MultiPolygon): Vec2 {
  const pts = m.flatMap((p) => p.flatMap((r) => r));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const c = v((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
  if (pointInMulti(c, m)) return c;
  for (const poly of m) {
    const ring = poly[0]!;
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        const q = v((ring[i]!.x + ring[j]!.x) / 2, (ring[i]!.y + ring[j]!.y) / 2);
        if (pointInMulti(q, m)) return q;
      }
    }
  }
  throw new Error('sem ponto interior no item visível');
}

/** Primeiro item visível de corte ou elevação cujo dono é o id dado (com a categoria). */
function itemOf(s: SectionResult, kind: 'wall' | 'floor' | 'slab' | 'roof' | 'stair', id: string) {
  const item = sectionItems(s).find((it) => it.owners.some((o) => o.id === id && o.kind === kind));
  if (!item) throw new Error(`item ${id} não está visível`);
  return item;
}

/**
 * Fachada: 'frente' (y = 0, 3 m, com janela no meio) e 'fundo' (y = 4, 4,5 m, mais alta: aparece acima da frente),
 * com uma janela no fundo deslocada para a esquerda, onde a frente é cheia. Vista da frente: a linha y = −2.
 */
function fachada(): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'fundo', typeId: 'wt_alv14', levelId: 'lv_0', a: v(6, 4), b: v(0, 4), height: 4.5 }) });
  store.exec({ type: 'addOpening', opening: { id: 'j_frente', kind: 'window', typeId: 'ot_j120', hostId: 'frente', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  store.exec({ type: 'addOpening', opening: { id: 'j_fundo', kind: 'window', typeId: 'ot_j120', hostId: 'fundo', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  return store.project;
}
const FRENTE = { a: v(0, -2), b: v(6, -2), depth: DEPTH };
const FUNDO = { a: v(6, 8), b: v(0, 8), depth: DEPTH };

describe('seleção em elevação (pickSection)', () => {
  it('onde só a parede da frente é visível, seleciona a parede', () => {
    const r = computeSection(fachada(), FRENTE);
    expect(pickSection(r, v(0.5, 1))).toEqual({ id: 'frente', kind: 'wall' });
  });

  it('sobre a janela da frente, seleciona a janela (o vão está na frente da parede)', () => {
    const r = computeSection(fachada(), FRENTE);
    const jf = r.openings.find((o) => o.openingId === 'j_frente')!;
    expect(pickSection(r, v((jf.t0 + jf.t1) / 2, (jf.z0 + jf.z1) / 2))).toEqual({ id: 'j_frente', kind: 'window' });
  });

  it('a parede da frente cobre a janela de trás: clicar no vão de trás seleciona a frente', () => {
    const front = computeSection(fachada(), FRENTE);
    const back = computeSection(fachada(), FUNDO);
    // na vista de trás a janela do fundo aparece (é a mais perto); a t = 0 é x = 6, então x = 6 − t
    const jb = back.openings.find((o) => o.openingId === 'j_fundo')!;
    expect(jb).toBeDefined();
    const x = 6 - (jb.t0 + jb.t1) / 2;
    const z = (jb.z0 + jb.z1) / 2;
    expect(front.openings.some((o) => o.openingId === 'j_fundo')).toBe(false);
    expect(pickSection(front, v(x, z))).toEqual({ id: 'frente', kind: 'wall' });
    expect(pickSection(back, v(6 - x, z))).toEqual({ id: 'j_fundo', kind: 'window' });
  });

  it('acima da frente, só a parede de trás é visível: seleciona a parede de trás', () => {
    const r = computeSection(fachada(), FRENTE);
    expect(pickSection(r, v(1, 3.8))).toEqual({ id: 'fundo', kind: 'wall' });
  });

  it('porta: o vão da porta é selecionado como porta', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
    store.exec({ type: 'addOpening', opening: { id: 'p1', kind: 'door', typeId: 'ot_p80', hostId: 'frente', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const r = computeSection(store.project, FRENTE);
    const door = r.openings.find((o) => o.openingId === 'p1')!;
    expect(pickSection(r, v((door.t0 + door.t1) / 2, (door.z0 + door.z1) / 2))).toEqual({ id: 'p1', kind: 'door' });
  });

  it('fora do desenho e no vazio: nada', () => {
    const r = computeSection(fachada(), FRENTE);
    expect(pickSection(r, v(-3, 1))).toBeNull();
    expect(pickSection(r, v(3, 40))).toBeNull();
  });

  it('tolerância: um ponto fora da borda só seleciona dentro da distância dada', () => {
    const r = computeSection(fachada(), FRENTE);
    const outside = v(-0.02, 1);
    expect(pickSection(r, outside)).toBeNull();
    expect(pickSection(r, outside, 0.01)).toBeNull();
    expect(pickSection(r, outside, 4 / 60)).toEqual({ id: 'frente', kind: 'wall' });
  });

  it('o interior tem prioridade sobre a borda: um ponto dentro de um item não é trocado pelo vizinho na tolerância', () => {
    const r = computeSection(fachada(), FRENTE);
    const jf = r.openings.find((o) => o.openingId === 'j_frente')!;
    // 1 cm dentro da parede, colado à janela: a janela está a 1 cm, mas o ponto cai na parede visível
    expect(pickSection(r, v(jf.t0 - 0.01, 1), 4 / 60)).toEqual({ id: 'frente', kind: 'wall' });
  });
});

describe('seleção em corte (pickSection)', () => {
  it('piso cortado: seleciona o piso', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'piso', typeId: 'ft_ceram', levelId: 'lv_0', boundary: RECT }) });
    const r = computeSection(store.project, { a: v(-1, 2), b: v(7, 2), depth: 2 });
    expect(pickSection(r, interior(itemOf(r, 'floor', 'piso').polygons))).toEqual({ id: 'piso', kind: 'floor' });
  });

  it('laje cortada: seleciona a laje', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addSlab', slab: makeSlab({ id: 'laje', typeId: 'ls_mac12', levelId: 'lv_0', boundary: RECT }) });
    const r = computeSection(store.project, { a: v(-1, 2), b: v(7, 2), depth: 2 });
    expect(pickSection(r, interior(itemOf(r, 'slab', 'laje').polygons))).toEqual({ id: 'laje', kind: 'slab' });
  });

  it('telhado: seleciona o telhado sob o ponto', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addRoof', roof: makeRoof({ id: 'telhado', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RECT, heightOffset: 2.8 }) });
    const r = computeSection(store.project, { a: v(3, -2), b: v(3, 6), depth: DEPTH });
    expect(pickSection(r, interior(itemOf(r, 'roof', 'telhado').polygons))).toEqual({ id: 'telhado', kind: 'roof' });
  });

  it('escada: seleciona a escada pelo degrau cortado', () => {
    const r = computeSection(stairProject(), { a: v(-1, 0), b: v(6, 0), depth: 2 });
    const cut = r.cut.find((c) => c.sources.some((o) => o.stairId === 'st1'))!;
    expect(pickSection(r, interior(cut.polygons))).toEqual({ id: 'st1', kind: 'stair' });
  });

  it('material cortado de várias origens (paredes do mesmo tipo): o clique devolve a parede de cada trecho', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'a', typeId: 'wt_alv14', levelId: 'lv_0', a: v(1, 0), b: v(1, 4), height: 3 }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'b', typeId: 'wt_alv14', levelId: 'lv_0', a: v(4, 0), b: v(4, 4), height: 3 }) });
    const r = computeSection(store.project, { a: v(-1, 2), b: v(7, 2), depth: 2 });
    const region = r.cut.find((c) => c.sources.length > 1)!;
    expect(region.sources.map((o) => o.wallId)).toEqual(['a', 'b']);
    // a linha começa em x = −1: a parede a (x = 1) está em t = 2, a parede b (x = 4) em t = 5; cada clique acha o dono
    expect(pickSection(r, v(2, 1.5))).toEqual({ id: 'a', kind: 'wall' });
    expect(pickSection(r, v(5, 1.5))).toEqual({ id: 'b', kind: 'wall' });
  });
});

describe('ordem do picking', () => {
  /** Resultado sintético: dois itens além que se sobrepõem (o motor não produz isso, aqui testa só a ordem). */
  const synthetic = (beyond: SectionResult['beyond'], openings: SectionResult['openings'] = []): SectionResult => ({
    length: 6,
    zMin: 0,
    zMax: 3,
    cut: [],
    silhouette: [],
    beyond,
    openings,
    membranes: [],
    levels: [],
  });
  const quad = (x0: number, z0: number, x1: number, z1: number) => [[[v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1)]]];

  it('o item mais perto ganha do mais longe onde se sobrepõem', () => {
    const far = { wallId: 'longe', materialId: 'm', layerIndex: 0, depth: 5, polygons: quad(0, 0, 4, 3) };
    const near = { wallId: 'perto', materialId: 'm', layerIndex: 0, depth: 1, polygons: quad(0, 0, 4, 3) };
    expect(pickSection(synthetic([far, near]), v(2, 1))).toEqual({ id: 'perto', kind: 'wall' });
  });

  it('em profundidade igual, o vão vence o além (ordem de oclusão do motor)', () => {
    const wall = { wallId: 'w', materialId: 'm', layerIndex: 0, depth: 2, polygons: quad(0, 0, 4, 3) };
    const model: SectionOpening['model'] = { kind: 'window', width: 1, height: 1, thickness: 0.1, core: { s0: -0.05, s1: 0.05 }, parts: [], openings: [], void: false };
    const opening: SectionOpening = {
      openingId: 'j',
      kind: 'window',
      t0: 1,
      t1: 2,
      z0: 1,
      z1: 2,
      depth: 2,
      cut: false,
      polygons: quad(1, 1, 2, 2),
      model,
      openingLine: { apex: 'latch', dashed: 'toward' },
      viewSide: 1,
      sSign: 1,
      cutT: 0,
      frameMaterialId: 'm',
      glassMaterialId: 'm',
    };
    expect(pickSection(synthetic([wall], [opening]), v(1.5, 1.5))).toEqual({ id: 'j', kind: 'window' });
  });

  it('itens sem polígono visível não são pickable', () => {
    expect(pickSection(synthetic([{ wallId: 'w', materialId: 'm', layerIndex: 0, depth: 1, polygons: [] }]), v(1, 1))).toBeNull();
  });
});

describe('realce na lista de desenho', () => {
  const LIGHT_SELECT = LIGHT.select;
  const input = (highlight?: SectionInput['highlight']): SectionInput => {
    const project = fachada();
    return {
      project,
      section: computeSection(project, FRENTE),
      viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
      theme: LIGHT,
      dark: false,
      showGrid: false,
      highlight,
    };
  };
  const selectedFills = (d: ReturnType<typeof buildSectionDrawList>) => d.fills.filter((f) => f.color === LIGHT_SELECT && f.alpha === 0.25);
  const hoverStrokes = (d: ReturnType<typeof buildSectionDrawList>) => d.strokes.filter((s) => s.color === LIGHT_SELECT && s.alpha === 0.55);

  it('aviso (decisão 0044): a parede em conflito sai em amarelo, por cima do desenho', () => {
    const d = buildSectionDrawList(input({ selection: [], hover: null, aviso: ['frente'] }));
    expect(d.fills.some((f) => f.color === AVISO && f.alpha === AVISO_ALPHA)).toBe(true);
    expect(d.strokes.some((s) => s.color === AVISO && s.widthPx === 2.5)).toBe(true);
    const sem = buildSectionDrawList(input({ selection: [], hover: null }));
    expect(sem.fills.some((f) => f.color === AVISO)).toBe(false);
  });

  it('sem realce, o desenho não traz nenhuma sobreposição da cor de seleção', () => {
    const d = buildSectionDrawList(input());
    expect(selectedFills(d)).toHaveLength(0);
    expect(d.strokes.some((s) => s.color === LIGHT_SELECT)).toBe(false);
  });

  it('selecionado que aparece na vista: preenchimento a 0,25 e contorno na cor de seleção, por cima do desenho', () => {
    const base = buildSectionDrawList(input());
    const d = buildSectionDrawList(input({ selection: ['frente'], hover: null }));
    expect(selectedFills(d).length).toBeGreaterThan(0);
    // a sobreposição vem no fim da lista (sobre o corte e o silhueta)
    expect(d.fills.slice(-selectedFills(d).length)).toEqual(selectedFills(d));
    expect(d.strokes.length).toBeGreaterThan(base.strokes.length);
  });

  it('o realce cobre só as partes visíveis do selecionado (sem contornos de outros itens)', () => {
    const s = computeSection(fachada(), FRENTE);
    const d = buildSectionDrawList(input({ selection: ['frente'], hover: null }));
    const want = sectionItems(s)
      .filter((it) => it.owners.some((o) => o.id === 'frente'))
      .reduce((total, it) => {
        const parts = it.parts?.filter((p) => ownerOf(p.origin)?.id === 'frente') ?? [];
        return total + multiArea(parts.length > 0 ? union(...parts.map((p) => p.polygons)) : it.polygons);
      }, 0);
    const fills = selectedFills(d);
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.reduce((total, f) => total + multiArea(f.polygons), 0)).toBeCloseTo(want, 9);
  });

  it('corte unido: selecionar uma parede realça só a parte dela, não a das outras origens', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'a', typeId: 'wt_alv14', levelId: 'lv_0', a: v(1, 0), b: v(1, 4), height: 3 }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'b', typeId: 'wt_alv14', levelId: 'lv_0', a: v(4, 0), b: v(4, 4), height: 3 }) });
    const section = computeSection(store.project, { a: v(-1, 2), b: v(7, 2), depth: 2 });
    const items = sectionItems(section).filter((it) => it.owners.some((o) => o.id === 'a'));
    expect(items.some((it) => it.owners.some((o) => o.id === 'b'))).toBe(true);
    const areaOf = (it: (typeof items)[number], id: string): number => {
      const parts = it.parts?.filter((p) => ownerOf(p.origin)?.id === id) ?? [];
      return parts.length > 0 ? multiArea(union(...parts.map((p) => p.polygons))) : 0;
    };
    const areaA = items.reduce((total, it) => total + areaOf(it, 'a'), 0);
    const areaAll = items.reduce((total, it) => total + multiArea(it.polygons), 0);
    expect(areaA).toBeLessThan(areaAll - 1e-6);
    const d = buildSectionDrawList({ ...input({ selection: ['a'], hover: null }), project: store.project, section });
    const fills = selectedFills(d);
    expect(fills.reduce((total, f) => total + multiArea(f.polygons), 0)).toBeCloseTo(areaA, 9);
  });

  it('seleção múltipla: cada selecionado aparece; o que não está na vista não aparece', () => {
    const s = computeSection(fachada(), FRENTE);
    const visiveis = sectionItems(s).filter((it) => it.owners.some((o) => o.id === 'frente' || o.id === 'fundo'));
    const d = buildSectionDrawList(input({ selection: ['frente', 'fundo', 'inexistente'], hover: null }));
    expect(selectedFills(d)).toHaveLength(visiveis.length);
  });

  it('seleção vazia e sem cursor: nenhum realce', () => {
    const d = buildSectionDrawList(input({ selection: [], hover: null }));
    expect(selectedFills(d)).toHaveLength(0);
    expect(hoverStrokes(d)).toHaveLength(0);
  });

  it('cursor sobre um item não selecionado: contorno fraco, sem preenchimento', () => {
    const d = buildSectionDrawList(input({ selection: [], hover: 'fundo' }));
    expect(hoverStrokes(d).length).toBeGreaterThan(0);
    expect(selectedFills(d)).toHaveLength(0);
  });

  it('cursor sobre um item já selecionado não mostra o contorno fraco (o realce da seleção vence)', () => {
    const d = buildSectionDrawList(input({ selection: ['frente'], hover: 'frente' }));
    expect(hoverStrokes(d)).toHaveLength(0);
    expect(selectedFills(d).length).toBeGreaterThan(0);
  });
});

/** Escada de três degraus no corte transversal, como em build.test (a origem é 'st1'). */
function stairProject(): Project {
  const base = createEmptyProject();
  const store = new ProjectStore({ ...base, levels: base.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: 2.8 } : l)) });
  const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });
  const xs = Array.from({ length: 16 }, (_, k) => k * 0.28);
  const run: StairRun = {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(-0.3, 0.6, 4.5, 0.6)],
    boundaryRight: [ln(-0.3, -0.6, 4.5, -0.6)],
    risers: xs.map((x) => ln(x, -1, x, 1)),
    path: [],
  };
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run] }) });
  return store.project;
}
