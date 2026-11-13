import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, servicoEstr, type MalhaEstrElemento } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeBeam, makeColumn, makeFooting, type Project, type View3DSettings } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import { buildEstrSolids } from './estr3d.ts';

/** Caixa fechada (12 triângulos) de x0..x1, y0..y1, z0..z1: a malha que o kernel devolveria para um prisma. */
function caixa(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { positions: number[]; indices: number[] } {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions, indices };
}

const MALHAS: MalhaEstrElemento[] = [
  { elementId: 'pe', categoria: 'pilar', partes: [{ parte: 'corpo', materialId: 'mat_concreto', ...caixa(0, 0, 0, 0.25, 0.25, 3) }] },
  { elementId: 'pa', categoria: 'pilar', partes: [{ parte: 'corpo', materialId: 'mat_concreto', ...caixa(2, 0, 0, 2.2, 0.2, 3) }, { parte: 'camadas', materialId: 'mat_reboco', ...caixa(1.98, -0.02, 0, 2.22, 0.22, 3) }] },
  { elementId: 'v1', categoria: 'viga', partes: [{ parte: 'corpo', materialId: 'mat_concreto', ...caixa(0, 0, 2.6, 5, 0.15, 3) }] },
  { elementId: 'f1', categoria: 'fundacao', partes: [{ parte: 'base', materialId: 'mat_concreto', ...caixa(-0.3, -0.3, -0.8, 0.5, 0.5, -0.5) }, { parte: 'pescoco', materialId: 'mat_concreto', ...caixa(0, 0, -0.5, 0.25, 0.25, 0) }] },
];

function projeto(vista: Partial<View3DSettings> = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pe', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 0, y: 0 } }) });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pa', typeId: 'pil_arq_20x20', levelId: 'lv_0', disciplina: 'arquitetonico', pos: { x: 2, y: 0 } }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'v1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 0, y: 0 }, topOffset: -0.5 }) });
  return Object.keys(vista).length ? { ...s.project, view3d: vista as View3DSettings } : s.project;
}

function cena(p: Project, hidden?: ReadonlySet<string>): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false, ...(hidden ? { hidden } : {}) });
  return ms;
}

const malhasDe = (ms: ModelScene): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  ms.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && ['columns', 'beams', 'footings'].includes(o.userData.kind as string)) out.push(o);
  });
  return out;
};
const idsDe = (m: THREE.Mesh): string[] => (m.userData.ranges as Array<{ id: string }>).map((r) => r.id);
const cor = (m: THREE.Mesh): string => (m.material as THREE.MeshStandardMaterial).color.getHexString();

afterEach(() => vi.restoreAllMocks());

