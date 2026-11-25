import { describe, expect, it } from 'vitest';
import { resolveRoofs, type ResolvedRoof } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeRoof, type Project } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { mix } from './color.ts';
import { roofOps } from './roofs.ts';
import { corDaAresta, DEFAULT_SUN_AZIMUTH, direcaoDoSol, TONE_45, tomDaAgua } from './roofsAgua.ts';
import { defaultPaint } from './style.ts';
import { DARK, LIGHT, type PlanTheme } from './types.ts';

const P = (x: number, y: number) => ({ x, y });
const VIEW: Viewport = { cx: 4, cy: 3, zoom: 100, width: 800, height: 600 };
const BASE = '#b5522d';
const LAYERS = [{ layerIndex: 0, materialId: 'mat_telha_ceramica', thickness: 0.015, below: 0 }];

/** Telhado de uma água com a subida `up` e a inclinação `percent`, para isolar o tom. */
function agua(up: { x: number; y: number }, percent: number): ResolvedRoof {
  return {
    roofId: 'r',
    typeId: 'rt_ceramica',
    levelId: 'lv_0',
    eaveZ: 2.8,
    joinedArea: 0,
    layers: LAYERS,
    planes: [{ polygon: [[[P(0, 0), P(8, 0), P(8, 3), P(0, 3)]]], origin: P(0, 0), up, percent, z0: 2.8 }],
    lines: [],
  };
}

/** Linha oculta (o padrão) e sombreado: o segundo é onde a cor do material aparece. */
const PRANCHA = defaultPaint('roof', 100);
const SHADED = { ...PRANCHA, visual: 'shaded' as const };

/** Cor da água desenhada na planta para o `up` e a inclinação dados, no tema e no estilo pedidos. */
function corDaAgua(theme: PlanTheme, dark: boolean, up: { x: number; y: number }, percent: number, p: Project = createEmptyProject(), paint = PRANCHA): string {
  return roofOps([agua(up, percent)], p, theme, dark, 'medium', VIEW, { paint }).fills[0]!.color;
}

/** Projeto com o material da telha sem cor (mas com a hachura). */
function semCorDeTelha(): Project {
  const p = createEmptyProject();
  return { ...p, materials: { ...p.materials, mat_telha_ceramica: { ...p.materials.mat_telha_ceramica!, color: '' } } };
}

/** Projeto sem o material da telha: o tipo continua apontando para ele, e a planta cai no `roofTile`. */
function semMaterialDeTelha(): Project {
  const p = createEmptyProject();
  const materiais = { ...p.materials };
  Reflect.deleteProperty(materiais, 'mat_telha_ceramica');
  return { ...p, materials: materiais };
}

describe('tomDaAgua: sol do 3D e inclinação', () => {
  it('água plana fica com a cor base pura', () => {
    expect(tomDaAgua(BASE, P(0, 1), 0)).toBe(BASE);
    expect(tomDaAgua(BASE, P(1, 0), 0)).toBe(BASE);
    expect(tomDaAgua(BASE, P(0, -1), 0)).toBe(BASE);
  });

  it('a 45° com a queda voltada para o sol clareia e na direção oposta escurece em cerca de 22 %', () => {
    // Azimute 0 = leste: a luz vem de +x. A água de `up` para oeste desce para leste (para o sol).
    expect(tomDaAgua(BASE, P(-1, 0), 100, 0)).toBe(mix(BASE, '#ffffff', TONE_45));
    expect(tomDaAgua(BASE, P(1, 0), 100, 0)).toBe(mix(BASE, '#000000', TONE_45));
  });

  it('a luz padrão é a do sol do 3D (azimute 324,46°), não mais uma constante de noroeste', () => {
    const luz = direcaoDoSol(DEFAULT_SUN_AZIMUTH);
    // A água que desce na direção do sol é a mais clara; a oposta, a mais escura.
    expect(tomDaAgua(BASE, P(-luz.x, -luz.y), 100)).toBe(mix(BASE, '#ffffff', TONE_45));
    expect(tomDaAgua(BASE, P(luz.x, luz.y), 100)).toBe(mix(BASE, '#000000', TONE_45));
    expect(DEFAULT_SUN_AZIMUTH).toBe(324.46);
  });

  it('as orientações cardeais a 45° com o sol a leste: leste clareia, oeste escurece, norte e sul ficam na base', () => {
    // `up` aponta para o lado alto; a queda é o sentido oposto.
    const desceLeste = tomDaAgua(BASE, P(-1, 0), 100, 0);
    const desceOeste = tomDaAgua(BASE, P(1, 0), 100, 0);
    expect(desceLeste).toBe(mix(BASE, '#ffffff', TONE_45));
    expect(desceOeste).toBe(mix(BASE, '#000000', TONE_45));
    expect(tomDaAgua(BASE, P(0, 1), 100, 0)).toBe(BASE);
    expect(tomDaAgua(BASE, P(0, -1), 100, 0)).toBe(BASE);
  });

  it('a variação cresce com a inclinação: 45° mais forte que 30 % e água plana sem variação', () => {
    const plano = tomDaAgua(BASE, P(0, 1), 0);
    const trinta = tomDaAgua(BASE, P(0, 1), 30);
    const quarentaCinco = tomDaAgua(BASE, P(0, 1), 100);
    expect(plano).toBe(BASE);
    expect(trinta).not.toBe(BASE);
    expect(quarentaCinco).not.toBe(trinta);
  });

  it('a cor da aresta interna é um pouco mais escura que o preenchimento', () => {
    const fill = mix(BASE, '#ffffff', 0.5);
    expect(corDaAresta(fill)).toBe(mix(fill, '#000000', 0.38));
  });
});

