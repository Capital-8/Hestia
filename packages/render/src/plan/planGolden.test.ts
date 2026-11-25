import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, makeColumn, makeLevel, makeSlab, makeWall, ProjectStore, type GraphicsCategory, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { planStyleOf } from './style.ts';
import { planViewOf, type PlanView } from './view.ts';
import { LIGHT, type PlanOps } from './types.ts';

/*
 * Golden da planta de piso (decisão 0060, fase 1B): trava o desenho ATUAL da planta padrão de dois níveis.
 * Os valores abaixo são LITERAIS, lidos UMA VEZ da saída do código de 2026-11-20 e conferidos à mão onde dá
 * (escala, detalhe, alphas, nomes, cotas e textos). Mudança aqui é mudança de comportamento: se for intencional
 * (fase 2 da decisão), atualize o golden com comentário, nunca apague o teste.
 *
 * Projeto: lv_0 (elevação 0) com retângulo 4 x 5 m, uma porta, um pilar, uma laje, cota de 4 m e um texto, gráficos
 * customizados (escala 1:50, detalhe fino, laje em meio-tom com 25 % de transparência). lv_1 (elevação 3 m) com o
 * mesmo retângulo, uma laje e ocultação do nível (`Level.hidden`): a parede m2 e a categoria `slab`.
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const RETANGULO = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);

function paredesDoRetangulo(s: ProjectStore, levelId: string, prefixo: string): void {
  RETANGULO.forEach((a, i) => {
    const b = RETANGULO[(i + 1) % RETANGULO.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `${prefixo}${i}`, typeId: 'wt_alv14', levelId, a, b, locationLine: 'finishInterior' }) });
  });
}

/** Projeto de dois níveis (ver o cabeçalho). */
function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  // Nível 0: paredes w0..w3, porta na w0, pilar, laje, cota e texto.
  paredesDoRetangulo(s, 'lv_0', 'w');
  s.exec({ type: 'addOpening', opening: { id: 'pt1', kind: 'door', typeId: 'ot_p80', hostId: 'w0', offset: 2.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pl1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 4 } }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'la1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]) }) });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dn', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'NOTA DO NIVEL', height: 3, rotation: 0 } });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50, detail: 'fine', overrides: { slab: { halftone: true, transparency: 0.25 } } } });
  // Nível 1: paredes m0..m3 e laje la2; ocultação do nível esconde m2 e a categoria laje.
  paredesDoRetangulo(s, 'lv_1', 'm');
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'la2', typeId: 'ls_mac12', levelId: 'lv_1', boundary: ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]) }) });
  s.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: 'lv_1' }, hidden: { elements: ['m2'], categories: ['slab'] } });
  return s.project;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Resumo estável da vista (`planViewOf`): ordenado, sem objetos de geometria. */
function resumoVista(v: PlanView) {
  return {
    range: { top: v.range.top, cut: v.range.cut, bottom: v.range.bottom, depth: v.range.depth },
    cutZ: r4(v.cutZ),
    topZ: r4(v.topZ),
    cls: [...v.cls.entries()].map(([id, c]) => `${id}:${c}`).sort(),
    hidden: [...v.hidden].sort(),
    categoryHidden: [...v.categoryHidden].sort(),
    outlineWalls: [...v.outlineWalls].sort(),
    outlines: v.outlines.length,
    partial: v.partial,
    paredes: Object.keys(v.geo.walls).sort(),
    clusters: v.geo.clusters.length,
  };
}

/** Caixa envolvente de todas as operações (preenchimentos, traços e posições de rótulos). */
function caixaDe(ops: PlanOps) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visita = (q: Vec2): void => {
    minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y);
  };
  for (const f of ops.fills) for (const poligono of f.polygons) for (const anel of poligono) anel.forEach(visita);
  for (const s of ops.strokes) s.pts.forEach(visita);
  for (const l of ops.labels) visita(l.at);
  return { minX: r4(minX), minY: r4(minY), maxX: r4(maxX), maxY: r4(maxY) };
}

/** Resumo das operações de `buildPlan` (contagens por tipo, caixa, textos, cores). */
function resumoOps(ops: PlanOps) {
  return {
    fills: ops.fills.length,
    fillsContorno: ops.fills.filter((f) => f.contour).length,
    fillsComHachura: ops.fills.filter((f) => f.hatch).length,
    strokes: ops.strokes.length,
    strokesFechados: ops.strokes.filter((s) => s.closed).length,
    labels: ops.labels.length,
    textos: ops.labels.map((l) => l.text).sort(),
    caixa: caixaDe(ops),
    cores: [...new Set([...ops.fills.map((f) => f.color), ...ops.strokes.map((s) => s.color)])].sort(),
    limiares: (ops.limiares ?? []).map(r4),
  };
}

