import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateLShape, servicoGuardaCorpo, type LinhaVistaGC } from '@hestia/engine';
import { dist, type Vec2 } from '@hestia/geom';
import {
  DEFAULT_STAIR_TYPES,
  defaultStairTypeId,
  dimensionPoints,
  levelDimensions,
  makeGuardaCorpo,
  makeStair,
  wallsOnLevel,
  type HospedeiroManual,
  type Id,
  type Project,
  type StairCurve,
  type StairRun,
  type StairType,
} from '@hestia/model';
import { ToolBase } from './base.ts';
import { drivenEditCommands } from './dims/driven.ts';
import { planStairRunFree } from './stairRunPlan.ts';
import { clickAt, drawWall, makeEnv, P, tool } from './testEnv.ts';
import type { Inference, PointerInfo } from './types.ts';

/**
 * Captura de planta (snap) de escada e guarda-corpo, pelo MESMO motor das paredes (`ToolBase.ctx` -> `infer`): cada tipo de
 * ponto esperado aparece, sem repetição, com a mesma ordem de prioridade; e a cota/medida que se prende a esses pontos
 * acompanha o elemento ao mover e ao editar.
 */
afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
const near = (a: Vec2, b: Vec2, tol = 1e-6): void => expect(dist(a, b)).toBeLessThan(tol);

/** Lance reto de `n` espelhos com passo 0,28 m e largura `w` (x de 0 a (n-1)·0,28; y = ±w/2). */
function reta(n: number, w = 1.2): StairRun {
  const xs = Array.from({ length: n }, (_, k) => k * 0.28);
  const b = (n - 1) * 0.28 + 0.5;
  return { id: 'run', kind: 'run', boundaryLeft: [ln(v(-0.5, w / 2), v(b, w / 2))], boundaryRight: [ln(v(-0.5, -w / 2), v(b, -w / 2))], risers: xs.map((x) => ln(v(x, -1), v(x, 1))), path: [] };
}

const FIN_ON = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;

/** Ferramenta mínima para exercitar a captura global montada em `ToolBase.ctx`. */
class Probe extends ToolBase {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly hint = '';
  protected reset(): void {}
  protected busy(): boolean {
    return false;
  }
  probe(p: PointerInfo, from?: Vec2, cycle?: number): Inference {
    return this.snap(p, { ...(from ? { from } : {}), ...(cycle !== undefined ? { cycle } : {}) });
  }
}

const ptr = (x: number, y: number): PointerInfo => P(x, y);

interface Cena {
  ctx: ReturnType<typeof makeEnv>;
  probe: Probe;
  /** Captura no ponto (com 1 mm de folga para não coincidir exatamente). */
  at: (x: number, y: number, from?: Vec2) => Inference;
}

/** Tolerância de 5 mm: os elementos têm detalhes de 1 e 2 cm (faixa do espelho e bocel). */
function cena(opts: { acabamento?: boolean; hospedado?: boolean; manual?: HospedeiroManual | null } = {}): Cena {
  const ctx = makeEnv();
  ctx.env.metersPerPixel = () => 0.0005;
  let typeId = defaultStairTypeId;
  if (opts.acabamento) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    ctx.store.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, ...FIN_ON } as StairType });
  }
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [reta(5)] }) });
  if (opts.manual) ctx.store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_m', levelId: 'lv_0', typeId: Object.keys(ctx.store.project.tiposGuardaCorpo)[0]!, hospedeiro: opts.manual }) });
  if (opts.hospedado) {
    const lado = { lance: true, patamar: true };
    ctx.store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_h', levelId: 'lv_0', typeId: Object.keys(ctx.store.project.tiposGuardaCorpo)[0]!, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  }
  const probe = new Probe(ctx.env);
  probe.start();
  return { ctx, probe, at: (x, y, from) => probe.probe(ptr(x + 0.001, y - 0.001), from) };
}

