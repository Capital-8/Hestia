import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeSection, generateLShape, generateUShape, servicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import { dist, type Vec2 } from '@hestia/geom';
import {
  DEFAULT_STAIR_TYPES,
  defaultStairTypeId,
  dimensionPoints,
  dimensionValue,
  levelDimensions,
  makeGuardaCorpo,
  makeSlab,
  makeStair,
  resolveDimRef,
  sectionAnnotationsOf,
  type Dimension,
  type Id,
  type Project,
  type StairCurve,
  type StairRun,
  type StairType,
} from '@hestia/model';
import { createTool } from './index.ts';
import { planStairRunFree } from './stairRunPlan.ts';
import { sectionDimRefAt, resolveSectionDimRef } from './sectionDimRefs.ts';
import { sectionInferContext } from './sectionContext.ts';
import { sectionSnapIndexDoProjeto } from './sectionSnapComGuardaCorpo.ts';
import { clickAt, drawWall, makeEnv, P, tool } from './testEnv.ts';
import type { SectionToolContext, Tool } from './types.ts';

/**
 * Cota: o fluxo é SEMPRE ponto 1, ponto 2 e clique da posição final (afastamento). A cota só nasce depois desse último
 * clique, em qualquer vista (planta, corte, elevação), em qualquer elemento (escada reta, L, U, livre, com e sem
 * acabamento, guarda-corpo, parede, laje) e por qualquer entrada (dois cliques, Orto, Polar, comprimento digitado, Tab, Enter,
 * duplo clique, modos horizontal/vertical/alinhada, sequência). Esc cancela sem criar. O valor medido bate com a distância
 * real dos pontos e as ligações `part` (planta) e `secRefs` (corte) apontam para o ponto certo.
 */
afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
const near = (a: Vec2, b: Vec2, tol = 1e-6): void => expect(dist(a, b)).toBeLessThan(tol);

/** Lance reto de `n` espelhos com passo 0,28 m e largura 1,2 (x de 0 a (n-1)·0,28; y = ±0,6). */
function reta(n: number, w = 1.2): StairRun {
  const xs = Array.from({ length: n }, (_, k) => k * 0.28);
  const b = (n - 1) * 0.28 + 0.5;
  return { id: 'run', kind: 'run', boundaryLeft: [ln(v(-0.5, w / 2), v(b, w / 2))], boundaryRight: [ln(v(-0.5, -w / 2), v(b, -w / 2))], risers: xs.map((x) => ln(v(x, -1), v(x, 1))), path: [] };
}
const FIN_ON = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;

type Forma = 'reta' | 'L' | 'U' | 'livre';
type Comp = NonNullable<Parameters<typeof makeStair>[0]['components']>;
type Parte = { kind: 'run'; run: Omit<StairRun, 'id' | 'kind'> } | { kind: 'landing'; landing: { boundary: StairCurve[] } };
const comps = (partes: readonly Parte[]): Comp => partes.map((c, i) => (c.kind === 'run' ? { id: `r${i}`, kind: 'run' as const, ...c.run } : { id: `p${i}`, kind: 'landing' as const, boundary: c.landing.boundary })) as Comp;

function componentesDa(forma: Forma): Comp {
  if (forma === 'reta') return [reta(5)];
  if (forma === 'L') return comps(generateLShape({ start: v(0, 0), dir: v(0, 1), width: 1, tread: 0.28, turn: 'left', risersFirst: 6, risersSecond: 6 }) as Parte[]);
  if (forma === 'U') return comps(generateUShape({ start: v(0, 0), dir: v(0, 1), width: 1, tread: 0.28, turn: 'left', risersFirst: 6, risersSecond: 6 }) as Parte[]);
  const type = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
  const r = planStairRunFree({ path: [v(0, 0), v(3, 0), v(3, 2)], H: 2.8, type, options: { shape: 'free', width: 1.0, turn: 'left' } });
  if ('error' in r) throw new Error(r.error);
  return comps(r.parts as Parte[]);
}