/** Estilo resolvido (`planStyleOf`) com escala, detalhe e pesos das categorias pedidas. */
function resumoEstilo(p: Project, levelId: string) {
  const st = planStyleOf(p, levelId, 100);
  const pick = (c: GraphicsCategory) => {
    const pt = st.paint[c];
    return { visible: pt.visible, visual: pt.visual, color: pt.color, halftone: pt.halftone, alpha: r4(pt.alpha), cutPx: r4(pt.cutPx), projPx: r4(pt.projPx) };
  };
  return { scale: st.scale, detail: st.detail, visual: st.visual, partial: st.partial, wall: pick('wall'), door: pick('door'), slab: pick('slab'), annotation: pick('annotation') };
}

const entrada = (p: Project, levelId: string): PlanInput => ({
  project: p,
  levelId,
  resolved: resolveLevel(p, levelId),
  below: null,
  viewport: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
});

const projetoAtual = (): Project => projeto();

describe('golden da planta padrão (caracterização do código de 2026-11-20)', () => {
  it('vista do nível 0 (planViewOf): classes, cortes e cotas não mudam', () => {
    expect(resumoVista(planViewOf(projetoAtual(), 'lv_0'))).toEqual({
      range: { top: 2.3, cut: 1.2, bottom: 0, depth: 0 }, // padrão do Revit (viewRange.ts)
      cutZ: 1.2,
      topZ: 2.3,
      cls: ['la1:projection-below', 'pt1:cut', 'w0:cut', 'w1:cut', 'w2:cut', 'w3:cut'],
      hidden: [],
      categoryHidden: [],
      outlineWalls: [],
      outlines: 0,
      partial: 'entire',
      paredes: ['w0', 'w1', 'w2', 'w3'],
      clusters: 1,
    });
  });

  it('vista do nível 1 (planViewOf): cota de corte 4,2 e topo 5,3 (elevação 3 m + 1,2 / 2,3)', () => {
    // Surpresa atual: `Level.hidden` (m0 e a categoria laje) NÃO aparece em `hidden`/`categoryHidden` desta vista.
    expect(resumoVista(planViewOf(projetoAtual(), 'lv_1'))).toEqual({
      range: { top: 2.3, cut: 1.2, bottom: 0, depth: 0 },
      cutZ: 4.2,
      topZ: 5.3,
      cls: ['la2:projection-below', 'm0:cut', 'm1:cut', 'm2:cut', 'm3:cut'],
      hidden: [],
      categoryHidden: [],
      outlineWalls: [],
      outlines: 0,
      partial: 'entire',
      paredes: ['m0', 'm1', 'm2', 'm3'],
      clusters: 1,
    });
  });

  it('operações do buildPlan, nível 0: contagens, textos, caixa e limiares não mudam', () => {
    expect(resumoOps(buildPlanGeometry(entrada(projetoAtual(), 'lv_0')))).toEqual({
      fills: 6,
      fillsContorno: 1,
      fillsComHachura: 3,
      strokes: 16,
      strokesFechados: 10,
      labels: 2,
      textos: ['4,00 m', 'NOTA DO NIVEL'], // a cota de 4 m é a da planta (0,0)-(4,0)
      caixa: { minX: -0.902, minY: -0.184, maxX: 4.184, maxY: 5.184 },
      cores: ['#16181c', '#68696b', '#7a828c', '#b4b4b5', '#f5f4f0', '#ffffff'],
      limiares: [0.9, 20, 100],
    });
  });

  it('operações do buildPlan, nível 1: contagens e caixa não mudam (caixa simétrica em torno do retângulo 0..4 x 0..5)', () => {
    expect(resumoOps(buildPlanGeometry(entrada(projetoAtual(), 'lv_1')))).toEqual({
      fills: 5,
      fillsContorno: 1,
      fillsComHachura: 3,
      strokes: 12,
      strokesFechados: 12,
      labels: 0,
      textos: [],
      caixa: { minX: -0.184, minY: -0.184, maxX: 4.184, maxY: 5.184 },
      cores: ['#16181c', '#68696b', '#ffffff'],
      limiares: [],
    });
  });

  it('estilo resolvido (planStyleOf), nível 0 com Level.graphics: escala 50, detalhe fino, laje em meio-tom com alpha 0,75', () => {
    expect(resumoEstilo(projetoAtual(), 'lv_0')).toEqual({
      scale: 50,
      detail: 'fine',
      visual: 'hiddenLine',
      partial: 'entire',
      wall: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 3.5, projPx: 1.25 },
      door: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 1.75, projPx: 1.25 },
      slab: { visible: true, visual: 'hiddenLine', color: null, halftone: true, alpha: 0.75, cutPx: 2.5, projPx: 1 },
      annotation: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 1, projPx: 1 },
    });
  });

  it('estilo resolvido (planStyleOf), nível 1 sem Level.graphics: padrão de escala 1:100 e detalhe médio', () => {
    expect(resumoEstilo(projetoAtual(), 'lv_1')).toEqual({
      scale: 100,
      detail: 'medium',
      visual: 'hiddenLine',
      partial: 'entire',
      wall: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 5, projPx: 1.8 },
      door: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 2.5, projPx: 1.8 },
      slab: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 3.5, projPx: 1 },
      annotation: { visible: true, visual: 'hiddenLine', color: null, halftone: false, alpha: 1, cutPx: 1, projPx: 1 },
    });
  });
});
