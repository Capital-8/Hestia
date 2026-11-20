import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, view3dOf, type Command, type Id, type Project, type View3DSettings } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from './scene3d.ts';

/** Projeto com `n` pavimentos (cota de 3 m) e quatro paredes por nível, como o gerador do baseline de 20 pavimentos. */
function predio(n: number): Project {
  const store = new ProjectStore(createEmptyProject('Malhas por nível'));
  const cmds: Command[] = [];
  const levels: Id[] = [];
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 'lv_0' : i === 1 ? 'lv_1' : `mn_lv_${i}`;
    levels.push(id);
    cmds.push({ type: 'upsertLevel', level: makeLevel({ id, name: `Pavimento ${i + 1}`, elevation: i * 3 }) });
  }
  const contorno: Array<[[number, number], [number, number]]> = [[[0, 0], [4, 0]], [[4, 0], [4, 4]], [[4, 4], [0, 4]], [[0, 4], [0, 0]]];
  levels.forEach((levelId, i) => {
    contorno.forEach(([[ax, ay], [bx, by]], j) => {
      cmds.push({ type: 'addWall', wall: makeWall({ id: `mn_w_${i}_${j}`, typeId: 'wt_ext19', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by } }) });
    });
  });
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

/** Projeto com a parede `j` do pavimento `i` deslocada em x. */
function comParede(p: Project, i: number, j: number, dx: number): Project {
  const w = p.elements[`mn_w_${i}_${j}`];
  if (!w || w.kind !== 'wall') throw new Error('parede de teste não encontrada');
  return { ...p, elements: { ...p.elements, [w.id]: { ...w, b: { x: w.b.x + dx, y: w.b.y } } } };
}

/** Projeto com a parede `j` do pavimento `i` transladada em x (mesmo comprimento: mesma contagem de caixas/arestas). */
function deslocarParede(p: Project, i: number, j: number, dx: number): Project {
  const w = p.elements[`mn_w_${i}_${j}`];
  if (!w || w.kind !== 'wall') throw new Error('parede de teste não encontrada');
  return { ...p, elements: { ...p.elements, [w.id]: { ...w, a: { x: w.a.x + dx, y: w.a.y }, b: { x: w.b.x + dx, y: w.b.y } } } };
}

const niveis = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));
const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };

/** Grupos de pavimento na cena (filhos diretos do modelo, na ordem dos níveis). Os lotes globais de GPU não são grupos de nível. */
function grupos(ms: ModelScene): THREE.Object3D[] {
  const modelo = ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
  return modelo.children.filter((c) => c.userData.levelId !== undefined);
}

/** Malhas de faces e de arestas de uma árvore de objetos. */
function contar(raiz: THREE.Object3D): { malhas: number; linhas: number } {
  let malhas = 0;
  let linhas = 0;
  raiz.traverse((o) => {
    if (o instanceof THREE.LineSegments) linhas++;
    else if (o instanceof THREE.Mesh) malhas++;
  });
  return { malhas, linhas };
}

