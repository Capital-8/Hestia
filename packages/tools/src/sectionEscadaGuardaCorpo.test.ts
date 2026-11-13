import { afterEach, describe, expect, it, vi } from 'vitest';
import { servicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import { defaultRampTypeId, defaultStairTypeId, isGuardaCorpo, isRamp, isStair, makeGuardaCorpo, makeRamp, makeSlab, makeStair, makeWall, type Id, type Project, type Ramp, type Slab, type Stair, type StairRun } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import { P, makeEnv, tool } from './testEnv.ts';
import { straight } from '@hestia/engine/src/fixtureGuardaCorpo.ts';
import { t as translate } from './i18n.ts';
import type { InferContext } from './infer.ts';
import type { SectionToolContext } from './types.ts';
import { comandosMoverNoCorte } from './sectionMoverElementos.ts';

/**
 * Mover, Copiar e Alinhar no corte/elevação com escada, guarda-corpo manual e guarda-corpo hospedado (decisão 0055 §25 e contrato
 * de famílias e ferramentas, regra 3). O corte é uma vista de 10 m na linha y = 0 (t = x, z = cota). O guarda-corpo vem do kernel,
 * fora do `SectionResult`: aqui as linhas dele são simuladas na `servicoGuardaCorpo().corte`, as MESMAS que a vista desenha.
 */

const ring = (...pts: Array<[number, number]>) => pts.map(([x, y]) => ({ x, y }));
const rect = (t0: number, z0: number, t1: number, z1: number) => ring([t0, z0], [t1, z0], [t1, z1], [t0, z1]);
/** Escada cortada: 2..4 m de comprimento, até 1,00 m; o canto superior esquerdo é chanfrado (aresta inclinada de (3;1) a (2;0,5)). */
const ESCADA = ring([2, 0], [4, 0], [4, 1], [3, 1], [2, 0.5]);
/** Guarda-corpo hospedado: dois postes e o corrimão em cima da escada (topo a 1,10 m). */
const LINHAS_HOSPEDADO: LinhaVistaGC[] = [
  { guardaId: 'gc_h', papel: 1, estilo: 0, pontos: rect(2, 0.5, 2.05, 1.1) },
  { guardaId: 'gc_h', papel: 1, estilo: 0, pontos: rect(3.95, 0, 4, 1.1) },
  { guardaId: 'gc_h', papel: 3, estilo: 0, pontos: rect(2, 1.05, 4, 1.1) },
];
/** Guarda-corpo manual, longe da escada (de 6 a 8 m, topo a 1,10 m). */
const LINHAS_MANUAL: LinhaVistaGC[] = [
  { guardaId: 'gc_m', papel: 1, estilo: 0, pontos: rect(6, 0, 6.05, 1.1) },
  { guardaId: 'gc_m', papel: 1, estilo: 0, pontos: rect(7.95, 0, 8, 1.1) },
  { guardaId: 'gc_m', papel: 3, estilo: 0, pontos: rect(6, 1.05, 8, 1.1) },
];

function fakeResult(extra: { cut?: SectionResult['cut']; slab?: boolean } = {}): SectionResult {
  const poly = (r: ReturnType<typeof ring>): MultiPolygon => [[r]];
  return {
    length: 10, zMin: 0, zMax: 3, silhouette: [], beyond: [], openings: [], membranes: [], levels: [],
    plano: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 3 },
    cut: extra.cut ?? [
      { materialId: 'mat_concreto', polygons: poly(ESCADA), sources: [{ stairId: 'st1' }], parts: [{ origin: { stairId: 'st1' }, polygons: poly(ESCADA) }] },
      ...(extra.slab ? [{ materialId: 'mat_concreto', polygons: poly(rect(0, 2.8, 5, 3)), sources: [{ slabId: 'lj1' }], parts: [{ origin: { slabId: 'lj1' }, polygons: poly(rect(0, 2.8, 5, 3)) }] }] : []),
    ],
  } as unknown as SectionResult;
}