function comKernel(): void {
  vi.spyOn(servicoEstr(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoEstr(), 'malha').mockImplementation((_p, nivel) => (nivel === 'lv_0' ? MALHAS : []));
}

describe('buildEstrSolids', () => {
  it('um lote por categoria e material, com a faixa de cada elemento e normais por face', () => {
    const lotes = buildEstrSolids(MALHAS);
    expect(lotes.map((l) => `${l.category}|${l.materialId}`).sort()).toEqual(['beams|mat_concreto', 'columns|mat_concreto', 'columns|mat_reboco', 'footings|mat_concreto']);
    const col = lotes.find((l) => l.category === 'columns' && l.materialId === 'mat_concreto')!;
    expect(col.ids.map((r) => r.id)).toEqual(['pe', 'pa']);
    expect(col.indices.length).toBe(2 * 36);
    expect(col.normals.length).toBe(col.positions.length);
    const unitarias = Array.from({ length: col.normals.length / 3 }, (_, i) => Math.hypot(col.normals[3 * i]!, col.normals[3 * i + 1]!, col.normals[3 * i + 2]!));
    expect(Math.min(...unitarias)).toBeCloseTo(1, 9);
  });

  it('filtra por id e por categoria gráfica', () => {
    expect(buildEstrSolids(MALHAS, (id) => id !== 'pe').flatMap((l) => l.ids.map((r) => r.id))).not.toContain('pe');
    expect(buildEstrSolids(MALHAS, () => true, (c) => c !== 'beams').map((l) => l.category)).not.toContain('beams');
    expect(buildEstrSolids([])).toEqual([]);
  });
});

describe('cena 3D: pilar, viga e fundação da malha do kernel', () => {
  it('os três kinds aparecem, com a cor do material e a faixa por id (seleção)', () => {
    comKernel();
    const p = projeto();
    const ms = cena(p);
    const todas = malhasDe(ms);
    expect(new Set(todas.map((m) => m.userData.kind))).toEqual(new Set(['columns', 'beams', 'footings']));
    const concreto = new THREE.Color(p.materials['mat_concreto']!.color).getHexString();
    const reboco = new THREE.Color(p.materials['mat_reboco']!.color).getHexString();
    const colunas = todas.filter((m) => m.userData.kind === 'columns');
    expect(colunas.map(cor).sort()).toEqual([concreto, reboco].sort());
    expect(idsDe(colunas.find((m) => cor(m) === reboco)!)).toEqual(['pa']);
    expect(idsDe(todas.find((m) => m.userData.kind === 'beams')!)).toEqual(['v1']);
    expect(idsDe(todas.find((m) => m.userData.kind === 'footings')!)).toEqual(['f1', 'f1']);
    // A caixa da cena cobre o pilar e a fundação enterrada.
    const caixaTotal = new THREE.Box3();
    for (const m of todas) caixaTotal.union(new THREE.Box3().setFromObject(m));
    expect(caixaTotal.min.z).toBeCloseTo(-0.8, 6);
    expect(caixaTotal.max.x).toBeCloseTo(5, 6);
    ms.dispose();
  });

  it('ocultar por id tira só o elemento; ocultar a categoria tira os do tipo', () => {
    comKernel();
    const ms = cena(projeto(), new Set(['pe', 'f1']));
    const ids = malhasDe(ms).flatMap(idsDe);
    expect(ids).not.toContain('pe');
    expect(ids).not.toContain('f1');
    expect(ids.sort()).toEqual(['pa', 'pa', 'v1']);
    ms.dispose();
    const vista = { overrides: { columns: { visible: false } } } as unknown as Partial<View3DSettings>;
    const sem = cena(projeto(vista));
    expect(new Set(malhasDe(sem).map((m) => m.userData.kind))).toEqual(new Set(['beams', 'footings']));
    sem.dispose();
  });

  it('sem kernel nada é desenhado (nunca TypeScript no lugar) e o lote volta quando o kernel chega', () => {
    const pronto = vi.spyOn(servicoEstr(), 'pronto').mockReturnValue(false);
    vi.spyOn(servicoEstr(), 'malha').mockImplementation((_p, nivel) => (servicoEstr().pronto() && nivel === 'lv_0' ? MALHAS : null));
    const p = projeto();
    const ms = cena(p);
    expect(malhasDe(ms)).toHaveLength(0);
    pronto.mockReturnValue(true);
    ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
    expect(malhasDe(ms).length).toBeGreaterThan(0);
    ms.dispose();
  });

  it('editar só o pilar refaz o lote de estrutura; editar uma parede não o refaz (chave própria)', () => {
    comKernel();
    const spy = vi.spyOn(servicoEstr(), 'malha');
    const s = new ProjectStore(projeto());
    const ms = new ModelScene({ instanciar: false });
    const opt = { edges: false, shadows: false, dark: false };
    const atualizar = (): void => ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), opt);
    atualizar();
    const n0 = spy.mock.calls.length;
    s.exec({ type: 'addWall', wall: { kind: 'wall', id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 4, y: 5 } } as never });
    atualizar();
    expect(spy.mock.calls.length).toBe(n0);
    s.exec({ type: 'updateColumn', id: 'pe', patch: { rotation: 0.3 } });
    atualizar();
    expect(spy.mock.calls.length).toBeGreaterThan(n0);
    ms.dispose();
  });
});