describe('cor e hachura do material do tipo de telhado', () => {
  it('em linha oculta a água fica no papel; no sombreado, usa a cor do material', () => {
    const p = createEmptyProject();
    expect(p.materials.mat_telha_ceramica!.color).toBe(BASE);
    expect(corDaAgua(LIGHT, false, P(0, 1), 30)).toBe('#ffffff');
    expect(corDaAgua(DARK, true, P(0, 1), 30)).toBe(DARK.bg);
    expect(corDaAgua(LIGHT, false, P(0, 1), 30, p, SHADED)).toBe(tomDaAgua(BASE, P(0, 1), 30));
  });

  it('sem cor no material, cai no token roofTile nos dois temas', () => {
    const p = semCorDeTelha();
    expect(corDaAgua(LIGHT, false, P(0, 1), 30, p)).toBe('#ffffff');
    expect(corDaAgua(DARK, true, P(0, 1), 30, p)).toBe(DARK.bg);
    expect(corDaAgua(LIGHT, false, P(0, 1), 30, p, SHADED)).toBe(tomDaAgua(LIGHT.roofTile, P(0, 1), 30));
    expect(corDaAgua(DARK, true, P(0, 1), 30, p, SHADED)).toBe(tomDaAgua(DARK.roofTile, P(0, 1), 30));
    expect(LIGHT.roofTile).toBe('#c9795a');
    expect(DARK.roofTile).toBe('#8a4f3b');
  });

  it('sem material, cai no roofTile e não há hachura', () => {
    const p = semMaterialDeTelha();
    expect(corDaAgua(LIGHT, false, P(0, 1), 30, p, SHADED)).toBe(tomDaAgua(LIGHT.roofTile, P(0, 1), 30));
    expect(roofOps([agua(P(0, 1), 30)], p, LIGHT, false, 'medium', VIEW).fills[0]!.hatch).toBeUndefined();
  });

  it('material com hachura continua com o padrão de planta', () => {
    expect(roofOps([agua(P(0, 1), 30)], createEmptyProject(), LIGHT, false, 'medium', VIEW).fills[0]!.hatch?.kind).toBe('diagonal');
  });
});

describe('telhado real: tom por água e rincão tracejado', () => {
  it('linha oculta: as duas águas no papel e o rincão tracejado na tinta; no sombreado, tons por água', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addRoof',
      roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }),
    });
    const p = s.project;
    const [r] = resolveRoofs(p, 'lv_0');
    const ops = roofOps([r!], p, LIGHT, false, 'medium', VIEW);
    expect(ops.fills.filter((f) => f.alpha === 0.98).map((f) => f.color)).toEqual(['#ffffff', '#ffffff']);
    // O telhado de duas águas não tem rincão: acrescenta-se um para conferir o tracejado da aresta.
    const comRincao: ResolvedRoof = { ...r!, lines: [...r!.lines, { kind: 'valley', a: P(0, 0), b: P(1, 1) }] };
    const valley = roofOps([comRincao], p, LIGHT, false, 'medium', VIEW).strokes.find((st) => st.dash && st.pts[0]!.x === 0 && st.pts[0]!.y === 0);
    expect(valley?.dash).toEqual([6, 3]);
    expect(valley?.color).toBe(LIGHT.ink);
    // No sombreado as águas continuam com o tom da orientação (a base é a cor do material).
    const shaded = roofOps([r!], p, LIGHT, false, 'medium', VIEW, { paint: SHADED });
    expect(shaded.fills.some((f) => f.color === tomDaAgua(BASE, r!.planes[0]!.up, 30) && f.alpha === 0.98)).toBe(true);
    expect(shaded.fills.some((f) => f.color === tomDaAgua(BASE, r!.planes[1]!.up, 30) && f.alpha === 0.98)).toBe(true);
  });
});
