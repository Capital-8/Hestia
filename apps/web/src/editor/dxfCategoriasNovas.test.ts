import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { planRamp, type RampPlan } from '@hestia/engine';
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
import { dxfLayerTableOf, planDxf } from './dxfExport.ts';

/*
 * Categorias gráficas novas no DXF da planta (adendo 2 do ADR 0060, etapa 4.5b). Projeto com um elemento de cada
 * categoria (parede, pilar, viga, sapata, laje, forro, escada, rampa e componentes das quatro disciplinas).
 *
 * O hash LITERAL do caso padrão foi lido UMA VEZ da saída de 4.5b (nada oculto) e é o da saída anterior: a mudança de
 * categoria não altera o arquivo padrão. Ocultar uma categoria nova tira só a camada/entidade dela (pilar não leva a
 * parede, viga/sapata não levam a laje, componente de uma disciplina não leva o das outras).
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => P(x, y));
const RETANGULO = ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]);

const N = 17;
const ESPELHO = 0.28;

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
  s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 3.5 } });
  return s.project;
}

function comCategoriaOculta(cat: GraphicsCategory, up = false): Project {
  const s = new ProjectStore(projeto());
  if (up) s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { [cat]: { visible: false } } } });
  return s.project;
}

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('DXF da planta: caso padrão idêntico ao anterior (hash literal)', () => {
  it('o arquivo padrão (nada oculto) tem o hash de antes da etapa 4.5b', () => {
    expect(hash(planDxf(projeto(), 'lv_0'))).toBe('93a7979aad360d8c17b0dba6b27bea887e2ad65545fd3d45733de360897b2959');
  });

  it('o arquivo traz as camadas das categorias: parede, pilar, viga, sapata, laje, escada, rampa e componentes', () => {
    const text = planDxf(projeto(), 'lv_0');
    const camadas = dxfLayerTableOf(projeto(), { kind: 'plan', levelId: 'lv_0' }).map((r) => r.name);
    expect(camadas.some((c) => c.startsWith('PAREDE_'))).toBe(true);
    expect(camadas.some((c) => c.startsWith('LAJE_'))).toBe(true);
    for (const camada of ['PILARES', 'VIGAS', 'FUNDACOES', 'ESCADA', 'RAMPA', 'COMPONENTES']) {
      expect(text).toContain(`\r\n${camada}\r\n`);
    }
  });
});

describe('DXF da planta: ocultar a categoria nova tira só a camada/entidade dela', () => {
  const camadas = (p: Project): string[] => dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).map((r) => r.name);

  it('pilar: some PILARES; parede, viga e sapata ficam', () => {
    const p = comCategoriaOculta('column');
    const text = planDxf(p, 'lv_0');
    expect(text).not.toContain('\r\nPILARES\r\n');
    expect(text).toContain('\r\nVIGAS\r\n');
    expect(text).toContain('\r\nFUNDACOES\r\n');
    expect(dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).some((r) => r.name.startsWith('PAREDE_'))).toBe(true);
  });

  it('parede: some a PAREDE_* e o contorno; o pilar continua', () => {
    const p = comCategoriaOculta('wall');
    const text = planDxf(p, 'lv_0');
    expect(dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).some((r) => r.name.startsWith('PAREDE_'))).toBe(false);
    expect(text).not.toContain('\r\nPAREDE_CONTORNO\r\n');
    expect(text).toContain('\r\nPILARES\r\n');
  });

  it('viga e sapata: cada uma tira a sua camada, sem levar a laje', () => {
    const semViga = planDxf(comCategoriaOculta('beam'), 'lv_0');
    expect(semViga).not.toContain('\r\nVIGAS\r\n');
    expect(semViga).toContain('\r\nFUNDACOES\r\n');
    expect(semViga).toContain('LAJE_');
    const semSapata = planDxf(comCategoriaOculta('footing'), 'lv_0');
    expect(semSapata).not.toContain('\r\nFUNDACOES\r\n');
    expect(semSapata).toContain('\r\nVIGAS\r\n');
  });

  it('componente de uma disciplina não leva o das outras; ocultar todas tira COMPONENTES', () => {
    const semHidraulico = comCategoriaOculta('plumbingFixture');
    expect(camadas(semHidraulico)).toContain('COMPONENTES');
    const todas = new ProjectStore(projeto());
    todas.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { component: { visible: false }, plumbingFixture: { visible: false }, electricalFixture: { visible: false }, mechanicalEquipment: { visible: false } } } });
    expect(camadas(todas.project)).not.toContain('COMPONENTES');
  });

  it('na planta de forro, ocultar "ceiling" tira o FORRO e não o PISO; ocultar "floor" não tira o forro', () => {
    const up = new ProjectStore(projeto());
    up.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
    expect(planDxf(up.project, 'lv_0')).toContain('\r\nFORRO\r\n');
    expect(planDxf(comCategoriaOculta('ceiling', true), 'lv_0')).not.toContain('\r\nFORRO\r\n');
    const semPiso = planDxf(comCategoriaOculta('floor', true), 'lv_0');
    expect(semPiso).toContain('\r\nFORRO\r\n');
  });
});
