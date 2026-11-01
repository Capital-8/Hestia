import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { frameOfWall, openingGeometry, resolveFloors, resolveLevel, resolveRoofs, resolveSlabs, resolveStairs, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeFloor, makeRoof, makeSlab, makeStair, makeWall, view3dOf, type Opening, type Project, type StairRun, type VisualStyle } from '@hestia/model';
import { pickElement } from './pick3d.ts';
import { ModelScene } from './scene3d.ts';
import { buildEaveSolids } from './eaveSolids.ts';
import { buildStairSolids } from './stairSolids.ts';
import { buildFloorSolids, buildLevelSolids, buildRoofSolids, buildSlabSolids, type SolidBatch } from './solids.ts';

const curve = (ax: number, ay: number, bx: number, by: number, sag = 0) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag });
/** Lance reto de 17 espelhos de 0,28 m sobre y ∈ [1, 2] (degraus de x = −0,5 a 4,9). */
const lanceReto = (): StairRun => {
  const n = 17;
  const sp = 0.28;
  const y0 = 1;
  const y1 = 2;
  return {
    id: 'r1',
    kind: 'run',
    boundaryLeft: [curve(-0.5, y1, (n - 1) * sp + 0.5, y1)],
    boundaryRight: [curve(-0.5, y0, (n - 1) * sp + 0.5, y0)],
    risers: Array.from({ length: n }, (_, k) => curve(k * sp, y0, k * sp, y1)),
    path: [],
  };
};

const PTS = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];
/** Paredes a (0,0)–(4,0), b (4,0)–(4,3), c (4,3)–(0,3), d (0,3)–(0,0). Porta em a, janela em c. */
const LADOS: Array<[string, number, number]> = [
  ['a', 0, 1],
  ['b', 1, 2],
  ['c', 2, 3],
  ['d', 3, 0],
];

/** Sala 4 × 3 m com paredes, porta, janela e (opcionais) piso, laje, telhado e escada. */
function casa(extra: { piso?: boolean; laje?: boolean; telhado?: boolean; escada?: boolean } = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const [id, i, j] of LADOS) s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: PTS[i]!, b: PTS[j]! }) });
  const porta: Opening = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'a', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  const janela: Opening = { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'c', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: porta });
  s.exec({ type: 'addOpening', opening: janela });
  if (extra.piso) s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: PTS }) });
  if (extra.laje) s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l', typeId: 'ls_mac12', levelId: 'lv_0', boundary: PTS }) });
  if (extra.telhado) {
    s.exec({
      type: 'addRoof',
      roof: makeRoof({
        id: 'r1',
        typeId: 'rt_ceramica',
        levelId: 'lv_0',
        boundary: PTS,
        heightOffset: 0.2,
        eave: { fascia: true, fasciaHeight: 0.2, gutter: true, soffit: true },
      }),
    });
  }
  if (extra.escada) s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [lanceReto()] }) });
  return s.project;
}

function niveis(p: Project): ResolvedLevel[] {
  return p.levels.map((l) => resolveLevel(p, l.id));
}

/** Cena montada com a vista de `p`; `style` troca o estilo visual do 3D. */
function cena(p: Project, style?: VisualStyle): ModelScene {
  const q = style ? { ...p, view3d: { ...view3dOf(p), style } } : p;
  const ms = new ModelScene();
  ms.update(q, niveis(q), { edges: false, shadows: false, dark: false });
  return ms;
}

/** Câmera em `from` olhando para `to`: o centro da tela (NDC 0, 0) é o raio que sai de `from` em direção a `to`. */
function camera(from: [number, number, number], to: [number, number, number]): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  cam.position.set(...from);
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  // Vista de cima: o "para cima" da câmera não pode ser paralelo à direção do olhar (usa y em vez de z).
  const vertical = Math.abs(dir.z) > 0.9 * dir.length();
  cam.up.set(0, vertical ? 1 : 0, vertical ? 0 : 1);
  cam.lookAt(...to);
  cam.updateMatrixWorld();
  return cam;
}

