import { afterEach, describe, expect, it, vi } from 'vitest';
import { servicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { defaultStairTypeId, isGuardaCorpo, isOpening, isStair, isWall, makeGuardaCorpo, makeSlab, makeStair, makeWall, type Id, type Opening, type Project, type Slab, type Stair, type StairRun } from '@hestia/model';
import { straight } from '@hestia/engine/src/fixtureGuardaCorpo.ts';
import { P, makeEnv, tool } from './testEnv.ts';
import { sectionInferContext } from './sectionContext.ts';
import { t as translate } from './i18n.ts';
import type { InferContext } from './infer.ts';
import type { ToolId } from './registry.ts';
import type { Inference, SectionToolContext, Tool } from './types.ts';

/**
 * Mover e Copiar no corte e na elevação com o MESMO fluxo da planta: ponto base com snaps, prévia, destino com snaps (ou distância
 * digitada + Enter), Orto/Polar, Esc, várias cópias e desfazer, para parede, laje, escada (com o guarda-corpo hospedado), guarda-corpo
 * manual e esquadria, em corte longitudinal, transversal e elevação. Os snaps vêm do índice REAL da vista (`sectionInferContext`),
 * com o guarda-corpo do kernel simulado em `servicoGuardaCorpo().corte` (as mesmas linhas que a vista desenha).
 *
 * Geometria (t, z), vista de 20 m: escada de 2 a 4 m (topo a 1 m, canto superior esquerdo chanfrado), laje de 0 a 5 m (z 2,8 a 3),
 * guarda-corpo hospedado na escada, guarda-corpo manual de 6 a 8 m (z 0 a 1,10), parede de 11 a 15 m (z 0 a 2,8) com a janela de
 * 12,4 a 13,6 m (z 1 a 2,2).
 */

const ring = (...pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const rect = (t0: number, z0: number, t1: number, z1: number): Vec2[] => ring([t0, z0], [t1, z0], [t1, z1], [t0, z1]);
const poly = (r: Vec2[]): MultiPolygon => [[r]];
const ESCADA = ring([2, 0], [4, 0], [4, 1], [3, 1], [2, 0.5]);
const LAJE = rect(0, 2.8, 5, 3);
const PAREDE = rect(11, 0, 15, 2.8);
const LINHAS_HOSPEDADO: LinhaVistaGC[] = [
  { guardaId: 'gc_h', papel: 1, estilo: 0, pontos: rect(2, 0.5, 2.05, 1.1) },
  { guardaId: 'gc_h', papel: 1, estilo: 0, pontos: rect(3.95, 0, 4, 1.1) },
  { guardaId: 'gc_h', papel: 3, estilo: 0, pontos: rect(2, 1.05, 4, 1.1) },
];
const LINHAS_MANUAL: LinhaVistaGC[] = [
  { guardaId: 'gc_m', papel: 1, estilo: 0, pontos: rect(6, 0, 6.05, 1.1) },
  { guardaId: 'gc_m', papel: 1, estilo: 0, pontos: rect(7.95, 0, 8, 1.1) },
  { guardaId: 'gc_m', papel: 3, estilo: 0, pontos: rect(6, 1.05, 8, 1.1) },
];

type Forma = 'longitudinal' | 'transversal' | 'elevacao';

function resultadoDe(forma: Forma, extra: { escadas?: number } = {}): SectionResult {
  const parte = (origin: Record<string, string>, r: Vec2[]) => ({ origin, polygons: poly(r) });
  const escadas = Array.from({ length: extra.escadas ?? 0 }, (_, i) => ({ id: `ex${i}`, r: ESCADA.map((q) => ({ x: q.x + 20 + i * 5, y: q.y })) }));
  const cortes = [
    { materialId: 'm', polygons: poly(ESCADA), sources: [{ stairId: 'st1' }], parts: [parte({ stairId: 'st1' }, ESCADA)] },
    { materialId: 'm', polygons: poly(LAJE), sources: [{ slabId: 'lj1' }], parts: [parte({ slabId: 'lj1' }, LAJE)] },
    { materialId: 'm', polygons: poly(PAREDE), sources: [{ wallId: 'w1' }], parts: [parte({ wallId: 'w1' }, PAREDE)] },
    ...escadas.map((e) => ({ materialId: 'm', polygons: poly(e.r), sources: [{ stairId: e.id }], parts: [parte({ stairId: e.id }, e.r)] })),
  ];
  // Elevação: o que o plano não corta aparece "além" dele, com profundidade; o resultado não tem `cut`.
  const alem = cortes.map((c, i) => ({ ...c.sources[0], materialId: 'm', layerIndex: 0, depth: 1 + i * 0.1, polygons: c.polygons }));
  return {
    length: 20, zMin: 0, zMax: 4, silhouette: [], membranes: [], levels: [],
    cut: forma === 'elevacao' ? [] : cortes,
    beyond: forma === 'elevacao' ? alem : [],
    openings: [{
      openingId: 'o1', kind: 'window', t0: 12.4, t1: 13.6, z0: 1, z1: 2.2, depth: 0, cut: forma !== 'elevacao',
      polygons: poly(rect(12.4, 1, 13.6, 2.2)),
    }],
    plano: forma === 'transversal' ? { a: { x: 0, y: 0 }, b: { x: 0, y: 20 }, depth: 3 } : { a: { x: 0, y: 0 }, b: { x: 20, y: 0 }, depth: 3 },
  } as unknown as SectionResult;
}

function cena({ forma = 'longitudinal' as Forma, escadasExtras = 0, gcExtras = 0 } = {}) {
  const ctx = makeEnv();
  const { store, env } = ctx;
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [straight(17, 0.28)] }) });
  const lado = { lance: true, patamar: true };
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_h', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_m', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'manual', uso: 'livre', ladoDeslocamento: 'centro', caminho: [{ x: 6, y: 1, dz: 0 }, { x: 8, y: 1, dz: 0 }], fechado: false } }) });
  store.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 0, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 1 }, { x: 0, y: 1 }] }) });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 11, y: 0 }, b: { x: 15, y: 0 } }) });
  store.exec({ type: 'addOpening', opening: { id: 'o1', kind: 'window', typeId: 'ot_j120', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: 1, mark: '' } });
  const linha = forma === 'transversal' ? { a: { x: 0, y: 0 }, b: { x: 0, y: 20 } } : { a: { x: 0, y: 0 }, b: { x: 20, y: 0 } };
  store.exec({ type: 'addView', view: { id: 'v1', name: 'Vista', kind: forma === 'elevacao' ? 'elevation' : 'section', ...linha, depth: 3 } as never });
  const messages: string[] = [];
  ctx.env.say = (m: string) => { messages.push(m); };
  const result = resultadoDe(forma, { escadas: escadasExtras });
  const sec = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra: Partial<InferContext> = {}) => sectionInferContext(result, store.project, 'lv_0', env.metersPerPixel(), env.gridStep(), { line: { ...linha, depth: 3 } }, extra),
    result: () => result,
    hidden: () => new Set<Id>(),
  } as unknown as SectionToolContext;
  env.section = () => sec;
  const extras: LinhaVistaGC[] = Array.from({ length: gcExtras }, (_, i) => ({ guardaId: `gx${i}`, papel: 1, estilo: 0, pontos: rect(30 + i * 3, 0, 30.05 + i * 3, 1.1) }));
  vi.spyOn(servicoGuardaCorpo(), 'corte').mockReturnValue({ linhas: [...LINHAS_HOSPEDADO, ...LINHAS_MANUAL, ...extras], poligonos: [] });
  return { ...ctx, messages, result };
}

