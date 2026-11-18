import { computeSection } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Localizacao, type Project, type SpotAnnotation } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { spotAnnotationOps } from './plan/extraAnnotations.ts';
import { defaultPaint } from './plan/style.ts';
import { LIGHT } from './plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './section/build.ts';
import { levelDataOf } from './model3d/levelsData.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const PAINT = (): ReturnType<typeof defaultPaint> => ({ ...defaultPaint('annotation', 40), color: '#000000' });
const comLocalizacao = (l: Localizacao): Project => ({ ...createEmptyProject(), localizacao: l });
const LOC_NORTE = { origemE: 500000, origemN: 7000000, cotaZero: 760, norteVerdadeiro: 0 };

/** Cota de coordenada na planta, no ponto (10, 20) do projeto, com a família padrão (base do projeto). */
const coordenada = (): SpotAnnotation => ({ id: 'sp1', kind: 'coordinate', target: v(10, 20), at: v(30, 40), showLeader: true });
/** Cota de elevação na planta, no ponto (0, 0), com a família padrão (base do projeto). */
const elevacao = (): SpotAnnotation => ({ id: 'sp2', kind: 'elevation', target: v(0, 0), at: v(5, 5), showLeader: true });

const textoDaCoordenada = (p: Project): string => spotAnnotationOps(p, 'lv_0', [coordenada()], PAINT(), 100).labels[0]!.text;
const textoDaElevacao = (p: Project, nivel: number): string => spotAnnotationOps(p, 'lv_0', [elevacao()], PAINT(), 100, { levelElevation: nivel }).labels[0]!.text;

describe('texto das cotas com localização (renderização calculada na hora do desenho)', () => {
  it('sem localização, a cota de coordenada mostra as coordenadas do projeto (N 20 / E 10)', () => {
    expect(textoDaCoordenada(createEmptyProject())).toBe('N +20,00 m\nE +10,00 m');
  });

  it('com localização e norte 0, a cota mostra E e N reais: E 500010 / N 7000020', () => {
    expect(textoDaCoordenada(comLocalizacao(LOC_NORTE))).toBe('N +7000020,00 m\nE +500010,00 m');
  });

  it('com localização e norte π/2, E e N saem girados: E 499980 / N 7000010', () => {
    const p = comLocalizacao({ ...LOC_NORTE, norteVerdadeiro: Math.PI / 2 });
    expect(textoDaCoordenada(p)).toBe('N +7000010,00 m\nE +499980,00 m');
  });

  it('a cota de elevação sem localização mostra a cota do nível (2,50 m)', () => {
    expect(textoDaElevacao(createEmptyProject(), 2.5)).toBe('+2,50 m');
  });

  it('a cota de elevação com cota zero 760 e z 2,5 mostra 762,50 m', () => {
    expect(textoDaElevacao(comLocalizacao(LOC_NORTE), 2.5)).toBe('+762,50 m');
  });

  it('a mudança de localização muda o texto de uma cota já existente (o texto não é gravado)', () => {
    const spot = [coordenada()];
    const antes = spotAnnotationOps(comLocalizacao(LOC_NORTE), 'lv_0', spot, PAINT(), 100).labels[0]!.text;
    const depois = spotAnnotationOps(comLocalizacao({ ...LOC_NORTE, origemE: 600000 }), 'lv_0', spot, PAINT(), 100).labels[0]!.text;
    expect(antes).toBe('N +7000020,00 m\nE +500010,00 m');
    expect(depois).toBe('N +7000020,00 m\nE +600010,00 m');
    expect(spot[0]!.target).toEqual({ x: 10, y: 20 });
  });
});

describe('marcas de nível com a cota exibida', () => {
  it('datum 3D: sem localização o rótulo é a elevação do projeto; com cota zero 760 soma a altitude real', () => {
    const base = createEmptyProject();
    const nome = base.levels[0]!.name;
    expect(levelDataOf(base)[0]!.text).toBe(`${nome} +0,00`);
    expect(levelDataOf(comLocalizacao(LOC_NORTE))[0]!.text).toBe(`${nome} +760,00`);
    // A elevação geométrica do datum continua sendo a do projeto (só o texto muda).
    expect(levelDataOf(comLocalizacao(LOC_NORTE))[0]!.elevation).toBe(0);
  });

  it('corte: a marca do nível sai com a cota exibida (760 + 0 = +760,00); sem localização, como antes', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
    const entrada = (project: Project): SectionInput => ({
      project,
      section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }),
      viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
      theme: LIGHT,
      dark: false,
      showGrid: false,
    });
    const nome = store.project.levels[0]!.name;
    const semLoc = buildSectionDrawList(entrada(store.project)).labels.map((l) => l.text);
    expect(semLoc).toContain(`${nome} +0,00`);
    const comLoc = buildSectionDrawList(entrada({ ...store.project, localizacao: LOC_NORTE })).labels.map((l) => l.text);
    expect(comLoc).toContain(`${nome} +760,00`);
  });
});
