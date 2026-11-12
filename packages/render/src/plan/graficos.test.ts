import { describe, expect, it, vi } from 'vitest';
import { pointInMulti, type Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, floorViewId, makeFloor, makeWall, paperMmToPx, type Opening, type Project, withFloorPatchOfTest } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { mix } from './color.ts';
import { drawPlanCpu } from './cpuPlan.ts';
import { PlanScene } from './gpuPlan.ts';
import { defaultPaint, planStyleOf } from './style.ts';
import { hiddenSelectionOps, resolvedPlanViewOf } from './view.ts';
import { LIGHT, type FillOp, type StrokeOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

/*
 * Gráficos de vista da planta (decisão 0015): larguras por escala e categoria, estilos visuais, substituições por
 * categoria (visibilidade, transparência, meio-tom, peso e cor), exibição parcial e hachura sólida.
 * Cena: parede de 3 m em y = 0 com janela de peitoril 0,90 (corta em 1,20 m) em x = 1,5; parede em y = 2 com janela de
 * peitoril 1,50 (acima do corte: símbolo tracejado); e um piso em x = 16 a 19.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
const VIEW: Viewport = { cx: 8, cy: 3, zoom: 100, width: 800, height: 600 };

function scene(): Project {
  const s = new ProjectStore(createEmptyProject());
  const opening = (id: string, hostId: string, sill: number): Opening => ({
    id,
    kind: 'window',
    typeId: 'ot_j120',
    hostId,
    offset: 1.5,
    flipHand: false,
    flipFacing: false,
    sillOverride: sill,
    mark: '',
  });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(3, 0), height: 2.8 }) });
  s.exec({ type: 'addOpening', opening: opening('j', 'w', 0.9) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 2), b: P(3, 2), height: 2.8 }) });
  s.exec({ type: 'addOpening', opening: opening('j2', 'w2', 1.5) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [P(16, 8), P(19, 8), P(19, 10), P(16, 10)], heightOffset: -1 }) });
  return s.project;
}

type DrawList = ReturnType<typeof draw>;

function draw(p: Project, over: Partial<PlanInput> = {}, zoom = 100) {
  const input: PlanInput = {
    project: p,
    viewId: floorViewId('lv_0'),
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: { ...VIEW, zoom },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
  return buildPlanDrawList(input);
}

/** Há preenchimento de superfície (não faixa de contorno) cobrindo o ponto? */
const surfaceAt = (dl: DrawList, x: number, y: number): FillOp | undefined => dl.fills.find((f) => !f.contour && pointInMulti({ x, y }, f.polygons));
/** Traços abertos de um símbolo de abertura: todos a menos de 0,7 m do centro. */
const symbolAt = (dl: DrawList, x: number, y: number): StrokeOp[] => dl.strokes.filter((s) => !s.closed && s.pts.every((q) => Math.hypot(q.x - x, q.y - y) <= 0.7));
/** Anéis fechados de traço no eixo y (silhueta, juntas entre materiais e a moldura dos símbolos de abertura). */
const ringsAt = (dl: DrawList, y: number): StrokeOp[] => dl.strokes.filter((s) => s.closed && s.pts.every((q) => Math.abs(q.y - y) < 0.5));
/**
 * Contorno da silhueta cortada da parede no eixo y: anel fechado de tinta com a espessura de corte da parede (`width`,
 * padrão 5 px a 100 px/m). Com vão, a silhueta tem o contorno externo e o furo.
 */
const silhouetteAt = (dl: DrawList, y: number, width = defaultPaint('wall', 100).cutPx): StrokeOp[] => ringsAt(dl, y).filter((s) => s.color === LIGHT.ink && s.widthPx === width);

/** Material de parede da cena que tem espessura para receber hachura (o bloco; o reboco tem 1 px e não recebe). */
const wallMaterialOf = (p: Project): string => {
  const r = resolveLevel(p, 'lv_0', new Map()).clusters[0]!.regions.find((x) => x.materialId === 'mat_bloco14');
  if (!r) throw new Error('a cena não tem o bloco de 14 cm');
  return r.materialId;
};

describe('larguras de linha por escala (decisão 0015 §2.1)', () => {
  it('parede cortada com o padrão: 0,5 mm de papel a 1:100, convertidos em px pelo zoom corrente', () => {
    const p = scene();
    expect(defaultPaint('wall', 100).cutPx).toBe(paperMmToPx(0.5, 100, 100));
    expect(defaultPaint('wall', 100).cutPx).toBe(5);
    const ring = silhouetteAt(draw(p), 0);
    expect(ring.length).toBeGreaterThan(0);
    expect(ring[0]!.widthPx).toBe(5);
  });

  it('1:50, 1:100 e 1:200: parede cortada 0,7 / 0,5 / 0,35 mm de papel; px = mm × zoom × escala / 1000', () => {
    const cases: Array<[number, number]> = [
      [50, 0.7],
      [100, 0.5],
      [200, 0.35],
    ];
    for (const [scale, mm] of cases) {
      const s = new ProjectStore(scene());
      s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale } });
      const expected = (mm * 100 * scale) / 1000;
      expect(planStyleOf(s.project, 'lv_0', 100).paint.wall.cutPx).toBeCloseTo(expected, 9);
      expect(silhouetteAt(draw(s.project), 0, expected)[0]!.widthPx).toBeCloseTo(expected, 9);
    }
  });

  it('escala muda o detalhe: até 1:50 fino, até 1:200 médio, acima grosso (pelo padrão do projeto)', () => {
    const detailAt = (scale: number) => {
      const s = new ProjectStore(scene());
      s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale } });
      return planStyleOf(s.project, 'lv_0', 100).detail;
    };
    expect(detailAt(50)).toBe('fine');
    expect(detailAt(100)).toBe('medium');
    expect(detailAt(200)).toBe('medium');
    expect(detailAt(300)).toBe('coarse');
  });

  it('mínimo de 1 px: peso baixo em zoom baixo não some', () => {
    expect(defaultPaint('wall', 5).projPx).toBe(1);
    expect(defaultPaint('wall', 5).cutPx).toBe(1);
  });

  it('peso de projeção: a janela acima do corte (peitoril 1,50) usa a espessura de projeção da categoria', () => {
    const dl = draw(scene());
    const sym = symbolAt(dl, 1.5, 2);
    expect(sym.length).toBeGreaterThan(0);
    expect(sym.every((s) => s.dash)).toBe(true);
    // Mesma janela cortada (y = 0) e acima do corte (y = 2): cada traço do símbolo sai na espessura de projeção, não na de corte.
    const cut = symbolAt(dl, 1.5, 0);
    expect(cut).toHaveLength(sym.length);
    const { cutPx, projPx } = defaultPaint('window', 100);
    sym.forEach((s, i) => expect(s.widthPx * cutPx).toBeCloseTo(cut[i]!.widthPx * projPx, 9));
  });
});

