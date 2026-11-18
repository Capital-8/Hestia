import { describe, expect, it } from 'vitest';
import { ProjectStore, SCHEMA_VERSION, createEmptyProject, makeWall, migrateProject, serializeProject, type Wall } from './index.ts';

/** `facePaints` é campo opcional e aditivo: não sobe o número do esquema e projetos sem ele continuam abrindo. */
describe('pintura de faces no arquivo do projeto', () => {
  const parede = (p: ReturnType<typeof createEmptyProject>) =>
    makeWall({ id: 'w1', typeId: p.defaults.wallTypeId, levelId: p.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });

  it('o esquema continua na versão 29 (campo aditivo)', () => {
    expect(SCHEMA_VERSION).toBe(29);
  });

  it('projeto salvo sem facePaints abre e não ganha o campo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: parede(s.project) });
    const volta = migrateProject(JSON.parse(serializeProject(s.project)));
    const w = volta.elements['w1'] as Wall;
    expect(w.facePaints).toBeUndefined();
    expect(volta.schemaVersion).toBe(29);
  });

  it('facePaints (base, região e ripado) sobrevive a salvar, abrir e salvar de novo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: parede(s.project) });
    s.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: {
        face: 'sideExt',
        layer: 'all',
        materialId: 'mat_cumaru',
        regions: [
          { id: 'r1', shape: { kind: 'rect', u0: 0.5, v0: 0.5, u1: 1.5, v1: 1.5 }, materialId: 'mat_nogueira', order: 1 },
          { id: 'r2', shape: { kind: 'rect', u0: 2, v0: 0.5, u1: 3, v1: 2 }, materialId: 'mat_freijo', order: 2, thickness: 0.03, slats: { width: 0.05, gap: 0.03, depth: 0.03, angleDeg: 0, slatMaterialId: 'mat_freijo' } },
        ],
      },
    });
    const texto = serializeProject(s.project);
    const volta = migrateProject(JSON.parse(texto));
    expect((volta.elements['w1'] as Wall).facePaints).toEqual((s.project.elements['w1'] as Wall).facePaints);
    expect(serializeProject(volta)).toBe(texto);
    s.undo();
    expect((s.project.elements['w1'] as Wall).facePaints ?? []).toHaveLength(0);
  });
});