/** Vista de cima sobre (x, y): o raio central cai no ponto da superfície mais alta ali. */
const deCima = (x: number, y: number): THREE.PerspectiveCamera => camera([x, y, 30], [x, y, 0]);

/** Triângulos de cada faixa são inteiros, não se sobrepõem e cobrem o lote (cada lote destes testes é de um só conjunto de elementos). */
function faixasValidas(b: SolidBatch): boolean {
  const ordenadas = [...b.ids].sort((x, y) => x.start - y.start);
  let cursor = 0;
  for (const r of ordenadas) {
    if (r.start % 3 !== 0 || r.count % 3 !== 0 || r.count <= 0) return false;
    if (r.start !== cursor) return false;
    cursor = r.start + r.count;
  }
  return cursor === b.indices.length;
}

const idsDe = (bs: SolidBatch[]): Set<string> => new Set(bs.flatMap((b) => b.ids.map((r) => r.id)));

describe('faixas de elementos nos lotes (decisão 0016)', () => {
  it('parede: cada faixa é de uma parede, e as faixas cobrem o lote', () => {
    const p = casa();
    const bs = buildLevelSolids(resolveLevel(p, 'lv_0')).batches;
    expect(bs.length).toBeGreaterThan(0);
    expect([...idsDe(bs)].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const b of bs) expect(faixasValidas(b)).toBe(true);
  });

  it('piso: a faixa é do id do piso', () => {
    const p = casa({ piso: true });
    const bs = buildFloorSolids(resolveFloors(p, 'lv_0'));
    expect([...idsDe(bs)]).toEqual(['f']);
    for (const b of bs) expect(faixasValidas(b)).toBe(true);
  });

  it('laje: a faixa é do id da laje', () => {
    const p = casa({ laje: true });
    const bs = buildSlabSolids(resolveSlabs(p, 'lv_0'));
    expect(bs.length).toBeGreaterThan(0);
    expect([...idsDe(bs)]).toEqual(['l']);
    for (const b of bs) expect(faixasValidas(b)).toBe(true);
  });

  it('telhado: água e beiral (testeira, calha e forro) levam o id do telhado', () => {
    const p = casa({ telhado: true });
    const roofs = resolveRoofs(p, 'lv_0');
    const agua = buildRoofSolids(roofs);
    const beiral = buildEaveSolids(p, roofs).batches;
    expect(agua.length).toBeGreaterThan(0);
    expect(beiral.length).toBeGreaterThan(0);
    expect([...idsDe([...agua, ...beiral])]).toEqual(['r1']);
    for (const b of [...agua, ...beiral]) expect(faixasValidas(b)).toBe(true);
  });

  it('escada: cada faixa é da escada, e o remapeamento das arestas mantém as faixas válidas', () => {
    const p = casa({ escada: true });
    const bs = buildStairSolids(resolveStairs(p));
    expect(bs.length).toBeGreaterThan(0);
    expect([...idsDe(bs)]).toEqual(['st1']);
    for (const b of bs) expect(faixasValidas(b)).toBe(true);
  });
});