describe('pesos por categoria e substituição por vista (decisão 0015 §2.4)', () => {
  it('peso de corte da parede no projeto (7 = 1,0 mm a 1:100): a silhueta fica com 10 px a 100 px/m', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setProjectGraphics', patch: { categories: { wall: { cutWeight: 7 } } } });
    expect(planStyleOf(s.project, 'lv_0', 100).paint.wall.cutPx).toBe(10);
    expect(silhouetteAt(draw(s.project), 0, 10)[0]!.widthPx).toBe(10);
  });

  it('substituição da vista vale sobre o do projeto: peso 2 (0,18 mm) só nesta planta', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setProjectGraphics', patch: { categories: { wall: { cutWeight: 7 } } } });
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { cutWeight: 2 } } } });
    expect(planStyleOf(s.project, 'lv_0', 100).paint.wall.cutPx).toBeCloseTo(1.8, 9);
    expect(silhouetteAt(draw(s.project), 0, 1.8)[0]!.widthPx).toBeCloseTo(1.8, 9);
  });

  it('cor da vista substitui a do material nas superfícies da categoria (mistura com o papel como antes)', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { color: '#ff0000' } } } });
    const f = surfaceAt(draw(s.project), 0.5, 0)!;
    expect(f.color).toBe(mix('#ff0000', '#ffffff', 0.58));
  });
});

describe('estilo visual da planta (decisão 0015 §2.3)', () => {
  it('hiddenLine (padrão): superfícies da parede com a cor do material misturada com o papel', () => {
    const p = scene();
    const m = p.materials[wallMaterialOf(p)]!;
    expect(draw(p).fills.some((f) => f.color === mix(m.color, '#ffffff', 0.58))).toBe(true);
  });

  it('shaded: superfície opaca na cor do material, sem mistura com o papel', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { style: 'shaded' } });
    const m = s.project.materials[wallMaterialOf(s.project)]!;
    const fs = draw(s.project).fills.filter((f) => f.color === m.color);
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.every((f) => f.alpha === 1)).toBe(true);
    expect(draw(s.project).fills.some((f) => f.color === mix(m.color, '#ffffff', 0.58))).toBe(false);
  });

  it('wireframe: sem preenchimento de modelo (só faixas de contorno); os contornos ficam', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { style: 'wireframe' } });
    const dl = draw(s.project);
    expect(dl.fills.every((f) => f.contour === true)).toBe(true);
    expect(dl.fills.some((f) => f.hatch)).toBe(false);
    expect(silhouetteAt(dl, 0).length).toBeGreaterThan(0);
    expect(symbolAt(dl, 1.5, 0).length).toBeGreaterThan(0);
  });

  it('estilo do 3D guardado numa planta cai em linha oculta (o comando recusa, mas o dado antigo não quebra)', () => {
    const p = scene();
    const g = { ...(p.planViews[0]!.graphics ?? {}), style: 'realistic' } as NonNullable<Project['planViews'][number]['graphics']>;
    const q: Project = withFloorPatchOfTest(p, 'lv_0', { graphics: g });
    expect(planStyleOf(q, 'lv_0', 100).visual).toBe('hiddenLine');
  });
});

