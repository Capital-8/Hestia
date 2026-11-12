import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  SCHEMA_VERSION,
  createEmptyProject,
  migrateProject,
  sectionAnnotationsOf,
  type Dimension,
  type DimensionElementRef,
  type SectionView,
} from './index.ts';

/**
 * Cotas da planta ligadas a apoio de escada/guarda-corpo (`DimensionElementRef` com feição `part` + `key`) e cotas de
 * corte ligadas ao elemento (`Dimension.secRefs`) são mecanismos de vistas diferentes. As duas mudanças são ADITIVAS:
 * não mudam a versão do esquema, projeto antigo abre e salva igual, e as duas convivem no mesmo projeto.
 */
const vista: SectionView = { id: 'v1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 5 };
const salvarEAbrir = (p: unknown) => migrateProject(JSON.parse(JSON.stringify(p)));

const parte = (elementId: string, key: string): DimensionElementRef => ({ elementId, feature: 'part', key });
const cotaPlanta = (extra: Partial<Dimension> = {}): Dimension => ({ id: 'dp', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, offset: 0.2, ...extra });
const cotaCorte = (extra: Partial<Dimension> = {}): Dimension => ({ id: 'dc', a: { x: 0, y: 0 }, b: { x: 2, y: 1 }, offset: 0.3, ...extra });

function montar(planta: Partial<Dimension>, corte: Partial<Dimension>): ReturnType<typeof createEmptyProject> {
  const s = new ProjectStore(createEmptyProject());
  const levelId = s.project.levels[0]!.id;
  s.exec({ type: 'addView', view: vista });
  s.exec({ type: 'addDimension', levelId, dimension: cotaPlanta(planta) });
  s.exec({ type: 'addDimension', levelId, sectionId: 'v1', dimension: cotaCorte(corte) });
  return s.project;
}

const daPlanta = (p: ReturnType<typeof createEmptyProject>): Dimension => p.levels[0]!.dimensions![0]!;
const doCorte = (p: ReturnType<typeof createEmptyProject>): Dimension => sectionAnnotationsOf(p.views.find((v) => v.id === 'v1')).dimensions[0]!;

describe('cotas com feição `part` (planta) e `secRefs` (corte)', () => {
  it('a versão do esquema não muda e um projeto vazio abre igual', () => {
    const p = createEmptyProject();
    expect(salvarEAbrir(p).schemaVersion).toBe(SCHEMA_VERSION);
    expect(salvarEAbrir(p)).toEqual(p);
  });

  it('projeto antigo (cotas só com refs de parede, sem part nem secRefs) abre e salva sem nenhuma alteração', () => {
    const antigo = montar({ refs: { a: { wallId: 'w1', end: 'a' } } }, {});
    const aberto = salvarEAbrir(antigo);
    expect(daPlanta(aberto)).toEqual(daPlanta(antigo));
    expect(doCorte(aberto)).toEqual(cotaCorte());
    expect('secRefs' in doCorte(aberto)).toBe(false);
    expect(salvarEAbrir(aberto)).toEqual(aberto);
  });

  it('feições antigas continuam válidas ao lado de part na mesma cota', () => {
    const refs = { a: { elementId: 'sl1', feature: 'vertex', index: 2 } as DimensionElementRef, b: parte('st1', 'd0.t3.v1') };
    const aberto = salvarEAbrir(montar({ refs }, {}));
    expect(daPlanta(aberto).refs).toEqual(refs);
  });

  it('as duas coexistem: part na planta e secRefs no corte salvam e abrem iguais, sem um interferir no outro', () => {
    const refs = { a: parte('st1', 'd0.t3.v1'), b: parte('gc1', 'post.0') };
    const secRefs = { a: { hostId: 'st1', kind: 'endpoint' as const, ord: 5 }, b: { hostId: 'gc1', kind: 'midpoint' as const, ord: 2 } };
    const p = montar({ refs }, { secRefs });
    const aberto = salvarEAbrir(p);
    expect(daPlanta(aberto)).toEqual(cotaPlanta({ refs }));
    expect('secRefs' in daPlanta(aberto)).toBe(false);
    expect(doCorte(aberto)).toEqual(cotaCorte({ secRefs }));
    expect('refs' in doCorte(aberto)).toBe(false);
    expect(salvarEAbrir(aberto)).toEqual(aberto);
  });
});