describe('pickElement (vista 3D)', () => {
  it('parede: a face superior da parede a sob o cursor é a parede a', () => {
    const hit = pickElement(cena(casa()).scene, deCima(3, 0), { x: 0, y: 0 });
    expect(hit?.id).toBe('a');
    expect(hit?.kind).toBe('wall');
    expect(hit?.point.z).toBeCloseTo(2.8, 3);
  });

  it('paredes diferentes no mesmo lote: cada face devolve a sua parede', () => {
    const ms = cena(casa());
    expect(pickElement(ms.scene, deCima(3, 0), { x: 0, y: 0 })?.id).toBe('a');
    expect(pickElement(ms.scene, deCima(4, 1.5), { x: 0, y: 0 })?.id).toBe('b');
    expect(pickElement(ms.scene, deCima(2, 3), { x: 0, y: 0 })?.id).toBe('c');
  });

  it('porta: o raio de frente pela porta acerta a folha da porta (d1, kind door)', () => {
    const p = casa();
    const f = frameOfWall(p, 'a')!;
    const g = openingGeometry(p, p.elements.d1 as Opening, f);
    const hit = pickElement(cena(p).scene, camera([g.center.x, 1.5, 1.0], [g.center.x, 0, 1.0]), { x: 0, y: 0 });
    expect(hit?.id).toBe('d1');
    expect(hit?.kind).toBe('door');
  });

  it('janela: o raio de frente pelo vidro acerta a janela j1 (kind window)', () => {
    const p = casa();
    const f = frameOfWall(p, 'c')!;
    const g = openingGeometry(p, p.elements.j1 as Opening, f);
    const z = g.sill + g.height / 2;
    const hit = pickElement(cena(p).scene, camera([g.center.x, 1.5, z], [g.center.x, 3, z]), { x: 0, y: 0 });
    expect(hit?.id).toBe('j1');
    expect(hit?.kind).toBe('window');
  });

  it('piso, laje, telhado e escada: cada categoria devolve o seu id', () => {
    expect(pickElement(cena(casa({ piso: true })).scene, deCima(2, 1.5), { x: 0, y: 0 })).toMatchObject({ id: 'f', kind: 'floor' });
    expect(pickElement(cena(casa({ laje: true })).scene, deCima(2, 1.5), { x: 0, y: 0 })).toMatchObject({ id: 'l', kind: 'slab' });
    expect(pickElement(cena(casa({ telhado: true })).scene, deCima(2, 1.5), { x: 0, y: 0 })).toMatchObject({ id: 'r1', kind: 'roof' });
    expect(pickElement(cena(casa({ escada: true })).scene, deCima(1, 1.5), { x: 0, y: 0 })).toMatchObject({ id: 'st1', kind: 'stair' });
  });

  it('vazio: nada sob o cursor (o chão e a grade não contam) devolve null', () => {
    expect(pickElement(cena(casa({ piso: true })).scene, deCima(-3, -3), { x: 0, y: 0 })).toBeNull();
  });

  it('categoria oculta não tem malha: o raio passa e acerta o que está embaixo', () => {
    const p = casa({ piso: true, telhado: true });
    const base = view3dOf(p).overrides;
    const semTelhado = { ...p, view3d: { ...view3dOf(p), overrides: { ...base, roof: { ...base.roof, visible: false } } } };
    expect(pickElement(cena(p).scene, deCima(2, 1.5), { x: 0, y: 0 })?.id).toBe('r1');
    expect(pickElement(cena(semTelhado).scene, deCima(2, 1.5), { x: 0, y: 0 })?.id).toBe('f');
  });

  it('estilo de arames: a malha de picking ainda acerta o elemento (sem faces visíveis)', () => {
    const hit = pickElement(cena(casa(), 'wireframe').scene, deCima(3, 0), { x: 0, y: 0 });
    expect(hit?.id).toBe('a');
  });
});

/** Objeto do datum de nível (o grupo leva `userData.levels`): não é realce nem malha do modelo. */
function ehDoNivel(o: THREE.Object3D): boolean {
  for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a.userData?.levels === true) return true;
  return false;
}

/** Malhas de sobreposição de realce: transparentes e sem gravar profundidade (o modelo não tem nenhuma assim por padrão). */
function realces(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  ms.scene.traverse((o) => {
    if (ehDoNivel(o)) return;
    const m = o as THREE.Mesh;
    // O chão é um plano transparente (só sombra): não é realce.
    if (m.isMesh && m.geometry?.type === 'PlaneGeometry') return;
    if (m.isMesh && m.material && (m.material as THREE.Material).transparent && (m.material as THREE.Material).depthWrite === false) out.push(m);
  });
  return out;
}

/** Malhas do modelo (o grupo principal da cena), sem as de picking, as de realce e o datum de nível. */
function malhasDoModelo(ms: ModelScene): number {
  const grupo = ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group && c.userData?.levels !== true)!;
  let n = 0;
  grupo.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