function scene({ hidden = new Set<Id>(), slab = false }: { hidden?: Set<Id>; slab?: boolean } = {}) {
  const ctx = makeEnv();
  const { store, env } = ctx;
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [straight(17, 0.28)] }) });
  const lado = { lance: true, patamar: true };
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_h', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_m', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'manual', uso: 'livre', ladoDeslocamento: 'centro', caminho: [{ x: 6, y: 1, dz: 0 }, { x: 8, y: 1, dz: 0 }], fechado: false } }) });
  store.exec({ type: 'addView', view: { id: 'v1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 3 } });
  if (slab) store.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 0, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 1 }, { x: 0, y: 1 }] }) });
  const messages: string[] = [];
  ctx.env.say = (m: string) => { messages.push(m); };
  const result = fakeResult({ slab });
  const sec = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra: Partial<InferContext> = {}) => ({ project: store.project, levelId: 'lv_0', mpp: env.metersPerPixel(), gridStep: env.gridStep(), section: true, noGrid: true, extraPoints: [], extraSegments: [], ...extra }),
    result: () => result,
    hidden: () => hidden,
  } as unknown as SectionToolContext;
  env.section = () => sec;
  vi.spyOn(servicoGuardaCorpo(), 'corte').mockReturnValue({ linhas: [...LINHAS_HOSPEDADO, ...LINHAS_MANUAL], poligonos: [] });
  return { ...ctx, messages };
}

afterEach(() => vi.restoreAllMocks());

const stair = (p: Project): Stair => { const s = p.elements.st1; if (!isStair(s)) throw new Error('sem escada'); return s; };
const stairX = (p: Project): number => (stair(p).components[0] as StairRun).boundaryLeft[0]!.a.x;
const rail = (p: Project, id: string) => { const g = p.elements[id]; if (!isGuardaCorpo(g)) throw new Error('sem guarda-corpo'); return g; };
const manualX = (p: Project): number => { const h = rail(p, 'gc_m').hospedeiro; if (h.tipo !== 'manual') throw new Error('não é manual'); return h.caminho[0]!.x; };
const LOCKED = translate('pt', 'tl_msg_railing_hosted_locked');
/** Ponto base e depois destino, por clique (o mesmo fluxo da planta). */
const arrasta = (t: ReturnType<typeof tool>, de: [number, number], para: [number, number]) => { t.move(P(...de)); t.click(P(...de)); t.move(P(...para)); t.click(P(...para)); };
const click = (t: ReturnType<typeof tool>, x: number, y: number) => { t.move(P(x, y)); t.click(P(x, y)); };

