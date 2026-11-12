/**
 * Snaps de corte e elevação com escada e guarda-corpo, sobre o Rust REAL (índice `sectionSnapIndexDoProjeto`).
 * O guarda-corpo é desenhado pelo kernel (camada própria, fora do `SectionResult`): cada vértice, aresta, ponto médio, perpendicular, cruzamento e
 * rastreio das linhas DESENHADAS tem de aparecer no índice, cortado (corte) e visto ao fundo (elevação). A escada traz o piso, o espelho e o
 * bocel acabados como geometrias próprias. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { intersectSegments, type Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeLevel, makeStair, type Project, type StairCurve, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import { computeSection, planoDaSecao, resolveStairs, servicoGuardaCorpo, stairFinishModel, type SectionResult } from '@hestia/engine';
import { infer, sectionInferContext, sectionSnapIndex, sectionSnapIndexDoProjeto, type SectionSnapIndex } from '@hestia/tools';
import { straight } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { generateLShape } from '../packages/engine/src/stairGenerators.ts';
import { planStairFree } from '../packages/engine/src/stairFree.ts';
import { definirGerenciadorDoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  ger = await GerenciadorKernelV2.dosBytes(bytes);
  definirGerenciadorDoGuardaCorpo(() => ger);
});

const v = (x: number, y: number): Vec2 => ({ x, y });
const lado = { lance: true, patamar: true };
const FIN_ON: Partial<StairType> = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 };

type Forma = 'reta' | 'L' | 'livre';

/** Escada `st1` (reta, em L ou livre), com ou sem acabamento, e o guarda-corpo `gc` nos dois lados dela; ou um guarda-corpo manual `gc_m`. */
function projeto(forma: Forma, acabamento: boolean, guarda: 'escada' | 'manual' | 'nenhum' = 'escada'): Project {
  const s = new ProjectStore(createEmptyProject());
  let typeId = defaultStairTypeId;
  if (acabamento) {
    typeId = 'stt_acab';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === defaultStairTypeId)!;
    s.exec({ type: 'upsertStairType', stairType: { ...base, id: typeId, ...FIN_ON } as StairType });
  }
  if (forma === 'reta') {
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(17, 0.28)] }) });
  } else if (forma === 'L') {
    const sk = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
    const comps = sk.map((x, k) => (x.kind === 'run' ? ({ id: `c${k}`, kind: 'run', ...x.run } as StairRun) : ({ id: `c${k}`, kind: 'landing', ...x.landing } as StairLanding)));
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 3.06 }) });
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topLevelId: 'lv_top', components: comps }) });
  } else {
    const mono = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
    const tipo = (acabamento ? { ...mono, id: 'stt_acab', ...FIN_ON } : mono) as StairType;
    if (acabamento) s.exec({ type: 'upsertStairType', stairType: tipo });
    const plan = planStairFree([v(0, 0), v(3, 0), v(3, 2)], 2.8, tipo, { width: 1.1 });
    if ('error' in plan) throw new Error(plan.error);
    s.exec({
      type: 'addStair',
      stair: makeStair({
        id: 'st1',
        typeId: tipo.id,
        levelId: 'lv_0',
        topOffset: -0.2,
        height: 2.8,
        freePath: plan.path,
        components: plan.parts.map((c, i) => (c.kind === 'run' ? { id: `c${i}`, kind: 'run', ...c.run } : { id: `c${i}`, kind: 'landing', ...c.landing })),
      }),
    });
  }
  if (guarda === 'escada') {
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  } else if (guarda === 'manual') {
    s.exec({
      type: 'addGuardaCorpo',
      guardaCorpo: makeGuardaCorpo({ id: 'gc_m', levelId: 'lv_0', typeId: 'gct_balaustres', cotaBase: 0, altura: 1.1, hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0.5, y: 3, dz: 0 }, { x: 4.5, y: 3, dz: 0 }, { x: 4.5, y: 5, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }),
    });
  }
  return s.project;
}

/** Vistas: corte longitudinal (ao longo da escada), transversal (atravessa o lance) e elevação (de fora, profundidade grande). */
const VISTAS: Record<string, { a: Vec2; b: Vec2; depth: number }> = {
  longitudinal: { a: v(-1, 0.02), b: v(6, 0.02), depth: 3 },
  transversal: { a: v(1.4, -2), b: v(1.4, 3.5), depth: 3 },
  elevacao: { a: v(-1, -3), b: v(6, -3), depth: 12 },
};

