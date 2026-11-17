import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  makeBeam,
  makeColumn,
  makeFooting,
  makeLevel,
  ProjectStore,
} from '@hestia/model';
import {
  apoioDoElemento,
  pontoDeApoio,
} from './apoioDeSnap.ts';
import { computeSection } from './section.ts';
import {
  resolveAllBeams,
  resolveAllColumns,
  resolveAllFootings,
  resolveBeamsOnLevel,
  resolveColumnsOnLevel,
  resolveFootingsOnLevel,
} from './structural.ts';
import {
  beamScheduleToCsv,
  buildBeamSchedule,
  buildColumnSchedule,
  buildFootingSchedule,
  columnScheduleToCsv,
  filterBeamRows,
  filterColumnRows,
  filterFootingRows,
  footingScheduleToCsv,
  sumBeamRows,
  sumColumnRows,
  sumFootingRows,
} from './structuralSchedule.ts';

function createStructuralProject() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'upsertLevel',
    level: makeLevel({ id: 'lv_1', name: 'Superior', elevation: 3.0 }),
  });

  // Pilar retangular no térreo
  s.exec({
    type: 'addColumn',
    column: makeColumn({
      id: 'col_rect',
      typeId: 'ct_conc_20x40',
      levelId: 'lv_0',
      at: { x: 2, y: 0 },
      height: 2.8,
      mark: 'P1',
    }),
  });

  // Pilar circular no nível superior
  s.exec({
    type: 'addColumn',
    column: makeColumn({
      id: 'col_round',
      typeId: 'ct_round_30',
      levelId: 'lv_1',
      at: { x: 5, y: 0 },
      height: 3.0,
      mark: 'P2',
    }),
  });

  // Viga no térreo
  s.exec({
    type: 'addBeam',
    beam: makeBeam({
      id: 'beam1',
      typeId: 'bt_conc_15x40',
      levelId: 'lv_0',
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      mark: 'V1',
    }),
  });

  // Sapata no térreo
  s.exec({
    type: 'addFooting',
    footing: makeFooting({
      id: 'foot1',
      typeId: 'ft_iso_100x100',
      levelId: 'lv_0',
      at: { x: 2, y: 0 },
      mark: 'S1',
    }),
  });

  return s.project;
}

describe('resolução estrutural (structural)', () => {
  const p = createStructuralProject();

  it('resolveColumnsOnLevel calcula geometria e quantitativos do pilar retangular', () => {
    const cols = resolveColumnsOnLevel(p, 'lv_0');
    expect(cols).toHaveLength(1);
    const c = cols[0]!;
    expect(c.id).toBe('col_rect');
    expect(c.sectionArea).toBeCloseTo(0.2 * 0.4, 4);
    expect(c.volume).toBeCloseTo(0.2 * 0.4 * 2.8, 4);
    expect(c.areaFormwork).toBeCloseTo(2 * (0.2 + 0.4) * 2.8, 4);
    expect(c.cost).toBeCloseTo(0.2 * 0.4 * 2.8 * 420, 2);
    expect(c.z0).toBe(0);
    expect(c.z1).toBe(2.8);
    expect(c.polygon).toHaveLength(4);
  });

  it('resolveColumnsOnLevel calcula pilar circular', () => {
    const cols = resolveColumnsOnLevel(p, 'lv_1');
    expect(cols).toHaveLength(1);
    const c = cols[0]!;
    expect(c.id).toBe('col_round');
    expect(c.sectionArea).toBeCloseTo(Math.PI * 0.15 * 0.15, 4);
    expect(c.areaFormwork).toBeCloseTo(Math.PI * 0.3 * 3.0, 4);
    expect(c.polygon).toHaveLength(16);
  });

  it('resolveAllColumns retorna todos os pilares do projeto', () => {
    const all = resolveAllColumns(p);
    expect(all).toHaveLength(2);
  });

  it('resolveBeamsOnLevel calcula viga', () => {
    const beams = resolveBeamsOnLevel(p, 'lv_0');
    expect(beams).toHaveLength(1);
    const b = beams[0]!;
    expect(b.id).toBe('beam1');
    expect(b.length).toBeCloseTo(4.0, 4);
    expect(b.volume).toBeCloseTo(0.15 * 0.4 * 4.0, 4);
    expect(b.areaFormwork).toBeCloseTo((0.15 + 2 * 0.4) * 4.0, 4);
    expect(b.cost).toBeCloseTo(0.15 * 0.4 * 4.0 * 340, 2);
    expect(b.z1).toBe(0);
    expect(b.z0).toBe(-0.4);
    expect(b.polygon).toHaveLength(4);
  });

  it('resolveAllBeams retorna todas as vigas', () => {
    expect(resolveAllBeams(p)).toHaveLength(1);
  });

  it('resolveFootingsOnLevel calcula sapata', () => {
    const footings = resolveFootingsOnLevel(p, 'lv_0');
    expect(footings).toHaveLength(1);
    const f = footings[0]!;
    expect(f.id).toBe('foot1');
    expect(f.area).toBeCloseTo(1.0 * 1.0, 4);
    expect(f.volume).toBeCloseTo(1.0 * 1.0 * 0.4, 4);
    expect(f.cost).toBeCloseTo(1.0 * 1.0 * 0.4 * 650, 2);
    expect(f.z1).toBe(0);
    expect(f.z0).toBe(-0.4);
    expect(f.polygon).toHaveLength(4);
  });

  it('resolveAllFootings retorna todas as sapatas', () => {
    expect(resolveAllFootings(p)).toHaveLength(1);
  });
});

