import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { planRamp, resolveLevel, type RampPlan, type SectionBeyond, type SectionOpening, type SectionOrigin, type SectionResult } from '@hestia/engine';
import {
  DISCIPLINAS_EXEMPLO,
  FAMILIA_ARMARIO,
  ProjectStore,
  createEmptyProject,
  defaultRampTypeId,
  defaultStairTypeId,
  makeBeam,
  makeCeiling,
  makeColumn,
  makeFloor,
  makeFooting,
  makeRamp,
  makeRoof,
  makeSlab,
  makeStair,
  makeWall,
  type Component,
  type Familia,
  type GraphicsCategory,
  type Project,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import { ModelScene } from './model3d/scene3d.ts';
import { LIGHT, type PlanDrawList } from './plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './section/build.ts';
import { pickSection } from './section/pick.ts';

/*
 * Categorias gráficas novas no 3D e no corte (adendo 2 do ADR 0060, etapa 4.5c). Um projeto com telhado, paredes, pilar,
 * viga, sapata, laje, piso, forro, escada, rampa e componentes das quatro disciplinas. Os ids e as contagens esperadas são
 * LITERAIS, escritos à mão a partir do fixture; nenhum valor vem do código testado.
 *
 * Para cada categoria oculta nos gráficos da vista: a cena 3D e o corte perdem SÓ os elementos dela. O corte sintético é
 * o mesmo caminho que os testes existentes usam (o filtro é do desenho, não da geometria). O desenho padrão (nada oculto)
 * continua tendo todos os elementos.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => P(x, y));
const RETANGULO = ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]);

const N = 17;
const ESPELHO = 0.28;

/** Lance reto de 17 espelhos em +x (o mesmo croqui de `categoriasNovasPlanta.test.ts`). */
function lance(): StairRun {
  const ln = (ax: number, ay: number, bx: number, by: number) => ({ a: P(ax, ay), b: P(bx, by), sag: 0 });
  const x1 = (N + 1) * ESPELHO;
  return {
    id: 'r1',
    kind: 'run',
    boundaryLeft: [ln(0, 0.5, x1, 0.5)],
    boundaryRight: [ln(0, -0.5, x1, -0.5)],
    risers: Array.from({ length: N }, (_, i) => ln((i + 1) * ESPELHO, -1, (i + 1) * ESPELHO, 1)),
    path: [],
    generatedBy: 'straight',
  };
}

const TIPO_RAMPA = createEmptyProject().rampTypes[defaultRampTypeId]!;

/** Componentes da rampa reta de 0,8 m, como em `ramps.test.ts`. */
function componentesDaRampa(): Array<StairRun | StairLanding> {
  const plano = planRamp({ start: P(6, 0), dir: P(1, 0), H: 0.8, type: TIPO_RAMPA, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
  if ('error' in plano) throw new Error(plano.error);
  return (plano as RampPlan).parts.map((x, i) => (x.kind === 'run' ? { id: `rc${i}`, kind: 'run', ...x.run } : { id: `rc${i}`, kind: 'landing', ...x.landing }));
}

const familiaExemplo = (id: string): Familia => structuredClone(DISCIPLINAS_EXEMPLO.find((f) => f.id === id)!);

const componente = (id: string, familyId: string, x: number, y: number): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId,
  typeId: null,
  levelId: 'lv_0',
  x,
  y,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
});

/** Projeto do teste: um elemento de cada categoria nova, mais parede, piso, laje, escada e telhado. */
function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const f of [FAMILIA_ARMARIO, familiaExemplo('fam_vaso_sanitario'), familiaExemplo('fam_tomada'), familiaExemplo('fam_difusor_teto')]) {
    s.exec({ type: 'upsertFamily', family: f });
  }
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wall1', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(4, 0) }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'floor1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: RETANGULO }) });
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'roof1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RETANGULO, heightOffset: 0.2 }) });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'col1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: P(2, 3), mark: 'P1' }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'beam1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: P(0, 1), b: P(4, 1), zOffset: 2.4, mark: 'VG-01' }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'ftg1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: P(2, 3), mark: 'SP-01' }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'slab1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: RETANGULO }) });
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'ceil1', typeId: 'ct_gesso', levelId: 'lv_0', boundary: RETANGULO, heightOffset: 2.6 }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'stair1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [lance()] }) });
  s.exec({ type: 'addRamp', ramp: makeRamp({ id: 'ramp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: componentesDaRampa(), inputMode: 'slope', slopeTarget: 1 / 12 }) });
  s.exec({ type: 'addComponent', component: componente('comp_arq', FAMILIA_ARMARIO.id, 1, 1) });
  s.exec({ type: 'addComponent', component: componente('comp_hid', 'fam_vaso_sanitario', 2, 1) });
  s.exec({ type: 'addComponent', component: componente('comp_ele', 'fam_tomada', 3, 1) });
  s.exec({ type: 'addComponent', component: componente('comp_hvac', 'fam_difusor_teto', 1, 2) });
  return s.project;
}

/** Ids LITERAIS de cada categoria no fixture. */
const ESPERADO: ReadonlyArray<readonly [GraphicsCategory, readonly string[]]> = [
  ['wall', ['wall1']],
  ['roof', ['roof1']],
  ['column', ['col1']],
  ['beam', ['beam1']],
  ['footing', ['ftg1']],
  ['slab', ['slab1']],
  ['floor', ['floor1']],
  ['ceiling', ['ceil1']],
  ['stair', ['stair1']],
  ['ramp', ['ramp1']],
  ['component', ['comp_arq']],
  ['plumbingFixture', ['comp_hid']],
  ['electricalFixture', ['comp_ele']],
  ['mechanicalEquipment', ['comp_hvac']],
];

/** Projeto com a categoria oculta nos gráficos da vista 3D ("Ocultar categoria" do 3D). */
function comCategoria3d(cat: GraphicsCategory): Project {
  const s = new ProjectStore(projeto());
  s.exec({ type: 'setView3D', patch: { overrides: { [cat]: { visible: false } } } });
  return s.project;
}

/** Projeto com a categoria oculta nos gráficos do corte ("Ocultar categoria" da vista de corte). */
function comCategoriaCorte(cat: GraphicsCategory): Project {
  const s = new ProjectStore(projeto());
  s.exec({ type: 'setSectionGraphics', patch: { overrides: { [cat]: { visible: false } } } });
  return s.project;
}

function cena(p: Project, hidden?: ReadonlySet<string>): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false, ...(hidden ? { hidden } : {}) });
  return ms;
}