afterEach(() => vi.restoreAllMocks());

const inferenciaDe = (t: Tool): Inference => (t as unknown as { inference(): Inference }).inference();
const move = (t: Tool, x: number, y: number): Inference => { t.move(P(x, y)); return inferenciaDe(t); };
const click = (t: Tool, x: number, y: number): void => { t.move(P(x, y)); t.click(P(x, y)); };
/** Eixo do deslocamento em planta: x no corte longitudinal, y no transversal. */
const ao = (forma: Forma, p: Vec2): number => (forma === 'transversal' ? p.y : p.x);

const stair = (p: Project, id = 'st1'): Stair => { const s = p.elements[id]; if (!isStair(s)) throw new Error('sem escada'); return s; };
const stairT = (p: Project, forma: Forma = 'longitudinal'): number => ao(forma, (stair(p).components[0] as StairRun).boundaryLeft[0]!.a);
const rail = (p: Project, id: string) => { const g = p.elements[id]; if (!isGuardaCorpo(g)) throw new Error('sem guarda-corpo'); return g; };
const manualT = (p: Project, forma: Forma = 'longitudinal'): number => { const h = rail(p, 'gc_m').hospedeiro; if (h.tipo !== 'manual') throw new Error('não é manual'); return ao(forma, h.caminho[0]!); };
const wallT = (p: Project, forma: Forma = 'longitudinal'): number => { const w = p.elements.w1; if (!isWall(w)) throw new Error('sem parede'); return ao(forma, w.a); };
const lajeZ = (p: Project): number => (p.elements.lj1 as Slab).heightOffset;
const janela = (p: Project): Opening => { const o = p.elements.o1; if (!isOpening(o)) throw new Error('sem janela'); return o; };
const LOCKED = translate('pt', 'tl_msg_railing_hosted_locked');
const VERTICAL = translate('pt', 'tl_msg_section_move_vertical');
const poligonosDaPrevia = (t: Tool) => t.preview().filter((i): i is Extract<typeof i, { kind: 'polygon' }> => i.kind === 'polygon');