/** Linhas de planta do kernel (substituídas): dois postes, um corrimão, um balaústre e o eixo, na altura `y` do eixo. */
function linhasDoKernel(gid: Id, y: number, x0 = 0, x1 = 4): LinhaVistaGC[] {
  const rect = (a: number, b: number, h: number): Vec2[] => [v(a, y - h), v(b, y - h), v(b, y + h), v(a, y + h)];
  return [
    { guardaId: gid, papel: 0, estilo: 0, pontos: rect(x0, x0 + 0.1, 0.05) },
    { guardaId: gid, papel: 0, estilo: 0, pontos: rect(x1 - 0.1, x1, 0.05) },
    { guardaId: gid, papel: 3, estilo: 1, pontos: rect(x0, x1, 0.03) },
    { guardaId: gid, papel: 1, estilo: 0, pontos: rect(x0 + 1, x0 + 1.02, 0.01) },
    { guardaId: gid, papel: 255, estilo: 1, pontos: [v(x0, y), v(x1, y)] },
  ];
}

/** O kernel de verdade devolve a MESMA lista enquanto a cena não muda; o mock também (por projeto), senão o cache por linhas nunca vale. */
function mockKernel(linhas: (p: Project) => LinhaVistaGC[]): void {
  const srv = servicoGuardaCorpo();
  const memo = new WeakMap<Project, LinhaVistaGC[]>();
  vi.spyOn(srv, 'pronto').mockImplementation(() => true);
  vi.spyOn(srv, 'planta').mockImplementation((p) => {
    let l = memo.get(p);
    if (!l) memo.set(p, (l = linhas(p)));
    return l;
  });
}

const manual = (caminho: Vec2[], fechado = false): HospedeiroManual => ({ tipo: 'manual', uso: 'varanda', caminho: caminho.map((q) => ({ x: q.x, y: q.y, dz: 0 })), fechado, ladoDeslocamento: 'esquerdo' });