const visivelNo3d = (ms: ModelScene, id: string): boolean => ms.selectionBounds([id]) !== null;

describe('3D: ocultar a categoria atinge só os elementos dela', () => {
  it('o cenário padrão tem um elemento de cada categoria (nada oculto)', () => {
    const ms = cena(projeto());
    for (const [, ids] of ESPERADO) for (const id of ids) expect(visivelNo3d(ms, id), id).toBe(true);
  });

  it('cada categoria oculta some só com os seus ids, e os demais continuam na malha/picking', () => {
    for (const [cat, ids] of ESPERADO) {
      const ms = cena(comCategoria3d(cat));
      for (const id of ids) expect(visivelNo3d(ms, id), `${cat}:${id}`).toBe(false);
      for (const [outra, outros] of ESPERADO) {
        if (outra === cat) continue;
        for (const id of outros) expect(visivelNo3d(ms, id), `${cat} não pode ocultar ${outra}:${id}`).toBe(true);
      }
    }
  });

  it('ocultar "column" não oculta a parede nem o telhado; ocultar "wall" não oculta o pilar', () => {
    const semPilar = cena(comCategoria3d('column'));
    expect(visivelNo3d(semPilar, 'col1')).toBe(false);
    expect(visivelNo3d(semPilar, 'wall1')).toBe(true);
    expect(visivelNo3d(semPilar, 'roof1')).toBe(true);
    const semParede = cena(comCategoria3d('wall'));
    expect(visivelNo3d(semParede, 'wall1')).toBe(false);
    expect(visivelNo3d(semParede, 'col1')).toBe(true);
    expect(visivelNo3d(semParede, 'roof1')).toBe(true);
  });

  it('relato do dono: telhado oculto por elemento e depois a categoria "column" oculta — as paredes ficam', () => {
    const semTelhado = cena(projeto(), new Set(['roof1']));
    expect(visivelNo3d(semTelhado, 'roof1')).toBe(false);
    expect(visivelNo3d(semTelhado, 'wall1')).toBe(true);
    const semTelhadoNemPilar = cena(comCategoria3d('column'), new Set(['roof1']));
    expect(visivelNo3d(semTelhadoNemPilar, 'roof1')).toBe(false);
    expect(visivelNo3d(semTelhadoNemPilar, 'col1')).toBe(false);
    expect(visivelNo3d(semTelhadoNemPilar, 'wall1')).toBe(true);
    expect(visivelNo3d(semTelhadoNemPilar, 'slab1')).toBe(true);
  });
});

