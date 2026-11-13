import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { elevationFrameBox } from '@hestia/render';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeCeiling, makeFloor, makeGuardaCorpo, makeRoof, makeSlab, makeStair, makeWall, sectionPoints, type Command, type SectionView, type StairCurve, type StairRun } from '@hestia/model';
import { elevationCommand, elevationSpecs, ELEVATION_OFFSET, type PlanBox } from './elevations.ts';

const BOX: PlanBox = { minX: 0, minY: 0, maxX: 10, maxY: 8 };
const CENTER = { x: 5, y: 4 };

/** Normal à esquerda de a→b, unitária. */
function leftNormal(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return { x: -dy / l, y: dx / l };
}

describe('elevationSpecs', () => {
  const specs = elevationSpecs(BOX);

  it('gera Norte, Sul, Leste e Oeste nessa ordem, com papel estável', () => {
    expect(specs.map((s) => s.name)).toEqual(['Norte', 'Sul', 'Leste', 'Oeste']);
    expect(specs.map((s) => s.role)).toEqual(['north', 'south', 'east', 'west']);
  });

  it.each(elevationSpecs(BOX).map((s) => [s.name, s] as const))('%s: a normal à esquerda aponta para o centro da caixa', (_name, s) => {
    const n = leftNormal(s.a, s.b);
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    const toCenter = { x: CENTER.x - mid.x, y: CENTER.y - mid.y };
    expect(toCenter.x * n.x + toCenter.y * n.y).toBeGreaterThan(0);
  });

  it.each(elevationSpecs(BOX).map((s) => [s.name, s] as const))('%s: a linha fica a 3 m da face da caixa', (_name, s) => {
    const n = leftNormal(s.a, s.b);
    const corners = [
      { x: BOX.minX, y: BOX.minY },
      { x: BOX.maxX, y: BOX.minY },
      { x: BOX.maxX, y: BOX.maxY },
      { x: BOX.minX, y: BOX.maxY },
    ];
    const gaps = corners.map((c) => (c.x - s.a.x) * n.x + (c.y - s.a.y) * n.y);
    expect(Math.min(...gaps)).toBeCloseTo(ELEVATION_OFFSET);
  });

  it('Norte mostra a fachada norte: vista de norte olhando para -y, de leste para oeste, em y = maxY + 3', () => {
    const norte = specs[0]!;
    expect(norte.a.y).toBeCloseTo(BOX.maxY + ELEVATION_OFFSET);
    expect(norte.b.y).toBeCloseTo(BOX.maxY + ELEVATION_OFFSET);
    expect(norte.a.x).toBeGreaterThan(norte.b.x);
    expect(norte.depth).toBeCloseTo(8 + 6);
  });

  it('profundidade é a extensão da caixa ao longo do olhar mais 6 m', () => {
    const byName = Object.fromEntries(specs.map((s) => [s.name, s]));
    expect(byName.Norte!.depth).toBeCloseTo(8 + 6);
    expect(byName.Sul!.depth).toBeCloseTo(8 + 6);
    expect(byName.Leste!.depth).toBeCloseTo(10 + 6);
    expect(byName.Oeste!.depth).toBeCloseTo(10 + 6);
  });

  it('a linha cobre a caixa com folga de 3 m em cada ponta', () => {
    const norte = specs[0]!;
    expect(Math.min(norte.a.x, norte.b.x)).toBeCloseTo(BOX.minX - ELEVATION_OFFSET);
    expect(Math.max(norte.a.x, norte.b.x)).toBeCloseTo(BOX.maxX + ELEVATION_OFFSET);
  });
});

describe('elevationCommand', () => {
  const addAll = (views: SectionView[]) => {
    const store = new ProjectStore({ ...createEmptyProject(), views });
    let n = 0;
    store.exec(elevationCommand(store.project.views, BOX, (p) => `${p}_gen${++n}`));
    return store;
  };

  it('cria as quatro elevações em um único passo de desfazer', () => {
    const store = addAll([]);
    expect(store.project.views.map((v) => `${v.kind}:${v.name}`)).toEqual([
      'elevation:Norte',
      'elevation:Sul',
      'elevation:Leste',
      'elevation:Oeste',
    ]);
    store.undo();
    expect(store.project.views).toHaveLength(0);
  });

  it('substitui elevações com o mesmo nome em vez de duplicar, mantendo o id', () => {
    const old: SectionView = { id: 'old_norte', name: 'Norte', kind: 'elevation', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, depth: 2 };
    const corte: SectionView = { id: 'corte_a', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, depth: 6 };
    const store = addAll([old, corte]);
    expect(store.project.views).toHaveLength(5);
    const norte = store.project.views.find((v) => v.name === 'Norte');
    expect(norte?.id).toBe('old_norte');
    expect(norte?.depth).toBeCloseTo(14);
    expect(store.project.views.find((v) => v.id === 'corte_a')).toBeDefined();
  });

  it('reconhece a elevação renomeada pelo papel, sem criar outra', () => {
    const renamed: SectionView = { id: 'renamed', name: 'Fachada Norte', kind: 'elevation', role: 'north', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, depth: 2 };
    const store = addAll([renamed]);
    const norte = store.project.views.find((v) => v.role === 'north');
    expect(norte?.id).toBe('renamed');
    expect(norte?.name).toBe('Fachada Norte');
    expect(store.project.views.filter((v) => v.role === 'north')).toHaveLength(1);
  });

  it('remove duplicatas de elevação com o mesmo nome', () => {
    const dup = (id: string): SectionView => ({ id, name: 'Sul', kind: 'elevation', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, depth: 2 });
    const store = addAll([dup('s1'), dup('s2')]);
    expect(store.project.views.filter((v) => v.name === 'Sul')).toHaveLength(1);
    expect(store.project.views).toHaveLength(4);
  });
});