/** Linhas de planta e corte do kernel do guarda-corpo (substituído por um mock: sem WASM nos testes). */
function linhasDoKernel(gid: Id, y: number, x0: number, x1: number): LinhaVistaGC[] {
  const rect = (a: number, b: number, h: number): Vec2[] => [v(a, y - h), v(b, y - h), v(b, y + h), v(a, y + h)];
  return [
    { guardaId: gid, papel: 0, estilo: 0, pontos: rect(x0, x0 + 0.1, 0.05) },
    { guardaId: gid, papel: 0, estilo: 0, pontos: rect(x1 - 0.1, x1, 0.05) },
    { guardaId: gid, papel: 3, estilo: 1, pontos: rect(x0, x1, 0.03) },
    { guardaId: gid, papel: 255, estilo: 1, pontos: [v(x0, y), v(x1, y)] },
  ];
}
function mockKernel(linhas: LinhaVistaGC[]): void {
  const srv = servicoGuardaCorpo();
  vi.spyOn(srv, 'pronto').mockImplementation(() => true);
  const memo = new WeakMap<Project, LinhaVistaGC[]>();
  vi.spyOn(srv, 'planta').mockImplementation((p) => {
    let l = memo.get(p);
    if (!l) memo.set(p, (l = linhas));
    return l;
  });
  const corte = { linhas, poligonos: [] as number[] };
  vi.spyOn(srv, 'corte').mockImplementation(() => corte as never);
}

type Vista = 'planta' | 'corte' | 'elevacao';
type Cena = ReturnType<typeof montar>;

interface Opcoes {
  vista: Vista;
  forma?: Forma;
  acabamento?: boolean;
  guardaCorpo?: boolean;
  parede?: boolean;
  laje?: boolean;
}

/** Projeto com o elemento pedido e a vista aberta (planta, corte longitudinal ou elevação em frente à escada). */
function montar(o: Opcoes) {
  const ctx = makeEnv();
  ctx.env.metersPerPixel = () => (o.vista === 'planta' ? 0.0005 : 0.002);
  let typeId = defaultStairTypeId;
  if (o.acabamento) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    ctx.store.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, ...FIN_ON } as StairType });
  }
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: componentesDa(o.forma ?? 'reta') }) });
  if (o.guardaCorpo) {
    const lado = { lance: true, patamar: true };
    ctx.store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_h', levelId: 'lv_0', typeId: Object.keys(ctx.store.project.tiposGuardaCorpo)[0]!, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
    mockKernel(linhasDoKernel('gc_h', 0.6, 0, 1.2));
  }
  if (o.parede) drawWall(ctx.env, [-2, 3], [4, 3]);
  if (o.laje) ctx.store.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [v(5, 5), v(8, 5), v(8, 7), v(5, 7)] }) });

  let secId: Id | null = null;
  let result: SectionResult | null = null;
  if (o.vista !== 'planta') {
    secId = 'v1';
    const [a, b, depth] = o.vista === 'corte' ? [v(-2, 0), v(6, 0), 3] as const : [v(-2, -3), v(6, -3), 6] as const;
    ctx.store.exec({ type: 'addView', view: { id: secId, name: o.vista, kind: o.vista === 'corte' ? 'section' : 'elevation', a, b, depth } });
    result = computeSection(ctx.store.project, { a, b, depth });
    const sec: SectionToolContext = {
      id: secId,
      annotations: () => sectionAnnotationsOf(ctx.store.project.views.find((x) => x.id === secId)),
      setAnnotations: () => {},
      inferContext: (extra = {}) => sectionInferContext(result!, ctx.store.project, 'lv_0', 0.002, 0.1, { line: { a, b, depth } }, extra),
      result: () => result!,
    };
    ctx.env.section = () => sec;
  }
  const dims = (): Dimension[] => (secId ? sectionAnnotationsOf(ctx.store.project.views.find((x) => x.id === secId)).dimensions : levelDimensions(ctx.store.project, 'lv_0'));
  const indice = () => sectionSnapIndexDoProjeto(result!, ctx.store.project);
  return { ctx, vista: o.vista, dims, result: () => result, indice, project: () => ctx.store.project };
}

/** Pontos de captura (endpoint) de um elemento no índice do corte, ordenados por t e depois z. */
function pontosDoCorte(c: Cena, host: Id): Vec2[] {
  const pts = (c.indice().byHost.get(host)?.points ?? []).filter((p) => p.kind === 'endpoint').map((p) => v(p.x, p.y));
  return pts.sort((p, q) => p.x - q.x || p.y - q.y);
}