const rect = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]]];

const sectionResult = (patch: Partial<SectionResult> = {}): SectionResult => ({
  length: 10,
  zMin: 0,
  zMax: 3,
  cut: [],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
  ...patch,
});

const beyond = (origin: SectionOrigin, polygons = rect(0, 0, 1, 1)): SectionBeyond => ({
  ...origin,
  materialId: 'mat_concreto',
  layerIndex: 0,
  depth: 2,
  polygons,
});

const janelaAncora = (): SectionOpening => ({
  openingId: 'ancora',
  kind: 'window',
  t0: 2,
  t1: 3,
  z0: 1,
  z1: 2,
  depth: 1,
  cut: false,
  polygons: rect(2, 1, 3, 2),
  model: null as unknown as SectionOpening['model'],
  openingLine: { apex: 'latch', dashed: 'toward' },
  viewSide: 1,
  sSign: 1,
  cutT: 0,
  frameMaterialId: 'mat_concreto',
  glassMaterialId: 'mat_vidro',
});

const entradaCorte = (p: Project, section: SectionResult, hidden?: ReadonlySet<string>): SectionInput => ({
  project: p,
  section,
  viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 },
  theme: LIGHT,
  dark: false,
  showGrid: false,
  ...(hidden ? { hidden } : {}),
});

const desenho = (d: PlanDrawList): string => JSON.stringify({ fills: d.fills, strokes: d.strokes, labels: d.labels });

/** Origem do resultado sintético de cada categoria (o id LITERAL do fixture). */
const origemDe = (cat: GraphicsCategory): SectionOrigin => {
  const id = ESPERADO.find(([c]) => c === cat)![1][0]!;
  switch (cat) {
    case 'wall': return { wallId: id };
    case 'roof': return { roofId: id };
    case 'column': return { columnId: id };
    case 'beam': return { beamId: id };
    case 'footing': return { footingId: id };
    case 'slab': return { slabId: id };
    case 'floor': return { floorId: id };
    case 'ceiling': return { ceilingId: id };
    case 'stair': return { stairId: id };
    case 'ramp': return { rampId: id };
    default: return { componentId: id };
  }
};