const FORMAS: Forma[] = ['longitudinal', 'transversal', 'elevacao'];
const FERRAMENTAS: ToolId[] = ['move', 'copy'];

describe.each(FORMAS)('Mover e Copiar no corte (%s): ponto base e destino com snaps', (forma) => {
  it('escada: base na extremidade, destino na extremidade da laje; o deslocamento é exatamente base → destino', () => {
    const c = cena({ forma });
    c.env.setSelection(['st1']);
    const inicial = stairT(c.store.project, forma);
    const t = tool('move', c.env);
    // Ponto base: a ponta da escada em (4, 1), com o cursor a 2 cm dela.
    const base = move(t, 4.02, 1.01);
    expect(base.kind).toBe('endpoint');
    expect(base.point).toEqual({ x: 4, y: 1 });
    t.click(P(4.02, 1.01));
    // Destino: a ponta da laje em (5, 2,8).
    const alvo = move(t, 5.02, 2.79);
    expect(alvo.kind).toBe('endpoint');
    expect(alvo.point).toEqual({ x: 5, y: 2.8 });
    // Prévia: contorno da escada deslocado e do guarda-corpo hospedado que anda junto, tudo tracejado.
    const previa = poligonosDaPrevia(t);
    expect(previa.length).toBeGreaterThanOrEqual(4);
    expect(previa.every((i) => i.dashed)).toBe(true);
    const em = (x: number, y: number) => previa.some((i) => i.ring.some((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9));
    expect(em(3, 1.8)).toBe(true); // vértice (2; 0) da escada + (1; 1,8)
    expect(em(3, 2.3)).toBe(true); // poste do hospedado (2; 0,5) + (1; 1,8)
    t.click(P(5.02, 2.79));
    const p = c.store.project;
    expect(stairT(p, forma)).toBeCloseTo(inicial + 1, 9);
    expect(stair(p).baseOffset).toBeCloseTo(1.8, 9);
    expect(stair(p).topOffset).toBeCloseTo(1.8, 9);
    expect(rail(p, 'gc_h').hospedeiro).toMatchObject({ tipo: 'escada', escadaId: 'st1' });
    expect(c.store.undoLabel).toBe('Mover no corte');
    expect(c.done()).toBe(1);
    c.store.undo();
    expect(stair(c.store.project).baseOffset).toBe(0);
    expect(stairT(c.store.project, forma)).toBeCloseTo(inicial, 9);
    c.store.redo();
    expect(stair(c.store.project).baseOffset).toBeCloseTo(1.8, 9);
  });

  it('laje: base no ponto médio da aresta, destino na interseção de duas arestas', () => {
    const c = cena({ forma });
    c.env.setSelection(['lj1']);
    const inicial = ao(forma, (c.store.project.elements.lj1 as Slab).boundary[0]!);
    const t = tool('move', c.env);
    const base = move(t, 2.52, 2.99);
    expect(base.kind).toBe('midpoint');
    expect(base.point).toEqual({ x: 2.5, y: 3 });
    t.click(P(2.52, 2.99));
    // Destino: o canto inferior do poste do guarda-corpo manual, em (6; 1,1).
    const alvo = move(t, 6.01, 1.1);
    expect(['endpoint', 'intersection']).toContain(alvo.kind);
    expect(alvo.point.x).toBeCloseTo(6, 9);
    expect(alvo.point.y).toBeCloseTo(1.1, 9);
    t.click(P(6.01, 1.1));
    const p = c.store.project;
    expect(lajeZ(p)).toBeCloseTo(1.1 - 3, 9);
    const boundaryT = ao(forma, (p.elements.lj1 as Slab).boundary[0]!);
    expect(boundaryT).toBeCloseTo(inicial + 3.5, 9);
  });

  it('guarda-corpo manual: arestas da peça servem de base; a cota base soma o deslocamento vertical', () => {
    const c = cena({ forma });
    c.env.setSelection(['gc_m']);
    const inicial = manualT(c.store.project, forma);
    const t = tool('move', c.env);
    const base = move(t, 6.02, 0.02);
    expect(base.kind).toBe('endpoint');
    expect(base.point).toEqual({ x: 6, y: 0 });
    t.click(P(6.02, 0.02));
    const alvo = move(t, 9.01, 0.01);
    t.click(P(9.01, 0.01));
    const p = c.store.project;
    expect(manualT(p, forma)).toBeCloseTo(inicial + (alvo.point.x - 6), 9);
    expect(rail(p, 'gc_m').cotaBase).toBeCloseTo(alvo.point.y - 0, 9);
  });

  it('esquadria: base e destino por snap; anda ao longo da parede e o peitoril sobe', () => {
    const c = cena({ forma });
    c.env.setSelection(['o1']);
    const t = tool('move', c.env);
    const base = move(t, 12.41, 2.19);
    expect(base.kind).toBe('endpoint');
    expect(base.point.x).toBeCloseTo(12.4, 9);
    expect(base.point.y).toBeCloseTo(2.2, 9);
    t.click(P(12.41, 2.19));
    // Destino: topo da parede acima do vão (15; 2,8)?  Usa a quina da parede em (11; 2,8).
    const alvo = move(t, 11.02, 2.79);
    expect(alvo.point).toEqual({ x: 11, y: 2.8 });
    t.click(P(11.02, 2.79));
    const o = janela(c.store.project);
    const antes = 2; // offset inicial
    const dt = 11 - 12.4;
    const wallAlong = forma === 'transversal' ? 0 : 1;
    // Corte paralelo à parede (longitudinal e elevação): o vão anda dt; no transversal o corte é perpendicular e a parede não anda nele.
    expect(o.offset).toBeCloseTo(antes + dt * wallAlong, 9);
    expect(o.sillOverride).toBeCloseTo(1 + (2.8 - 2.2), 9);
  });

  it('parede: só anda na horizontal; a prévia já vem restrita e a barra explica', () => {
    const c = cena({ forma });
    c.env.setSelection(['w1']);
    const inicial = wallT(c.store.project, forma);
    const t = tool('move', c.env);
    const base = move(t, 15.01, 2.79);
    expect(base.point).toEqual({ x: 15, y: 2.8 });
    t.click(P(15.01, 2.79));
    expect(c.messages.at(-1)).toBe(VERTICAL);
    // O cursor sobe muito: o ponto capturado fica na horizontal do ponto base.
    const alvo = move(t, 17, 5);
    expect(alvo.point.y).toBeCloseTo(2.8, 9);
    expect(poligonosDaPrevia(t).every((i) => i.ring.every((q) => !Number.isNaN(q.x)))).toBe(true);
    const ghostY = poligonosDaPrevia(t).flatMap((i) => i.ring.map((q) => q.y));
    expect(Math.min(...ghostY)).toBeCloseTo(0, 9);
    expect(Math.max(...ghostY)).toBeCloseTo(2.8, 9);
    t.click(P(17, 5));
    const w = c.store.project.elements.w1;
    if (!isWall(w)) throw new Error('sem parede');
    expect(wallT(c.store.project, forma)).toBeCloseTo(inicial + (alvo.point.x - 15), 9);
    expect(w.baseOffset).toBe(0);
  });

  it('desfazer e refazer do Copiar levam tudo de uma vez; Esc encerra a sessão', () => {
    const c = cena({ forma });
    c.env.setSelection(['st1']);
    const t = tool('copy', c.env);
    click(t, 4.02, 1.01);
    click(t, 5.02, 2.79);
    click(t, 7, 3.5);
    const escadas = () => Object.values(c.store.project.elements).filter(isStair);
    expect(escadas()).toHaveLength(3);
    expect(Object.values(c.store.project.elements).filter(isGuardaCorpo)).toHaveLength(2 + 2);
    expect(c.store.undoLabel).toBe('Copiar no corte');
    t.cancel();
    expect(c.done()).toBe(1);
    c.store.undo();
    expect(escadas()).toHaveLength(1);
    c.store.redo();
    expect(escadas()).toHaveLength(3);
  });
});

describe('Mover e Copiar no corte: distância digitada + Enter', () => {
  it('na direção do cursor, com o valor exato, e a cota dinâmica do deslocamento', () => {
    const c = cena();
    c.env.setSelection(['st1']);
    const t = tool('move', c.env);
    click(t, 4.02, 1.01);
    expect(t.inputPrompt()).toBe(translate('pt', 'tl_inp_distance'));
    // Cursor livre (longe de qualquer captura), na horizontal do ponto base.
    const alvo = move(t, 5.5, 1);
    expect(alvo.point.y).toBeCloseTo(1, 9);
    const inicial = stairT(c.store.project);
    const dims = t.tempDims?.() ?? [];
    expect(dims).toHaveLength(1);
    expect(dims[0]!.value).toBeCloseTo(alvo.point.x - 4, 9);
    expect(t.type('0,5')).toBe(true);
    const p = c.store.project;
    expect(stairT(p)).toBeCloseTo(inicial + 0.5, 9);
    expect(stair(p).baseOffset).toBeCloseTo(0, 9);
    expect(c.done()).toBe(1);
  });

  it('na vertical: sobe o valor digitado (dz) sem andar ao longo do corte', () => {
    const c = cena();
    c.env.setSelection(['lj1']);
    const t = tool('move', c.env);
    click(t, 2.52, 2.99);
    move(t, 2.5, 3.6);
    expect(t.type('0,3')).toBe(true);
    expect(lajeZ(c.store.project)).toBeCloseTo(0.3, 9);
    expect((c.store.project.elements.lj1 as Slab).boundary[0]!.x).toBeCloseTo(0, 9);
  });

  it('Copiar: cada valor digitado faz uma cópia a partir da mesma base; texto inválido é recusado', () => {
    const c = cena();
    c.env.setSelection(['st1']);
    const t = tool('copy', c.env);
    click(t, 4.02, 1.01);
    move(t, 5.5, 1);
    expect(t.type('abc')).toBe(false);
    expect(t.type('1')).toBe(true);
    expect(t.type('2')).toBe(true);
    const escadas = Object.values(c.store.project.elements).filter(isStair);
    expect(escadas).toHaveLength(3);
    const xs = escadas.map((s) => (s.components[0] as StairRun).boundaryLeft[0]!.a.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-0.5, 9);
    expect(xs[1]).toBeCloseTo(0.5, 9);
    expect(xs[2]).toBeCloseTo(1.5, 9);
    expect(c.store.undoLabel).toBe('Copiar no corte');
    c.store.undo();
    expect(Object.values(c.store.project.elements).filter(isStair)).toHaveLength(1);
  });
});

describe('Mover e Copiar no corte: Orto, Polar e Esc', () => {
  it('Orto trava o destino na horizontal do ponto base', () => {
    const c = cena();
    c.options.angleMode = { ortho: true } as never;
    c.env.setSelection(['st1']);
    const inicial = stairT(c.store.project);
    const t = tool('move', c.env);
    click(t, 7, 2); // ponto livre
    const alvo = move(t, 9.4, 2.3);
    expect(alvo.kind).toBe('ortho');
    expect(alvo.point.y).toBe(2);
    t.click(P(9.4, 2.3));
    expect(stair(c.store.project).baseOffset).toBeCloseTo(0, 9);
    expect(stairT(c.store.project)).toBeCloseTo(inicial + (alvo.point.x - 7), 9);
  });

  it('Polar trava no múltiplo do incremento a partir do ponto base', () => {
    const c = cena();
    c.options.angleMode = { polar: true, polarIncrementDeg: 45 } as never;
    c.env.setSelection(['st1']);
    const inicial = stairT(c.store.project);
    const t = tool('move', c.env);
    click(t, 7, 2); // ponto livre
    const alvo = move(t, 9.6, 4.3);
    expect(alvo.kind).toBe('polar');
    expect(((Math.atan2(alvo.point.y - 2, alvo.point.x - 7) * 180) / Math.PI)).toBeCloseTo(45, 6);
    t.click(P(9.6, 4.3));
    expect(stair(c.store.project).baseOffset).toBeCloseTo(alvo.point.y - 2, 9);
    expect(stairT(c.store.project)).toBeCloseTo(inicial + (alvo.point.x - 7), 9);
  });

  it('Esc cancela o ponto base sem alterar nada; o segundo Esc sai da ferramenta', () => {
    const c = cena();
    c.env.setSelection(['st1']);
    const t = tool('move', c.env);
    click(t, 4.02, 1.01);
    move(t, 6, 2);
    const versao = c.store.version;
    t.cancel();
    expect(c.store.version).toBe(versao);
    expect(t.preview()).toEqual([]);
    expect(t.inputPrompt()).toBeNull();
    expect(c.done()).toBe(0);
    t.cancel();
    expect(c.done()).toBe(1);
  });
});

describe('Mover e Copiar no corte: seleção prévia, sem seleção e recusas', () => {
  it('com a seleção feita, o primeiro clique já é o ponto base (sem selecionar de novo)', () => {
    const c = cena();
    c.env.setSelection(['st1']);
    const t = tool('move', c.env);
    click(t, 6.9, 0.2); // longe do que quer que seja: ponto livre, base
    expect(c.env.selection()).toEqual(['st1']);
    expect(t.inputPrompt()).not.toBeNull();
  });

  it('sem seleção, o elemento sob o clique é selecionado e o clique vira o ponto base com snap', () => {
    const c = cena();
    const t = tool('move', c.env);
    // Antes do clique, o elemento que será escolhido já está realçado.
    t.move(P(2.02, 0.01));
    expect(t.preview()).toContainEqual({ kind: 'highlight', ids: ['st1'] });
    t.click(P(2.02, 0.01));
    expect(c.env.selection()).toEqual(['st1']);
    expect(inferenciaDe(t).point).toEqual({ x: 2, y: 0 });
    t.move(P(5.02, 2.79));
    t.click(P(5.02, 2.79));
    expect(stair(c.store.project).baseOffset).toBeCloseTo(2.8, 9);
  });

  it('sem seleção, clicar o guarda-corpo hospedado mostra a explicação e não começa o gesto', () => {
    const c = cena();
    const t = tool('copy', c.env);
    const versao = c.store.version;
    click(t, 4.01, 0.5); // poste do hospedado
    expect(c.env.selection()).toEqual(['gc_h']);
    expect(c.messages.at(-1)).toBe(LOCKED);
    expect(t.inputPrompt()).toBeNull();
    click(t, 9.5, 3.5); // outro clique não troca a explicação por outro elemento
    expect(c.messages.at(-1)).toBe(LOCKED);
    expect(c.store.version).toBe(versao);
  });

  it('sem seleção sobre o vazio: pede para selecionar e não muda nada', () => {
    const c = cena();
    const versao = c.store.version;
    const t = tool('move', c.env);
    click(t, 9.5, 3.5);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(translate('pt', 'tl_msg_section_move_select'));
    expect(t.inputPrompt()).toBeNull();
  });

  it.each(FERRAMENTAS)('%s: guarda-corpo hospedado SOZINHO mostra a mensagem, já ao escolher a ferramenta e ao clicar, e nada muda', (id) => {
    const c = cena();
    c.env.setSelection(['gc_h']);
    const t = tool(id, c.env);
    expect(c.messages.at(-1)).toBe(LOCKED);
    c.messages.length = 0;
    const versao = c.store.version;
    click(t, 3, 1.1);
    expect(c.messages.at(-1)).toBe(LOCKED);
    expect(t.inputPrompt()).toBeNull();
    expect(c.store.version).toBe(versao);
  });

  it('escada e hospedado juntos andam como um só (sem recusa); a cópia leva o guarda-corpo remapeado', () => {
    const c = cena();
    c.env.setSelection(['st1', 'gc_h']);
    const t = tool('copy', c.env);
    click(t, 4.02, 1.01);
    click(t, 5.02, 2.79);
    expect(c.messages.at(-1)).not.toBe(LOCKED);
    const gcs = Object.values(c.store.project.elements).filter(isGuardaCorpo);
    const nova = Object.values(c.store.project.elements).filter(isStair).find((s) => s.id !== 'st1')!;
    expect(gcs.some((g) => g.hospedeiro.tipo === 'escada' && g.hospedeiro.escadaId === nova.id)).toBe(true);
    expect(gcs).toHaveLength(3);
  });

  it('parede e escada juntas: a escada sobe e a parede só anda na horizontal; a razão aparece depois', () => {
    const c = cena();
    c.env.setSelection(['w1', 'st1']);
    const t = tool('move', c.env);
    click(t, 4.02, 1.01);
    click(t, 5.02, 2.79);
    expect(stair(c.store.project).baseOffset).toBeCloseTo(1.8, 9);
    expect(wallT(c.store.project)).toBeCloseTo(12, 9);
    expect(c.messages.at(-1)).toBe(VERTICAL);
  });

  it('parede com o cursor na vertical do ponto base: não fica sem resposta', () => {
    const c = cena();
    c.env.setSelection(['w1']);
    const t = tool('move', c.env);
    click(t, 15.01, 2.79);
    c.messages.length = 0;
    const versao = c.store.version;
    click(t, 15.01, 4);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(VERTICAL);
  });
});

describe('Alinhar no corte: snap e destaque na referência', () => {
  it('a referência mostra o snap do índice da vista e o destaque do elemento e da linha escolhidos', () => {
    const c = cena();
    const t = tool('align', c.env);
    // Cursor a 1 cm do topo do guarda-corpo manual: o marcador de captura vem do mesmo índice do Mover.
    const inf = move(t, 7.02, 1.095);
    expect(inf.point.y).toBeCloseTo(1.1, 9);
    expect(['nearest', 'endpoint', 'midpoint', 'alignment']).toContain(inf.kind);
    const itens = t.preview();
    expect(itens).toContainEqual({ kind: 'highlight', ids: ['gc_m'] });
    expect(itens.some((i) => i.kind === 'point')).toBe(true);
    t.click(P(7.02, 1.095));
    // Fixada a referência, a linha dela fica desenhada (traço cheio) e o snap continua valendo para o alvo.
    expect(t.preview().some((i) => i.kind === 'line')).toBe(true);
    const alvo = move(t, 3.5, 0.995);
    expect(alvo.point.y).toBeCloseTo(1, 9);
    expect(alvo.kind).not.toBe('none');
    expect(t.preview()).toContainEqual({ kind: 'highlight', ids: ['st1'] });
  });
});

describe('Mover no corte: desempenho do snap com muitas escadas e guarda-corpos', () => {
  const tempoMedio = (c: ReturnType<typeof cena>, passos: number): number => {
    c.env.setSelection(['st1']);
    const t = tool('move', c.env);
    click(t, 4.02, 1.01);
    for (let i = 0; i < 10; i++) t.move(P(5 + i * 0.01, 2));
    const t0 = performance.now();
    for (let i = 0; i < passos; i++) t.move(P(5 + (i % 50) * 0.37, 1 + (i % 30) * 0.11));
    return (performance.now() - t0) / passos;
  };

  it('100 escadas e 100 guarda-corpos na vista: o custo por movimento não cresce com a quantidade', () => {
    const pouco = tempoMedio(cena(), 200);
    vi.restoreAllMocks();
    const muito = tempoMedio(cena({ escadasExtras: 100, gcExtras: 100 }), 200);
    // Folga larga para a variação da máquina; o que se guarda é o crescimento: sem índice seria da ordem de 100x.
    expect(muito).toBeLessThan(Math.max(pouco * 12, 5));
  });
});
