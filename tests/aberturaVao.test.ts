/**
 * Regressão: o vão da parede acompanha a esquadria. Apagar ou editar (largura, tipo, offset) uma porta/janela deve mudar
 * a geometria da parede (planta resolvida e sólido 3D), inclusive em projeto importado de IFC. Os caches por conteúdo
 * (`resolveLevel`, `wallLayerSolid`) não podem devolver o vão antigo.
 */
import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type Project } from '@hestia/model';
import { importIfc } from '@hestia/io';
import { buildLevelSolids } from '../packages/render/src/model3d/solids.ts';
import paredeJanela from './ifc/fixtures/parede-janela.ifc?raw';

/** Área de planta somada das camadas das paredes do nível. */
function areaPlanta(p: Project, levelId: string): number {
  const r = resolveLevel(p, levelId);
  return Object.values(r.walls).reduce((s, w) => s + w.layers.reduce((a, l) => a + multiArea(l.cut), 0), 0);
}

/** Volume (m³) dos sólidos de parede do nível. */
function volume3d(p: Project, levelId: string): number {
  let v = 0;
  for (const b of buildLevelSolids(resolveLevel(p, levelId)).batches) {
    const P = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
    for (let i = 0; i < b.indices.length; i += 3) {
      const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)];
      v += (a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0])) / 6;
    }
  }
  return Math.abs(v);
}

const medidas = (p: Project, lv: string) => ({ planta: areaPlanta(p, lv), vol: volume3d(p, lv) });

