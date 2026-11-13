/**
 * Cenário de estabilidade de escadas e guarda-corpos (sem projeto real). Monta um prédio sintético com vários níveis de alturas diferentes, insere
 * escadas retas, em L, em U e livres (com e sem acabamento e bocel, guarda-corpo hospedado dos dois lados, sobrepostas e ligando níveis que não são
 * vizinhos) e percorre o que o app faz com elas: 3D, plantas, cortes, elevações, ocultar/isolar, mover/copiar com o guarda-corpo, desfazer/refazer
 * em lote, salvar/reabrir e exportar IFC. Cada passo mede o tempo; o ciclo devolve um resumo determinístico (resumo de conteúdo), para provar que
 * duas execuções dão o mesmo resultado.
 *
 * O mesmo código roda com a escala reduzida na suíte (`tests/estabilidade-escadas.test.ts`, `tests/kernel-gc-estabilidade.wasm.test.ts`) e em
 * escala cheia sobre uma cópia de projeto de prédio (`scripts/estabilidade-predio.mts`).
 */
import { createHash } from 'node:crypto';
import { computeSection, generateLShape, generateStraightRun, generateUShape, planStairFree, resolveLevel, resolveSlabs, resolveFloors, resolveRoofs, SecaoIncremental, type StairComponentSketch } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import {
  DEFAULT_STAIR_TYPES,
  ProjectStore,
  createEmptyProject,
  levelElevation,
  makeGuardaCorpo,
  makeLevel,
  makeSlab,
  makeStair,
  makeWall,
  migrateProject,
  type Command,
  type Id,
  type Project,
  type StairLanding,
  type StairRun,
  type StairType,
} from '@hestia/model';
import { LIGHT, ModelScene, buildPlanDrawList, buildSectionDrawList, type PlanInput } from '@hestia/render';
import { projectIfc } from '../../apps/web/src/editor/ifcExport.ts';

export type FormaEscada = 'reta' | 'L' | 'U' | 'livre';
export const FORMAS: readonly FormaEscada[] = ['reta', 'L', 'U', 'livre'];

export interface Passo {
  nome: string;
  ms: number;
}

export interface RelatorioDoCiclo {
  passos: Passo[];
  /** Resumo determinístico do conteúdo (cortes, plantas, 3D, IFC, arquivo salvo): igual em duas execuções do mesmo cenário. */
  resumo: string;
  /** Maior bloqueio (ms) de um passo. */
  maiorPasso: number;
}

const ms = <T>(passos: Passo[], nome: string, f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  passos.push({ nome, ms: performance.now() - t0 });
  return r;
};

const hash = (...partes: unknown[]): string => createHash('sha1').update(JSON.stringify(partes, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))).digest('hex').slice(0, 16);

// ----------------------------------------------------------------------------------------------------------------------------------------
// Montagem do projeto
// ----------------------------------------------------------------------------------------------------------------------------------------

const ACABAMENTO = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01 } as const;

/** Tipos de escada do cenário: o monolítico padrão, um com acabamento sem bocel e outro com acabamento e bocel. */
export function tiposDeEscadaDoCenario(): StairType[] {
  const base = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
  return [
    { ...base, id: 'stt_est_acab', ...ACABAMENTO, bocelEnabled: false, bocelProjection: 0 } as StairType,
    { ...base, id: 'stt_est_bocel', ...ACABAMENTO, bocelEnabled: true, bocelProjection: 0.02 } as StairType,
  ];
}

/** Prédio sintético: `niveis` pavimentos de alturas diferentes, casca de 4 paredes, uma divisória e uma laje por nível. */
export function predioSintetico(niveis: number): ProjectStore {
  const store = new ProjectStore(createEmptyProject('Estabilidade'));
  const wallType = store.project.defaults.wallTypeId;
  const cmds: Command[] = tiposDeEscadaDoCenario().map((stairType) => ({ type: 'upsertStairType', stairType }));
  let z = 0;
  for (let k = 0; k < niveis; k++) {
    const id = k === 0 ? 'lv_0' : `lv_${k}`;
    if (k > 0) cmds.push({ type: 'upsertLevel', level: makeLevel({ id, name: `Pav ${k}`, elevation: z }) });
    const lv = id;
    const box: Vec2[] = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 14 }, { x: 0, y: 14 }];
    box.forEach((a, i) => cmds.push({ type: 'addWall', wall: makeWall({ id: `w${k}_${i}`, typeId: wallType, levelId: lv, a, b: box[(i + 1) % 4]! }) }));
    cmds.push({ type: 'addWall', wall: makeWall({ id: `w${k}_d`, typeId: wallType, levelId: lv, a: { x: 12, y: 0 }, b: { x: 12, y: 14 } }) });
    cmds.push({ type: 'addSlab', slab: makeSlab({ id: `sl${k}`, typeId: 'ls_mac15', levelId: lv, boundary: box }) });
    z += 2.9 + (k % 3) * 0.15;
  }
  store.exec({ type: 'batch', commands: cmds });
  return store;
}