describe('Mover no corte: escada, guarda-corpo manual e guarda-corpo hospedado', () => {
  it('escada selecionada: anda ao longo do corte e sobe (base e topo), com um só desfazer; o hospedado segue sem comando próprio', () => {
    const c = scene();
    c.env.setSelection(['st1']);
    const x0 = stairX(c.store.project);
    const t = tool('move', c.env);
    arrasta(t, [3, 0.5], [4, 1]);
    const p = c.store.project;
    expect(stairX(p)).toBeCloseTo(x0 + 1, 9);
    expect(stair(p).baseOffset).toBeCloseTo(0.5, 9);
    expect(stair(p).topOffset).toBeCloseTo(0.5, 9);
    expect(rail(p, 'gc_h').hospedeiro).toMatchObject({ tipo: 'escada', escadaId: 'st1' });
    expect(c.store.undoLabel).toBe('Mover no corte');
    c.store.undo();
    expect(stairX(c.store.project)).toBeCloseTo(x0, 9);
    expect(stair(c.store.project).baseOffset).toBe(0);
    c.store.redo();
    expect(stair(c.store.project).baseOffset).toBeCloseTo(0.5, 9);
  });

  it('guarda-corpo manual: anda em planta ao longo do corte e a cota base sobe', () => {
    const c = scene();
    c.env.setSelection(['gc_m']);
    arrasta(tool('move', c.env), [7, 0.5], [8, 0.9]);
    expect(manualX(c.store.project)).toBeCloseTo(7, 9);
    expect(rail(c.store.project, 'gc_m').cotaBase).toBeCloseTo(0.4, 9);
  });

  it('hospedado SOZINHO: a barra de status explica (já ao escolher Mover e de novo ao soltar) e nada muda', () => {
    const c = scene();
    c.env.setSelection(['gc_h']);
    const t = tool('move', c.env);
    expect(c.messages.at(-1)).toBe(LOCKED);
    const versao = c.store.version;
    c.messages.length = 0;
    arrasta(t, [3, 1.07], [4, 1.5]);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(LOCKED);
    expect(c.messages.at(-1)).toMatch(/escada|rampa/);
  });

  it('escada e hospedado juntos: anda como um só, sem recusar', () => {
    const c = scene();
    c.env.setSelection(['st1', 'gc_h']);
    const x0 = stairX(c.store.project);
    arrasta(tool('move', c.env), [3, 0.5], [3.5, 0.5]);
    expect(stairX(c.store.project)).toBeCloseTo(x0 + 0.5, 9);
    expect(c.messages.at(-1)).not.toBe(LOCKED);
  });

  it('sem seleção, o arraste sobre o elemento o seleciona e move (escada e guarda-corpo manual)', () => {
    const c = scene();
    const t = tool('move', c.env);
    const x0 = stairX(c.store.project);
    arrasta(t, [3, 0.5], [3.5, 0.5]);
    expect(c.env.selection()).toEqual(['st1']);
    expect(stairX(c.store.project)).toBeCloseTo(x0 + 0.5, 9);
    c.env.setSelection([]);
    arrasta(t, [7, 1.07], [7.5, 1.07]);
    expect(c.env.selection()).toEqual(['gc_m']);
    expect(manualX(c.store.project)).toBeCloseTo(6.5, 9);
  });

  it('sem seleção sobre o vazio: pede para selecionar e não muda nada', () => {
    const c = scene();
    const versao = c.store.version;
    arrasta(tool('move', c.env), [9, 2.5], [9.5, 2.5]);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toMatch(/Selecione/);
  });

  it('o que está oculto na vista não vira alvo do arraste', () => {
    const c = scene({ hidden: new Set<Id>(['gc_m']) });
    const versao = c.store.version;
    arrasta(tool('move', c.env), [7, 1.07], [7.5, 1.07]);
    expect(c.env.selection()).toEqual([]);
    expect(c.store.version).toBe(versao);
  });

  it('laje (sem inclinação): sobe pelo deslocamento de altura e anda ao longo do corte', () => {
    const c = scene({ slab: true });
    c.env.setSelection(['lj1']);
    arrasta(tool('move', c.env), [2, 2.9], [3, 3.4]);
    const lj = c.store.project.elements.lj1 as Slab;
    expect(lj.heightOffset).toBeCloseTo(0.5, 9);
    expect(lj.boundary[0]!.x).toBeCloseTo(1, 9);
  });

  it('parede continua sem movimento vertical, com a mensagem de sempre', () => {
    const c = scene();
    c.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }) });
    c.env.setSelection(['w1']);
    const versao = c.store.version;
    arrasta(tool('move', c.env), [0.5, 1], [0.5, 1.5]);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(translate('pt', 'tl_msg_section_move_vertical'));
  });
});