function cena(kind: 'door' | 'window' = 'door') {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  const base = Object.values(s.project.openingTypes).filter((t) => t.kind === kind);
  const t0 = base[0]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_a', width: 0.9 } });
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_b', width: 1.6 } });
  const ssemVao = medidas(s.project, 'lv_0');
  s.exec({ type: 'addOpening', opening: { id: 'v', kind, typeId: 'ot_a', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  return { s, sem: ssemVao, com: medidas(s.project, 'lv_0') };
}

describe.each(['door', 'window'] as const)('vão acompanha a esquadria (%s)', (kind) => {
  it('o vão existe e apagar a esquadria devolve a parede inteira', () => {
    const { s, sem, com } = cena(kind);
    expect(com.planta).toBeLessThan(sem.planta - 1e-6);
    expect(com.vol).toBeLessThan(sem.vol - 1e-6);
    s.exec({ type: 'deleteElements', ids: ['v'] });
    const dep = medidas(s.project, 'lv_0');
    expect(dep.planta).toBeCloseTo(sem.planta, 6);
    expect(dep.vol).toBeCloseTo(sem.vol, 6);
  });

  it('desfazer o apagar traz o vão de volta', () => {
    const { s, com } = cena(kind);
    s.exec({ type: 'deleteElements', ids: ['v'] });
    medidas(s.project, 'lv_0');
    s.undo();
    const dep = medidas(s.project, 'lv_0');
    expect(dep.planta).toBeCloseTo(com.planta, 6);
    expect(dep.vol).toBeCloseTo(com.vol, 6);
  });

  it('trocar o tipo por um mais largo aumenta o vão; voltar restaura', () => {
    const { s, com } = cena(kind);
    s.exec({ type: 'updateElements', ids: ['v'], patch: { typeId: 'ot_b' } as Partial<Opening> });
    const larga = medidas(s.project, 'lv_0');
    expect(larga.planta).toBeLessThan(com.planta - 1e-6);
    expect(larga.vol).toBeLessThan(com.vol - 1e-6);
    s.exec({ type: 'updateElements', ids: ['v'], patch: { typeId: 'ot_a' } as Partial<Opening> });
    const volta = medidas(s.project, 'lv_0');
    expect(volta.planta).toBeCloseTo(com.planta, 6);
    expect(volta.vol).toBeCloseTo(com.vol, 6);
  });

  it('editar a largura do próprio tipo muda o vão', () => {
    const { s, com } = cena(kind);
    s.exec({ type: 'upsertOpeningType', openingType: { ...s.project.openingTypes.ot_a!, width: 1.4 } });
    const m = medidas(s.project, 'lv_0');
    expect(m.planta).toBeLessThan(com.planta - 1e-6);
    expect(m.vol).toBeLessThan(com.vol - 1e-6);
  });

  it('mover o offset para a ponta da parede (vão sai do miolo) muda a área; o vão mexe de lugar', () => {
    const { s, com } = cena(kind);
    const geoA = resolveLevel(s.project, 'lv_0').walls.w!.layers[0]!.cut;
    s.exec({ type: 'updateElements', ids: ['v'], patch: { offset: 4.5 } as Partial<Opening> });
    const geoB = resolveLevel(s.project, 'lv_0').walls.w!.layers[0]!.cut;
    expect(JSON.stringify(geoB)).not.toBe(JSON.stringify(geoA));
    const m = medidas(s.project, 'lv_0');
    expect(m.planta).toBeCloseTo(com.planta, 6); // mesma largura, vão inteiro dentro da parede
    // o ponto x=2 (antes no vão) agora é parede; o ponto x=4.5 agora é vão
  });
});

describe('projeto importado de IFC (parede-janela.ifc)', () => {
  const { project } = importIfc(paredeJanela);
  const lv = project.levels[0]!.id;
  const aberturas = Object.values(project.elements).filter((e): e is Opening => e.kind === 'door' || e.kind === 'window');

  it('tem esquadria', () => expect(aberturas.length).toBeGreaterThan(0));

  it('apagar todas as esquadrias devolve parede cheia; desfazer traz o vão', () => {
    const s = new ProjectStore(project);
    const com = medidas(s.project, lv);
    s.exec({ type: 'deleteElements', ids: aberturas.map((o) => o.id) });
    const sem = medidas(s.project, lv);
    expect(sem.planta).toBeGreaterThan(com.planta + 1e-6);
    expect(sem.vol).toBeGreaterThan(com.vol + 1e-6);
    s.undo();
    const volta = medidas(s.project, lv);
    expect(volta.planta).toBeCloseTo(com.planta, 6);
    expect(volta.vol).toBeCloseTo(com.vol, 6);
  });

  it('alterar a largura do tipo e o offset muda o vão', () => {
    const s = new ProjectStore(project);
    const o = aberturas[0]!;
    const com = medidas(s.project, lv);
    const t = s.project.openingTypes[o.typeId]!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, width: t.width * 0.5 } });
    const estreita = medidas(s.project, lv);
    expect(estreita.planta).toBeGreaterThan(com.planta + 1e-6);
    expect(estreita.vol).toBeGreaterThan(com.vol + 1e-6);
  });

  it('apagar e mover uma esquadria só (a primeira) muda a parede', () => {
    const s = new ProjectStore(project);
    const o = aberturas[0]!;
    const com = medidas(s.project, lv);
    s.exec({ type: 'updateElements', ids: [o.id], patch: { offset: o.offset + 0.3 } as Partial<Opening> });
    const movida = resolveLevel(s.project, lv);
    expect(JSON.stringify(movida.walls[o.hostId]!.layers.map((l) => l.cut))).not.toBe(JSON.stringify(resolveLevel(project, lv).walls[o.hostId]!.layers.map((l) => l.cut)));
    s.exec({ type: 'deleteElements', ids: [o.id] });
    const sem = medidas(s.project, lv);
    expect(sem.planta).toBeGreaterThan(com.planta + 1e-6);
  });
});

describe('chave de cache da malha 3D do nível', () => {
  it('muda ao apagar, trocar tipo, largura ou offset da esquadria (importada e construída)', async () => {
    const { chavesDeNivel } = await import('../packages/render/src/model3d/chaveNivel3d.ts');
    const { project } = importIfc(paredeJanela);
    const lv = project.levels[0]!.id;
    const o = Object.values(project.elements).find((e): e is Opening => e.kind === 'door' || e.kind === 'window')!;
    const k = (p: Project) => chavesDeNivel(p, 'm').get(lv);
    const base = k(project);
    const edit = (c: Parameters<ProjectStore['exec']>[0]) => {
      const s = new ProjectStore(project);
      s.exec(c);
      return k(s.project);
    };
    expect(edit({ type: 'deleteElements', ids: [o.id] })).not.toBe(base);
    expect(edit({ type: 'updateElements', ids: [o.id], patch: { offset: o.offset + 0.2 } as Partial<Opening> })).not.toBe(base);
    const t = project.openingTypes[o.typeId]!;
    expect(edit({ type: 'upsertOpeningType', openingType: { ...t, width: t.width + 0.2 } })).not.toBe(base);
  });
});
