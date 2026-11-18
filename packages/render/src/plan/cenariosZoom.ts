import { generateSpiralRun, generateStraightRun, resolveLevel } from '@hestia/engine';
import {
  ProjectStore,
  buildTemplate,
  createEmptyProject,
  defaultStairTypeId,
  makeCeiling,
  makeFloor,
  makeRoof,
  makeRoom,
  makeSlab,
  makeStair,
  makeWall,
  type Command,
  type Id,
  type Project,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import type { Inference, PreviewItem } from '@hestia/tools';
import { larguraEmPx } from './espessura.ts';
import { planBelowOf, type PlanInput } from './build.ts';
import type { PlanViewState } from './planFrame.ts';
import type { Viewport } from '../viewport.ts';
import { DARK, LIGHT, type PlanDrawList } from './types.ts';

/**
 * Cenários de conferência do zoom da planta: projetos variados (modelo, detalhe, estilo, escala, tema) e sobreposições
 * (seleção, cursor, pré-visualização, captura). Servem aos testes de equivalência: a lista de desenho de cada cenário nos
 * zooms 12, 60 e 220 tem de ser a mesma de antes de o zoom sair da geometria (ver `canonico`).
 */

export interface Cenario {
  nome: string;
  project: Project;
  levelId: Id;
  dark?: boolean;
  thinLines?: boolean;
  showUnderlay?: boolean;
  selection?: Id[];
  hover?: Id | null;
  preview?: PreviewItem[];
  inference?: Inference | null;
}

const P = (x: number, y: number) => ({ x, y });
const caixa = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

/** Projeto com tudo que a planta desenha: paredes, aberturas, piso e laje com furo, telhado, ambiente, escadas, cotas, texto e corte. */
function projetoCompleto(): Project {
  const s = new ProjectStore(createEmptyProject('Completo'));
  const cmds: Command[] = [];
  const lados: Array<[ReturnType<typeof P>, ReturnType<typeof P>]> = [[P(0, 0), P(10, 0)], [P(10, 0), P(10, 7)], [P(10, 7), P(0, 7)], [P(0, 7), P(0, 0)], [P(5, 0), P(5, 7)]];
  lados.forEach(([a, b], i) => cmds.push({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: i === 4 ? 'wt_alv14' : 'wt_ext19', levelId: 'lv_0', a, b }) }));
  const abertura = (id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number): Command => ({
    type: 'addOpening',
    opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  cmds.push(abertura('o1', 'door', 'ot_p80', 'w0', 2), abertura('o2', 'door', 'ot_p80', 'w4', 3));
  const furo = [P(7, 2), P(8.2, 2), P(8.2, 3.2), P(7, 3.2)];
  cmds.push({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: caixa(0.1, 0.1, 9.9, 6.9), holes: [furo] }) });
  cmds.push({ type: 'addSlab', slab: makeSlab({ id: 's1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: caixa(-0.5, -0.5, 10.5, 7.5), holes: [furo], slope: { origin: P(0, 0), dir: P(1, 0), percent: 2 } }) });
  cmds.push({ type: 'addSlab', slab: makeSlab({ id: 's2', typeId: 'ls_cobertura', levelId: 'lv_0', boundary: caixa(11, 0, 14, 3) }) });
  cmds.push({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: caixa(-0.3, -0.3, 10.3, 7.3), heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }) });
  cmds.push({ type: 'addRoom', room: makeRoom({ id: 'rm1', levelId: 'lv_0', name: 'Sala', number: '101', point: P(2.5, 3.5) }) });
  cmds.push({ type: 'addRoom', room: makeRoom({ id: 'rm2', levelId: 'lv_0', name: 'Quarto', number: '102', point: P(7.5, 5) }) });
  const reta = generateStraightRun({ start: P(11, 4), dir: P(1, 0), width: 1, risers: 16, tread: 0.28 });
  cmds.push({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [{ id: 'r1', kind: 'run', ...reta } as StairRun] as Array<StairRun | StairLanding> }) });
  const cara = generateSpiralRun({ center: P(13, 6), rInner: 0.1, rOuter: 1, startAngle: 0, sweep: (540 * Math.PI) / 180, risers: 19 });
  cmds.push({ type: 'addStair', stair: makeStair({ id: 'st2', typeId: 'stt_caracol_poste', levelId: 'lv_0', components: [{ id: 'r2', kind: 'run', ...cara } as StairRun] as Array<StairRun | StairLanding> }) });
  cmds.push({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: P(0, 0), b: P(10, 0), offset: -1 } });
  cmds.push({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: P(5, 8), text: 'Casa', height: 3, rotation: 0 } });
  cmds.push({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 'sep1', a: P(2, 0), b: P(2, 7) } });
  cmds.push({ type: 'addView', view: { id: 'v1', name: 'Corte A', kind: 'section', a: P(-1, 3.5), b: P(11, 3.5), depth: 5 } });
  cmds.push({ type: 'setSettings', patch: { showTags: true } });
  for (const c of cmds) s.exec(c);
  return s.project;
}