/** Posição final fora da linha de cota: ponto a `lado` metros da reta (A, B), na direção da normal esquerda de A→B. */
function posicao(a: Vec2, b: Vec2, lado: number): Vec2 {
  const l = dist(a, b);
  const n = v(-(b.y - a.y) / l, (b.x - a.x) / l);
  const m = v((a.x + b.x) / 2, (a.y + b.y) / 2);
  return v(m.x + n.x * lado, m.y + n.y * lado);
}

const nCotas = (c: Cena): number => c.dims().length;
const prompt = (t: Tool): string | null => t.inputPrompt!();

/** Três cliques com a verificação passo a passo: nada nasce antes do último. Devolve a cota criada. */
function cotarEmTresCliques(c: Cena, t: Tool, a: Vec2, b: Vec2, lado = 0.9): Dimension {
  const antes = nCotas(c);
  clickAt(t, a.x, a.y);
  expect(nCotas(c)).toBe(antes);
  clickAt(t, b.x, b.y);
  expect(nCotas(c)).toBe(antes);
  // Esperando a posição final: o campo digitável é o do afastamento e nenhuma cota dinâmica convertível aparece.
  expect(prompt(t)).toBe('Deslocamento');
  expect(t.tempDims!()).toEqual([]);
  clickAt(t, posicao(a, b, lado).x, posicao(a, b, lado).y);
  expect(nCotas(c)).toBe(antes + 1);
  expect(prompt(t)).toBeNull();
  return c.dims().at(-1)!;
}

/** O valor medido bate com a distância real entre as pontas efetivamente cotadas. */
function valorBate(c: Cena, d: Dimension, esperado?: number): void {
  const pts = dimensionPoints(c.project(), d);
  expect(Math.abs(dimensionValue(c.project(), d) - dist(pts.a, pts.b))).toBeLessThanOrEqual(0.0005 + 1e-9); // a leitura é arredondada ao mm
  if (esperado !== undefined) expect(Math.abs(dimensionValue(c.project(), d) - esperado)).toBeLessThanOrEqual(0.0005 + 1e-9);
}

/** A ponta está ligada ao elemento (parte de apoio `part`, vértice ou aresta do contorno): a ligação resolve no ponto cotado. */
function ligada(c: Cena, ref: unknown, ponto: Vec2): void {
  expect(ref).toMatchObject({ elementId: 'st1' });
  expect(['part', 'vertex', 'edge']).toContain((ref as { feature: string }).feature);
  near(resolveDimRef(c.project(), ref as never)!, ponto);
}

/** Planta: pares de pontos a cotar, com a medida esperada quando conhecida (m). */
const PLANTA = {
  largura: { a: v(0.28, 0.6), b: v(0.28, -0.6), valor: 1.2 },
  pisada: { a: v(0.28, 0.6), b: v(0.56, 0.6), valor: 0.28 },
  comprimento: { a: v(0, 0.6), b: v(1.12, 0.6), valor: 1.12 },
} as const;

