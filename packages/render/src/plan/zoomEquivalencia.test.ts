import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveFloors, resolveLevel, resolveRooms, resolveRoofs, resolveSlabs, resolveStairsOnLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, makeWall, openingsOfWall, wallsOnLevel, type Project } from '@hestia/model';
import { buildPlanDrawList, planBelowOf, type PlanInput } from './build.ts';
import { aberturasDaParede, ambientesDoNivel, escadasDoNivel, juncaoDoNivel, lajesDoNivel, paredesDoNivel, pisosDoNivel, telhadosDoNivel } from './resolucao.ts';
import { LIGHT } from './types.ts';

/** Zooms dos cenários de equivalência: vista de conjunto, de trabalho e de detalhe (px/m). */
const ZOOMS = [12, 60, 220];

/** Dois andares de 8 m × 6 m, cada um com quatro paredes, uma porta na primeira, um piso e uma laje. */
function projetoDeTeste(): Project {
  const s = new ProjectStore(createEmptyProject());
  const caixa = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];
  const lados: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [{ x: 0, y: 0 }, { x: 8, y: 0 }],
    [{ x: 8, y: 0 }, { x: 8, y: 6 }],
    [{ x: 8, y: 6 }, { x: 0, y: 6 }],
    [{ x: 0, y: 6 }, { x: 0, y: 0 }],
  ];
  for (const levelId of ['lv_0', 'lv_1']) {
    lados.forEach(([a, b], j) => s.exec({ type: 'addWall', wall: makeWall({ id: `w_${levelId}_${j}`, typeId: 'wt_ext19', levelId, a, b }) }));
    s.exec({ type: 'addOpening', opening: { id: `o_${levelId}`, kind: 'door', typeId: 'ot_p80', hostId: `w_${levelId}_0`, offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    s.exec({ type: 'addFloor', floor: makeFloor({ id: `f_${levelId}`, typeId: 'ft_ceram', levelId, boundary: caixa }) });
    s.exec({ type: 'addSlab', slab: makeSlab({ id: `l_${levelId}`, typeId: 'ls_mac12', levelId, boundary: caixa }) });
  }
  return s.project;
}

/** Entrada da planta do nível como o app passa: resolução do nível e o de baixo (referência apagada), na vista de `zoom`. */
function entrada(p: Project, levelId: string, zoom: number): PlanInput {
  return {
    project: p,
    levelId,
    resolved: resolveLevel(p, levelId, new Map()),
    ...planBelowOf(p, levelId, (id) => resolveLevel(p, id, new Map()), true),
    viewport: { cx: 4, cy: 3, zoom, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: true,
  };
}

describe('zoom da planta: a lista de desenho não depende da memória aquecida (cenários 12, 60 e 220)', () => {
  it('memória aquecida (zooms em sequência no mesmo projeto) = projeto novo, em cada zoom', () => {
    const p = projetoDeTeste();
    const quente = ZOOMS.map((z) => buildPlanDrawList(entrada(p, 'lv_1', z)));
    ZOOMS.forEach((z, i) => {
      const fria = buildPlanDrawList(entrada(structuredClone(p), 'lv_1', z));
      expect(quente[i]).toEqual(fria);
    });
    // Sanidade: a lista tem preenchimentos, traços e a porta (não é uma comparação de listas vazias).
    expect(quente[0]!.fills.length).toBeGreaterThan(0);
    expect(quente[0]!.strokes.length).toBeGreaterThan(10);
  });

  it('ordem dos zooms não muda a lista (220, 12, 60)', () => {
    const p = projetoDeTeste();
    const porZoom = new Map<number, ReturnType<typeof buildPlanDrawList>>();
    for (const z of [220, 12, 60]) porZoom.set(z, buildPlanDrawList(entrada(p, 'lv_1', z)));
    const q = projetoDeTeste();
    for (const z of ZOOMS) expect(porZoom.get(z)).toEqual(buildPlanDrawList(entrada(q, 'lv_1', z)));
  });

  it('edição cria outro projeto: a lista muda como num projeto novo e não reaproveita a de antes', () => {
    const antes = projetoDeTeste();
    const s = new ProjectStore(antes);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_extra', typeId: 'wt_ext19', levelId: 'lv_1', a: { x: 8, y: 6 }, b: { x: 12, y: 6 } }) });
    const depois = s.project;
    const listaAntes = buildPlanDrawList(entrada(antes, 'lv_1', 60));
    const listaDepois = buildPlanDrawList(entrada(depois, 'lv_1', 60));
    expect(listaDepois).not.toEqual(listaAntes);
    expect(listaDepois).toEqual(buildPlanDrawList(entrada(structuredClone(depois), 'lv_1', 60)));
  });
});

describe('resoluções memorizadas da planta: as mesmas do motor e do modelo', () => {
  it('pisos, lajes, telhados, ambientes, escadas, junção e paredes, em cada nível', () => {
    const p = projetoDeTeste();
    for (const levelId of ['lv_0', 'lv_1']) {
      expect(pisosDoNivel(p, levelId)).toEqual(resolveFloors(p, levelId));
      expect(lajesDoNivel(p, levelId)).toEqual(resolveSlabs(p, levelId));
      expect(telhadosDoNivel(p, levelId)).toEqual(resolveRoofs(p, levelId));
      expect(ambientesDoNivel(p, levelId)).toEqual(resolveRooms(p, levelId));
      expect(escadasDoNivel(p, levelId)).toEqual(resolveStairsOnLevel(p, levelId));
      expect(juncaoDoNivel(p, levelId)).toEqual(junctionLevel(p, levelId));
      expect(paredesDoNivel(p, levelId)).toEqual(wallsOnLevel(p, levelId));
    }
  });

  it('aberturas por parede: as mesmas de openingsOfWall, parede a parede (parede sem abertura dá lista vazia)', () => {
    const p = projetoDeTeste();
    for (const w of wallsOnLevel(p, 'lv_1')) expect(aberturasDaParede(p, w.id)).toEqual(openingsOfWall(p, w.id));
    expect(aberturasDaParede(p, 'w_lv_1_0')).toHaveLength(1);
    expect(aberturasDaParede(p, 'w_lv_1_1')).toEqual([]);
  });
});
