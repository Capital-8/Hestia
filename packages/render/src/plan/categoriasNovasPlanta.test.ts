import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { planRamp, resolveLevel, type RampPlan } from '@hestia/engine';
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
  makeFooting,
  makeRamp,
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
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { LIGHT, type PlanOps } from './types.ts';
import { planViewOf } from './view.ts';

/*
 * Categorias gráficas novas na planta (adendo 2 do ADR 0060, etapa 4.5b). Projeto com um elemento de cada categoria:
 * parede, pilar, viga, sapata, laje, forro, escada, rampa e componentes de arquitetura, hidrossanitário, elétrico e HVAC.
 * As listas de ids são LITERAIS (escritas à mão a partir dos ids do fixture); nenhuma vem do código testado.
 *
 * Para cada categoria oculta: `categoryHidden`/`hidden` do `planViewOf` têm SÓ os ids dela, e o desenho por categoria é
 * IDÊNTICO ao desenho com esses mesmos ids no Hide in View (`PlanInput.hidden`). Isso prova que ocultar a categoria atinge
 * somente os elementos dela. O desenho padrão (nada oculto) é o de antes: os testes de ouro da planta não mudam.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => P(x, y));
const RETANGULO = ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]);

const N = 17;
const ESPELHO = 0.28;

/** Lance reto de 17 espelhos em +x (mesmo croqui de `stairsBuild.test.ts`). */
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

/** Projeto do teste: um elemento de cada categoria nova (mais parede, laje e escada, das antigas). */
function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const f of [FAMILIA_ARMARIO, familiaExemplo('fam_vaso_sanitario'), familiaExemplo('fam_tomada'), familiaExemplo('fam_difusor_teto')]) {
    s.exec({ type: 'upsertFamily', family: f });
  }
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wall1', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(4, 0) }) });
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
  // Topo 3,5 m: forro, vigas e escada ficam dentro do intervalo (não são ocultos pelo intervalo de vista).
  s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 3.5 } });
  return s.project;
}

/** Projeto com a categoria oculta nos gráficos do nível (o caminho de "Ocultar categoria" da planta). */
function comCategoriaOculta(cat: GraphicsCategory, up = false): Project {
  const s = new ProjectStore(projeto());
  if (up) s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { [cat]: { visible: false } } } });
  return s.project;
}

/** Projeto na planta de forro (direção para cima): o único caso em que o forro é desenhado na planta baixa. */
function naPlantaDeForro(): Project {
  const s = new ProjectStore(projeto());
  s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  return s.project;
}

const entrada = (p: Project, extra: Partial<PlanInput> = {}): PlanInput => ({
  project: p,
  levelId: 'lv_0',
  resolved: resolveLevel(p, 'lv_0'),
  below: null,
  viewport: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
  ...extra,
});

/** Assinatura estável do desenho (sem os limiares de zoom: a lista de operações é a mesma entre eles). */
const desenho = (ops: PlanOps): string => JSON.stringify({ fills: ops.fills, strokes: ops.strokes, labels: ops.labels });

/** Ids LITERAIS de cada categoria no fixture. */
const ESPERADO: ReadonlyArray<readonly [GraphicsCategory, readonly string[]]> = [
  ['wall', ['wall1']],
  ['column', ['col1']],
  ['beam', ['beam1']],
  ['footing', ['ftg1']],
  ['slab', ['slab1']],
  ['ceiling', ['ceil1']],
  ['stair', ['stair1']],
  ['ramp', ['ramp1']],
  ['component', ['comp_arq']],
  ['plumbingFixture', ['comp_hid']],
  ['electricalFixture', ['comp_ele']],
  ['mechanicalEquipment', ['comp_hvac']],
];