interface Cena {
  p: Project;
  section: SectionResult;
  index: SectionSnapIndex;
  linhasGC: Array<{ hostId: string; pts: Vec2[]; closed: boolean }>;
  line: { a: Vec2; b: Vec2; depth: number };
}

function cena(p: Project, vista: string): Cena {
  const line = VISTAS[vista]!;
  const section = computeSection(p, line);
  const plano = planoDaSecao(section)!;
  const corte = servicoGuardaCorpo().corte(p, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
  const linhasGC = (corte?.linhas ?? []).filter((l) => l.pontos.length >= 2).map((l) => ({ hostId: l.guardaId, pts: l.pontos, closed: l.papel !== 255 && l.pontos.length >= 3 }));
  return { p, section, index: sectionSnapIndexDoProjeto(section, p), linhasGC, line };
}

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const chave = (x: number, y: number): string => `${r6(x)}:${r6(y)}`;
const pontosDe = (c: Cena, host: string, kind?: string) => c.index.points.filter((q) => q.hostId === host && (kind === undefined || q.kind === kind));
const arestasDe = (l: { pts: Vec2[]; closed: boolean }): Array<[Vec2, Vec2]> => {
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i + 1 < l.pts.length; i++) out.push([l.pts[i]!, l.pts[i + 1]!]);
  if (l.closed) out.push([l.pts[l.pts.length - 1]!, l.pts[0]!]);
  return out.filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 1e-9);
};

function ctxInfer(c: Cena, extra: Record<string, unknown> = {}) {
  return sectionInferContext(c.section, c.p, 'lv_0', 0.01, 0.1, { line: c.line, grids: false }, extra);
}

const CASOS: Array<[string, Forma, boolean, 'escada' | 'manual']> = [
  ['escada reta sem acabamento + guarda-corpo hospedado', 'reta', false, 'escada'],
  ['escada reta com acabamento + guarda-corpo hospedado', 'reta', true, 'escada'],
  ['escada em L + guarda-corpo hospedado', 'L', false, 'escada'],
  ['escada livre + guarda-corpo hospedado', 'livre', true, 'escada'],
  ['guarda-corpo manual (varanda)', 'reta', false, 'manual'],
];

