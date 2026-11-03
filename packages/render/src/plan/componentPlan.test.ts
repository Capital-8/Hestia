import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
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
});
