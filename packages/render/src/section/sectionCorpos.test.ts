import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Corpo, type Familia, type Project } from '@hestia/model';
import { LIGHT, type FillOp } from '../plan/types.ts';
import { buildSectionDrawList } from './build.ts';

/** Cilindro Ø100 em pé, altura 600 mm, na origem da instância. */
const cilindro = (vistas?: Corpo['vistas']): Corpo => ({
  id: 'cil',
  nome: 'Cilindro',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '600' },
  quadro: { origem: ['0', '0', '0'], rotacao: ['0', '0', '0'] },
  ...(vistas ? { vistas } : {}),
});

function cena(corpos?: Corpo[]): Project {
  const p = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), ...(corpos ? { corpos } : {}) };
  aplicar(p, { type: 'upsertFamily', family: familia });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: familia.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'c1' };
  return p;
}

/** Corte em y = `y` olhando para +y (t = x, z = cota), com 1,5 m de profundidade. */
function lista(p: Project, y: number) {
  const section = computeSection(p, { a: { x: 0, y }, b: { x: 3, y }, depth: 1.5 });
  return buildSectionDrawList({ project: p, section, viewport: { cx: 1.5, cy: 0.4, zoom: 200, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false });
}

const box = (f: FillOp): number[] => {
  const pts = f.polygons.flat(2);
  return [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))].map((n) => Math.round(n * 1e3) / 1e3);
};

describe('corte dos corpos (B4)', () => {
  it('plano pelo eixo do cilindro dá o retângulo 0,1 × 0,6 no corte', () => {
    const d = lista(cena([cilindro()]), 2);
    expect(d.fills.some((f) => box(f).join() === [0.95, 0, 1.05, 0.6].join())).toBe(true);
  });

  it('plano na frente do cilindro mostra a silhueta atrás; plano que passa depois dele não mostra nada', () => {
    const base = lista(cena(), 1).fills.length;
    expect(lista(cena([cilindro()]), 1).fills.length).toBe(base + 1);
    expect(lista(cena([cilindro()]), 3).fills.length).toBe(lista(cena(), 3).fills.length);
  });

  it('corpo só com vistas planta e família sem corpos: o corte fica idêntico', () => {
    const sem = lista(cena(), 2);
    expect(lista(cena([cilindro(['planta'])]), 2)).toEqual(sem);
    expect(lista(cena([]), 2)).toEqual(sem);
  });
});