export interface OpcoesEscadas {
  /** Quantas escadas por par de níveis (a forma gira entre `FORMAS`). */
  porNivel: number;
  /** Escadas extras que ligam o nível k ao k+2 (alturas diferentes). */
  longas?: number;
  /** Sobrepõe uma escada reta a cada três níveis. */
  sobrepostas?: boolean;
}

export interface EscadasInseridas {
  escadas: Id[];
  guardas: Id[];
}

function componentes(sk: StairComponentSketch[]): Array<StairRun | StairLanding> {
  return sk.map((c, i) => (c.kind === 'run' ? ({ id: `c${i}`, kind: 'run', ...c.run } as StairRun) : ({ id: `c${i}`, kind: 'landing', ...c.landing } as StairLanding)));
}

/** Escada da forma pedida entre as cotas dadas, com origem em `o`; a altura define o número de espelhos (cerca de 17 cm). */
function esbocoDaForma(forma: FormaEscada, o: Vec2, altura: number, tipo: StairType): Array<StairRun | StairLanding> {
  const N = Math.max(4, Math.ceil(altura / 0.175));
  const T = 0.27;
  if (forma === 'reta') return componentes([{ kind: 'run', run: generateStraightRun({ start: o, dir: { x: 1, y: 0 }, width: 1.2, risers: N, tread: T }) }]);
  if (forma === 'L') return componentes(generateLShape({ start: o, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: T, risersFirst: Math.ceil(N / 2), risersSecond: N - Math.ceil(N / 2) }));
  if (forma === 'U') return componentes(generateUShape({ start: o, dir: { x: 1, y: 0 }, turn: 'left', width: 1.1, tread: T, risersFirst: Math.ceil(N / 2), risersSecond: N - Math.ceil(N / 2) }));
  const r = planStairFree([o, { x: o.x + 3, y: o.y }, { x: o.x + 3, y: o.y + 3 }, { x: o.x + 6, y: o.y + 3 }], altura, tipo, { width: 1.2 });
  if ('error' in r) throw new Error(r.error);
  return componentes(r.parts);
}