/** Variante do projeto por comandos (detalhe, estilo gráfico, escala, direção da vista). */
function variante(p: Project, ...cmds: Command[]): Project {
  const s = new ProjectStore(structuredClone(p));
  for (const c of cmds) s.exec(c);
  return s.project;
}

/** Planta de forro: forro e piso sobre um ambiente, vista para cima. */
function projetoForro(): Project {
  const s = new ProjectStore(createEmptyProject('Forro'));
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(4, 0), height: 2.8 }) });
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c', typeId: 'ct_gesso', levelId: 'lv_0', boundary: caixa(0, 0, 4, 5), heightOffset: 2.6 }) });
  s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  s.exec({ type: 'setSettings', patch: { showTags: true } });
  return s.project;
}

const PREVIA: PreviewItem[] = [
  { kind: 'line', a: P(1, 1), b: P(4, 1.5), dashed: true },
  { kind: 'polygon', ring: caixa(2, 2, 3, 3), tone: 'tread' },
  { kind: 'polygon', ring: caixa(4, 2, 5, 3), tone: 'boundary', dashed: true },
  { kind: 'wallBand', a: P(1, 4), b: P(6, 4), thickness: 0.19, sMid: 0 },
  { kind: 'label', at: P(3, 5), text: '5,00 m' },
  { kind: 'point', at: P(6, 5) },
  { kind: 'highlight', ids: ['w0'] },
  { kind: 'sectionLine', a: P(0, 3), b: P(9, 3), label: 'B' },
  { kind: 'sectionLine', a: P(0, 5), b: P(9, 5), dashed: true, elevation: true },
];

const CAPTURAS = ['endpoint', 'face', 'core', 'midpoint', 'intersection', 'perpendicular', 'nearest', 'alignment', 'grid', 'ortho'] as const;
const captura = (kind: (typeof CAPTURAS)[number]): Inference => ({ point: P(5, 3.5), kind, guides: [{ from: P(0, 3.5), to: P(5, 3.5), kind: 'alignment' }] });

/** Todos os cenários: modelo (vários projetos e estilos) e sobreposição (seleção, cursor, prévia, captura). */
export function cenarios(): Cenario[] {
  const comp = projetoCompleto();
  const premium = variante(buildTemplate('house-premium'), { type: 'setSettings', patch: { showTags: true } });
  const out: Cenario[] = [
    { nome: 'completo', project: comp, levelId: 'lv_0' },
    { nome: 'completo escuro', project: comp, levelId: 'lv_0', dark: true },
    { nome: 'completo linhas finas', project: comp, levelId: 'lv_0', thinLines: true },
    { nome: 'completo fino', project: variante(comp, { type: 'setSettings', patch: { detail: 'fine' } }), levelId: 'lv_0' },
    { nome: 'completo grosseiro', project: variante(comp, { type: 'setSettings', patch: { detail: 'coarse' } }), levelId: 'lv_0' },
    { nome: 'completo arame', project: variante(comp, { type: 'setLevelGraphics', levelId: 'lv_0', patch: { style: 'wireframe' } }), levelId: 'lv_0' },
    { nome: 'completo 1:50', project: variante(comp, { type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50 } }), levelId: 'lv_0' },
    { nome: 'completo 1:200', project: variante(comp, { type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 200 } }), levelId: 'lv_0' },
    { nome: 'completo topo alto', project: variante(comp, { type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 3.5 } }), levelId: 'lv_0' },
    { nome: 'premium térreo', project: premium, levelId: 'lv_0' },
    { nome: 'premium superior', project: premium, levelId: 'lv_1', dark: true },
    { nome: 'prédio', project: buildTemplate('predio10'), levelId: 'lv_1' },
    { nome: 'casa 2 quartos', project: variante(buildTemplate('house2'), { type: 'setSettings', patch: { showTags: true } }), levelId: 'lv_0' },
    { nome: 'forro', project: projetoForro(), levelId: 'lv_0' },
    { nome: 'seleção de paredes e abertura', project: comp, levelId: 'lv_0', selection: ['w0', 'w4', 'o1'], hover: 'w1' },
    { nome: 'seleção de piso, laje e ambiente', project: comp, levelId: 'lv_0', selection: ['f1', 's1', 'rm1'], hover: 's2' },
    { nome: 'seleção de telhado e escadas', project: comp, levelId: 'lv_0', selection: ['r1', 'st1', 'st2'], hover: 'rm2' },
    { nome: 'seleção de cota e corte', project: comp, levelId: 'lv_0', selection: ['d1', 'sep1', 'v1'] },
    { nome: 'prévia da ferramenta', project: comp, levelId: 'lv_0', preview: PREVIA, inference: captura('endpoint') },
  ];
  for (const k of CAPTURAS) out.push({ nome: `captura ${k}`, project: comp, levelId: 'lv_0', inference: captura(k) });
  return out;
}