describe('categoria oculta (decisão 0015 §2.4): sai da planta, da seleção e das etiquetas', () => {
  it('janela oculta: o símbolo some e a parede volta inteira (sem vão)', () => {
    const p = scene();
    expect(surfaceAt(draw(p), 1.5, 0)).toBeUndefined();
    expect(symbolAt(draw(p), 1.5, 0).length).toBeGreaterThan(0);
    const s = new ProjectStore(p);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { window: { visible: false } } } });
    const dl = draw(s.project);
    expect(surfaceAt(dl, 1.5, 0)).toBeDefined();
    expect(symbolAt(dl, 1.5, 0)).toHaveLength(0);
    expect(symbolAt(dl, 1.5, 2)).toHaveLength(0);
  });

  it('parede oculta: nenhuma superfície nem contorno de parede; a janela continua (é outra categoria)', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { visible: false } } } });
    const dl = draw(s.project);
    expect(silhouetteAt(dl, 0)).toHaveLength(0);
    expect(dl.fills.some((f) => !f.contour && pointInMulti({ x: 0.5, y: 0 }, f.polygons))).toBe(false);
    expect(symbolAt(dl, 1.5, 0).length).toBeGreaterThan(0);
  });

  it('piso oculto: sai da seleção (sem destaque nem fantasma) e das etiquetas', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { floor: { visible: false } } } });
    const p = s.project;
    const withTags = draw(p, { selection: ['f'] }, 100);
    expect(withTags.fills.some((f) => f.color === LIGHT.select && f.alpha === 0.26)).toBe(false);
    expect(hiddenSelectionOps(p, 'lv_0', resolvedPlanViewOf(p, 'lv_0'), ['f'], LIGHT)).toHaveLength(0);
    const tagged = new ProjectStore(p);
    tagged.exec({ type: 'setSettings', patch: { showTags: true } });
    expect(draw(tagged.project).labels.some((l) => l.text.includes('m²'))).toBe(false);
    const visible = new ProjectStore(scene());
    visible.exec({ type: 'setSettings', patch: { showTags: true } });
    expect(draw(visible.project).labels.some((l) => l.text.includes('m²'))).toBe(true);
  });
});

describe('transparência e meio-tom (decisão 0015 §2.4)', () => {
  it('transparência 0,5 na categoria piso: a alpha dos preenchimentos cai para 0,5; a faixa de contorno fica opaca', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { floor: { transparency: 0.5 } } } });
    const dl = draw(s.project);
    const surf = dl.fills.find((f) => !f.contour && pointInMulti({ x: 17.5, y: 9 }, f.polygons))!;
    expect(surf.alpha).toBe(0.5);
    const band = dl.fills.find((f) => f.contour && pointInMulti({ x: 16.005, y: 9 }, f.polygons));
    expect(band?.alpha ?? 1).toBe(1);
  });

  it('meio-tom na parede: as cores de superfície e de traço da categoria vão 50 % para o papel', () => {
    const p = scene();
    const s = new ProjectStore(p);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { halftone: true } } } });
    const base = surfaceAt(draw(p), 0.5, 0)!.color;
    expect(surfaceAt(draw(s.project), 0.5, 0)!.color).toBe(mix(base, '#ffffff', 0.5));
    // Mesma ordem de traços nas duas plantas (só a cor muda): compara o anel da silhueta pelo índice.
    const before = ringsAt(draw(p), 0);
    const after = ringsAt(draw(s.project), 0);
    expect(after).toHaveLength(before.length);
    expect(after[0]!.color).toBe(mix(before[0]!.color, '#ffffff', 0.5));
  });
});

