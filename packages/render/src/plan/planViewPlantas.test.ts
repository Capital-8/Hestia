import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, makeLevel, makePlanView, makeSlab, makeWall, ProjectStore, type Project } from '@hestia/model';
import { buildPlanGeometry, buildPlanOverlay, type PlanInput } from './build.ts';
import { planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { planStyleOf } from './style.ts';
import { planViewOf } from './view.ts';
import { LIGHT, type PlanOps } from './types.ts';

/*
 * Plantas de disciplina no render (decisão 0060, etapa 2.3A): estilo, vista (com cache) e desenho por `planId`.
 * Projeto: lv_0 (retângulo 4 x 5 m, uma laje) e lv_1; duas plantas adicionais de lv_0 (pvA e pvB, arquitetura neutra,
 * sem gráficos) e uma de lv_1 (pvC). Valores de referência LITERAIS (calculados à mão).
 *
 * Sobre o achado do golden ("planViewOf não reflete Level.hidden"): é por projeto, não um defeito. A vista só depende do
 * intervalo de vista e das substituições de categoria dos gráficos; o Hide in View (`Level.hidden` na planta padrão,
 * `PlanView.hidden` na adicional) chega ao desenho como `PlanInput.hidden`, calculado pelo app (`visibilityOf`, que já lê
 * `planHiddenOf`). O último teste do arquivo trava esse contrato nas duas plantas.
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const RETANGULO = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  RETANGULO.forEach((a, i) => {
    const b = RETANGULO[(i + 1) % RETANGULO.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'la1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: ring([[0.1, 0.1], [0.1, 4.9], [3.9, 4.9], [3.9, 0.1]]) }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvA', levelId: 'lv_0', name: 'Arquitetura A' }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvB', levelId: 'lv_0', name: 'Arquitetura B' }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvC', levelId: 'lv_1', name: 'Arquitetura C' }) });
  return s.project;
}

const entrada = (p: Project, planId?: string, extra: Partial<PlanInput> = {}): PlanInput => ({
  project: p,
  levelId: 'lv_0',
  resolved: resolveLevel(p, 'lv_0'),
  below: null,
  viewport: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
  ...(planId ? { planId } : {}),
  ...extra,
});

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
function resumoOps(ops: PlanOps) {
  return {
    fills: ops.fills.length,
    strokes: ops.strokes.length,
    strokesFechados: ops.strokes.filter((s) => s.closed).length,
    labels: ops.labels.length,
    textos: ops.labels.map((l) => l.text).sort(),
    cores: [...new Set([...ops.fills.map((f) => f.color), ...ops.strokes.map((s) => s.color)])].sort(),
    pontos: ops.strokes.map((s) => s.pts.map((q) => `${r4(q.x)},${r4(q.y)}`).join(' ')).sort(),
  };
}

describe('cache de planViewOf: duas plantas do mesmo nível não compartilham geometria', () => {
  it('padrão, pvA e pvB do mesmo nível são três vistas distintas, e cada uma é memorizada', () => {
    const p = projeto();
    const padrao = planViewOf(p, 'lv_0');
    const a = planViewOf(p, 'lv_0', 'pvA');
    const b = planViewOf(p, 'lv_0', 'pvB');
    expect(a).not.toBe(padrao);
    expect(b).not.toBe(padrao);
    expect(a).not.toBe(b);
    // Memorizadas: a mesma chamada devolve o MESMO objeto.
    expect(planViewOf(p, 'lv_0')).toBe(padrao);
    expect(planViewOf(p, 'lv_0', 'pvA')).toBe(a);
    expect(planViewOf(p, 'lv_0', 'pvB')).toBe(b);
    // Neutras: o conteúdo é igual ao da padrão (só não é o mesmo objeto).
    expect([...a.cls.entries()].sort()).toEqual([...padrao.cls.entries()].sort());
    expect(a.cutZ).toBe(1.2);
    expect(a.topZ).toBe(2.3);
  });

  it('cada planta lê os PRÓPRIOS gráficos: a categoria laje oculta na pvA some só dela', () => {
    const s = new ProjectStore(projeto());
    s.exec({ type: 'setPlanGraphics', planId: 'pvA', patch: { overrides: { slab: { visible: false } } } });
    const p = s.project;
    expect([...planViewOf(p, 'lv_0', 'pvA').categoryHidden]).toEqual(['la1']);
    expect(planViewOf(p, 'lv_0', 'pvA').cls.get('la1')).toBe('hidden');
    expect([...planViewOf(p, 'lv_0').categoryHidden]).toEqual([]);
    expect([...planViewOf(p, 'lv_0', 'pvB').categoryHidden]).toEqual([]);
    expect(planViewOf(p, 'lv_0').cls.get('la1')).toBe('projection-below');
  });

  it('estrutura parcial de cada planta é independente (pvB "somente núcleo" não afeta a padrão)', () => {
    const s = new ProjectStore(projeto());
    s.exec({ type: 'setPlanGraphics', planId: 'pvB', patch: { partialStructure: 'coreOnly' } });
    const p = s.project;
    expect(planViewOf(p, 'lv_0', 'pvB').partial).toBe('coreOnly');
    expect(planViewOf(p, 'lv_0', 'pvA').partial).toBe('entire');
    expect(planViewOf(p, 'lv_0').partial).toBe('entire');
  });

  it('id desconhecido ou de planta de OUTRO nível cai na planta padrão (mesmo objeto, sem duplicar o cache)', () => {
    const p = projeto();
    const padrao = planViewOf(p, 'lv_0');
    expect(planViewOf(p, 'lv_0', 'pv-que-nao-existe')).toBe(padrao);
    expect(planViewOf(p, 'lv_0', 'pvC')).toBe(padrao); // pvC é do lv_1
    expect(planViewOf(p, 'lv_1', 'pvA')).toBe(planViewOf(p, 'lv_1'));
  });
});

describe('planStyleOf por planta', () => {
  it('planta neutra sem gráficos gravados é igual à padrão sem gráficos (escala 100, detalhe do projeto)', () => {
    const p = projeto();
    const padrao = planStyleOf(p, 'lv_0', 100);
    expect(padrao.scale).toBe(100);
    expect(padrao.detail).toBe('medium');
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'pvA')).toEqual(padrao);
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'pvC')).toEqual(padrao); // de outro nível: cai na padrão
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'nao-existe')).toEqual(padrao);
  });

  it('cada planta tem a sua escala e o seu detalhe; a padrão não muda', () => {
    const s = new ProjectStore(projeto());
    s.exec({ type: 'setPlanGraphics', planId: 'pvA', patch: { scale: 50, detail: 'fine' } });
    s.exec({ type: 'setPlanGraphics', planId: 'pvB', patch: { scale: 200, detail: 'coarse' } });
    const p = s.project;
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'pvA')).toMatchObject({ scale: 50, detail: 'fine' });
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'pvB')).toMatchObject({ scale: 200, detail: 'coarse' });
    expect(planStyleOf(p, 'lv_0', 100)).toMatchObject({ scale: 100, detail: 'medium' });
    // Espessura de papel em px: 1:50 (linha mais fina em papel) x 1:200: 0,25 mm x 100 x 50 / 1000 = 1,25 px vs 5 px.
    expect(planStyleOf(p, 'lv_0', 100, undefined, 'pvA').paint.wall.projPx).toBeLessThan(planStyleOf(p, 'lv_0', 100, undefined, 'pvB').paint.wall.projPx);
  });
});

describe('desenho (buildPlanGeometry): oráculo 2 e isolamento das anotações', () => {
  it('planta de disciplina neutra desenha EXATAMENTE o que a padrão desenha (mesmos traços, preenchimentos e cores)', () => {
    const p = projeto();
    const padrao = resumoOps(buildPlanGeometry(entrada(p)));
    expect(padrao.fills).toBeGreaterThan(0);
    expect(padrao.strokes).toBeGreaterThan(0);
    expect(resumoOps(buildPlanGeometry(entrada(p, 'pvA')))).toEqual(padrao);
    expect(resumoOps(buildPlanGeometry(entrada(p, 'pvB')))).toEqual(padrao);
    // Id de outro nível ou inexistente: a padrão.
    expect(resumoOps(buildPlanGeometry(entrada(p, 'pvC')))).toEqual(padrao);
  });

  it('o mesmo desenho também na sobreposição (seleção de uma parede)', () => {
    const p = projeto();
    const sel = (planId?: string) => resumoOps(buildPlanOverlay(entrada(p, planId, { selection: ['w0'] })));
    expect(sel('pvA')).toEqual(sel());
  });

  it('a cota do nível aparece SÓ na padrão; a cota da pvA aparece SÓ na pvA; a mesma cota dá o mesmo desenho', () => {
    const s = new ProjectStore(projeto());
    const dim = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 };
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', ...dim } });
    const soNivel = s.project;
    expect(resumoOps(buildPlanGeometry(entrada(soNivel))).textos).toEqual(['4,00 m']);
    expect(resumoOps(buildPlanGeometry(entrada(soNivel, 'pvA'))).textos).toEqual([]); // não vaza para a pvA
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', ...dim } });
    const ambas = s.project;
    expect(resumoOps(buildPlanGeometry(entrada(ambas, 'pvA'))).textos).toEqual(['4,00 m']);
    expect(resumoOps(buildPlanGeometry(entrada(ambas, 'pvB'))).textos).toEqual([]); // nem para a pvB
    // Mesma cota, mesmo desenho (o dono muda, o resultado não): oráculo 2.
    expect(resumoOps(buildPlanGeometry(entrada(ambas, 'pvA')))).toEqual(resumoOps(buildPlanGeometry(entrada(ambas))));
    // O texto da pvA e o da padrão ficam cada um na sua planta.
    s.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvA', text: { id: 'tA', at: { x: 2, y: 3 }, text: 'NOTA A', height: 3, rotation: 0 } });
    expect(resumoOps(buildPlanGeometry(entrada(s.project, 'pvA'))).textos).toEqual(['4,00 m', 'NOTA A']);
    expect(resumoOps(buildPlanGeometry(entrada(s.project))).textos).toEqual(['4,00 m']);
  });

  it('detalhe, cota de ponto e etiqueta de elemento: a planta de disciplina desenha as DELA igual à padrão desenha as do nível; separador é do nível', () => {
    const s = new ProjectStore(projeto());
    s.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 'sep', a: { x: 2, y: 0 }, b: { x: 2, y: 5 } } });
    const linha = { a: { x: 0, y: 1 }, b: { x: 4, y: 1 }, style: 'solid' as const };
    const etiqueta = { hostId: 'w0', at: { x: 2, y: -1 }, property: 'type' as const, leader: true, orientation: 'horizontal' as const };
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dlN', ...linha } });
    s.exec({ type: 'addTag', levelId: 'lv_0', item: { id: 'tgN', ...etiqueta } });
    const soNivel = s.project;
    const padrao = resumoOps(buildPlanGeometry(entrada(soNivel)));
    expect(resumoOps(buildPlanGeometry(entrada(soNivel, 'pvA'))).strokes).toBeLessThan(padrao.strokes); // nada do nível vaza para a pvA (só o separador)
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', planId: 'pvA', item: { id: 'dlA', ...linha } });
    s.exec({ type: 'addTag', levelId: 'lv_0', planId: 'pvA', item: { id: 'tgA', ...etiqueta } });
    expect(resumoOps(buildPlanGeometry(entrada(s.project, 'pvA')))).toEqual(padrao);
    // E a pvB, vazia, só tem o separador do nível.
    expect(resumoOps(buildPlanGeometry(entrada(s.project, 'pvB'))).strokes).toBeLessThan(padrao.strokes);
  });

  it('a escala da planta decide o tamanho de papel da anotação: a cota da pvA em 1:200 tem folgas maiores que a da padrão em 1:100', () => {
    const s = new ProjectStore(projeto());
    const dim = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 };
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', ...dim } });
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', ...dim } });
    s.exec({ type: 'setPlanGraphics', planId: 'pvA', patch: { scale: 200 } });
    const p = s.project;
    /** Altura (y) dos traços que só existem por causa da cota: a diferença entre o desenho com e sem ela. */
    const alturaDaCota = (com: PlanOps, sem: PlanOps): number => {
      const chave = (st: PlanOps['strokes'][number]): string => st.pts.map((q) => `${r4(q.x)},${r4(q.y)}`).join(' ');
      const antes = new Set(sem.strokes.map(chave));
      const ys = com.strokes.filter((st) => !antes.has(chave(st))).flatMap((st) => st.pts.map((q) => q.y));
      return Math.max(...ys) - Math.min(...ys);
    };
    const semCotas = new ProjectStore(projeto());
    semCotas.exec({ type: 'setPlanGraphics', planId: 'pvA', patch: { scale: 200 } });
    const hPadrao = alturaDaCota(buildPlanGeometry(entrada(p)), buildPlanGeometry(entrada(semCotas.project)));
    const hDisc = alturaDaCota(buildPlanGeometry(entrada(p, 'pvA')), buildPlanGeometry(entrada(semCotas.project, 'pvA')));
    expect(hPadrao).toBeGreaterThan(1); // a linha de cota está a 1 m do eixo, mais a folga da extensão (papel x 100)
    expect(hDisc).toBeGreaterThan(hPadrao); // 1:200 -> a folga de papel vale o dobro em metros
  });
});

