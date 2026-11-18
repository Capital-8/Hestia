import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, familiaDaBiblioteca, type Component, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };

/** Projeto vazio com a família do armário importada, para o componente poder ser resolvido. */
function comFamilia(): Project {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return p;
}

/** Componente do armário no nível do projeto. */
function componente(p: Project, id: string): Component {
  return { id, kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: id };
}

/** Projeto com o componente `c1` (ou sem nenhum, quando `com` é falso). */
function cena(com: boolean): Project {
  const p = comFamilia();
  if (com) p.elements.c1 = componente(p, 'c1');
  return p;
}

function entrada(p: Project, hidden?: ReadonlySet<string>): PlanInput {
  return {
    project: p,
    levelId: p.levels[0]!.id,
    resolved: resolveLevel(p, p.levels[0]!.id, new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    hidden,
  };
}

/** Traços fechados, finos e na tinta suave do tema: a pegada do componente em planta. */
const pegadas = (p: Project, hidden?: ReadonlySet<string>): number =>
  buildPlanGeometry(entrada(p, hidden)).strokes.filter((s) => s.closed && s.widthPx === 1 && s.color === LIGHT.inkSoft).length;

describe('componentes na planta', () => {
  it('um componente no nível gera ao menos um traço fechado na cor do tema', () => {
    expect(pegadas(cena(true))).toBeGreaterThan(0);
  });

  it('sem componente nenhum, nada é desenhado', () => {
    expect(pegadas(cena(false))).toBe(0);
  });

  it('componente escondido não é desenhado', () => {
    expect(pegadas(cena(true), new Set(['c1']))).toBe(0);
  });

  it('armário aéreo elevado (zMin >= 1,1 m) usa contorno tracejado [4, 3] e não emite fill sólido', () => {
    const p = createEmptyProject('t');
    const aereo = familiaDaBiblioteca('fam_aereo')!;
    aplicar(p, { type: 'upsertFamily', family: structuredClone(aereo) });
    p.elements.aereo1 = {
      id: 'aereo1',
      kind: 'component',
      familyId: aereo.id,
      typeId: 'A80',
      levelId: p.levels[0]!.id,
      order: 1,
      x: 1,
      y: 2,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'aereo1',
    };

    const g = buildPlanGeometry(entrada(p));
    const tracejados = g.strokes.filter((s) => s.closed && s.dash && s.dash[0] === 4 && s.dash[1] === 3);
    expect(tracejados.length).toBeGreaterThan(0);
    // Sem preenchimento opaco escondendo o balcão de baixo.
    expect(g.fills).toHaveLength(0);
  });

  it('balcão de pia (piso) destaca tampo, recorte interno de cuba, portas e marcação frontal', () => {
    const p = createEmptyProject('t');
    const pia = familiaDaBiblioteca('fam_base_pia')!;
    aplicar(p, { type: 'upsertFamily', family: structuredClone(pia) });
    p.elements.pia1 = {
      id: 'pia1',
      kind: 'component',
      familyId: pia.id,
      typeId: 'P100',
      levelId: p.levels[0]!.id,
      order: 1,
      x: 1,
      y: 2,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'pia1',
    };

    const g = buildPlanGeometry(entrada(p));
    // Fill sutil da pegada + tampo, sem traço tracejado de aéreo.
    expect(g.fills.length).toBeGreaterThanOrEqual(2);
    expect(g.strokes.some((s) => s.dash !== undefined)).toBe(false);
    // Marcação frontal de portas (traços abertos dos puxadores na frente das 2 portas).
    const frentes = g.strokes.filter((s) => !s.closed && s.color === LIGHT.inkSoft);
    expect(frentes).toHaveLength(2);
    // Contornos internos do recorte da cuba (caixa menor dentro da largura do tampo).
    const fechados = g.strokes.filter((s) => s.closed && s.color === LIGHT.inkSoft);
    expect(fechados.length).toBeGreaterThanOrEqual(5);
  });

  it('peça generica/cuba explícita no tampo também aparece como linha interna em planta', () => {
    const p = createEmptyProject('t');
    const fam = structuredClone(FAMILIA_ARMARIO);
    fam.pecas.push({
      id: 'cuba_topo',
      nome: 'Cuba',
      papel: 'generica',
      eixo: 'z',
      origem: ['150', '100', 'A - 25'],
      tamanho: ['400', '350'],
      espessura: '25',
    });
    aplicar(p, { type: 'upsertFamily', family: fam });
    p.elements.c1 = componente(p, 'c1');

    const g = buildPlanGeometry(entrada(p));
    const menoresQueLargura = g.strokes.filter((s) => {
      if (!s.closed || s.pts.length !== 4) return false;
      const xs = s.pts.map((q) => q.x);
      return Math.max(...xs) - Math.min(...xs) < 0.45;
    });
    expect(menoresQueLargura.length).toBeGreaterThan(0);
  });
});