/** Insere as escadas (e o guarda-corpo hospedado dos dois lados em cada uma) nos níveis do projeto. */
export function inserirEscadas(store: ProjectStore, op: OpcoesEscadas): EscadasInseridas {
  const p = store.project;
  const niveis = p.levels.map((l) => l.id);
  const tipos = ['stt_monolitica', 'stt_est_acab', 'stt_est_bocel'];
  const lado = { lance: true, patamar: true };
  const cmds: Command[] = [];
  const out: EscadasInseridas = { escadas: [], guardas: [] };
  let n = 0;
  const colocar = (k: number, topo: number, forma: FormaEscada, slot: number, sobre: boolean): void => {
    const typeId = tipos[n % tipos.length]!;
    const tipo = p.stairTypes[typeId] ?? tiposDeEscadaDoCenario().find((t) => t.id === typeId) ?? DEFAULT_STAIR_TYPES[0]!;
    const base = niveis[k]!;
    const alto = niveis[topo]!;
    const altura = levelElevation(p, alto) - levelElevation(p, base);
    const origem: Vec2 = { x: 1.5 + slot * 0.6, y: 2 + (sobre ? 0.01 : slot * 3.2) };
    const id = `est_${n}`;
    cmds.push({ type: 'addStair', stair: makeStair({ id, typeId, levelId: base, topLevelId: alto, components: esbocoDaForma(forma, origem, altura, tipo) }) });
    out.escadas.push(id);
    const g = `gc_${n}`;
    cmds.push({
      type: 'addGuardaCorpo',
      guardaCorpo: makeGuardaCorpo({ id: g, levelId: base, typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: id, lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }),
    });
    out.guardas.push(g);
    n++;
  };
  for (let k = 0; k + 1 < niveis.length; k++) {
    for (let s = 0; s < op.porNivel; s++) colocar(k, k + 1, FORMAS[(k + s) % FORMAS.length]!, s, false);
    if (op.sobrepostas && k % 3 === 0) colocar(k, k + 1, 'reta', 0, true);
  }
  for (let s = 0; s < (op.longas ?? 0); s++) {
    const k = (s * 2) % Math.max(1, niveis.length - 2);
    if (k + 2 < niveis.length) colocar(k, k + 2, FORMAS[s % FORMAS.length]!, 3, false);
  }
  // Um guarda-corpo manual (varanda) em cada dois níveis.
  niveis.forEach((lv, k) => {
    if (k % 2 !== 0) return;
    const g = `gm_${k}`;
    cmds.push({
      type: 'addGuardaCorpo',
      guardaCorpo: makeGuardaCorpo({ id: g, levelId: lv, typeId: 'gct_balaustres', cotaBase: levelElevation(p, lv), altura: 1.1, hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 14, y: 12, dz: 0 }, { x: 22, y: 12, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }),
    });
    out.guardas.push(g);
  });
  store.exec({ type: 'batch', commands: cmds });
  return out;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// Percurso
// ----------------------------------------------------------------------------------------------------------------------------------------

const vp = { cx: 12, cy: 7, zoom: 30, width: 1400, height: 800 };

function caixaDoProjeto(p: Project): { minX: number; minY: number; maxX: number; maxY: number } {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'wall') continue;
    for (const q of [e.a, e.b]) {
      b.minX = Math.min(b.minX, q.x);
      b.minY = Math.min(b.minY, q.y);
      b.maxX = Math.max(b.maxX, q.x);
      b.maxY = Math.max(b.maxY, q.y);
    }
  }
  return b;
}

/** Linhas dos cortes (longitudinal e transversal, atravessando as escadas) e das 4 elevações. */
export function linhasDeVista(p: Project): Array<{ nome: string; a: Vec2; b: Vec2; depth: number }> {
  const b = caixaDoProjeto(p);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const m = 6;
  return [
    { nome: 'corte-longitudinal-1', a: { x: b.minX - 1, y: 2.6 }, b: { x: b.maxX + 1, y: 2.6 }, depth: h },
    { nome: 'corte-longitudinal-2', a: { x: b.minX - 1, y: 5.8 }, b: { x: b.maxX + 1, y: 5.8 }, depth: h },
    { nome: 'corte-transversal-1', a: { x: 4, y: b.minY - 1 }, b: { x: 4, y: b.maxY + 1 }, depth: w },
    { nome: 'corte-transversal-2', a: { x: 9, y: b.maxY + 1 }, b: { x: 9, y: b.minY - 1 }, depth: w },
    { nome: 'elev-sul', a: { x: b.minX - m, y: b.minY - m }, b: { x: b.maxX + m, y: b.minY - m }, depth: h + 2 * m },
    { nome: 'elev-norte', a: { x: b.maxX + m, y: b.maxY + m }, b: { x: b.minX - m, y: b.maxY + m }, depth: h + 2 * m },
    { nome: 'elev-leste', a: { x: b.maxX + m, y: b.minY - m }, b: { x: b.maxX + m, y: b.maxY + m }, depth: w + 2 * m },
    { nome: 'elev-oeste', a: { x: b.minX - m, y: b.maxY + m }, b: { x: b.minX - m, y: b.minY - m }, depth: w + 2 * m },
  ];
}

function triangulosDaCena(cena: ModelScene): number {
  let n = 0;
  cena.scene.traverse((o) => {
    const g = (o as unknown as { geometry?: { index?: { count: number } | null; getAttribute: (s: string) => { count: number } | undefined } }).geometry;
    if (!g) return;
    n += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });
  return Math.round(n);
}

export interface ContextoDoCiclo {
  cena: ModelScene;
  incremental: SecaoIncremental;
}