describe('escada: snaps de planta', () => {
  it('canto do degrau, meio da aresta, centro do degrau e ponto sobre a aresta', () => {
    const { at } = cena();
    // Degrau 2 ocupa x de 0,28 a 0,56 e y de -0,6 a 0,6.
    const canto = at(0.28, 0.6);
    expect(canto.kind).toBe('endpoint');
    expect(canto.hostId).toBe('st1');
    near(canto.point, v(0.28, 0.6));
    const meio = at(0.42, 0.6);
    expect(meio.kind).toBe('midpoint');
    near(meio.point, v(0.42, 0.6));
    const centro = at(0.42, 0.2);
    // Fora do eixo: o centro do degrau é (0,42; 0) e não captura a 20 cm dele.
    expect(centro.point.y).not.toBeCloseTo(0, 3);
    const c = at(0.42, 0);
    expect(['center', 'midpoint']).toContain(c.kind);
    near(c.point, v(0.42, 0));
    const aresta = at(0.5, 0.6);
    expect(aresta.kind).toBe('nearest');
    near(aresta.point, v(0.5, 0.6), 1e-3);
  });

  it('o centro do degrau é captura própria (center), mesmo com o eixo da subida passando por ali', () => {
    const { ctx } = cena();
    // O centro do degrau 2 coincide com o meio do eixo; o motor oferece os dois tipos e o Tab os percorre sem repetir.
    const probe = new Probe(ctx.env);
    probe.start();
    const kinds = new Set<string>();
    for (let i = 0; i < 6; i++) kinds.add(probe.probe(ptr(0.42, 0), undefined, i).kind);
    expect(kinds.has('center')).toBe(true);
  });

  it('contorno, espelhos, patamar e chegada: canto da chegada e do contorno externo', () => {
    const { at } = cena();
    // A chegada (último degrau) fecha em x = 1,4.
    const chegada = at(1.4, 0.6);
    expect(chegada.kind).toBe('endpoint');
    near(chegada.point, v(1.4, 0.6));
    const contorno = at(0.28, 0.6);
    expect(contorno.hostId).toBe('st1');
  });

  it('sem acabamento não existe face de piso, bocel nem faixa de espelho', () => {
    const { at } = cena();
    // x = -0,02 seria a frente do bocel, e 0,01 a faixa do espelho: sem acabamento nada captura ali (só o ponto livre).
    expect(at(-0.02, 0.6).kind === 'endpoint' && dist(at(-0.02, 0.6).point, v(-0.02, 0.6)) < 1e-6).toBe(false);
    expect(at(0.01, 0.6).kind === 'endpoint' && dist(at(0.01, 0.6).point, v(0.01, 0.6)) < 1e-6).toBe(false);
  });

  it('com acabamento: frente do bocel, face acabada do espelho e do piso são pontos próprios', () => {
    const { at } = cena({ acabamento: true });
    const bocel = at(-0.02, 0.6);
    expect(bocel.kind).toBe('endpoint');
    near(bocel.point, v(-0.02, 0.6));
    const faixa = at(0.01, 0.6);
    expect(faixa.kind).toBe('endpoint');
    near(faixa.point, v(0.01, 0.6));
    // Meio da aresta lateral do bocel (x = -0,01) e meio da face acabada do espelho (0,01; 0).
    const meioBocel = at(-0.01, 0.6);
    expect(['midpoint', 'nearest']).toContain(meioBocel.kind);
    const piso = at(0.29, 0.6);
    expect(piso.kind).toBe('endpoint');
    near(piso.point, v(0.29, 0.6));
  });

  it('escada em L: cantos do patamar e do contorno', () => {
    const ctx = makeEnv();
    ctx.env.metersPerPixel = () => 0.0005;
    const partes = generateLShape({ start: v(0, 0), dir: v(0, 1), width: 1, tread: 0.28, turn: 'left', risersFirst: 6, risersSecond: 6 });
    ctx.store.exec({
      type: 'addStair',
      stair: makeStair({
        id: 'st_l',
        typeId: defaultStairTypeId,
        levelId: 'lv_0',
        topOffset: -0.2,
        height: 2.8,
        components: partes.map((c, i) => (c.kind === 'run' ? { id: `r${i}`, kind: 'run' as const, ...c.run } : { id: `p${i}`, kind: 'landing' as const, boundary: c.landing.boundary })),
      }),
    });
    const probe = new Probe(ctx.env);
    probe.start();
    const g = ctx.store.project.elements['st_l'];
    expect(g?.kind).toBe('stair');
    const lands = (ctx.store.project.elements['st_l'] as { components: Array<{ kind: string; boundary?: StairCurve[] }> }).components.filter((c) => c.kind === 'landing');
    expect(lands.length).toBeGreaterThan(0);
    const canto = lands[0]!.boundary![0]!.a;
    const r = probe.probe(ptr(canto.x + 0.001, canto.y - 0.001));
    expect(r.kind).toBe('endpoint');
    expect(r.hostId).toBe('st_l');
    near(r.point, canto);
  });

  it('escada livre: degraus gerados pelo traçado livre também capturam cantos e meios', () => {
    const ctx = makeEnv();
    ctx.env.metersPerPixel = () => 0.0005;
    const type = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    const r = planStairRunFree({ path: [v(0, 0), v(3, 0), v(3, 2)], H: 2.8, type, options: { shape: 'free', width: 1.0, turn: 'left' } });
    if ('error' in r) throw new Error(r.error);
    ctx.store.exec({
      type: 'addStair',
      stair: makeStair({
        id: 'st_f',
        typeId: defaultStairTypeId,
        levelId: 'lv_0',
        topOffset: -0.2,
        height: 2.8,
        components: r.parts.map((c, i) => (c.kind === 'run' ? { id: `r${i}`, kind: 'run' as const, ...c.run } : { id: `p${i}`, kind: 'landing' as const, boundary: c.landing.boundary })),
      }),
    });
    const probe = new Probe(ctx.env);
    probe.start();
    const first = (ctx.store.project.elements['st_f'] as { components: Array<{ kind: string; boundaryLeft?: StairCurve[]; boundary?: StairCurve[] }> }).components[0]!;
    const canto = first.boundaryLeft![0]!.a;
    const rr = probe.probe(ptr(canto.x + 0.001, canto.y - 0.001));
    expect(rr.hostId).toBe('st_f');
    expect(rr.kind).toBe('endpoint');
    near(rr.point, canto);
  });
});