describe('exibição parcial de estrutura (decisão 0015 §2.5) na vista', () => {
  it('"noFinishes" e "coreOnly" tiram camadas das paredes na vista; "entire" é o nível como estava', () => {
    const p = scene();
    const count = (q: Project): number => Object.values(resolvedPlanViewOf(q, 'lv_0').geo.walls).reduce((n, w) => n + w.layers.length, 0);
    const whole = count(p);
    const a = new ProjectStore(p);
    a.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { partialStructure: 'noFinishes' } });
    const b = new ProjectStore(p);
    b.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { partialStructure: 'coreOnly' } });
    expect(count(a.project)).toBeLessThanOrEqual(whole);
    expect(count(b.project)).toBeLessThanOrEqual(whole);
    expect(count(p)).toBe(whole);
  });

  it('a vista é refeita só quando a exibição parcial ou as categorias ocultas mudam (memo por opções)', () => {
    const p = scene();
    expect(resolvedPlanViewOf(p, 'lv_0')).toBe(resolvedPlanViewOf(p, 'lv_0'));
    const s = new ProjectStore(p);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50 } });
    // escala não entra na chave da vista (não muda a geometria): o mesmo projeto devolve o mesmo objeto
    const q = s.project;
    expect(resolvedPlanViewOf(q, 'lv_0')).toBe(resolvedPlanViewOf(q, 'lv_0'));
    const hidden = new ProjectStore(p);
    hidden.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { window: { visible: false } } } });
    expect(resolvedPlanViewOf(hidden.project, 'lv_0').categoryHidden.size).toBeGreaterThan(0);
    expect(resolvedPlanViewOf(p, 'lv_0').categoryHidden.size).toBe(0);
  });
});

describe('detalhe (decisão 0015 §2.2)', () => {
  it('sem gráficos salvos no nível, vale o detalhe do projeto (como antes)', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setSettings', patch: { detail: 'coarse' } });
    expect(planStyleOf(s.project, 'lv_0', 100).detail).toBe('coarse');
  });

  it('com gráficos salvos no nível, o detalhe é o da escala (ou o fixado na vista)', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'setSettings', patch: { detail: 'coarse' } });
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50 } });
    expect(planStyleOf(s.project, 'lv_0', 100).detail).toBe('fine');
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { detail: 'medium' } });
    expect(planStyleOf(s.project, 'lv_0', 100).detail).toBe('medium');
  });
});

describe('hachura sólida (decisão 0015 §2.8)', () => {
  const p0 = scene;
  /** Projeto com a parede em material de hachura `solid` (alumínio e telha metálica usam esse tipo). */
  const solidProject = (): Project => {
    const p = scene();
    const mid = wallMaterialOf(p);
    return { ...p, materials: { ...p.materials, [mid]: { ...p.materials[mid]!, hatch: 'solid' } } };
  };

  it('o desenho leva a hachura sólida na superfície da parede, na cor da hachura', () => {
    const dl = draw(solidProject());
    const f = dl.fills.find((x) => x.hatch?.kind === 'solid');
    expect(f).toBeDefined();
    expect(f!.hatch!.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(f!.hatch!.color).toBe(mix(p0().materials[wallMaterialOf(p0())]!.color, '#000000', 0.45));
  });

  it('CPU: o padrão sólido é um preenchimento na cor da hachura, sem padrão rasterizado', () => {
    const calls: string[] = [];
    const fillStyles: unknown[] = [];
    const fakeCtx = new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) => {
        if (k in t) return t[k];
        return () => {
          calls.push(k);
          return {};
        };
      },
      set: (t, k: string, v) => {
        if (k === 'fillStyle') fillStyles.push(v);
        t[k] = v;
        return true;
      },
    });
    const createCanvas = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({}) }));
    vi.stubGlobal('document', { createElement: createCanvas });
    try {
      const dl = draw(solidProject());
      const hatchColor = dl.fills.find((x) => x.hatch?.kind === 'solid')!.hatch!.color;
      drawPlanCpu(fakeCtx as unknown as CanvasRenderingContext2D, dl, VIEW, 1);
      expect(fillStyles).toContain(hatchColor);
      expect(calls).toContain('fill');
      expect(calls).not.toContain('createPattern');
      expect(createCanvas).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('GPU: o padrão sólido é uma malha na cor da hachura (uKind 0), sem textura', () => {
    const createCanvas = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({}) }));
    vi.stubGlobal('document', { createElement: createCanvas });
    try {
      const dl = draw(solidProject());
      const hatchColor = dl.fills.find((x) => x.hatch?.kind === 'solid')!.hatch!.color;
      const scenePlan = new PlanScene();
      scenePlan.setDrawList(dl, VIEW);
      type Mat = { color?: { getHexString: () => string }; map?: unknown; uniforms?: Record<string, { value: unknown }> };
      const meshes = scenePlan.scene.children.flatMap((c) => c.children) as unknown as Array<{ material: Mat }>;
      const solido = meshes.find((m) => (m.material.uniforms?.uCor?.value as { getHexString: () => string } | undefined)?.getHexString() === hatchColor!.slice(1));
      expect(solido).toBeDefined();
      expect(solido!.material.uniforms!.uKind!.value).toBe(0);
      expect(meshes.every((m) => m.material.map === null || m.material.map === undefined)).toBe(true);
      expect(createCanvas).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