/** Entrada da planta do cenário na vista de `zoom`, como o app a monta (resolução do nível e o nível de baixo). */
export function entradaDe(c: Cenario, zoom: number, over: Partial<PlanInput> = {}): PlanInput {
  const p = c.project;
  const resolve = (id: Id) => resolveLevel(p, id, new Map());
  return {
    project: p,
    levelId: c.levelId,
    resolved: resolve(c.levelId),
    ...planBelowOf(p, c.levelId, resolve, c.showUnderlay !== false),
    viewport: { cx: 5, cy: 3.5, zoom, width: 800, height: 600 },
    theme: c.dark ? DARK : LIGHT,
    dark: c.dark === true,
    selection: c.selection ?? [],
    hover: c.hover ?? null,
    preview: c.preview ?? [],
    inference: c.inference ?? null,
    showGrid: false,
    thinLines: c.thinLines,
    ...over,
  };
}

/** Estado da planta do cenário para o quadro (`planFrameUpdateOf`), na vista dada. */
export function estadoDe(c: Cenario, v: Viewport, gpu = true): PlanViewState {
  const p = c.project;
  return {
    project: p,
    version: 1,
    levelId: c.levelId,
    v,
    theme: c.dark ? DARK : LIGHT,
    dark: c.dark === true,
    gpu,
    showGrid: false,
    showUnderlay: c.showUnderlay !== false,
    showRoofProjection: true,
    thinLines: c.thinLines === true,
    selection: c.selection ?? [],
    hover: c.hover ?? null,
    preview: c.preview ?? [],
    inference: c.inference ?? null,
    resolve: (id) => resolveLevel(p, id, new Map()),
  };
}

const arredonda = (n: number): number => Math.round(n * 1e9) / 1e9 + 0;

/**
 * Forma canônica da lista de desenho no `zoom`: números arredondados a 1e-9 e a largura de cada traço já em pixels
 * (`larguraEmPx`), de modo que a mesma imagem tenha a mesma forma, venha a espessura de `papel` ou de `widthPx`. Os
 * campos que só servem à GPU (`papel`, `faixa`, `deslocamentoPx`) não entram.
 */
export function canonico(dl: PlanDrawList, zoom: number): string {
  const pt = (p: { x: number; y: number }) => [arredonda(p.x), arredonda(p.y)];
  const fills = dl.fills.map((f) => ({
    p: f.polygons.map((poly) => poly.map((r) => r.map(pt))),
    c: f.color,
    a: arredonda(f.alpha),
    h: f.hatch ? [f.hatch.kind, f.hatch.color, f.hatch.alpha === undefined ? null : arredonda(f.hatch.alpha)] : null,
    k: f.contour === true,
  }));
  const strokes = dl.strokes.map((s) => ({
    p: s.pts.map(pt),
    z: s.closed,
    w: arredonda(larguraEmPx(s, zoom)),
    c: s.color,
    a: arredonda(s.alpha),
    d: s.dash ?? null,
  }));
  const labels = dl.labels.map((l) => ({
    at: pt(l.at),
    t: l.text,
    dx: l.dx === undefined ? null : arredonda(l.dx),
    dy: l.dy === undefined ? null : arredonda(l.dy),
    tone: l.tone ?? null,
    f: l.fontPx === undefined ? null : arredonda(l.fontPx),
    r: l.rotation ?? null,
    ce: l.center ?? null,
  }));
  return JSON.stringify({ bg: dl.background, fills, strokes, labels });
}

/** Resumo de 53 bits (cyrb53) de um texto, em hexadecimal: identifica a forma canônica sem guardar a lista inteira. */
export function resumo(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Nome do arquivo de referência de um cenário num zoom (letras, números e sublinhado). */
export const chaveDoCenario = (nome: string, zoom: number): string => `${nome.replace(/[^a-z0-9]+/gi, '_')}-${zoom}`;
