import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Corpo, type Familia, type Project, type Simbolo2D } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { componentsPlanOps } from './planComponents.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };

/** Tubo Ø50 × 1 m deitado em X, com a vista dada. */
const tubo = (vistas?: Corpo['vistas']): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'], rotacao: ['0', '90', '0'] },
  ...(vistas ? { vistas } : {}),
});

function cena(corpos?: Corpo[]): Project {
  const p = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), ...(corpos ? { corpos } : {}) };
  aplicar(p, { type: 'upsertFamily', family: familia });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: familia.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'c1' };
  return p;
}

function fills(p: Project) {
  return buildPlanGeometry({
    project: p, levelId: p.levels[0]!.id, resolved: resolveLevel(p, p.levels[0]!.id, new Map()), below: null, viewport: VIEW, theme: LIGHT, dark: false,
    selection: [], hover: null, preview: [], inference: null, showGrid: false,
  } satisfies PlanInput).fills;
}

const caixa = (f: { polygons: ReadonlyArray<ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>> }): number[] => {
  const pts = f.polygons.flat(2);
  return [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))].map((n) => Math.round(n * 1e3) / 1e3);
};

describe('silhueta dos corpos na planta (B3)', () => {
  it('tubo em X desenha o retângulo 1 × 0,05 no mundo', () => {
    const f = fills(cena([tubo()]));
    expect(f.some((x) => caixa(x).join() === [1, 1.975, 2, 2.025].join())).toBe(true);
  });

  it('corpo só com vistas corte não desenha; família sem corpos fica idêntica', () => {
    const semCorpos = fills(cena());
    expect(fills(cena([tubo(['corte'])]))).toEqual(semCorpos);
    expect(fills(cena([]))).toEqual(semCorpos);
    expect(fills(cena([tubo()])).length).toBe(semCorpos.length + 1);
  });
});

/** Tubo Ø50 × 1 m em pé: eixo Z da família, sem rotação do quadro. */
const tuboEmPe = (): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'] },
});

/** Mesmo cenário de `cena`, com a inclinação 3D `[inclinação, giro]` na instância. */
function cenaInclinada(corpos: Corpo[], inclinacao: [number, number]): Project {
  const p = cena(corpos);
  const c = p.elements.c1;
  if (c?.kind === 'component') c.inclinacao = inclinacao;
  return p;
}

describe('planta com a inclinação 3D da instância (B3b)', () => {
  it('tubo em pé inclinado 90° em Y deita na planta: retângulo 1 × 0,05 a partir de (1, 2)', () => {
    const f = fills(cenaInclinada([tuboEmPe()], [Math.PI / 2, 0]));
    expect(f.some((x) => caixa(x).join() === [1, 1.975, 2, 2.025].join())).toBe(true);
  });

  it('sem inclinação ou com [0, 0] a planta do tubo em pé é a de sempre', () => {
    expect(fills(cenaInclinada([tuboEmPe()], [0, 0]))).toEqual(fills(cena([tuboEmPe()])));
  });

  it('símbolo com substituiGeometria esconde a silhueta do tubo e as peças da família', () => {
    const simbolo: Simbolo2D = { id: 'tomada', nome: 'Tomada', vistas: ['planta'], plano: 'xy', substituiGeometria: true, primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['800', '0'] }] };
    const com = cena([tuboEmPe()]);
    const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), corpos: [tuboEmPe()], simbolos: [simbolo] };
    aplicar(com, { type: 'upsertFamily', family: familia });
    const comSimbolo = componentsPlanOps(com, com.levels[0]!.id, LIGHT, undefined);
    expect(comSimbolo.fills).toHaveLength(0);
    expect(comSimbolo.strokes).toHaveLength(1);
    const semSimbolo = cena([tuboEmPe()]);
    expect(componentsPlanOps(semSimbolo, semSimbolo.levels[0]!.id, LIGHT, undefined).fills.length).toBeGreaterThan(0);
  });
});