describe('Copiar no corte', () => {
  it('escada: cria a cópia com o guarda-corpo hospedado dela, na posição nova; a original fica; desfazer remove tudo', () => {
    const c = scene();
    c.env.setSelection(['st1']);
    const x0 = stairX(c.store.project);
    arrasta(tool('copy', c.env), [3, 0.5], [4, 1]);
    const p = c.store.project;
    const escadas = Object.values(p.elements).filter(isStair);
    const gcs = Object.values(p.elements).filter(isGuardaCorpo);
    expect(escadas).toHaveLength(2);
    expect(gcs).toHaveLength(3);
    const nova = escadas.find((s) => s.id !== 'st1')!;
    expect(stairX(p)).toBeCloseTo(x0, 9);
    expect((nova.components[0] as StairRun).boundaryLeft[0]!.a.x).toBeCloseTo(x0 + 1, 9);
    expect(nova.baseOffset).toBeCloseTo(0.5, 9);
    expect(nova.topOffset).toBeCloseTo(0.5, 9);
    expect(gcs.some((g) => g.hospedeiro.tipo === 'escada' && g.hospedeiro.escadaId === nova.id)).toBe(true);
    expect(stair(p).baseOffset).toBe(0);
    expect(c.store.undoLabel).toBe('Copiar no corte');
    c.store.undo();
    expect(Object.values(c.store.project.elements).filter(isStair)).toHaveLength(1);
    expect(Object.values(c.store.project.elements).filter(isGuardaCorpo)).toHaveLength(2);
    c.store.redo();
    expect(Object.values(c.store.project.elements).filter(isStair)).toHaveLength(2);
  });

  it('guarda-corpo manual: cópia na posição nova com a cota base somada; a original fica', () => {
    const c = scene();
    c.env.setSelection(['gc_m']);
    arrasta(tool('copy', c.env), [7, 0.5], [8, 0.8]);
    const gcs = Object.values(c.store.project.elements).filter(isGuardaCorpo);
    expect(gcs).toHaveLength(3);
    expect(manualX(c.store.project)).toBe(6);
    const nova = gcs.find((g) => g.id !== 'gc_h' && g.id !== 'gc_m')!;
    expect(nova.hospedeiro.tipo === 'manual' && nova.hospedeiro.caminho[0]!.x).toBeCloseTo(7, 9);
    expect(nova.cotaBase).toBeCloseTo(0.3, 9);
  });

  it('hospedado sozinho não se copia: mensagem na barra de status e nada nasce', () => {
    const c = scene();
    c.env.setSelection(['gc_h']);
    const versao = c.store.version;
    arrasta(tool('copy', c.env), [3, 1.07], [4, 1.5]);
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(LOCKED);
  });
});

describe('Alinhar no corte: escada e guarda-corpo como alvo e como referência', () => {
  it('referência no topo do guarda-corpo manual, alvo no topo da escada: a escada sobe até a cota e leva o hospedado', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 7, 1.095); // topo do corrimão do guarda-corpo manual: 1,10 m
    expect(c.messages.at(-1)).toMatch(/topo/);
    click(t, 3.5, 0.995); // topo da escada: 1,00 m
    const e = stair(c.store.project);
    expect(e.baseOffset).toBeCloseTo(0.1, 9);
    expect(e.topOffset).toBeCloseTo(0.1, 9);
    expect(rail(c.store.project, 'gc_h').hospedeiro).toMatchObject({ tipo: 'escada', escadaId: 'st1' });
    expect(c.store.undoLabel).toBe('Alinhar no corte');
    c.store.undo();
    expect(stair(c.store.project).baseOffset).toBe(0);
    c.store.redo();
    expect(stair(c.store.project).baseOffset).toBeCloseTo(0.1, 9);
  });

  it('referência no topo da escada, alvo no topo do guarda-corpo manual: a cota base dele desce', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 3.5, 0.995);
    click(t, 7, 1.095);
    expect(rail(c.store.project, 'gc_m').cotaBase).toBeCloseTo(-0.1, 9);
    expect(stair(c.store.project).baseOffset).toBe(0);
  });

  it('linha vertical: a face da escada vai ao longo do corte até o poste do guarda-corpo manual', () => {
    const c = scene();
    const t = tool('align', c.env);
    const x0 = stairX(c.store.project);
    click(t, 6, 0.5); // face esquerda do poste do guarda-corpo manual (t = 6)
    click(t, 2, 0.25); // face esquerda da escada (t = 2, de 0 a 0,5 m)
    expect(stairX(c.store.project)).toBeCloseTo(x0 + 4, 9);
    expect(c.store.undoLabel).toBe('Alinhar no corte');
    c.store.undo();
    expect(stairX(c.store.project)).toBeCloseTo(x0, 9);
  });

  it('guarda-corpo hospedado como ALVO: a mensagem fica na barra de status e nada muda', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 7, 1.095);
    const versao = c.store.version;
    click(t, 3, 1.095); // corrimão do hospedado
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(LOCKED);
  });

  it('guarda-corpo hospedado como REFERÊNCIA vale: o manual sobe até o topo dele', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 3, 1.095); // topo do corrimão do hospedado: 1,10 m
    expect(c.messages.at(-1)).toMatch(/topo/);
    click(t, 7, 1.095);
    // Já na mesma cota (1,10): nada a mover.
    expect(c.messages.at(-1)).toMatch(/já está alinhado/);
    // O hospedado continua como referência: a escada sobe até o topo dele.
    const u = tool('align', c.env);
    click(u, 3, 1.095);
    click(u, 3.5, 0.995);
    expect(stair(c.store.project).baseOffset).toBeCloseTo(0.1, 9);
  });

  it('aresta inclinada da escada não alinha: explica e não altera', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 7, 1.095);
    const versao = c.store.version;
    click(t, 2.5, 0.75); // aresta inclinada do chanfro
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toBe(translate('pt', 'tl_msg_edge_sloped_element'));
  });

  it('referência vertical não alinha linha horizontal (e o contrário)', () => {
    const c = scene();
    const t = tool('align', c.env);
    click(t, 4, 0.4); // face vertical da escada como referência
    const versao = c.store.version;
    click(t, 7, 1.099); // topo horizontal do manual
    expect(c.store.version).toBe(versao);
    expect(c.messages.at(-1)).toMatch(/incompatível/);
  });

  it('o que está oculto na vista não é alvo nem referência', () => {
    const c = scene({ hidden: new Set<Id>(['gc_m']) });
    const t = tool('align', c.env);
    click(t, 7, 1.095);
    expect(c.messages.at(-1)).toMatch(/Sem referência de linha/);
  });

  it('laje (sem inclinação) pode ser alvo: sobe pelo deslocamento de altura', () => {
    const c = scene({ slab: true });
    const t = tool('align', c.env);
    click(t, 7, 1.095); // 1,10 m
    click(t, 2.5, 2.995); // topo da laje: 3,00 m
    expect((c.store.project.elements.lj1 as Slab).heightOffset).toBeCloseTo(-1.9, 9);
  });
});