describe('corte e elevação estrutural (sectionStructural)', () => {
  const p = createStructuralProject();

  it('corte transversal atravessando pilar, viga e sapata', () => {
    const sec = computeSection(p, { a: { x: 2, y: -2 }, b: { x: 2, y: 2 }, depth: 3 });
    expect(sec.cut.length).toBeGreaterThan(0);
    const sources = sec.cut.flatMap((c) => c.sources);
    expect(sources.some((s) => s.columnId === 'col_rect')).toBe(true);
    expect(sources.some((s) => s.beamId === 'beam1')).toBe(true);
    expect(sources.some((s) => s.footingId === 'foot1')).toBe(true);
  });

  it('elevação projeta elementos estruturais em beyond', () => {
    // Linha de corte em frente a y = 0, olhando para o norte (+y)
    const sec = computeSection(p, { a: { x: -1, y: -2 }, b: { x: 6, y: -2 }, depth: 4 });
    expect(sec.cut).toHaveLength(0);
    expect(sec.beyond.some((b) => b.columnId === 'col_rect')).toBe(true);
    expect(sec.beyond.some((b) => b.beamId === 'beam1')).toBe(true);
    expect(sec.beyond.some((b) => b.footingId === 'foot1')).toBe(true);
  });
});

describe('tabelas estruturais e CSV (structuralSchedule)', () => {
  const p = createStructuralProject();

  it('buildColumnSchedule e CSV', () => {
    const sched = buildColumnSchedule(p);
    expect(sched.rows).toHaveLength(2);
    expect(sched.totals.count).toBe(2);
    expect(sched.totals.volume).toBeGreaterThan(0);
    expect(sched.totals.cost).toBeGreaterThan(0);

    const filtered = filterColumnRows(sched.rows, { levelId: 'lv_0' });
    expect(filtered).toHaveLength(1);
    expect(sumColumnRows([])).toEqual({ count: 0, volume: 0, areaFormwork: 0, cost: 0 });

    const csv = columnScheduleToCsv(sched);
    expect(csv).toContain('P1;');
    expect(csv).toContain('P2;');
    expect(csv).toContain('Total');
  });

  it('buildBeamSchedule e CSV', () => {
    const sched = buildBeamSchedule(p);
    expect(sched.rows).toHaveLength(1);
    expect(sched.totals.count).toBe(1);
    expect(sched.totals.length).toBeCloseTo(4.0, 4);

    const filtered = filterBeamRows(sched.rows, { levelId: 'lv_0' });
    expect(filtered).toHaveLength(1);
    expect(sumBeamRows([])).toEqual({ count: 0, length: 0, volume: 0, areaFormwork: 0, cost: 0 });

    const csv = beamScheduleToCsv(sched);
    expect(csv).toContain('V1;');
    expect(csv).toContain('Total');
  });

  it('buildFootingSchedule e CSV', () => {
    const sched = buildFootingSchedule(p);
    expect(sched.rows).toHaveLength(1);
    expect(sched.totals.count).toBe(1);
    expect(sched.totals.area).toBeCloseTo(1.0, 4);

    const filtered = filterFootingRows(sched.rows, { levelId: 'lv_0' });
    expect(filtered).toHaveLength(1);
    expect(sumFootingRows([])).toEqual({ count: 0, area: 0, volume: 0, cost: 0 });

    const csv = footingScheduleToCsv(sched);
    expect(csv).toContain('S1;');
    expect(csv).toContain('Total');
  });
});