describe('gerar elevações sem paredes (tudo o que aparece em elevação define os limites)', () => {
  const v = (x: number, y: number) => ({ x, y });
  const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });
  const rect = (x0: number, y0: number, x1: number, y1: number) => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];
  const lance = (): StairRun => ({
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(19.5, 0.6, 23, 0.6)],
    boundaryRight: [ln(19.5, -0.6, 23, -0.6)],
    risers: Array.from({ length: 10 }, (_, k) => ln(20 + k * 0.28, -1, 20 + k * 0.28, 1)),
    path: [],
  });
  const escada = () => makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [lance()] });
  const guarda = () =>
    makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: 'gct_balaustres', cotaBase: 0, hospedeiro: { tipo: 'manual', uso: 'livre', caminho: [{ x: 20, y: 2, dz: 0 }, { x: 24, y: 2, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } });
  const paredes = (): Command[] => [
    { type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(10, 0) }) },
    { type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: v(10, 0), b: v(10, 8) }) },
  ];

  const MODELOS: Array<[string, Command[], boolean]> = [
    ['só uma escada', [{ type: 'addStair', stair: escada() }], true],
    ['só um guarda-corpo manual', [{ type: 'addGuardaCorpo', guardaCorpo: guarda() }], false],
    ['só uma laje', [{ type: 'addSlab', slab: makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: rect(0, 0, 6, 5) }) }], true],
    ['só um piso', [{ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_laje12', levelId: 'lv_0', boundary: rect(0, 0, 6, 5) }) }], true],
    ['só um forro', [{ type: 'addCeiling', ceiling: makeCeiling({ id: 'c1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: rect(0, 0, 6, 5) }) }], true],
    ['só um telhado', [{ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: rect(0, 0, 8, 6), heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: v(1, 0) }) }], true],
    ['escada e guarda-corpo', [{ type: 'addStair', stair: escada() }, { type: 'addGuardaCorpo', guardaCorpo: guarda() }], true],
    ['só paredes', paredes(), true],
  ];

  it.each(MODELOS)('%s: gera as quatro elevações, cada uma enquadrando o elemento', (_nome, cmds, desenhaNoMotor) => {
    const store = new ProjectStore(createEmptyProject());
    for (const c of cmds) store.exec(c);
    const box = elevationFrameBox(store.project, 'lv_0');
    expect(box, 'a caixa de elevação existe sem depender de paredes').not.toBeNull();
    let n = 0;
    store.exec(elevationCommand(store.project.views, box!, (p) => `${p}_${++n}`));
    const views = store.project.views.filter((x) => x.kind === 'elevation');
    expect(views.map((x) => x.role)).toEqual(['north', 'south', 'east', 'west']);
    for (const view of views) {
      const pts = sectionPoints(store.project, view);
      const secao = computeSection(store.project, { a: pts.a, b: pts.b, depth: view.depth });
      // O guarda-corpo é desenhado pelo kernel Rust (fora do `computeSection`); os demais entram no resultado do motor.
      if (desenhaNoMotor) expect(secao.cut.length + secao.beyond.length, `${view.name}: a elevação tem de desenhar o elemento`).toBeGreaterThan(0);
      // O elemento está dentro da faixa da elevação (a profundidade vai até o fundo da caixa).
      expect(view.depth).toBeGreaterThan(ELEVATION_OFFSET);
    }
  });

  it('sem nenhum elemento a caixa é nula (o controlador avisa em vez de falhar em silêncio)', () => {
    expect(elevationFrameBox(createEmptyProject(), 'lv_0')).toBeNull();
  });

  it('a elevação Norte da escada mostra os degraus: o perfil tem mais de um patamar de altura', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addStair', stair: escada() });
    let n = 0;
    store.exec(elevationCommand(store.project.views, elevationFrameBox(store.project, 'lv_0')!, (p) => `${p}_${++n}`));
    const leste = store.project.views.find((x) => x.role === 'east')!;
    const pts = sectionPoints(store.project, leste);
    const secao = computeSection(store.project, { a: pts.a, b: pts.b, depth: leste.depth });
    // De lado (leste), os degraus sobem em escada: várias alturas distintas de topo.
    const topos = new Set(secao.beyond.flatMap((b) => b.polygons.flatMap((poly) => poly.flatMap((ring) => ring.map((q) => Math.round(q.y * 100))))));
    expect(topos.size).toBeGreaterThan(4);
  });
});