describe('guarda-corpo: snaps de planta', () => {
  it('manual, sem o kernel: extremidades e vértices do caminho, meio de cada trecho e pé sobre o eixo', () => {
    const { at } = cena({ manual: manual([v(0, 5), v(4, 5), v(4, 8)]) });
    expect(at(0, 5).kind).toBe('endpoint');
    near(at(0, 5).point, v(0, 5));
    expect(at(4, 5).kind).toBe('endpoint'); // vértice do caminho
    const meio1 = at(2, 5);
    expect(meio1.kind).toBe('midpoint');
    near(meio1.point, v(2, 5));
    near(at(4, 6.5).point, v(4, 6.5));
    expect(at(4, 6.5).kind).toBe('midpoint');
    const sobre = at(1.2, 5);
    expect(sobre.kind).toBe('nearest');
    expect(sobre.hostId).toBe('gc_m');
    near(sobre.point, v(1.2, 5), 1e-3);
  });

  it('perpendicular a partir do ponto anterior cai no eixo do guarda-corpo', () => {
    const { ctx } = cena({ manual: manual([v(0, 5), v(4, 5)]) });
    const probe = new Probe(ctx.env);
    probe.start();
    const r = probe.probe(ptr(1.3, 5.002), v(1.3, 7));
    expect(r.kind).toBe('perpendicular');
    near(r.point, v(1.3, 5), 1e-6);
  });

  it('com o kernel: centro e cantos dos postes, bordas do corrimão e pé sobre elas; balaústre não entra', () => {
    mockKernel(() => linhasDoKernel('gc_m', 5));
    const { at } = cena({ manual: manual([v(0, 5), v(4, 5)]) });
    const centro = at(0.05, 5);
    expect(centro.kind).toBe('center'); // centro do poste de início
    expect(centro.hostId).toBe('gc_m');
    near(centro.point, v(0.05, 5));
    const canto = at(0.1, 5.05);
    expect(canto.kind).toBe('endpoint');
    near(canto.point, v(0.1, 5.05));
    const fimCanto = at(4, 4.95);
    expect(fimCanto.kind).toBe('endpoint');
    // Borda do corrimão (y = 5,03): o meio da borda e o pé sobre ela.
    const meioBorda = at(2, 5.03);
    expect(['midpoint', 'nearest']).toContain(meioBorda.kind);
    near(meioBorda.point, v(2, 5.03), 1e-3);
    const pe = at(1.2, 5.03);
    expect(pe.kind).toBe('nearest');
    near(pe.point, v(1.2, 5.03), 1e-3);
    // Balaústre (x de 1,00 a 1,02): o canto dele não é captura.
    const bal = at(1.02, 5.01);
    expect(bal.kind === 'endpoint' && dist(bal.point, v(1.02, 5.01)) < 1e-6).toBe(false);
  });

  it('hospedado em escada: as peças e o eixo do kernel viram captura, com o dono do guarda-corpo', () => {
    mockKernel(() => linhasDoKernel('gc_h', 0.6, 0, 1.4));
    const { at } = cena({ hospedado: true });
    const centro = at(0.05, 0.6);
    expect(centro.kind).toBe('center');
    expect(centro.hostId).toBe('gc_h');
    const meioEixo = at(0.7, 0.6);
    expect(['midpoint', 'nearest']).toContain(meioEixo.kind);
  });

  it('cruzamento do eixo do guarda-corpo com a aresta de um degrau é interseção', () => {
    const { at } = cena({ manual: manual([v(0.35, 0.2), v(0.35, 1.5)]) });
    const r = at(0.35, 0.6);
    expect(r.kind).toBe('intersection');
    near(r.point, v(0.35, 0.6));
  });
});