describe('Hide in View chega ao desenho como PlanInput.hidden, igual na padrão e na planta de disciplina', () => {
  it('o mesmo conjunto de ocultos tira os mesmos traços nas duas plantas; a vista (planViewOf) não carrega o Hide in View', () => {
    const p = projeto();
    const ocultos = new Set(['w2']);
    const padraoVis = resumoOps(buildPlanGeometry(entrada(p)));
    const padraoOcu = resumoOps(buildPlanGeometry(entrada(p, undefined, { hidden: ocultos })));
    expect(padraoOcu.strokes).toBeLessThan(padraoVis.strokes);
    expect(resumoOps(buildPlanGeometry(entrada(p, 'pvA', { hidden: ocultos })))).toEqual(padraoOcu);
    // O contrato do achado: a vista traz só intervalo e categoria; `Level.hidden`/`PlanView.hidden` não entram nela.
    const s = new ProjectStore(p);
    s.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: 'lv_0' }, hidden: { elements: ['w2'] } });
    s.exec({ type: 'setViewHidden', target: { kind: 'planView', planId: 'pvA' }, hidden: { elements: ['w1'] } });
    expect([...planViewOf(s.project, 'lv_0').hidden]).toEqual([]);
    expect([...planViewOf(s.project, 'lv_0', 'pvA').hidden]).toEqual([]);
    expect(s.project.levels.find((l) => l.id === 'lv_0')!.hidden).toEqual({ elements: ['w2'] });
    expect(s.project.planViews!.find((x) => x.id === 'pvA')!.hidden).toEqual({ elements: ['w1'] });
  });
});