export function novoContexto(): ContextoDoCiclo {
  return { cena: new ModelScene(), incremental: new SecaoIncremental() };
}

export function soltarContexto(c: ContextoDoCiclo): void {
  c.cena.dispose();
}

/** Abre 3D, gera plantas, cortes e elevações (completas e incrementais), com e sem ocultos/isolados; devolve o resumo do conteúdo. */
export function abrirTudo(p: Project, ctx: ContextoDoCiclo, passos: Passo[], escadas: readonly Id[], guardas: readonly Id[]): string {
  const partes: unknown[] = [];
  const opt = { edges: true, shadows: false, dark: false };
  // 3D completo, depois ocultando metade das escadas e dos guarda-corpos, depois isolando uma só.
  ms(passos, '3d', () => ctx.cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), opt));
  partes.push(['3d', triangulosDaCena(ctx.cena)]);
  const ocultos = new Set<Id>([...escadas.filter((_, i) => i % 2 === 0), ...guardas.filter((_, i) => i % 2 === 0)]);
  ms(passos, '3d-ocultando', () => ctx.cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { ...opt, hidden: ocultos }));
  partes.push(['3d-ocultos', triangulosDaCena(ctx.cena)]);
  const sobra = new Set<Id>([...Object.keys(p.elements)].filter((id) => id !== escadas[0] && id !== guardas[0]));
  ms(passos, '3d-isolando', () => ctx.cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { ...opt, hidden: sobra }));
  partes.push(['3d-isolado', triangulosDaCena(ctx.cena)]);
  ms(passos, '3d-volta', () => ctx.cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), opt));
  partes.push(['3d-volta', triangulosDaCena(ctx.cena)]);
  // Plantas de todos os níveis.
  p.levels.forEach((l, i) => {
    const dl = ms(passos, 'planta', () => {
      const resolved = resolveLevel(p, l.id);
      const abaixo = i > 0 ? p.levels[i - 1]!.id : null;
      const input: PlanInput = {
        project: p,
        levelId: l.id,
        resolved,
        below: abaixo ? resolveLevel(p, abaixo) : null,
        belowFloors: abaixo ? resolveFloors(p, abaixo) : undefined,
        belowSlabs: abaixo ? resolveSlabs(p, abaixo) : undefined,
        belowRoofs: abaixo ? resolveRoofs(p, abaixo) : undefined,
        viewport: vp,
        theme: LIGHT,
        dark: false,
        selection: [],
        hover: null,
        preview: [],
        inference: null,
        showGrid: true,
        showRoofProjection: true,
      } as PlanInput;
      return buildPlanDrawList(input);
    });
    partes.push(['planta', l.id, dl.fills.length, dl.strokes.length]);
  });
  // Cortes e elevações: completos, com o incremental, e com ocultos.
  for (const l of linhasDeVista(p)) {
    const line = { a: l.a, b: l.b, depth: l.depth };
    const s = ms(passos, l.nome.startsWith('elev') ? 'elevacao' : 'corte', () => computeSection(p, line));
    const dl = ms(passos, 'corte-desenho', () => buildSectionDrawList({ project: p, section: s, viewport: { ...vp, cx: s.length / 2, cy: (s.zMin + s.zMax) / 2 }, theme: LIGHT, dark: false, showGrid: false }));
    const si = ms(passos, 'corte-incremental', () => ctx.incremental.calcular(p, line));
    const dlo = ms(passos, 'corte-ocultando', () =>
      buildSectionDrawList({ project: p, section: s, viewport: { ...vp, cx: s.length / 2, cy: (s.zMin + s.zMax) / 2 }, theme: LIGHT, dark: false, showGrid: false, hidden: ocultos }),
    );
    partes.push([l.nome, s.cut.length, s.beyond.length, s.silhouette.length, hash(s.cut.map((c) => c.polygons)), dl.fills.length, dl.strokes.length, si.cut.length, si.beyond.length, dlo.strokes.length]);
  }
  return hash(partes);
}

/**
 * Estado dos elementos para comparar execuções: a cópia gera ids novos (aleatórios) para os lances e patamares do croqui, então eles ficam de fora;
 * o resto (posições, cotas, tipos, hospedeiros) entra inteiro.
 */
