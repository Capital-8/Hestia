import { describe, expect, it } from 'vitest';
import { createEmptyProject, emptyPlanAnnotations, migrateProject, planAnnotationIds, planAnnotationsOf, SCHEMA_VERSION, DEFAULT_AREA_GRAPHICS, type AreaPlan, type AreaPlanAnnotations } from './index.ts';

/**
 * Caracterização do modelo (golden): trava o comportamento ATUAL de migração de planta de área e da regra
 * `annotations` undefined vs {}. Quando o plano de perfis mudar isso, o teste deve ser atualizado de propósito.
 */

/** Projeto v21 com uma planta de área cujo `graphics` só tem alguns campos (arquivo antigo). */
function projetoV21ComGraficosParciais(): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  base.schemaVersion = 21;
  base.areaPlans = [
    {
      id: 'ap_parcial',
      name: 'Planta parcial',
      levelId: 'lv_0',
      scale: 50,
      tags: [],
      graphics: { fill: 'none', outline: 'thin' },
    },
    {
      id: 'ap_sem_graficos',
      name: 'Planta sem graphics',
      levelId: 'lv_0',
      scale: 100,
      tags: [],
    },
  ];
  return base;
}

describe('caracterização do modelo: migração v21 com planta de área parcial', () => {
  it('(c) migrateProject abre o arquivo sem exceção e sem alterar a versão', () => {
    expect(SCHEMA_VERSION).toBe(24);
    expect(() => migrateProject(projetoV21ComGraficosParciais())).not.toThrow();
    const p = migrateProject(projetoV21ComGraficosParciais());
    expect(p.schemaVersion).toBe(24);
  });

  it('(c) v22: a migração completa graphics (merge profundo); annotations segue undefined', () => {
    const p = migrateProject(projetoV21ComGraficosParciais());
    const parcial = p.areaPlans!.find((x) => x.id === 'ap_parcial')!;
    expect(parcial.graphics).toEqual(DEFAULT_AREA_GRAPHICS);
    const semGraficos = p.areaPlans!.find((x) => x.id === 'ap_sem_graficos')!;
    expect(semGraficos.graphics).toEqual(DEFAULT_AREA_GRAPHICS);
    expect(semGraficos.scale).toBe(100);
    // Sem annotations no arquivo: continua undefined (herda do nível na regra de render).
    expect(parcial.annotations).toBeUndefined();
  });

  it('(c) o projeto migrado pode ser salvo e reaberto sem perder a forma', () => {
    const p1 = migrateProject(projetoV21ComGraficosParciais());
    const p2 = migrateProject(JSON.parse(JSON.stringify(p1)));
    expect(p2.areaPlans).toEqual(p1.areaPlans);
  });
});

describe('caracterização: planAnnotationsOf e regra annotations undefined vs {}', () => {
  const plano = (annotations?: unknown): Pick<AreaPlan, 'annotations'> => ({ annotations } as Pick<AreaPlan, 'annotations'>);

  it('(d) annotations undefined vira conjunto vazio com as cinco listas', () => {
    const a = planAnnotationsOf(plano(undefined));
    expect(a).toEqual(emptyPlanAnnotations());
    expect(a).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
    expect(planAnnotationIds(plano(undefined))).toEqual([]);
  });

  it('(d) annotations definido é devolvido como está (mesma referência)', () => {
    const ann: AreaPlanAnnotations = emptyPlanAnnotations();
    expect(planAnnotationsOf(plano(ann))).toBe(ann);
  });

  it('(d) annotations {} é conjunto próprio vazio: listas normalizadas e planAnnotationIds não lança', () => {
    const a = planAnnotationsOf(plano({}));
    expect(a).toEqual(emptyPlanAnnotations());
    expect(planAnnotationIds(plano({}))).toEqual([]);
  });

  it('(d) a regra de render escolhe o nível só para annotations undefined (build.ts: plan.annotations ? ... : nível)', () => {
    // Coberto indiretamente pelos snapshots de render (b) e (b2) em packages/render/src/plan/caracterizacao.test.ts.
    expect(planAnnotationsOf(plano(undefined)).texts).toEqual([]);
  });
});