describe('Cota na planta: a cota só nasce no clique da posição final', () => {
  const cenas: Array<[string, Opcoes]> = [
    ['escada reta', { vista: 'planta', forma: 'reta' }],
    ['escada reta com acabamento e bocel', { vista: 'planta', forma: 'reta', acabamento: true }],
  ];
  describe.each(cenas)('%s', (_n, o) => {
    for (const [nome, par] of Object.entries(PLANTA)) {
      it(`${nome}: dois pontos e a posição; valor ${par.valor} m e ligação part nas duas pontas`, () => {
        const c = montar(o);
        const t = tool('dimension', c.ctx.env);
        const d = cotarEmTresCliques(c, t, par.a, par.b);
        valorBate(c, d, par.valor);
        // A ligação resolve exatamente no ponto cotado, e as duas pontas são pontos diferentes da escada.
        ligada(c, d.refs?.a, par.a);
        ligada(c, d.refs?.b, par.b);
        expect(JSON.stringify(d.refs!.a)).not.toBe(JSON.stringify(d.refs!.b));
        expect(d.offset).toBeCloseTo(0.9, 6);
        expect(d.secRefs).toBeUndefined();
      });
    }
  });

  it('bocel e faixa do espelho: a medida é a do acabamento (3 cm entre a frente do bocel e a face do espelho)', () => {
    const c = montar({ vista: 'planta', acabamento: true });
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, v(-0.02, 0.6), v(0.01, 0.6), 0.4);
    valorBate(c, d, 0.03);
    expect(d.refs?.a).toMatchObject({ elementId: 'st1', feature: 'part' });
    expect(d.refs?.b).toMatchObject({ elementId: 'st1', feature: 'part' });
  });

  it('degrau com acabamento: face acabada do piso a 1 cm do espelho', () => {
    const c = montar({ vista: 'planta', acabamento: true });
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, v(0.28, 0.6), v(0.29, 0.6), 0.4);
    valorBate(c, d, 0.01);
  });

  for (const forma of ['L', 'U', 'livre'] as const) {
    it(`escada ${forma}: canto do degrau ao canto do contorno, cota só depois da posição final`, () => {
      const c = montar({ vista: 'planta', forma });
      const stair = c.project().elements['st1'] as { components: Array<{ kind: string; boundary?: StairCurve[]; boundaryLeft?: StairCurve[] }> };
      const a = (stair.components[0]!.boundaryLeft ?? stair.components[0]!.boundary)![0]!.a;
      const b = (stair.components[0]!.boundaryLeft ?? stair.components[0]!.boundary)![0]!.b;
      const t = tool('dimension', c.ctx.env);
      const d = cotarEmTresCliques(c, t, a, b, 0.7);
      valorBate(c, d);
      ligada(c, d.refs?.a, a);
      ligada(c, d.refs?.b, b);
    });
  }

  it('degrau e guarda-corpo hospedado: ligações part de cada elemento', () => {
    const c = montar({ vista: 'planta', guardaCorpo: true });
    const t = tool('dimension', c.ctx.env);
    // Ponta do corrimão do kernel (0, 0,63) e canto do degrau.
    const d = cotarEmTresCliques(c, t, v(0.28, 0.6), v(0.1, 0.65), 0.5);
    valorBate(c, d);
    expect(d.refs?.a).toMatchObject({ elementId: 'st1', feature: 'part' });
    expect(['gc_h', 'st1']).toContain((d.refs?.b as { elementId?: string } | undefined)?.elementId);
  });

  it('escada e parede: ponta da parede grava ligação de parede e o valor é a distância real', () => {
    const c = montar({ vista: 'planta', parede: true });
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, v(0.28, 0.6), v(-2, 3), 0.8);
    valorBate(c, d);
    expect(d.refs?.a).toMatchObject({ elementId: 'st1', feature: 'part' });
    expect(d.refs?.b).toBeDefined();
    near(dimensionPoints(c.project(), d).b, v(-2, 3));
  });

  it('parede: as duas pontas da parede viram a cota de comprimento, só depois da posição final', () => {
    const c = montar({ vista: 'planta', parede: true });
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, v(-2, 3), v(4, 3), 0.5);
    valorBate(c, d, 6);
  });

  it('laje: dois vértices cotam o lado, só depois da posição final', () => {
    const c = montar({ vista: 'planta', laje: true });
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, v(5, 5), v(8, 5), 0.6);
    valorBate(c, d, 3);
    expect((d.refs?.a as { elementId?: string } | undefined)?.elementId).toBe('lj1');
    expect((d.refs?.b as { elementId?: string } | undefined)?.elementId).toBe('lj1');
  });
});