describe('corte: ocultar a categoria atinge só os elementos dela', () => {
  it('cada categoria oculta desenha o mesmo que o Hide in View dos MESMOS ids (e só deles)', () => {
    // Mesmo estilo salvo dos dois lados (o override só entra na vista da categoria): sem isso os pesos do desenho diferem.
    const s = new ProjectStore(projeto());
    s.exec({ type: 'setSectionGraphics', patch: { scale: 100 } });
    const comEstilo = s.project;
    for (const [cat, ids] of ESPERADO) {
      const corte = sectionResult({ beyond: [beyond(origemDe(cat))], openings: [janelaAncora()] });
      const base = desenho(buildSectionDrawList(entradaCorte(comEstilo, corte)));
      const porCategoria = desenho(buildSectionDrawList(entradaCorte(comCategoriaCorte(cat), corte)));
      const porElemento = desenho(buildSectionDrawList(entradaCorte(comEstilo, corte, new Set(ids))));
      expect(porCategoria, cat).toBe(porElemento);
      expect(porElemento, cat).not.toBe(base);
    }
  });

  it('ocultar "column" no corte mantém a parede e o telhado; "wall" mantém o pilar', () => {
    const s = sectionResult({
      beyond: [beyond({ wallId: 'wall1' }, rect(0, 0, 1, 1)), beyond({ columnId: 'col1' }, rect(1, 0, 2, 1)), beyond({ roofId: 'roof1' }, rect(2, 0, 3, 1))],
      openings: [janelaAncora()],
    });
    const est = new ProjectStore(projeto());
    est.exec({ type: 'setSectionGraphics', patch: { scale: 100 } });
    const comEstilo = est.project;
    const base = desenho(buildSectionDrawList(entradaCorte(comEstilo, s)));
    const semPilar = desenho(buildSectionDrawList(entradaCorte(comCategoriaCorte('column'), s)));
    const semParede = desenho(buildSectionDrawList(entradaCorte(comCategoriaCorte('wall'), s)));
    expect(semPilar).not.toBe(base);
    expect(semParede).not.toBe(base);
    expect(semPilar).not.toBe(semParede);
    // Ocultar o pilar é o mesmo que ocultar só o id dele; a parede e o telhado continuam desenhados.
    expect(semPilar).toBe(desenho(buildSectionDrawList(entradaCorte(comEstilo, s, new Set(['col1'])))));
    expect(semParede).toBe(desenho(buildSectionDrawList(entradaCorte(comEstilo, s, new Set(['wall1'])))));
  });
});

describe('picking do corte: respeita elemento e categoria ocultos e devolve a categoria nova', () => {
  it('cada elemento tem a sua categoria no clique, e some quando ele ou a categoria dele está oculta', () => {
    const p = projeto();
    for (const [cat, ids] of ESPERADO) {
      const s = sectionResult({ beyond: [beyond(origemDe(cat))] });
      expect(pickSection(s, P(0.5, 0.5), 0, undefined, p), cat).toEqual({ id: ids[0]!, kind: cat });
      expect(pickSection(s, P(0.5, 0.5), 0, new Set(ids), p), cat).toBeNull();
      // Ocultar outra categoria não muda este alvo.
      const outra = ESPERADO.find(([c]) => c !== cat)!;
      expect(pickSection(s, P(0.5, 0.5), 0, new Set(outra[1]), p), cat).toEqual({ id: ids[0]!, kind: cat });
      // Categoria desligada nos gráficos do corte: não é alvo, mesmo sem Hide in View.
      expect(pickSection(s, P(0.5, 0.5), 0, undefined, comCategoriaCorte(cat)), cat).toBeNull();
    }
  });
});

/** Todos os .ts de produção sob packages/render/src (sem testes). */
function fontesDeProducao(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...fontesDeProducao(caminho));
    else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.test.ts')) out.push(caminho);
  }
  return out;
}

describe('guarda de texto: nenhum kind decide categoria fora do modelo', () => {
  it('packages/render não tem a tabela antiga (pilar→parede, viga/sapata→laje, forro→piso, rampa→escada)', () => {
    const raiz = join(import.meta.dirname, '.');
    const proibidos: RegExp[] = [
      /columnId[^\n]{0,60}['"](?:wall|slab|floor|stair|generic)['"]/,
      /beamId[^\n]{0,60}['"](?:wall|slab|floor|stair|generic)['"]/,
      /footingId[^\n]{0,60}['"](?:wall|slab|floor|stair|generic)['"]/,
      /ceilingId[^\n]{0,60}['"](?:wall|slab|floor|stair|generic)['"]/,
      /rampId[^\n]{0,60}['"](?:wall|slab|floor|stair|generic)['"]/,
      /case\s+'(?:column|beam|footing|ceiling|ramp|component)':\s*return\s+'/,
      /batchOf\([^\n]*, '(?:wall|slab|floor|stair|generic)'\)[^\n]*(?:column|beam|footing|ceiling|ramp)/,
    ];
    const achados: string[] = [];
    for (const arquivo of fontesDeProducao(raiz)) {
      const texto = readFileSync(arquivo, 'utf8');
      for (const regra of proibidos) if (regra.test(texto)) achados.push(join(arquivo.replace(raiz, ''), String(regra)));
    }
    expect(achados).toEqual([]);
  });
});