describe('prioridade e ausência de repetição (como as paredes)', () => {
  it('endpoint vence midpoint, que vence nearest, na mesma aresta de escada e na da parede', () => {
    const { ctx, probe } = cena();
    drawWall(ctx.env, [0, -3], [4, -3]);
    expect(wallsOnLevel(ctx.store.project, 'lv_0')).toHaveLength(1);
    // Perto da ponta da aresta: endpoint; perto do meio: midpoint; no resto: nearest. Igual para a parede (que não tem nearest em y livre).
    expect(probe.probe(ptr(0.284, 0.598)).kind).toBe('endpoint');
    expect(probe.probe(ptr(0.422, 0.599)).kind).toBe('midpoint');
    expect(probe.probe(ptr(0.5, 0.598)).kind).toBe('nearest');
    expect(probe.probe(ptr(0.004, -2.998)).kind).toBe('endpoint');
    expect(probe.probe(ptr(2.002, -2.999)).kind).toBe('midpoint');
  });

  it('o Tab percorre os candidatos sem repetir (tipo, ponto)', () => {
    const { ctx } = cena({ acabamento: true });
    const probe = new Probe(ctx.env);
    probe.start();
    for (const [x, y] of [[0.28, 0.6], [0.01, 0.6], [0, 0], [0.42, 0]] as const) {
      const vistos = new Set<string>();
      let voltou = false;
      for (let i = 0; i < 12 && !voltou; i++) {
        const r = probe.probe(ptr(x, y), undefined, i);
        const k = `${r.kind}|${r.point.x.toFixed(6)},${r.point.y.toFixed(6)}`;
        if (vistos.has(k)) voltou = true;
        vistos.add(k);
      }
      expect(voltou, `Tab em (${x}, ${y}) tem de fechar o ciclo`).toBe(true);
    }
  });

  it('o elemento em `ignore` (o que está sendo movido) some da captura', () => {
    const { ctx } = cena({ manual: manual([v(0, 5), v(4, 5)]) });
    const env = { ...ctx.env, hiddenInView: () => new Set(['st1', 'gc_m']) };
    const probe = new Probe(env);
    probe.start();
    const r = probe.probe(ptr(0.28, 0.6));
    expect(r.hostId).toBeUndefined();
    expect(probe.probe(ptr(2, 5)).hostId).toBeUndefined();
  });
});