function estadoDe(p: Project): string {
  const chaves = Object.keys(p.elements).sort();
  return hash(
    chaves,
    chaves.map((k) => {
      const e = p.elements[k] as unknown as { components?: Array<Record<string, unknown>> };
      return e.components ? { ...e, components: e.components.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'id'))) } : e;
    }),
  );
}

/** Mover e copiar escadas (com o guarda-corpo), em lote, e desfazer/refazer; devolve o resumo do estado final. */
export function editarEmLote(store: ProjectStore, passos: Passo[], escadas: readonly Id[], guardas: readonly Id[], rodada: number): string {
  const antes = estadoDe(store.project);
  const dx = 0.35 + (rodada % 3) * 0.1;
  const alvo = escadas.slice(0, Math.max(2, Math.min(6, escadas.length)));
  ms(passos, 'mover-lote', () => store.exec({ type: 'transform', ids: [...alvo], transform: { kind: 'translate', d: { x: dx, y: 0.2 } } }));
  const idMap: Record<Id, Id> = {};
  alvo.forEach((id, i) => {
    idMap[id] = `${id}_c${rodada}`;
    const gc = guardas[escadas.indexOf(id)];
    if (gc) idMap[gc] = `${gc}_c${rodada}`;
    void i;
  });
  ms(passos, 'copiar-lote', () => store.exec({ type: 'transform', ids: [...alvo], transform: { kind: 'translate', d: { x: 0, y: 4.5 } }, copy: { idMap } }));
  const meio = estadoDe(store.project);
  ms(passos, 'desfazer-2', () => {
    store.undo();
    store.undo();
  });
  const volta = estadoDe(store.project);
  if (volta !== antes) throw new Error('desfazer em lote não devolveu o estado anterior');
  ms(passos, 'refazer-2', () => {
    store.redo();
    store.redo();
  });
  if (estadoDe(store.project) !== meio) throw new Error('refazer em lote não devolveu o estado editado');
  // Deixa o projeto como estava (para os ciclos repetidos): desfaz de novo.
  ms(passos, 'desfazer-final', () => {
    store.undo();
    store.undo();
  });
  return hash(antes, meio, volta);
}

/** Salva (serializa), reabre (migra) e confere que o projeto reaberto é o mesmo; devolve o resumo do arquivo. */
export function salvarEReabrir(p: Project, passos: Passo[]): { resumo: string; reaberto: Project } {
  const texto = ms(passos, 'salvar', () => JSON.stringify(p));
  const reaberto = ms(passos, 'reabrir', () => migrateProject(JSON.parse(texto)));
  const a = hash(Object.keys(p.elements).sort());
  const b = hash(Object.keys(reaberto.elements).sort());
  if (a !== b) throw new Error('o projeto reaberto tem outros elementos');
  return { resumo: hash(texto.length, a), reaberto };
}

export function exportarIfc(p: Project, passos: Passo[]): string {
  const texto = ms(passos, 'ifc', () => projectIfc(p, new Date(0), 'pt'));
  return hash(texto.length, texto.replace(/FILE_NAME\([^;]*;/, ''));
}

/** Um ciclo completo sobre o projeto da loja: o que o usuário faz depois de lançar as escadas. */
export function cicloCompleto(store: ProjectStore, ctx: ContextoDoCiclo, ins: EscadasInseridas, rodada: number): RelatorioDoCiclo {
  const passos: Passo[] = [];
  const resumos: string[] = [];
  resumos.push(abrirTudo(store.project, ctx, passos, ins.escadas, ins.guardas));
  resumos.push(editarEmLote(store, passos, ins.escadas, ins.guardas, rodada));
  resumos.push(abrirTudo(store.project, ctx, passos, ins.escadas, ins.guardas));
  const salvo = salvarEReabrir(store.project, passos);
  resumos.push(salvo.resumo);
  resumos.push(exportarIfc(salvo.reaberto, passos));
  return { passos, resumo: hash(resumos), maiorPasso: Math.max(...passos.map((x) => x.ms)) };
}

/** Heap (bytes) depois de uma coleta; zero se a coleta explícita não está disponível. */
export function heapAposColeta(): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) return 0;
  for (let i = 0; i < 3; i++) gc();
  return process.memoryUsage().heapUsed;
}