describe('ocultar uma categoria nova atinge só os elementos dela (planViewOf)', () => {
  it('cada categoria tem categoryHidden, hidden e cls exatos (e nenhum outro id some junto)', () => {
    for (const [cat, ids] of ESPERADO) {
      const vista = planViewOf(comCategoriaOculta(cat), 'lv_0');
      expect([...vista.categoryHidden].sort(), cat).toEqual([...ids].sort());
      expect([...vista.hidden].sort(), cat).toEqual([...ids].sort());
      for (const id of ids) expect(vista.cls.get(id), cat).toBe('hidden');
      // Os demais elementos do fixture continuam classificados (nenhum outro some junto).
      for (const [outra, outros] of ESPERADO) {
        if (outra === cat) continue;
        for (const id of outros) expect(vista.hidden.has(id), `${cat} não pode ocultar ${outra}:${id}`).toBe(false);
      }
    }
  });

  it('ocultar "column" não oculta a parede, a laje nem a viga; "wall" não oculta o pilar', () => {
    const semPilar = planViewOf(comCategoriaOculta('column'), 'lv_0');
    expect(semPilar.hidden.has('wall1')).toBe(false);
    expect(semPilar.hidden.has('slab1')).toBe(false);
    expect(semPilar.hidden.has('beam1')).toBe(false);
    const semParede = planViewOf(comCategoriaOculta('wall'), 'lv_0');
    expect(semParede.hidden.has('col1')).toBe(false);
    expect(semParede.hidden.has('wall1')).toBe(true);
  });

  it('a chave do cache cobre as categorias novas: cada uma resolve uma vista com o seu conjunto de ocultos', () => {
    const vistas = ESPERADO.map(([cat]) => planViewOf(comCategoriaOculta(cat), 'lv_0'));
    expect(vistas.map((v) => [...v.categoryHidden])).toEqual(ESPERADO.map(([, ids]) => ids));
    expect(new Set(vistas.map((v) => v)).size).toBe(ESPERADO.length);
  });
});

describe('desenho: categoria oculta == Hide in View dos MESMOS elementos (e só deles)', () => {
  const casos = ESPERADO.filter(([cat]) => cat !== 'ceiling');

  it('cada categoria oculta apaga só os elementos dela no desenho', () => {
    for (const [cat, ids] of casos) {
      const p = comCategoriaOculta(cat);
      const porCategoria = desenho(buildPlanGeometry(entrada(p)));
      const porElemento = desenho(buildPlanGeometry(entrada(projeto(), { hidden: new Set(ids) })));
      expect(porCategoria, cat).toBe(porElemento);
      // O elemento é realmente desenhado neste fixture: ocultá-lo muda o desenho.
      expect(porElemento, cat).not.toBe(desenho(buildPlanGeometry(entrada(projeto()))));
    }
  });

  it('o forro obedece à categoria própria na planta de forro (e "floor" não o oculta)', () => {
    const base = desenho(buildPlanGeometry(entrada(naPlantaDeForro())));
    const porCategoria = desenho(buildPlanGeometry(entrada(comCategoriaOculta('ceiling', true))));
    const porElemento = desenho(buildPlanGeometry(entrada(naPlantaDeForro(), { hidden: new Set(['ceil1']) })));
    expect(porCategoria).toBe(porElemento);
    expect(porCategoria).not.toBe(base);
    // Ocultar a categoria do piso (que antes levava o forro junto) não muda a planta de forro.
    expect(desenho(buildPlanGeometry(entrada(comCategoriaOculta('floor', true))))).toBe(base);
  });

  it('Hide in View por elemento continua isolado: só o pilar some, viga e sapata ficam', () => {
    const base = projeto();
    const p: Project = { ...base, settings: { ...base.settings, showTags: true } };
    const textos = buildPlanGeometry(entrada(p)).labels.map((l) => l.text);
    expect(textos).toContain('P1');
    expect(textos).toContain('VG-01');
    const semPilar = buildPlanGeometry(entrada(p, { hidden: new Set(['col1']) }));
    expect(semPilar.labels.map((l) => l.text)).not.toContain('P1');
    expect(semPilar.labels.map((l) => l.text)).toContain('VG-01');
    expect(planViewOf(p, 'lv_0').categoryHidden.size).toBe(0);
  });
});

describe('guarda de texto: nenhum kind decide categoria fora do modelo', () => {
  it('packages/render/src/plan não tem case de column/beam/footing decidindo categoria', () => {
    const dir = join(import.meta.dirname, '.');
    const arquivos = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const achados = arquivos.filter((f) => /\bcase\s+'(column|beam|footing)'/.test(readFileSync(join(dir, f), 'utf8')));
    expect(achados).toEqual([]);
  });
});
