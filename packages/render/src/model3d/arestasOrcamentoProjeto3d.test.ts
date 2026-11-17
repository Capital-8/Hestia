import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, type Generic, type Project, type View3DSettings } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import { ORCAMENTO_TRIANGULOS_GENERICOS, genericosAcimaDoOrcamento } from './lotesMalha3d.ts';

/**
 * Orçamento de arestas dos genéricos decidido pelo PROJETO (todos os níveis), na cena real. Um tetraedro (6 arestas duras)
 * gera arestas; um genérico "cheio" só de triângulos degenerados conta no orçamento e não gera aresta nenhuma, então ele
 * infla o total do projeto sem mudar as arestas visíveis.
 */

const TETRA_POS = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const TETRA_IDX = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];

const tetraedro = (id: string, levelId: string): Generic => ({
  id,
  kind: 'generic',
  levelId,
  name: 'Peça',
  sourceClass: 'IFCBEAM',
  mesh: { positions: TETRA_POS, indices: TETRA_IDX },
  order: 1,
});

/** Malha de `tris` triângulos todos degenerados (um vértice só): conta no orçamento e não sai aresta. */
const cheio = (id: string, levelId: string, tris: number): Generic => ({
  id,
  kind: 'generic',
  levelId,
  name: 'Massa',
  sourceClass: 'IFCBUILDINGELEMENTPROXY',
  mesh: { positions: new Float32Array(3), indices: new Uint32Array(tris * 3) },
  order: 2,
});

/** Projeto de dois níveis (`createEmptyProject`) com os genéricos dados, sobre a base dada, com arestas ligadas. */
function projeto(genericos: Generic[], base: Project = createEmptyProject()): Project {
  const elements: Project['elements'] = { ...base.elements };
  for (const g of genericos) elements[g.id] = g;
  return { ...base, elements, view3d: { ...base.view3d, style: 'realistic', edges: true } as View3DSettings };
}

/** Sala 4 x 3 m com quatro paredes e um piso (paredes e lajes sempre têm arestas). */
function sala(): Project {
  const s = new ProjectStore(createEmptyProject());
  const pts = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  for (const [id, i, j] of [
    ['a', 0, 1],
    ['b', 1, 2],
    ['c', 2, 3],
    ['d', 3, 0],
  ] as const) {
    s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: pts[i]!, b: pts[j]! }) });
  }
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: pts }) });
  return s.project;
}

/** Cena montada com a vista padrão do app (instanciada) e arestas ligadas. Devolve a cena já atualizada. */
function cena(p: Project, ms = new ModelScene()): ModelScene {
  const levels: ResolvedLevel[] = p.levels.map((l) => resolveLevel(p, l.id));
  ms.update(p, levels, { edges: true, shadows: false, dark: false });
  return ms;
}

/**
 * Vértices desenhados das linhas de arestas do modelo (sem as linhas de nível, que ficam fora do grupo do modelo). Respeita o
 * `drawRange`: as malhas de linha podem ter buffer maior que o desenhado.
 */
function verticesDeArestas(ms: ModelScene): number {
  const modelo = ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
  let n = 0;
  modelo.traverse((o) => {
    if (!(o instanceof THREE.LineSegments)) return;
    const g = o.geometry;
    const total = g.getAttribute('position').count;
    n += Number.isFinite(g.drawRange.count) ? Math.min(g.drawRange.count, total) : total;
  });
  return n;
}

const ACIMA = ORCAMENTO_TRIANGULOS_GENERICOS / 2 + 1;

describe('orçamento de arestas por projeto (cena)', () => {
  it('total do projeto acima do orçamento e cada nível abaixo: nenhum genérico ganha aresta em nenhum nível', () => {
    const p = projeto([tetraedro('t0', 'lv_0'), tetraedro('t1', 'lv_1'), cheio('c0', 'lv_0', ACIMA), cheio('c1', 'lv_1', ACIMA)]);
    expect(genericosAcimaDoOrcamento(p.elements)).toBe(true);
    expect(verticesDeArestas(cena(p))).toBe(0);
  });

  it('projeto abaixo do orçamento: as arestas dos genéricos saem como antes, nos dois níveis', () => {
    const p = projeto([tetraedro('t0', 'lv_0'), tetraedro('t1', 'lv_1'), cheio('c0', 'lv_0', 1000)]);
    expect(genericosAcimaDoOrcamento(p.elements)).toBe(false);
    const sem = verticesDeArestas(cena(projeto([cheio('c0', 'lv_0', 1000)])));
    expect(sem).toBe(0);
    expect(verticesDeArestas(cena(p))).toBeGreaterThan(0);
  });

  it('paredes e lajes continuam com arestas mesmo com os genéricos acima do orçamento', () => {
    const base = sala();
    const soParedes = verticesDeArestas(cena(base));
    expect(soParedes).toBeGreaterThan(0);
    const p = projeto([tetraedro('t0', 'lv_0'), cheio('c0', 'lv_0', ACIMA), cheio('c1', 'lv_1', ACIMA)], base);
    expect(genericosAcimaDoOrcamento(p.elements)).toBe(true);
    expect(verticesDeArestas(cena(p))).toBe(soParedes);
  });

  it('trocar a decisão numa mesma cena refaz as arestas dos níveis (sem reaproveitar o cache de antes)', () => {
    const abaixo = projeto([tetraedro('t0', 'lv_0'), tetraedro('t1', 'lv_1')]);
    const acima = projeto([tetraedro('t0', 'lv_0'), tetraedro('t1', 'lv_1'), cheio('c0', 'lv_0', ACIMA), cheio('c1', 'lv_1', ACIMA)]);
    const ms = new ModelScene();
    const levels = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));
    ms.update(abaixo, levels(abaixo), { edges: true, shadows: false, dark: false });
    const com = verticesDeArestas(ms);
    expect(com).toBeGreaterThan(0);
    ms.update(acima, levels(acima), { edges: true, shadows: false, dark: false });
    expect(verticesDeArestas(ms)).toBe(0);
    ms.update(abaixo, levels(abaixo), { edges: true, shadows: false, dark: false });
    expect(verticesDeArestas(ms)).toBe(com);
  });
});