describe('cota e Medir presas a pontos da escada e do guarda-corpo', () => {
  /** Cria uma cota linear pela ferramenta Cota: dois pontos e o lado. */
  function cotar(ctx: ReturnType<typeof makeEnv>, a: Vec2, b: Vec2): void {
    // Alinhada: horizontal e vertical projetariam as pontas e esconderiam o deslocamento que o teste quer ver.
    ctx.options.dimensionMode = 'aligned';
    const t = tool('dimension', ctx.env);
    clickAt(t, a.x, a.y);
    clickAt(t, b.x, b.y);
    // O lado da linha de cota: um ponto fora da reta que une as pontas, qualquer que seja a direção dela.
    clickAt(t, (a.x + b.x) / 2 + (a.y - b.y) * 0.3 + 0.7, (a.y + b.y) / 2 + (b.x - a.x) * 0.3 + 0.7);
  }
  const dim = (ctx: ReturnType<typeof makeEnv>) => levelDimensions(ctx.store.project, 'lv_0')[0]!;

  it('ponto do degrau e ponto do guarda-corpo: a cota grava referências e acompanha ao mover a escada', () => {
    const { ctx } = cena({ acabamento: true, manual: manual([v(0, 5), v(4, 5)]) });
    cotar(ctx, v(0.28, 0.6), v(0, 5));
    const d = dim(ctx);
    expect(d.refs?.a).toMatchObject({ elementId: 'st1', feature: 'part' });
    expect(d.refs?.b).toMatchObject({ elementId: 'gc_m', feature: 'part' });
    const antes = dimensionPoints(ctx.store.project, d);
    near(antes.a, v(0.28, 0.6));
    near(antes.b, v(0, 5));
    // Mover a escada (comando genérico `transform`): a ponta do degrau vai junto, a do guarda-corpo fica.
    ctx.store.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: v(3, 1) } });
    const depois = dimensionPoints(ctx.store.project, dim(ctx));
    near(depois.a, v(3.28, 1.6));
    near(depois.b, v(0, 5));
    // E o guarda-corpo manual leva a ponta dele.
    ctx.store.exec({ type: 'transform', ids: ['gc_m'], transform: { kind: 'translate', d: v(-2, 0.5) } });
    near(dimensionPoints(ctx.store.project, dim(ctx)).b, v(-2, 5.5));
  });

  it('ponto do acabamento (bocel e faixa do espelho) também fica preso e segue a escada', () => {
    const { ctx } = cena({ acabamento: true });
    cotar(ctx, v(-0.02, 0.6), v(0.01, 0.6));
    const d = dim(ctx);
    expect(d.refs?.a).toMatchObject({ elementId: 'st1', feature: 'part' });
    expect(d.refs?.b).toMatchObject({ elementId: 'st1', feature: 'part' });
    ctx.store.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'rotate', about: v(0, 0), angle: Math.PI / 2 } });
    const pts = dimensionPoints(ctx.store.project, dim(ctx));
    near(pts.a, v(-0.6, -0.02));
    near(pts.b, v(-0.6, 0.01));
  });

  it('editar a escada atualiza a cota: lance mais largo leva o canto do degrau', () => {
    const { ctx } = cena();
    cotar(ctx, v(0.28, 0.6), v(0.28, -0.6));
    near(dimensionPoints(ctx.store.project, dim(ctx)).a, v(0.28, 0.6));
    ctx.store.exec({ type: 'updateElements', ids: ['st1'], patch: { components: [{ ...reta(5, 2), id: 'r1' }] } });
    const p = dimensionPoints(ctx.store.project, dim(ctx));
    near(p.a, v(0.28, 1));
    near(p.b, v(0.28, -1));
  });

  it('editar o guarda-corpo atualiza a cota: o vértice do caminho que mudou', () => {
    const { ctx } = cena({ manual: manual([v(0, 5), v(4, 5)]) });
    cotar(ctx, v(4, 5), v(0.28, 0.6));
    ctx.store.exec({ type: 'updateGuardaCorpo', id: 'gc_m', patch: { hospedeiro: manual([v(0, 5), v(6, 5)]) } });
    near(dimensionPoints(ctx.store.project, dim(ctx)).a, v(6, 5));
  });

  it('guarda-corpo hospedado segue a escada: mover a escada leva a cota presa ao poste', () => {
    let dx = 0;
    mockKernel((p) => {
      const s = p.elements['st1'];
      dx = s?.kind === 'stair' ? ((s.components[0] as StairRun).risers[0]!.a.x) : 0;
      return linhasDoKernel('gc_h', 0.6 + 0, dx, dx + 1.4);
    });
    const { ctx } = cena({ hospedado: true });
    cotar(ctx, v(0.05, 0.6), v(0.28, -0.6));
    const d = dim(ctx);
    expect(d.refs?.a).toMatchObject({ elementId: 'gc_h', feature: 'part' });
    ctx.store.exec({ type: 'transform', ids: ['st1'], transform: { kind: 'translate', d: v(2, 0) } });
    near(dimensionPoints(ctx.store.project, dim(ctx)).b, v(2.28, -0.6));
    expect(dx).toBeCloseTo(2, 9);
    near(dimensionPoints(ctx.store.project, dim(ctx)).a, v(2.05, 0.6));
  });

  it('chave que sumiu na edição: a cota guarda o último ponto, sem quebrar', () => {
    const { ctx } = cena();
    cotar(ctx, v(1.12, 0.6), v(0, 0.6)); // degrau 4 e canto do degrau 1
    expect(dim(ctx).refs?.a).toMatchObject({ feature: 'part' });
    ctx.store.exec({ type: 'updateElements', ids: ['st1'], patch: { components: [{ ...reta(3), id: 'r1' }] } });
    const p = dimensionPoints(ctx.store.project, dim(ctx));
    near(p.a, v(1.12, 0.6));
  });

  it('editar o valor da cota presa a ponto de apoio é recusado com o motivo e não altera nada', () => {
    const { ctx } = cena({ manual: manual([v(0, 5), v(4, 5)]) });
    cotar(ctx, v(0.28, 0.6), v(0, 5));
    const antes = JSON.stringify(ctx.store.project.elements);
    const r = drivenEditCommands(ctx.store.project, dim(ctx), 6);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/ainda não move/);
    expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
  });

  it('Medir captura os mesmos pontos (degrau, bocel, poste e eixo do guarda-corpo)', () => {
    mockKernel(() => linhasDoKernel('gc_m', 5));
    const { ctx } = cena({ acabamento: true, manual: manual([v(0, 5), v(4, 5)]) });
    const m = tool('measure', ctx.env);
    const casos: Array<[Vec2, string]> = [[v(0.28, 0.6), 'endpoint'], [v(-0.02, 0.6), 'endpoint'], [v(0.05, 5), 'center'], [v(2, 5), 'midpoint']];
    for (const [q, kind] of casos) {
      m.move(P(q.x + 0.001, q.y - 0.001));
      const inf = (m as unknown as { inference(): Inference }).inference();
      expect(inf.kind, `Medir em (${q.x}, ${q.y})`).toBe(kind);
      near(inf.point, q);
    }
    // Medir entre o canto de um degrau e o centro de um poste dá a distância certa.
    clickAt(m, 0.28, 0.6);
    clickAt(m, 0.05, 5);
    expect(m.preview().some((i) => i.kind === 'label')).toBe(true);
  });

  it('desenho de parede para fora: o ponto do degrau e do guarda-corpo servem de base ao traçado', () => {
    mockKernel(() => linhasDoKernel('gc_m', 5));
    const { ctx } = cena({ acabamento: true, manual: manual([v(0, 5), v(4, 5)]) });
    const w = tool('wall', ctx.env);
    clickAt(w, 6, 0);
    w.move(P(0.281, 0.599));
    expect((w as unknown as { inference(): Inference }).inference().kind).toBe('endpoint');
    w.move(P(0.051, 5.001));
    expect((w as unknown as { inference(): Inference }).inference().kind).toBe('center');
    w.move(P(2.001, 4.999));
    expect((w as unknown as { inference(): Inference }).inference().kind).toBe('midpoint');
  });
});