describe('pontos de apoio e captura (apoioDeSnap)', () => {
  const p = createStructuralProject();

  it('apoio do pilar retangular traz vértices e centro col.c', () => {
    const col = p.elements.col_rect;
    const a = apoioDoElemento(p, col);
    expect(a).not.toBeNull();
    expect(a!.pontos.some((q) => q.chave === 'col.c' && q.tipo === 'center')).toBe(true);
    const center = pontoDeApoio(p, 'col_rect', 'col.c');
    expect(center).toEqual({ x: 2, y: 0 });
    expect(a!.segmentos.length).toBeGreaterThanOrEqual(4);
  });

  it('apoio do pilar circular traz centro e 4 quadrantes', () => {
    const col = p.elements.col_round;
    const a = apoioDoElemento(p, col);
    expect(a).not.toBeNull();
    expect(a!.pontos.some((q) => q.chave === 'col.c' && q.tipo === 'center')).toBe(true);
    expect(a!.pontos.filter((q) => q.chave.startsWith('col.q'))).toHaveLength(4);
  });

  it('apoio da viga traz anel, eixo, centro e pontos de extremidade', () => {
    const beam = p.elements.beam1;
    const a = apoioDoElemento(p, beam);
    expect(a).not.toBeNull();
    expect(a!.porChave.has('eixo.a')).toBe(true);
    expect(a!.porChave.has('eixo.b')).toBe(true);
    expect(a!.porChave.has('eixo.m')).toBe(true);
    expect(pontoDeApoio(p, 'beam1', 'eixo.a')).toEqual({ x: 0, y: 0 });
    expect(pontoDeApoio(p, 'beam1', 'eixo.b')).toEqual({ x: 4, y: 0 });
    expect(pontoDeApoio(p, 'beam1', 'eixo.m')).toEqual({ x: 2, y: 0 });
    expect(a!.segmentos.some((s) => s.chave === 'eixo.s0')).toBe(true);
  });

  it('apoio da sapata traz anel, vértices e centro foot.c', () => {
    const foot = p.elements.foot1;
    const a = apoioDoElemento(p, foot);
    expect(a).not.toBeNull();
    expect(a!.porChave.has('foot.c')).toBe(true);
    expect(pontoDeApoio(p, 'foot1', 'foot.c')).toEqual({ x: 2, y: 0 });
    expect(a!.segmentos.length).toBeGreaterThanOrEqual(4);
  });

  it('viga W (i-section) gera seção I no corte (> 4 vértices) e >= 3 faixas beyond em elevação', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addBeam',
      beam: makeBeam({
        id: 'bw',
        typeId: 'bt_steel_w310',
        levelId: 'lv_0',
        a: { x: 0, y: 0 },
        b: { x: 4, y: 0 },
      }),
    });

    const cutSec = computeSection(s.project, { a: { x: 2, y: -1 }, b: { x: 2, y: 1 }, depth: 0.4 });
    const cutBeam = cutSec.cut.find((c) => c.sources.some((o) => o.beamId === 'bw'));
    expect(cutBeam).toBeDefined();
    expect(cutBeam!.polygons[0]![0]!.length).toBeGreaterThan(4);

    const elevSec = computeSection(s.project, { a: { x: -1, y: -2 }, b: { x: 5, y: -2 }, depth: 5 });
    const beyondBeam = elevSec.beyond.filter((b) => b.beamId === 'bw');
    expect(beyondBeam.length).toBeGreaterThanOrEqual(3);
  });

  it('pilar metálico W (ct_steel_w250) emite >= 3 faixas beyond na elevação', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addColumn',
      column: makeColumn({
        id: 'cw',
        typeId: 'ct_steel_w250',
        levelId: 'lv_0',
        at: { x: 2, y: 0 },
        height: 3.0,
      }),
    });

    const elevY = computeSection(s.project, { a: { x: -1, y: -2 }, b: { x: 5, y: -2 }, depth: 5 }).beyond.filter((b) => b.columnId === 'cw');
    const elevX = computeSection(s.project, { a: { x: -2, y: 3 }, b: { x: -2, y: -3 }, depth: 5 }).beyond.filter((b) => b.columnId === 'cw');
    expect(Math.max(elevY.length, elevX.length)).toBeGreaterThanOrEqual(3);
  });
});