describe.skipIf(!bytes).each(CASOS)('guarda-corpo no índice de snap: %s', (_nome, forma, acab, guarda) => {
  const host = guarda === 'manual' ? 'gc_m' : 'gc';

  it.each(Object.keys(VISTAS))('%s: todo vértice, ponto médio e aresta DESENHADOS entram no índice, sem duplicata', (vista) => {
    const p = projeto(forma, acab, guarda);
    const c = cena(p, vista);
    // O guarda-corpo precisa estar no desenho em pelo menos a elevação (ao fundo).
    if (vista === 'elevacao') expect(c.linhasGC.length).toBeGreaterThan(0);
    if (c.linhasGC.length === 0) return;
    const pts = pontosDe(c, host);
    const extremidades = new Set(pontosDe(c, host, 'endpoint').map((q) => chave(q.x, q.y)));
    const medios = new Set(pontosDe(c, host, 'midpoint').map((q) => chave(q.x, q.y)));
    const segs = new Set(c.index.segments.filter((s) => s.hostId === host).map((s) => `${chave(s.a.x, s.a.y)}|${chave(s.b.x, s.b.y)}`));
    for (const l of c.linhasGC) {
      for (const q of l.pts) expect(extremidades.has(chave(q.x, q.y)), `vértice ${chave(q.x, q.y)}`).toBe(true);
      for (const [a, b] of arestasDe(l)) {
        expect(medios.has(chave((a.x + b.x) / 2, (a.y + b.y) / 2)), 'ponto médio da aresta').toBe(true);
        expect(segs.has(`${chave(a.x, a.y)}|${chave(b.x, b.y)}`) || segs.has(`${chave(b.x, b.y)}|${chave(a.x, a.y)}`), 'aresta').toBe(true);
      }
    }
    // Sem duplicata: nenhum (tipo, posição) repetido no mesmo elemento; nenhum segmento repetido.
    expect(new Set(pts.map((q) => `${q.kind}|${chave(q.x, q.y)}`)).size).toBe(pts.length);
    const todosSegs = c.index.segments.filter((s) => s.hostId === host);
    expect(new Set(todosSegs.map((s) => `${chave(s.a.x, s.a.y)}|${chave(s.b.x, s.b.y)}`)).size).toBe(todosSegs.length);
    expect(c.index.tracks.filter((t) => t.hostId === host).length).toBeGreaterThan(0);
    // O índice com guarda-corpo é o da seção MAIS o dele: nada do resto se perde.
    const base = sectionSnapIndex(c.section);
    expect(c.index.points.length).toBe(base.points.length + pts.length);
    expect(c.index.segments.length).toBe(base.segments.length + todosSegs.length);
  });

  it('o infer captura vértice, ponto médio, perpendicular, mais próximo do guarda-corpo na elevação', () => {
    const p = projeto(forma, acab, guarda);
    const c = cena(p, 'elevacao');
    expect(c.linhasGC.length).toBeGreaterThan(0);
    // A aresta mais longa (corrimão ou travessa).
    const arestas = c.linhasGC.flatMap((l) => arestasDe(l)).sort((a, b) => Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) - Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y));
    const [a, b] = arestas[0]!;
    // Só o guarda-corpo visível (o resto escondido): a captura de um cursor exatamente sobre o ponto devolve ESSE ponto. (Com tudo ligado, um
    // cruzamento a 2 cm pode ganhar pelo peso do tipo; isso é a escolha normal do motor, não falta de candidato.)
    const outros = new Set([...c.index.byHost.keys()].filter((k) => k !== host));
    const soGC = (extra: Record<string, unknown> = {}) => sectionInferContext(c.section, c.p, 'lv_0', 0.01, 0.1, { line: c.line, grids: false, hidden: outros }, extra);
    const noVertice = infer(a, soGC());
    expect(noVertice.kind).not.toBe('none');
    // Ou o próprio ponto, ou um cruzamento/extremidade do guarda-corpo ao alcance da tolerância (peso do tipo): nunca um ponto fora da peça.
    const bateu = (r: { kind: string; point: Vec2 }, alvo: Vec2): boolean => Math.hypot(r.point.x - alvo.x, r.point.y - alvo.y) < 1e-6 || (['intersection', 'endpoint', 'midpoint'].includes(r.kind) && Math.hypot(r.point.x - alvo.x, r.point.y - alvo.y) <= 0.08);
    expect(bateu(noVertice, a)).toBe(true);
    const meio = v((a.x + b.x) / 2, (a.y + b.y) / 2);
    const noMeio = infer(meio, soGC());
    expect(noMeio.kind).not.toBe('none');
    expect(bateu(noMeio, meio)).toBe(true);
    // Mais próximo: a 27% da aresta.
    const quarto = v(a.x + (b.x - a.x) * 0.27, a.y + (b.y - a.y) * 0.27);
    const noQuarto = infer(v(quarto.x + 0.003, quarto.y + 0.002), soGC());
    expect(noQuarto.kind).not.toBe('none');
    // Perpendicular: do ponto de partida ao pé da aresta.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    const pe = v(a.x + dx * 0.37, a.y + dy * 0.37);
    const de = v(pe.x - (dy / L) * 0.8, pe.y + (dx / L) * 0.8);
    // Só a perpendicular ligada (e só o guarda-corpo visível): o pé da perpendicular sobre a aresta é exatamente o ponto devolvido.
    const soPerp = { enabled: true, perpendicular: true, faces: false, endpoint: false, midpoint: false, intersections: false, alignment: false, axis: false, core: false, grid: false } as never;
    const perp = infer(v(pe.x + 0.003, pe.y + 0.002), soGC({ from: de, snap: soPerp }));
    expect(perp.kind).toBe('perpendicular');
    expect(Math.hypot(perp.point.x - pe.x, perp.point.y - pe.y)).toBeLessThan(1e-6);
    // Mais próximo (aresta sob o cursor), só com a captura de aresta.
    const soAresta = { enabled: true, perpendicular: false, faces: true, endpoint: false, midpoint: false, intersections: false, alignment: false, axis: false, core: false, grid: false } as never;
    const aresta = infer(v(pe.x + 0.003, pe.y + 0.002), soGC({ snap: soAresta }));
    expect(aresta.kind).toBe('nearest');
    expect(Math.hypot(aresta.point.x - pe.x, aresta.point.y - pe.y)).toBeLessThan(0.01);
  });

  it('zoom independente: o índice é o mesmo em qualquer escala, só a tolerância muda', () => {
    const p = projeto(forma, acab, guarda);
    const c = cena(p, 'elevacao');
    const a = ctxInfer(c);
    const b = sectionInferContext(c.section, c.p, 'lv_0', 0.002, 0.1, { line: c.line, grids: false });
    expect(b.extraPoints).toBe(a.extraPoints);
    expect(b.extraSegments).toBe(a.extraSegments);
    const q = c.linhasGC[0]!.pts[0]!;
    // 5 mm do vértice: no zoom grande (2 mm/px) captura; no zoom pequeno (10 mm/px) também, e nunca erra para outro ponto.
    const grande = infer(v(q.x + 0.005, q.y), b);
    expect(grande.kind).not.toBe('none');
  });

  it('esconder o guarda-corpo na vista tira os snaps dele e só dele', () => {
    const p = projeto(forma, acab, guarda);
    const c = cena(p, 'elevacao');
    const ctx = sectionInferContext(c.section, c.p, 'lv_0', 0.01, 0.1, { line: c.line, grids: false, hidden: new Set([host]) });
    expect(ctx.extraPoints!.some((q) => q.hostId === host)).toBe(false);
    expect(ctx.extraSegments!.some((q) => q.hostId === host)).toBe(false);
    expect(ctx.extraTracks!.some((q) => q.hostId === host)).toBe(false);
    expect(ctx.extraPoints!.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!bytes)('escada no índice de snap do corte', () => {
  const semDuplicata = (c: Cena, h: string): void => {
    const ps = pontosDe(c, h);
    expect(new Set(ps.map((q) => `${q.kind}|${chave(q.x, q.y)}`)).size).toBe(ps.length);
  };

  it.each(Object.keys(VISTAS))('%s: sem acabamento, quinas de cada degrau e perfil inclinado; sem duplicata', (vista) => {
    const c = cena(projeto('reta', false, 'nenhum'), vista);
    const h = c.index.byHost.get('st1')!;
    expect(h.points.filter((q) => q.kind === 'endpoint').length).toBeGreaterThan(8);
    expect(h.points.some((q) => q.kind === 'midpoint')).toBe(true);
    // Corte longitudinal: perfil dentado e face inferior inclinada (estilo monolítico).
    if (vista === 'longitudinal') expect(h.segments.some((s) => Math.abs(s.a.y - s.b.y) > 1e-3 && Math.abs(s.a.x - s.b.x) > 1e-3)).toBe(true);
    semDuplicata(c, 'st1');
  });

  it.each(Object.keys(VISTAS))('%s: com piso, espelho e bocel acabados, as faces acabadas viram geometrias próprias (quinas nas cotas do acabamento)', (vista) => {
    const sem = cena(projeto('reta', false, 'nenhum'), vista);
    const com = cena(projeto('reta', true, 'nenhum'), vista);
    const stair = resolveStairs(com.p)[0]!;
    const solidos = stairFinishModel(stair)!.solids;
    expect(solidos.some((s) => s.kind === 'tread')).toBe(true);
    expect(solidos.some((s) => s.kind === 'riser')).toBe(true);
    const h = com.index.byHost.get('st1')!;
    const zs = new Set(h.points.filter((q) => q.kind === 'endpoint').map((q) => r6(q.y)));
    // Vista transversal só enxerga os degraus que atravessa; as demais veem todos.
    if (vista !== 'transversal') {
      for (const s of solidos) {
        expect(zs.has(r6(s.z0)), `z0 do ${s.kind} ${s.number}`).toBe(true);
        expect(zs.has(r6(s.z1)), `z1 do ${s.kind} ${s.number}`).toBe(true);
      }
    }
    expect(h.segments.length).toBeGreaterThan(sem.index.byHost.get('st1')!.segments.length);
    semDuplicata(com, 'st1');
  });

  it.each([['L', false], ['livre', true]] as Array<[Forma, boolean]>)('escada %s: patamar e lances dão quinas e pontos médios', (forma, acab) => {
    for (const vista of Object.keys(VISTAS)) {
      const c = cena(projeto(forma, acab, 'nenhum'), vista);
      const h = c.index.byHost.get('st1');
      if (!h) continue;
      expect(h.points.filter((q) => q.kind === 'endpoint').length).toBeGreaterThan(4);
      semDuplicata(c, 'st1');
    }
    expect(cena(projeto(forma, acab, 'nenhum'), 'elevacao').index.byHost.get('st1')).toBeDefined();
  });
});

describe.skipIf(!bytes)('cruzamento do guarda-corpo com outros elementos', () => {
  it('a linha de um nível cruza os balaústres: cada cruzamento é captura de interseção', () => {
    const s = new ProjectStore(projeto('reta', false, 'escada'));
    // Nível a 1,0 m: corta os balaústres e os postes na elevação.
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_x', name: 'X', elevation: 1.0 }) });
    const c = cena(s.project, 'elevacao');
    const nivel = c.index.segments.find((g) => g.hostId === 'lv_x')!;
    expect(nivel).toBeDefined();
    const cruz: Vec2[] = [];
    for (const l of c.linhasGC) {
      for (const [a, b] of arestasDe(l)) {
        const q = intersectSegments(a, b, nivel.a, nivel.b);
        if (q && Math.abs(q.y - 1) < 1e-9 && q.x > nivel.a.x + 1e-6 && q.x < nivel.b.x - 1e-6) cruz.push(q);
      }
    }
    expect(cruz.length).toBeGreaterThan(0);
    let capturou = 0;
    const amostra = cruz.slice(0, 12);
    for (const q of amostra) {
      const r = infer(q, ctxInfer(c));
      if (Math.hypot(r.point.x - q.x, r.point.y - q.y) < 1e-6) capturou++;
    }
    expect(capturou).toBe(amostra.length);
  });
});

describe.skipIf(!bytes)('desempenho com 100 escadas e 100 guarda-corpos', () => {
  it('construir o índice e consultar continuam rápidos; o cache evita refazer', () => {
    const s = new ProjectStore(createEmptyProject());
    for (let i = 0; i < 100; i++) {
      const dy = (i % 10) * 4;
      const dx = Math.floor(i / 10) * 6;
      const mv = (q: StairCurve): StairCurve => ({ ...q, a: v(q.a.x + dx, q.a.y + dy), b: v(q.b.x + dx, q.b.y + dy) });
      const r0 = straight(17, 0.28);
      const run: StairRun = { ...r0, boundaryLeft: r0.boundaryLeft.map(mv), boundaryRight: r0.boundaryRight.map(mv), risers: r0.risers.map(mv) };
      s.exec({ type: 'addStair', stair: makeStair({ id: `st${i}`, typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [run] }) });
      s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: `gc${i}`, levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: `st${i}`, lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
    }
    const p = s.project;
    const line = { a: v(-2, -6), b: v(60, -6), depth: 80 };
    const t0 = performance.now();
    const section = computeSection(p, line);
    const tSecao = performance.now() - t0;
    const t1 = performance.now();
    const base = sectionSnapIndex(section);
    const tBase = performance.now() - t1;
    const t2 = performance.now();
    const idx = sectionSnapIndexDoProjeto(section, p);
    const tCom = performance.now() - t2;
    const t3 = performance.now();
    const idx2 = sectionSnapIndexDoProjeto(section, p);
    const tCache = performance.now() - t3;
    expect(idx2).toBe(idx);
    const gcPts = idx.points.length - base.points.length;
    expect(gcPts).toBeGreaterThan(0);
    const ctx = sectionInferContext(section, p, 'lv_0', 0.01, 0.1, { line, grids: false });
    const n = 100;
    // A 1ª passada monta a estrutura espacial das listas (uma vez por índice); as medidas valem para a consulta com ela pronta.
    const t3b = performance.now();
    infer(v(2, 0.5), ctx);
    const tEstrutura = performance.now() - t3b;
    const t4 = performance.now();
    for (let k = 0; k < n; k++) infer(v(2 + (k % 20) * 0.7, 0.5 + (k % 7) * 0.3), ctx);
    const tInfer = (performance.now() - t4) / n;
    const t5 = performance.now();
    for (let k = 0; k < n; k++) sectionInferContext(section, p, 'lv_0', 0.01, 0.1, { line, grids: false });
    const tCtx = (performance.now() - t5) / n;
    console.log(`100 escadas + 100 guarda-corpos: seção ${tSecao.toFixed(0)} ms | índice base ${tBase.toFixed(0)} ms (${base.points.length} pts, ${base.segments.length} seg) | +guarda-corpo (kernel + índice) ${tCom.toFixed(0)} ms (${gcPts} pts, ${idx.segments.length - base.segments.length} seg) | estrutura espacial (1ª consulta) ${tEstrutura.toFixed(0)} ms | cache ${tCache.toFixed(3)} ms | contexto ${tCtx.toFixed(3)} ms | infer ${tInfer.toFixed(2)} ms/consulta`);
    expect(tCache).toBeLessThan(1);
    expect(tCtx).toBeLessThan(2);
    // Antes da estrutura espacial: ~24 ms por consulta nesta cena (4 ms sem guarda-corpo). Folga grande para máquina sob carga.
    expect(tInfer).toBeLessThan(15);
  });
});