describe('realce na vista 3D (decisão 0016 §4)', () => {
  it('a seleção e o cursor são sobreposições: as malhas do modelo não mudam de número', () => {
    const ms = cena(casa({ piso: true }));
    const antes = malhasDoModelo(ms);
    ms.highlight(['a', 'd1'], 'b');
    expect(malhasDoModelo(ms)).toBe(antes);
    ms.highlight([], null);
    expect(malhasDoModelo(ms)).toBe(antes);
  });

  it('o realce não é acertado pelo picking: com a parede b realçada, o centro da parede a continua a', () => {
    const ms = cena(casa());
    ms.highlight(['b'], null);
    expect(pickElement(ms.scene, deCima(3, 0), { x: 0, y: 0 })?.id).toBe('a');
  });

  it('seleção: opacidade 0,35; cursor: 0,15; quem está nos dois ganha só a da seleção', () => {
    const ms = cena(casa());
    const opacidades = (): number[] => [...new Set(realces(ms).map((m) => (m.material as THREE.MeshBasicMaterial).opacity))].sort();
    ms.highlight(['a'], null);
    expect(opacidades()).toEqual([0.35]);
    ms.highlight(['a'], 'b');
    expect(opacidades()).toEqual([0.15, 0.35]);
    ms.highlight(['a'], 'a');
    expect(opacidades()).toEqual([0.35]);
  });

  it('o realce cobre o elemento: a caixa da sobreposição é a da parede (e a da porta, a da porta)', () => {
    const ms = cena(casa());
    ms.highlight(['a'], null);
    // A parede a vai de x 0 a 4 (com a espessura de 14 cm nas pontas de canto); y em torno de 0; z de 0 a 2,8 m.
    const caixa = new THREE.Box3();
    for (const m of realces(ms)) caixa.union(new THREE.Box3().setFromObject(m));
    expect(caixa.min.x).toBeGreaterThan(-0.15);
    expect(caixa.max.x).toBeLessThan(4.15);
    expect(Math.abs(caixa.min.y)).toBeLessThan(0.1);
    expect(caixa.max.z).toBeCloseTo(2.8, 2);
    ms.highlight(['d1'], null);
    const porta = new THREE.Box3();
    for (const m of realces(ms)) porta.union(new THREE.Box3().setFromObject(m));
    expect(porta.max.x - porta.min.x).toBeLessThan(1.2);
    expect(porta.max.z).toBeLessThan(2.3);
  });

  it('só refaz o realce que mudou: o da seleção fica o mesmo ao mudar o cursor, e trocar a seleção só troca a máscara', () => {
    const ms = cena(casa());
    ms.highlight(['a'], null);
    const sel = realces(ms);
    expect(sel.length).toBeGreaterThan(0);
    ms.highlight(['a'], 'c');
    expect(realces(ms)).toEqual(expect.arrayContaining(sel));
    // Trocar a seleção só troca a máscara na GPU: as sobreposições por malha são as mesmas (nada é recriado por elemento).
    ms.highlight(['a', 'b'], null);
    expect(realces(ms)).toEqual(expect.arrayContaining(sel));
  });

  it('refazer o modelo apaga o realce (ele guardava a geometria antiga)', () => {
    const p = casa();
    const ms = cena(p);
    ms.highlight(['a'], null);
    expect(realces(ms).length).toBeGreaterThan(0);
    ms.update(p, niveis(p), { edges: false, shadows: false, dark: false });
    expect(realces(ms)).toHaveLength(0);
    ms.highlight(['a'], null);
    expect(realces(ms).length).toBeGreaterThan(0);
  });

  it('no wireframe, o realce usa as faixas da camada de picking e também aparece', () => {
    const ms = cena(casa(), 'wireframe');
    ms.highlight(['a'], null);
    expect(realces(ms).length).toBeGreaterThan(0);
    expect(pickElement(ms.scene, deCima(3, 0), { x: 0, y: 0 })?.id).toBe('a');
  });

  it('a cor do realce segue o tema: o azul claro no tema claro e o escuro no tema escuro', () => {
    const p = casa();
    const ms = new ModelScene();
    ms.update(p, niveis(p), { edges: false, shadows: false, dark: true });
    ms.highlight(['a'], null);
    expect((realces(ms)[0]!.material as THREE.MeshBasicMaterial).color.getHexString()).toBe(new THREE.Color('#5aa2ff').getHexString());
  });
});
