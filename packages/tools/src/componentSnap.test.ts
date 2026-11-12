import { describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { makeRamp, makeStair, type Project, type StairCurve, type StairLanding, type StairRun } from '@hestia/model';
import { ToolBase } from './base.ts';
import { componentSnapGeometry } from './componentSnap.ts';
import { infer, type InferContext } from './infer.ts';
import { makeEnv } from './testEnv.ts';
import { DEFAULT_SNAP, type Inference, type PointerInfo } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });

/** Lance reto de 4 m por 1 m a partir de `x0`; com espelhos, um a cada metro. A rampa usa o mesmo lance sem espelhos. */
function run(id: string, x0: number, risers = true): StairRun {
  const xs = risers ? [1, 2, 3].map((k) => x0 + k) : [];
  return {
    id,
    kind: 'run',
    boundaryLeft: [ln(v(x0, 0.5), v(x0 + 4, 0.5))],
    boundaryRight: [ln(v(x0, -0.5), v(x0 + 4, -0.5))],
    risers: xs.map((x) => ln(v(x, -1), v(x, 1))),
    path: [],
  };
}

/** Patamar quadrado de 2 m: quatro curvas fechadas, com os cantos repetidos entre curvas vizinhas. */
function landing(id: string, x0: number, y0: number): StairLanding {
  const corners = [v(x0, y0), v(x0 + 2, y0), v(x0 + 2, y0 + 2), v(x0, y0 + 2)];
  return { id, kind: 'landing', boundary: corners.map((q, i) => ln(q, corners[(i + 1) % 4]!)) };
}

/** Projeto com uma escada (lance reto) e uma rampa (lance reto sem espelhos), um longe do outro. */
function setup(): { project: Project; stairId: string; rampId: string; env: ReturnType<typeof makeEnv>['env'] } {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st_teste', typeId: 'stt_monolitica', levelId: 'lv_0', components: [run('r1', 0)] }) });
  ctx.store.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp_teste', typeId: 'rmt_nbr9050', levelId: 'lv_0', components: [run('r1', 10, false)] }) });
  return { project: ctx.store.project, stairId: 'st_teste', rampId: 'rp_teste', env: ctx.env };
}

const at = (project: Project, x: number, y: number, extra: Partial<InferContext> = {}): Inference =>
  infer({ x, y }, { project, levelId: 'lv_0', mpp: 0.005, gridStep: 0.1, ...extra });

/** Ferramenta mínima para exercitar a captura global montada em `ToolBase.ctx`. */
class Probe extends ToolBase {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly hint = '';
  protected reset(): void {}
  protected busy(): boolean {
    return false;
  }
  probe(p: PointerInfo): Inference {
    return this.snap(p);
  }
}

const pointer = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });

describe('captura de escadas e rampas (componentSnap)', () => {
  it('os vértices resolvidos da escada e as pontas da rampa entram com o hostId do elemento', () => {
    const { project, stairId, rampId } = setup();
    const g = componentSnapGeometry(project, 'lv_0');
    // A escada válida entra pela geometria resolvida: cantos dos degraus, da pegada e pontas dos espelhos.
    expect(g.points).toContainEqual({ ...v(1, 0.5), hostId: stairId, kind: 'endpoint' });
    expect(g.points).toContainEqual({ ...v(3, -0.5), hostId: stairId, kind: 'endpoint' });
    // A rampa sem bordas válidas cai no croqui: as pontas do lance continuam na captura.
    expect(g.points).toContainEqual({ ...v(10, 0.5), hostId: rampId, kind: 'endpoint' });
    expect(g.points).toContainEqual({ ...v(14, -0.5), hostId: rampId, kind: 'endpoint' });
    // A escada resolvida também dá meio das arestas e centro dos degraus; a rampa do croqui só tem as pontas.
    expect(new Set(g.points.filter((q) => q.hostId === stairId).map((q) => q.kind))).toEqual(new Set(['endpoint', 'midpoint', 'center']));
    expect(g.points.filter((q) => q.hostId === rampId).every((q) => q.kind === 'endpoint')).toBe(true);
  });

  it('as arestas resolvidas viram "nearest" com o hostId do elemento', () => {
    const { project, stairId, rampId } = setup();
    const g = componentSnapGeometry(project, 'lv_0');
    const stair = g.segments.filter((s) => s.hostId === stairId);
    const ramp = g.segments.filter((s) => s.hostId === rampId);
    expect(stair.every((s) => s.kind === 'nearest')).toBe(true);
    expect(ramp.every((s) => s.kind === 'nearest')).toBe(true);
    // Aresta do degrau (borda da pegada) e espelho aparado no limite do lance.
    expect(stair).toContainEqual({ a: v(2, 0.5), b: v(1, 0.5), hostId: stairId, kind: 'nearest' });
    expect(stair).toContainEqual({ a: v(2, -0.5), b: v(2, 0.5), hostId: stairId, kind: 'nearest' });
    expect(ramp).toContainEqual({ a: v(10, 0.5), b: v(14, 0.5), hostId: rampId, kind: 'nearest' });
  });

  it('o motor captura o canto da escada como endpoint e o ponto sobre a aresta da rampa como nearest', () => {
    const { project, stairId, rampId } = setup();
    const g = componentSnapGeometry(project, 'lv_0');
    const context = { extraPoints: g.points, extraSegments: g.segments };

    const corner = at(project, 1.01, 0.49, context);
    expect(corner.kind).toBe('endpoint');
    expect(corner.hostId).toBe(stairId);
    expect(dist(corner.point, v(1, 0.5))).toBeLessThan(1e-9);

    const edge = at(project, 10.37, 0.507, context);
    expect(edge.kind).toBe('nearest');
    expect(edge.hostId).toBe(rampId);
    expect(dist(edge.point, v(10.37, 0.5))).toBeLessThan(1e-9);
  });

  it('ignore com o hostId remove o próprio elemento da captura (como ao mover a escada)', () => {
    const { project, stairId } = setup();
    const g = componentSnapGeometry(project, 'lv_0');
    // Sem alinhamento: a referência da rampa, longe do cursor em x mas na mesma altura, não mascara o resultado.
    const context = { extraPoints: g.points, extraSegments: g.segments, snap: { ...DEFAULT_SNAP, alignment: false } };

    expect(at(project, 1.01, 0.49, context).kind).toBe('endpoint');
    const semEscada = at(project, 1.01, 0.49, { ...context, ignore: new Set([stairId]) });
    expect(semEscada.kind).toBe('none');
    expect(semEscada.hostId).toBeUndefined();
  });

  it('deduplica pontos idênticos das curvas que se encontram no mesmo elemento', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st_pat', typeId: 'stt_monolitica', levelId: 'lv_0', components: [landing('p1', 0, 0)] }) });
    const g = componentSnapGeometry(ctx.store.project, 'lv_0');
    const points = g.points.filter((q) => q.hostId === 'st_pat');
    // O patamar tem 4 curvas e 8 pontas; as pontas compartilhadas viram 4 referências.
    expect(points).toHaveLength(4);
    expect(new Set(points.map((q) => `${q.x.toFixed(6)},${q.y.toFixed(6)}`)).size).toBe(4);
    expect(g.segments.filter((s) => s.hostId === 'st_pat')).toHaveLength(4);
  });

  it('a captura global do base soma escadas e rampas e respeita o elemento oculto na vista', () => {
    const { project, stairId, rampId, env: base } = setup();
    // Sem alinhamento: a referência da rampa não mascara a ausência do canto oculto.
    base.options().snap = { ...DEFAULT_SNAP, alignment: false };
    const hidden = new Set([stairId]);
    const env = { ...base, project: () => project, hiddenInView: () => hidden };
    const probe = new Probe(env);
    probe.start();

    const noCantoOculto = probe.probe(pointer(0.01, 0.49));
    expect(noCantoOculto.kind).toBe('none');
    const noCantoVisivel = probe.probe(pointer(10.01, 0.49));
    expect(noCantoVisivel.kind).toBe('endpoint');
    expect(noCantoVisivel.hostId).toBe(rampId);
  });
});