describe('Cota: formas de entrada (planta, escada com acabamento)', () => {
  const base: Opcoes = { vista: 'planta', acabamento: true };
  const { a, b, valor } = PLANTA.largura;

  it('Orto ligado: segue a regra dos três cliques e mede a distância real', () => {
    const c = montar(base);
    c.ctx.options.orthoLock = true;
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    expect(nCotas(c)).toBe(0);
    clickAt(t, b.x + 0.01, b.y + 0.02);
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Deslocamento');
    clickAt(t, 1.5, 0);
    expect(nCotas(c)).toBe(1);
    const d = c.dims()[0]!;
    valorBate(c, d);
    expect(Math.abs(dimensionValue(c.project(), d) - valor)).toBeLessThan(0.03);
  });

  it('Polar ligado (45°): três cliques', () => {
    const c = montar(base);
    c.ctx.options.angleMode = { ortho: false, polar: true, polarIncrementDeg: 45 } as never;
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 0.28, 0.6);
    clickAt(t, 0.56, 0.32);
    expect(nCotas(c)).toBe(0);
    clickAt(t, 1.5, 1.2);
    expect(nCotas(c)).toBe(1);
    valorBate(c, c.dims()[0]!);
  });

  it('comprimento digitado + Enter: define só o 2º ponto; a cota espera a posição final', () => {
    const c = montar(base);
    c.ctx.options.orthoLock = true;
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    t.move(P(a.x, a.y - 3));
    expect(prompt(t)).toBe('Comprimento');
    expect(t.type!('1.2')).toBe(true);
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Deslocamento');
    clickAt(t, 1.5, 0);
    expect(nCotas(c)).toBe(1);
    const d = c.dims()[0]!;
    valorBate(c, d, valor);
    expect(d.b.y).toBeCloseTo(a.y - 1.2, 6);
  });

  it('deslocamento digitado + Enter é a posição final escolhida pelo usuário (cria só então)', () => {
    const c = montar(base);
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    clickAt(t, b.x, b.y);
    expect(nCotas(c)).toBe(0);
    expect(t.type!('0,75')).toBe(true);
    expect(nCotas(c)).toBe(1);
    expect(Math.abs(c.dims()[0]!.offset)).toBeCloseTo(0.75, 9);
  });

  it('Tab e Enter sem texto não criam cota; Enter depois do 2º ponto cancela sem criar', () => {
    const c = montar(base);
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    t.tab!();
    expect(nCotas(c)).toBe(0);
    clickAt(t, b.x, b.y);
    t.tab!();
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Deslocamento');
    t.confirm!();
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBeNull();
  });

  it('Esc: após o 1º ponto e após o 2º cancela sem criar; novo Esc encerra a ferramenta', () => {
    const c = montar(base);
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    t.cancel();
    expect(nCotas(c)).toBe(0);
    clickAt(t, a.x, a.y);
    clickAt(t, b.x, b.y);
    t.cancel();
    expect(nCotas(c)).toBe(0);
    expect(c.ctx.done()).toBe(0);
    t.cancel();
    expect(c.ctx.done()).toBe(1);
    // Nada ficou pendente: o próximo clique é um 1º ponto de novo.
    clickAt(t, a.x, a.y);
    expect(nCotas(c)).toBe(0);
  });

  it('duplo clique no 2º ponto ou no 1º: o 2º clique do par nunca vira a posição final nem cria', () => {
    const c = montar(base);
    const t = tool('dimension', c.ctx.env);
    clickAt(t, a.x, a.y);
    clickAt(t, a.x, a.y); // 2º clique no mesmo ponto: recusado, segue esperando o 2º ponto
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Comprimento');
    clickAt(t, b.x, b.y);
    clickAt(t, b.x, b.y); // clique em cima da própria linha medida: afastamento zero é recusado
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Deslocamento');
    clickAt(t, 1, 0);
    expect(nCotas(c)).toBe(1);
  });

  for (const modo of ['aligned', 'horizontal', 'vertical'] as const) {
    it(`modo ${modo}: três cliques e o valor é o da projeção medida`, () => {
      const c = montar(base);
      c.ctx.options.dimensionMode = modo;
      const t = tool('dimension', c.ctx.env);
      const p1 = v(0.28, 0.6);
      const p2 = v(0.84, -0.6);
      clickAt(t, p1.x, p1.y);
      clickAt(t, p2.x, p2.y);
      expect(nCotas(c)).toBe(0);
      clickAt(t, 2, 2);
      expect(nCotas(c)).toBe(1);
      const d = c.dims()[0]!;
      expect(d.mode).toBe(modo);
      valorBate(c, d, modo === 'horizontal' ? 0.56 : modo === 'vertical' ? 1.2 : dist(p1, p2));
    });
  }

  for (const sequencia of ['continuous', 'baseline'] as const) {
    it(`sequência ${sequencia}: pontos e Enter não criam; só a posição final cria as cotas`, () => {
      const c = montar(base);
      c.ctx.options.dimensionString = sequencia;
      c.ctx.options.dimensionMode = 'horizontal';
      const t = tool('dimension', c.ctx.env);
      clickAt(t, 0.0, 0.6);
      clickAt(t, 0.28, 0.6);
      clickAt(t, 0.56, 0.6);
      expect(nCotas(c)).toBe(0);
      t.confirm!();
      expect(nCotas(c)).toBe(0);
      expect(prompt(t)).toBe('Deslocamento');
      clickAt(t, 0.3, 1.5);
      expect(nCotas(c)).toBe(2);
      const valores = c.dims().map((d) => dimensionValue(c.project(), d));
      expect(valores[0]).toBeCloseTo(0.28, 6);
      expect(valores[1]).toBeCloseTo(sequencia === 'continuous' ? 0.28 : 0.56, 6);
    });
  }

  it('Esc na sequência (antes e depois do Enter) cancela sem criar', () => {
    const c = montar(base);
    c.ctx.options.dimensionString = 'continuous';
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 0, 0.6); clickAt(t, 0.28, 0.6); clickAt(t, 0.56, 0.6);
    t.confirm!();
    t.cancel();
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBeNull();
  });
});