describe('desempenho: modelo com 100 escadas e 100 guarda-corpos', () => {
  /** Grade de 10 × 10 escadas com acabamento, cada uma com um guarda-corpo manual ao lado (mesmas linhas do kernel, substituídas). */
  function modeloGrande() {
    const ctx = makeEnv();
    ctx.env.metersPerPixel = () => 0.01;
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    ctx.store.exec({ type: 'upsertStairType', stairType: { ...base, id: 'stt_acab', ...FIN_ON } as StairType });
    const tipoGc = Object.keys(ctx.store.project.tiposGuardaCorpo)[0]!;
    const ids: Id[] = [];
    ctx.store.transaction('modelo', () => {
      for (let i = 0; i < 100; i++) {
        const dx = (i % 10) * 12;
        const dy = Math.floor(i / 10) * 8;
        const comps = [reta(17)].map((c) => ({
          ...c,
          boundaryLeft: c.boundaryLeft.map((q) => ln(v(q.a.x + dx, q.a.y + dy), v(q.b.x + dx, q.b.y + dy))),
          boundaryRight: c.boundaryRight.map((q) => ln(v(q.a.x + dx, q.a.y + dy), v(q.b.x + dx, q.b.y + dy))),
          risers: c.risers.map((q) => ln(v(q.a.x + dx, q.a.y + dy), v(q.b.x + dx, q.b.y + dy))),
        }));
        ctx.env.exec({ type: 'addStair', stair: makeStair({ id: `st${i}`, typeId: 'stt_acab', levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: comps }) });
        ctx.env.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: `gc${i}`, levelId: 'lv_0', typeId: tipoGc, hospedeiro: manual([v(dx, dy + 3), v(dx + 5, dy + 3)]) }) });
        ids.push(`gc${i}`);
      }
    });
    mockKernel(() => ids.flatMap((id, i) => linhasDoKernel(id, (Math.floor(i / 10) * 8) + 3, (i % 10) * 12, (i % 10) * 12 + 5)));
    const probe = new Probe(ctx.env);
    probe.start();
    return { ctx, probe };
  }

  it('consulta de captura em poucos ms, com cache quente e depois de uma edição', () => {
    const { ctx, probe } = modeloGrande();
    const consultas = (n: number): number => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) probe.probe(ptr(0.3 + (i % 7) * 0.1, 0.5 + (i % 5) * 0.2));
      return (performance.now() - t0) / n;
    };
    const frio = (() => {
      const t0 = performance.now();
      probe.probe(ptr(0.3, 0.5));
      return performance.now() - t0;
    })();
    const quente = consultas(100);
    // Uma edição de um elemento cria outro projeto: o que não mudou (99 escadas, os guarda-corpos) reaproveita o cálculo.
    ctx.store.exec({ type: 'transform', ids: ['st0'], transform: { kind: 'translate', d: v(0.5, 0) } });
    const t0 = performance.now();
    probe.probe(ptr(0.3, 0.5));
    const aposEdicao = performance.now() - t0;
    console.info(`desempenho do snap (100 escadas + 100 guarda-corpos): frio ${frio.toFixed(1)} ms, quente ${quente.toFixed(2)} ms, 1ª após edição ${aposEdicao.toFixed(1)} ms`);
    expect(quente).toBeLessThan(15);
    expect(aposEdicao).toBeLessThan(500);
  });
});
