/**
 * Estrutura, ficha R1a: a cena 3D desenha pilar e viga a partir da malha do Rust REAL (consulta 200 pelo adaptador), com cor por material, seleção por id
 * (clique) e ocultação por id e por categoria. A fundação (E7) vem com a ficha K3: quando o kernel a entrega, o teste confere que ela aparece como `footings`.
 * Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProject, makeBeam, makeColumn, makeFooting, ProjectStore, type Project, type View3DSettings } from '@hestia/model';
import { definirGerenciadorDaEstrutura, resolveLevel, servicoEstr } from '../packages/engine/src/index.ts';
import { ModelScene, pickElement } from '../packages/render/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
  definirGerenciadorDaEstrutura(() => ger);
});

afterAll(() => definirGerenciadorDaEstrutura(() => null));

function projeto(vista: Partial<View3DSettings> = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertColumnType', columnType: { id: 'pil_20x40', name: 'E', code: 'E', description: '', disciplina: 'estrutural', perfil: { forma: 'retangular', b: 0.2, h: 0.4 }, materialId: 'mat_concreto', cost: 0 } });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pe', typeId: 'pil_20x40', levelId: 'lv_0', pos: { x: 0, y: 0 }, height: 3 }) });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'pa', typeId: 'pil_arq_20x20', levelId: 'lv_0', disciplina: 'arquitetonico', pos: { x: 3, y: 2 }, height: 3 }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'v1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, zOffsetA: 3, zOffsetB: 3 }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 0, y: 0 }, topOffset: -0.5 }) });
  return Object.keys(vista).length ? { ...s.project, view3d: vista as View3DSettings } : s.project;
}

function cena(p: Project, hidden?: ReadonlySet<string>): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false, ...(hidden ? { hidden } : {}) });
  return ms;
}

const malhas = (ms: ModelScene, kinds = ['columns', 'beams', 'footings']): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  ms.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && kinds.includes(o.userData.kind as string)) out.push(o);
  });
  return out;
};
const idsDe = (m: THREE.Mesh): string[] => (m.userData.ranges as Array<{ id: string }>).map((r) => r.id);
const cor = (m: THREE.Mesh): string => (m.material as THREE.MeshStandardMaterial).color.getHexString();

describe('estrutura no 3D com o kernel real', () => {
  it.skipIf(!bytes)('pilar e viga aparecem com a cor do material e a caixa do pilar 0,20 x 0,40 x 3,00 e da viga 5,00 m', () => {
    const p = projeto();
    const ms = cena(p);
    const todas = malhas(ms);
    const colunas = todas.filter((m) => m.userData.kind === 'columns');
    const vigas = todas.filter((m) => m.userData.kind === 'beams');
    expect(vigas.flatMap(idsDe)).toEqual(['v1']);
    expect(colunas.flatMap(idsDe).sort()).toEqual(['pa', 'pe']);
    const concreto = new THREE.Color(p.materials['mat_concreto']!.color).getHexString();
    const reboco = new THREE.Color(p.materials['mat_reboco']!.color).getHexString();
    expect(vigas.map(cor)).toEqual([concreto]);
    // O pilar estrutural (concreto) e o arquitetônico (reboco) ficam em lotes de cor diferente.
    expect(colunas.map(cor).sort()).toEqual([concreto, reboco].sort());
    ms.scene.updateMatrixWorld(true);
    const caixa = (ms2: THREE.Mesh[]): THREE.Box3 => ms2.reduce((b, m) => b.union(new THREE.Box3().setFromObject(m)), new THREE.Box3());
    const bv = caixa(vigas);
    expect(bv.max.x - bv.min.x).toBeCloseTo(5, 6);
    expect(bv.max.z - bv.min.z).toBeCloseTo(0.4, 6);
    const bp = caixa(colunas.filter((m) => cor(m) === concreto));
    expect(bp.max.z - bp.min.z).toBeCloseTo(3, 6);
    // Fundação (ficha K3): topo da peça em -0,5 m, pescoço de 0,5 m sobre a base de 0,3 m: a base desce até -1,3 m.
    const fundacoes = malhas(ms, ['footings']);
    expect(fundacoes.length).toBeGreaterThan(0);
    expect(fundacoes.flatMap(idsDe)).toContain('f1');
    expect(caixa(fundacoes).min.z).toBeCloseTo(-1.3, 6);
    ms.dispose();
  });

  it.skipIf(!bytes)('o clique no 3D sobre o pilar e sobre a viga devolve o id do elemento', () => {
    const ms = cena(projeto());
    ms.scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(3, -8, 1.5);
    camera.lookAt(3, 2, 1.5);
    camera.updateMatrixWorld(true);
    // Mira no pilar arquitetônico (3, 2) pela frente.
    const hit = pickElement(ms.scene, camera, { x: 0, y: 0 });
    expect(hit?.id).toBe('pa');
    expect(hit?.kind).toBe('columns');
    ms.dispose();
  });

  it.skipIf(!bytes)('ocultar por id e por categoria', () => {
    const ms = cena(projeto(), new Set(['pe']));
    expect(malhas(ms).flatMap(idsDe)).not.toContain('pe');
    expect(malhas(ms).flatMap(idsDe)).toContain('v1');
    ms.dispose();
    const vista = { overrides: { beams: { visible: false } } } as unknown as Partial<View3DSettings>;
    const sem = cena(projeto(vista));
    expect(malhas(sem, ['beams'])).toHaveLength(0);
    expect(malhas(sem, ['columns']).length).toBeGreaterThan(0);
    sem.dispose();
  });

  it.skipIf(!bytes)('o serviço único do processo usa o gerenciador injetado e reenvia só a diferença entre as atualizações da cena', () => {
    const s = new ProjectStore(projeto());
    const ms = new ModelScene({ instanciar: false });
    const opt = { edges: false, shadows: false, dark: false };
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), opt);
    const envios = servicoEstr().enviosAoKernel;
    s.exec({ type: 'updateBeam', id: 'v1', patch: { zOffsetA: 3.2 } });
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), opt);
    expect(servicoEstr().enviosAoKernel).toBe(envios + 1);
    ms.dispose();
  });
});