describe('Cota: o rascunho da própria ferramenta não oferece o botão "I" (convertia a cota sozinha)', () => {
  it('o trecho em traçado não é conversível (o clique sobre o "I" criava a cota com afastamento padrão)', () => {
    const c = montar({ vista: 'planta' });
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 0.28, 0.6);
    t.move(P(0.84, 0.6));
    const dims = t.tempDims!();
    expect(dims).toHaveLength(1);
    expect(dims[0]!.conversivel).toBe(false);
    expect(nCotas(c)).toBe(0);
  });

  it('a cota angular também não oferece o "I" no raio em traçado', () => {
    const c = montar({ vista: 'planta' });
    const t = createTool('angularDimension', c.ctx.env);
    t.start();
    const dims = t.tempDims?.() ?? [];
    for (const d of dims) expect(d.conversivel).toBe(false);
  });
});

describe('Cota: o encaixe do afastamento só vale para linha de cota paralela, no lugar real dela', () => {
  /** Uma cota existente na vertical em x = 3 (afastamento 1 → linha de cota em x = 2, normal esquerda de baixo para cima). */
  function comCotaExistente(): ReturnType<typeof montar> {
    const c = montar({ vista: 'planta' });
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 3, 0); clickAt(t, 3, 4); clickAt(t, 2, 2);
    expect(nCotas(c)).toBe(1);
    expect(c.dims()[0]!.offset).toBeCloseTo(1, 9);
    return c;
  }

  it('cota em outra direção e em outro lugar não puxa a nova para o mesmo número de afastamento', () => {
    const c = comCotaExistente();
    // Horizontal em y = 8: o afastamento da cota existente (1) seria "1" na nova, mas a linha dela não está em y = 9.
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 0, 8); clickAt(t, 4, 8); clickAt(t, 2, 8.95);
    expect(nCotas(c)).toBe(2);
    expect(c.dims()[1]!.offset).toBeCloseTo(0.95, 9);
  });

  it('linha de cota paralela na mesma posição de desenho: encaixa (cadeia alinhada)', () => {
    const c = comCotaExistente();
    // Outra vertical, mais abaixo, que sairia na mesma linha x = 2: o afastamento esperado é o da linha existente.
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 3, 6); clickAt(t, 3, 9); clickAt(t, 2.003, 7.5);
    expect(c.dims()[1]!.offset).toBeCloseTo(1, 9);
  });

  it('o encaixe é curto: longe da linha existente vale o clique do usuário', () => {
    const c = comCotaExistente();
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 3, 6); clickAt(t, 3, 9); clickAt(t, 1.5, 7.5);
    expect(c.dims()[1]!.offset).toBeCloseTo(1.5, 9);
  });

  it('encaixe em pixels: em escala 1:100 o encaixe de papel (30 cm) não decide a 30 cm do clique', () => {
    const c = comCotaExistente();
    c.ctx.env.metersPerPixel = () => 0.005; // 8 px = 4 cm
    const t = tool('dimension', c.ctx.env);
    clickAt(t, 3, 6); clickAt(t, 3, 9); clickAt(t, 2.2, 7.5);
    expect(c.dims()[1]!.offset).toBeCloseTo(0.8, 9);
  });
});