describe('comandosMoverNoCorte (o mecanismo único de Mover e Alinhar)', () => {
  it('hospedado sozinho vira bloqueado; com o hospedeiro na seleção, não', () => {
    const c = scene();
    const p = c.store.project;
    expect(comandosMoverNoCorte(p, ['gc_h'], { x: 1, y: 0 }, 1, 0.5)).toMatchObject({ commands: [], bloqueados: ['gc_h'] });
    const junto = comandosMoverNoCorte(p, ['st1', 'gc_h'], { x: 1, y: 0 }, 1, 0.5);
    expect(junto.bloqueados).toEqual([]);
    expect(junto.commands.map((x) => x.type)).toEqual(['transform', 'updateElements']);
  });

  it('rampa: sobe pela base e pelo topo, como a escada, e copia com os guarda-corpos dela', () => {
    const c = scene();
    c.store.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0' }) });
    const lado = { lance: true, patamar: true };
    c.store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_rp', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'rampa', rampaId: 'rp1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'lateral' } }) });
    const r = comandosMoverNoCorte(c.store.project, ['rp1'], { x: 1, y: 0 }, 0, 0.4);
    expect(r.commands).toEqual([{ type: 'updateElements', ids: ['rp1'], patch: { baseOffset: 0.4, topOffset: 0.4 } }]);
    const copia = comandosMoverNoCorte(c.store.project, ['rp1'], { x: 1, y: 0 }, 1, 0.4, true);
    expect(copia.copias).toHaveLength(1);
    c.store.transaction('copiar', () => { for (const cmd of copia.commands) c.store.exec(cmd); });
    const rampas = Object.values(c.store.project.elements).filter(isRamp) as Ramp[];
    expect(rampas).toHaveLength(2);
    const nova = rampas.find((x) => x.id !== 'rp1')!;
    expect(nova.baseOffset).toBeCloseTo(0.4, 9);
    expect(Object.values(c.store.project.elements).some((g) => isGuardaCorpo(g) && g.hospedeiro.tipo === 'rampa' && g.hospedeiro.rampaId === nova.id)).toBe(true);
  });

  it('a direção do corte entra no deslocamento em planta (corte diagonal)', () => {
    const c = scene();
    const r = comandosMoverNoCorte(c.store.project, ['st1'], { x: 0, y: 1 }, 2, 0);
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toMatchObject({ type: 'transform', transform: { kind: 'translate', d: { x: 0, y: 2 } } });
  });
});