describe('chaves do quadro (planFrameUpdateOf): a planta de disciplina entra nelas', () => {
  const estado = (p: Project, planId?: string): PlanViewState => ({
    project: p, version: 1, levelId: 'lv_0', v: { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 }, theme: LIGHT, dark: false, gpu: false, showGrid: false,
    showUnderlay: false, showRoofProjection: false, thinLines: false, selection: [], hover: null, preview: [], inference: null, resolve: (id) => resolveLevel(p, id),
    ...(planId ? { planId } : {}),
  });

  it('duas plantas do mesmo nível nunca reaproveitam as camadas uma da outra; sem planId a chave é a de antes', () => {
    const p = projeto();
    const padrao = planFrameUpdateOf(estado(p));
    const a = planFrameUpdateOf(estado(p, 'pvA'));
    const b = planFrameUpdateOf(estado(p, 'pvB'));
    expect(new Set([padrao.geometryKey, a.geometryKey, b.geometryKey]).size).toBe(3);
    expect(new Set([padrao.overlayKey, a.overlayKey, b.overlayKey]).size).toBe(3);
    expect(new Set([padrao.hoverKey, a.hoverKey, b.hoverKey]).size).toBe(3);
    expect(planFrameUpdateOf(estado(p)).geometryKey).toBe(padrao.geometryKey);
  });
});