/** Corte e elevação com escada (e guarda-corpo hospedado): índice real de captura do motor. */
describe.each([['corte'], ['elevacao']] as const)('Cota no(a) %s: a cota só nasce no clique da posição final', (vista) => {
  const cena = (extra: Partial<Opcoes> = {}) => montar({ vista, acabamento: true, ...extra });

  function paresDaEscada(c: Cena): { a: Vec2; b: Vec2 }[] {
    const pts = pontosDoCorte(c, 'st1');
    expect(pts.length).toBeGreaterThan(10);
    const baixo = pts.reduce((m, p) => (p.y < m.y ? p : m), pts[0]!);
    const alto = pts.reduce((m, p) => (p.y > m.y ? p : m), pts[0]!);
    // Dois pontos vizinhos do mesmo patamar de degrau: o passo (pisada).
    const mesmoZ = pts.find((p) => Math.abs(p.y - baixo.y) < 1e-9 && p.x > baixo.x + 0.05)!;
    return [{ a: baixo, b: alto }, { a: baixo, b: mesmoZ }];
  }

  it('altura piso a piso e pisada: valor igual à distância real e secRefs no elemento', () => {
    const c = cena();
    for (const par of paresDaEscada(c)) {
      const t = tool('dimension', c.ctx.env);
      const d = cotarEmTresCliques(c, t, par.a, par.b, 0.4);
      valorBate(c, d);
      const medida = dimensionPoints(c.project(), d);
      expect(dist(medida.a, medida.b)).toBeGreaterThan(0.001);
      expect(d.secRefs?.a).toMatchObject({ hostId: 'st1', kind: 'endpoint' });
      expect(d.secRefs?.b).toMatchObject({ hostId: 'st1', kind: 'endpoint' });
      expect(d.refs).toBeUndefined();
      // A ligação resolve no ponto exato que foi cotado.
      near(resolveSectionDimRef(c.indice(), d.secRefs!.a!)!, par.a);
      near(resolveSectionDimRef(c.indice(), d.secRefs!.b!)!, par.b);
      expect(sectionDimRefAt(c.indice(), par.a)).toEqual(d.secRefs!.a);
    }
  });

  it('degrau e guarda-corpo: cada ponta liga ao seu elemento; só cria na posição final', () => {
    const c = cena({ guardaCorpo: true });
    const st = pontosDoCorte(c, 'st1')[0]!;
    const gc = pontosDoCorte(c, 'gc_h');
    expect(gc.length).toBeGreaterThan(0);
    const alvo = gc.find((p) => dist(p, st) > 0.3)!;
    const t = tool('dimension', c.ctx.env);
    const d = cotarEmTresCliques(c, t, st, alvo, 0.5);
    valorBate(c, d);
    expect(d.secRefs?.a?.hostId).toBe('st1');
    expect(d.secRefs?.b?.hostId).toBe('gc_h');
  });

  it('Orto, Polar, comprimento digitado e Esc seguem a regra dos três cliques', () => {
    const c = cena();
    const [par] = paresDaEscada(c);
    c.ctx.options.orthoLock = true;
    const t = tool('dimension', c.ctx.env);
    clickAt(t, par!.a.x, par!.a.y);
    expect(nCotas(c)).toBe(0);
    t.move(P(par!.a.x + 0.02, par!.a.y + 1));
    expect(t.type!('0.5')).toBe(true);
    expect(nCotas(c)).toBe(0);
    expect(prompt(t)).toBe('Deslocamento');
    t.cancel();
    expect(nCotas(c)).toBe(0);
    c.ctx.options.orthoLock = false;
    c.ctx.options.angleMode = { ortho: false, polar: true, polarIncrementDeg: 45 } as never;
    const u = tool('dimension', c.ctx.env);
    clickAt(u, par!.a.x, par!.a.y);
    clickAt(u, par!.a.x + 0.4, par!.a.y + 0.45);
    expect(nCotas(c)).toBe(0);
    u.cancel();
    expect(nCotas(c)).toBe(0);
  });
});
