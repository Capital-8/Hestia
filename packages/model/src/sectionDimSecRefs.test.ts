import { describe, expect, it } from 'vitest';
import { ProjectStore, SCHEMA_VERSION, createEmptyProject, migrateProject, sectionAnnotationsOf, setSectionDimensionResolver, type Dimension, type SectionView } from './index.ts';

/**
 * `Dimension.secRefs` (cota de corte ligada ao elemento) é campo OPCIONAL: não muda a versão do esquema nem exige migração.
 * Projeto antigo (sem o campo) abre igual; com o campo, salvar e abrir devolve o mesmo.
 */
const vista: SectionView = { id: 'v1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 5 };
const cota = (extra: Partial<Dimension> = {}): Dimension => ({ id: 'dim1', a: { x: 0, y: 0 }, b: { x: 2, y: 1 }, offset: 0.3, ...extra });

function projetoComCota(extra: Partial<Dimension>): ReturnType<typeof createEmptyProject> {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addView', view: vista });
  s.exec({ type: 'addDimension', levelId: s.project.levels[0]!.id, sectionId: 'v1', dimension: cota(extra) });
  return s.project;
}

const salvarEAbrir = (p: unknown) => migrateProject(JSON.parse(JSON.stringify(p)));

describe('cota de corte com secRefs: abrir e salvar', () => {
  it('o campo opcional não muda a versão do esquema', () => {
    expect(salvarEAbrir(createEmptyProject()).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('projeto antigo, sem secRefs, abre e salva sem nenhuma alteração na cota', () => {
    const antigo = projetoComCota({});
    const aberto = salvarEAbrir(antigo);
    const d = sectionAnnotationsOf(aberto.views.find((v) => v.id === 'v1')).dimensions[0]!;
    expect(d).toEqual(cota());
    expect('secRefs' in d).toBe(false);
    expect(salvarEAbrir(aberto)).toEqual(aberto);
  });

  it('com secRefs: o comando aceita, salvar e abrir devolvem o mesmo, e a leitura sem resolvedor é a gravada', () => {
    const secRefs = { a: { hostId: 'st1', kind: 'endpoint' as const, ord: 5 }, b: { hostId: 'gc1', kind: 'midpoint' as const, ord: 2 } };
    const p = projetoComCota({ secRefs });
    const aberto = salvarEAbrir(p);
    const d = sectionAnnotationsOf(aberto.views.find((v) => v.id === 'v1')).dimensions[0]!;
    expect(d.secRefs).toEqual(secRefs);
    expect(d).toEqual(cota({ secRefs }));
    expect(salvarEAbrir(aberto)).toEqual(aberto);
  });

  it('o resolvedor só entra em cota com secRefs; as outras saem como gravadas', () => {
    const p = projetoComCota({});
    let chamadas = 0;
    setSectionDimensionResolver((_v, a) => {
      chamadas++;
      return a;
    });
    try {
      sectionAnnotationsOf(p.views.find((v) => v.id === 'v1'));
      expect(chamadas).toBe(0);
      const q = projetoComCota({ secRefs: { a: { hostId: 'st1', kind: 'endpoint', ord: 0 } } });
      sectionAnnotationsOf(q.views.find((v) => v.id === 'v1'));
      expect(chamadas).toBe(1);
    } finally {
      setSectionDimensionResolver(null);
    }
  });
});
