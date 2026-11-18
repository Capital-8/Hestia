import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeTerrain, migrateProject, terrenoComTipo, soloDoTerreno, terrainTypesOf, tipoDoTerreno, TERRAIN_TYPES_DEFAULT, type Project, type Terrain } from './index.ts';

const comTerreno = (extra: Partial<Terrain> = {}): ProjectStore => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: s.project.levels[0]!.id, ...extra }) });
  return s;
};
const tn = (p: Project): Terrain => p.elements.tn1 as Terrain;
const tipoVerde = { ...TERRAIN_TYPES_DEFAULT[0]!, id: 'tt_x', name: 'X', intervaloCurvas: 0.5, mestraCada: 4, superficieColor: '#00aa00', soloColor: '#663300', rotularCada: 2 };

describe('tipo de terreno', () => {
  it('terreno sem tipo (arquivo antigo) é devolvido como está e sem solo próprio', () => {
    const s = comTerreno({ color: '#123456' });
    expect(tipoDoTerreno(s.project.settings, tn(s.project))).toBeUndefined();
    expect(terrenoComTipo(s.project.settings, tn(s.project))).toBe(tn(s.project));
    expect(soloDoTerreno(s.project.settings, tn(s.project))).toBeUndefined();
  });

  it('upsert grava o tipo; com tipoId o tipo vale (equidistância, mestra, superfície) e o solo é independente', () => {
    const s = comTerreno({ color: '#123456', materialId: 'mat_x' });
    s.exec({ type: 'upsertTerrainType', tipo: tipoVerde });
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { tipoId: 'tt_x' } });
    const e = terrenoComTipo(s.project.settings, tn(s.project));
    expect([e.intervaloCurvas, e.mestraCada, e.color, e.materialId]).toEqual([0.5, 4, '#00aa00', undefined]);
    expect(soloDoTerreno(s.project.settings, tn(s.project))).toEqual({ color: '#663300' });
    // o terreno guarda os campos próprios: sem o tipo, voltam
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { tipoId: null } });
    expect(tn(s.project).tipoId).toBeUndefined();
    expect(terrenoComTipo(s.project.settings, tn(s.project)).color).toBe('#123456');
  });

  it('editar o tipo vale para todos os terrenos que o usam, e desfazer volta', () => {
    const s = comTerreno();
    s.exec({ type: 'upsertTerrainType', tipo: tipoVerde });
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { tipoId: 'tt_x' } });
    s.exec({ type: 'upsertTerrainType', tipo: { ...tipoVerde, intervaloCurvas: 2, soloColor: '#111111' } });
    expect(terrenoComTipo(s.project.settings, tn(s.project)).intervaloCurvas).toBe(2);
    expect(soloDoTerreno(s.project.settings, tn(s.project))?.color).toBe('#111111');
    s.undo();
    expect(terrenoComTipo(s.project.settings, tn(s.project)).intervaloCurvas).toBe(0.5);
  });

  it('recusa equidistância e mestra inválidas; remover o tipo devolve o terreno aos campos próprios', () => {
    const s = comTerreno();
    expect(() => s.exec({ type: 'upsertTerrainType', tipo: { ...tipoVerde, intervaloCurvas: 0.01 } })).toThrow();
    expect(() => s.exec({ type: 'upsertTerrainType', tipo: { ...tipoVerde, rotularCada: 0 } })).toThrow();
    s.exec({ type: 'upsertTerrainType', tipo: tipoVerde });
    s.exec({ type: 'updateTerrain', id: 'tn1', patch: { tipoId: 'tt_x' } });
    s.exec({ type: 'removeTerrainType', id: 'tt_x' });
    expect(tipoDoTerreno(s.project.settings, tn(s.project))).toBeUndefined();
    expect(terrainTypesOf(s.project.settings).some((x) => x.id === 'tt_x')).toBe(false);
  });

  it('migração: arquivo anterior abre sem tipos nem tipoId, e o esquema continua o mesmo', () => {
    const antigo = JSON.parse(JSON.stringify(createEmptyProject())) as Project;
    const aberto = migrateProject(antigo);
    expect(aberto.schemaVersion).toBe(antigo.schemaVersion);
    expect(aberto.settings.terrainTypes).toBeUndefined();
    expect(terrainTypesOf(aberto.settings)).toBe(TERRAIN_TYPES_DEFAULT);
  });
});