describe('malhas por nível na atualização da cena', () => {
  it('a mesma cena e o mesmo projeto: todos os pavimentos são reaproveitados (mesmo objeto)', () => {
    const p = predio(5);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const antes = grupos(ms);
    ms.update(p, niveis(p), OPT);
    expect(grupos(ms)).toHaveLength(5);
    expect(grupos(ms).every((g, i) => g === antes[i])).toBe(true);
  });

  it('editar um pavimento refaz só ele e os vizinhos por cota; os demais mantêm o grupo', () => {
    const p = predio(5);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const antes = grupos(ms);
    const p2 = comParede(p, 2, 1, 0.25);
    ms.update(p2, niveis(p2), OPT);
    const depois = grupos(ms);
    expect(depois[0]).toBe(antes[0]);
    expect(depois[4]).toBe(antes[4]);
    expect([1, 2, 3].map((i) => depois[i] !== antes[i])).toEqual([true, true, true]);
  });

  it('a malha reaproveitada tem a mesma geometria (e o mesmo BVH de picking); a refeita, geometria nova', () => {
    const p = predio(4);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const geosAntes = grupos(ms).map((g) => {
      const malhas: THREE.BufferGeometry[] = [];
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) malhas.push(o.geometry);
      });
      return malhas;
    });
    const p2 = comParede(p, 1, 0, 0.1);
    ms.update(p2, niveis(p2), OPT);
    const geosDepois = grupos(ms).map((g) => {
      const malhas: THREE.BufferGeometry[] = [];
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) malhas.push(o.geometry);
      });
      return malhas;
    });
    // Pavimento 3 (sem vizinhança com o editado): mesmas geometrias. Pavimento 1 (editado): todas novas.
    expect(geosDepois[3]!.every((g, k) => g === geosAntes[3]![k])).toBe(true);
    expect(geosDepois[1]!.every((g) => !geosAntes[1]!.includes(g))).toBe(true);
  });

  it('o pavimento reaproveitado mantém os materiais (nenhum é descartado pela atualização)', () => {
    const p = predio(3);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const mats: THREE.Material[] = [];
    grupos(ms)[0]!.traverse((o) => {
      if (o instanceof THREE.Mesh) mats.push(o.material as THREE.Material);
    });
    const espias = mats.map((m) => vi.spyOn(m, 'dispose'));
    const p2 = comParede(p, 2, 0, 0.2);
    ms.update(p2, niveis(p2), OPT);
    expect(espias.every((e) => e.mock.calls.length === 0)).toBe(true);
  });

  it('mudar o tema refaz todos os pavimentos (a cor dos materiais muda)', () => {
    const p = predio(3);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const antes = grupos(ms);
    ms.update(p, niveis(p), { ...OPT, dark: true });
    expect(grupos(ms).every((g, i) => g !== antes[i])).toBe(true);
  });

  it('com teto zero, nada fica no cache; a cena é a mesma de uma montagem nova', () => {
    const p = predio(4);
    const sem = new ModelScene({ tetoMalhasBytes: 0 });
    sem.update(p, niveis(p), OPT);
    expect(sem.memoriaMalhas).toBe(0);
    const p2 = comParede(p, 1, 2, 0.3);
    sem.update(p2, niveis(p2), OPT);
    const nova = new ModelScene();
    nova.update(p2, niveis(p2), OPT);
    const a = contar(sem.scene);
    const b = contar(nova.scene);
    expect(a).toEqual(b);
    expect(a.malhas).toBeGreaterThan(0);
  });

  it('o cache de malhas respeita o teto em bytes (LRU), e os níveis expulsos saem da memória', () => {
    const p = predio(6);
    const medida = new ModelScene();
    medida.update(p, niveis(p), OPT);
    const porNivel = medida.memoriaMalhas / 6;
    const teto = Math.floor(porNivel * 2.5);
    const ms = new ModelScene({ tetoMalhasBytes: teto });
    ms.update(p, niveis(p), OPT);
    expect(ms.memoriaMalhas).toBeLessThanOrEqual(teto);
    const p2 = comParede(p, 3, 0, 0.1);
    ms.update(p2, niveis(p2), OPT);
    expect(ms.memoriaMalhas).toBeLessThanOrEqual(teto);
  });

  it('dispose libera as geometrias de todos os pavimentos (na cena e no cache)', () => {
    const p = predio(3);
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const geos: THREE.BufferGeometry[] = [];
    for (const g of grupos(ms)) {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) geos.push(o.geometry);
      });
    }
    const espias = geos.map((g) => vi.spyOn(g, 'dispose'));
    ms.dispose();
    expect(espias.length).toBeGreaterThan(0);
    expect(espias.every((e) => e.mock.calls.length === 1)).toBe(true);
  });

  it('no wireframe, as peças de picking seguem os pavimentos: o total bate com uma montagem nova', () => {
    const p = predio(4);
    const wire = { ...p, view3d: { style: 'wireframe' } as View3DSettings };
    const ms = new ModelScene();
    ms.update(wire, niveis(wire), OPT);
    const p2 = comParede(wire, 2, 1, 0.2);
    ms.update(p2, niveis(p2), OPT);
    const nova = new ModelScene();
    nova.update(p2, niveis(p2), OPT);
    expect(contar(ms.scene)).toEqual(contar(nova.scene));
  });

  it('editar um nível reenvia só a faixa dos níveis refeitos (caixas e arestas), não o buffer inteiro', () => {
    const base = predio(6);
    const p: Project = { ...base, view3d: { ...view3dOf(base), edges: true } };
    const ms = new ModelScene();
    ms.update(p, niveis(p), OPT);
    const instanciadas: THREE.InstancedMesh[] = [];
    let linha: THREE.LineSegments | null = null;
    ms.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) instanciadas.push(o);
      // Os eixos da origem (overlay da interface, `userData.eixoOrigem`) também são LineSegments, mas não fazem parte do modelo.
      else if (o instanceof THREE.LineSegments && !(o instanceof THREE.GridHelper) && !o.userData?.eixoOrigem) linha = o;
    });
    expect(instanciadas.length).toBeGreaterThan(0);
    expect(linha).not.toBeNull();
    for (const m of instanciadas) m.instanceMatrix.clearUpdateRanges();
    const posLinha = (linha as unknown as THREE.LineSegments).geometry.getAttribute('position') as THREE.BufferAttribute;
    posLinha.clearUpdateRanges();

    const p2: Project = { ...deslocarParede(p, 2, 1, 0.2), view3d: p.view3d };
    ms.update(p2, niveis(p2), OPT);

    const totalInstancias = instanciadas.reduce((s, m) => s + m.instanceMatrix.array.length / 16, 0);
    const enviadoInstancias = instanciadas.reduce((s, m) => s + m.instanceMatrix.updateRanges.reduce((a, r) => a + r.count / 16, 0), 0);
    expect(enviadoInstancias).toBeGreaterThan(0);
    expect(enviadoInstancias).toBeLessThan(totalInstancias);

    const totalLinha = posLinha.array.length;
    const enviadoLinha = posLinha.updateRanges.reduce((a, r) => a + r.count, 0);
    expect(enviadoLinha).toBeGreaterThan(0);
    expect(enviadoLinha).toBeLessThan(totalLinha);
  });
});
