/**
 * Parede cortina, fase 5: a esquadria da célula no 3D, na planta e no clique, desenhada pela `Opening` virtual (decisão 0056 §7.6) sobre o Rust REAL.
 * Confere que (a) o 3D desenha a porta com o código das esquadrias comuns (malhas de categoria porta, com o id virtual) e NÃO a folha simples do kernel
 * (papéis 3 e 4), (b) "abrir vãos" gira a folha (a caixa da esquadria cresce na profundidade), (c) o clique no 3D sobre a esquadria devolve o id virtual e
 * o subelemento `opening` da célula, (d) a planta desenha o símbolo comum da porta no vão. Roda só em `npm run test:wasm`.
 *
 * Geometria (cortina `ct1` de 6 m x 3 m em y = 0; porta na célula (1, 0) no modo "preencher" com fusão): vão de x = 1,529 a 2,971, z de 0 a 2,95.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, type Project, type View3DSettings } from '@hestia/model';
import { definirGerenciadorDaCortina, esquadriasDaCortina, resolveLevel, subelementoDaEsquadriaCortina, idEsquadriaCortina, idDoProjetoDoPick, type ResolvedLevel } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { LIGHT, ModelScene, pickElement, buildPlanGeometry, idsNaCaixaDaTela } from '../packages/render/src/index.ts';
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
  definirGerenciadorDaCortina(() => ger);
});

afterAll(() => definirGerenciadorDaCortina(() => null));

function projeto(vista: Partial<View3DSettings> = {}): Project {
  const s = new ProjectStore(projetoComCortina());
  const porta = Object.values(s.project.openingTypes).find((t) => t.kind === 'door')!;
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: porta.id, flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
  return Object.keys(vista).length ? { ...s.project, view3d: { ...(s.project.view3d ?? ({} as View3DSettings)), ...vista } as View3DSettings } : s.project;
}

const niveis = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));

function cena(p: Project): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, niveis(p), { edges: false, shadows: false, dark: false });
  return ms;
}

function malhas(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  ms.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.kind) out.push(o);
  });
  return out;
}

/** Caixa (mundo) das malhas da categoria `kind`. */
function caixaDe(ms: ModelScene, kind: string): THREE.Box3 {
  ms.scene.updateMatrixWorld(true);
  const b = new THREE.Box3();
  for (const m of malhas(ms).filter((x) => x.userData.kind === kind)) b.union(new THREE.Box3().setFromObject(m));
  return b;
}

describe('parede cortina: esquadria virtual no 3D, no clique e na planta', () => {
  it.skipIf(!bytes)('o 3D desenha a porta como esquadria comum (categoria porta, id virtual) e não a folha simples do kernel', () => {
    const p = projeto();
    const ms = cena(p);
    const portas = malhas(ms).filter((m) => m.userData.kind === 'door');
    expect(portas.length).toBeGreaterThan(0);
    const ids = new Set(portas.flatMap((m) => (m.userData.ranges as Array<{ id: string }>).map((r) => r.id)));
    expect([...ids]).toEqual([idEsquadriaCortina('ct1', 1, 0)]);
    // Nenhuma malha avulsa da cortina (a folha simples do kernel, papéis 3 e 4): só montantes e painéis instanciados.
    const avulsas = malhas(ms).filter((m) => m.userData.avulsa === true);
    expect(avulsas).toHaveLength(0);
    // A porta cabe no vão de 1,529 a 2,971 (a folha e o batente dentro das faces dos montantes) e na altura de 2,95.
    const b = caixaDe(ms, 'door');
    expect(b.min.x).toBeGreaterThanOrEqual(1.529 - 1e-3);
    expect(b.max.x).toBeLessThanOrEqual(2.971 + 1e-3);
    expect(b.min.z).toBeGreaterThanOrEqual(-1e-3);
    expect(b.max.z).toBeLessThanOrEqual(2.95 + 1e-3);
    expect(b.max.x - b.min.x).toBeGreaterThan(1.3); // o batente e a folha ocupam quase todo o vão de 1,442 m
  });

  it.skipIf(!bytes)('"abrir vãos" gira a folha: a caixa da porta cresce na profundidade; fechada, só as maçanetas passam dos 0,1 m do sistema', () => {
    const fechada = caixaDe(cena(projeto({ openOpenings: false })), 'door');
    const aberta = caixaDe(cena(projeto({ openOpenings: true })), 'door');
    const prof = (b: THREE.Box3) => b.max.y - b.min.y;
    // Fechada: o quadro e a folha ficam nos 0,1 m do sistema (núcleo de -0,05 a 0,05) e só as alavancas das maçanetas saem (0,142 m no total).
    expect(prof(fechada)).toBeLessThanOrEqual(0.15);
    expect(prof(aberta)).toBeGreaterThan(prof(fechada) + 0.3);
    // A dobradiça fica no vão: a folha aberta não passa dos lados do vão em x além da própria largura.
    expect(aberta.max.z).toBeLessThanOrEqual(2.95 + 1e-3);
  });

  it.skipIf(!bytes)('o clique no 3D sobre a porta devolve o id virtual, e o subelemento é `opening` da célula (a parede é o hospedeiro)', () => {
    const p = projeto();
    const ms = cena(p);
    ms.scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(2.25, -5, 1.2);
    camera.lookAt(2.25, 0, 1.2);
    camera.updateMatrixWorld(true);
    const hit = pickElement(ms.scene, camera, { x: 0, y: 0 });
    expect(hit?.id).toBe(idEsquadriaCortina('ct1', 1, 0));
    expect(hit?.kind).toBe('door');
    expect(idDoProjetoDoPick(hit!.id)).toBe('ct1');
    const sub = subelementoDaEsquadriaCortina(p, hit!.id);
    expect(sub).toMatchObject({ wallId: 'ct1', kind: 'opening', cell: { i: 1, j: 0 } });
    // Clique num montante (fora do vão): não é a esquadria.
    camera.position.set(0.75, -5, 1.2);
    camera.lookAt(0.75, 0, 1.2);
    camera.updateMatrixWorld(true);
    const fora = pickElement(ms.scene, camera, { x: 0, y: 0 });
    expect(fora?.id === undefined || !fora.id.startsWith('cortina-esq|')).toBe(true);
    // A seleção por caixa devolve a parede (nunca o id virtual).
    const todos = idsNaCaixaDaTela(ms.scene, new THREE.PerspectiveCamera(60, 1, 0.1, 200).translateZ(0), { x0: -1, y0: -1, x1: 1, y1: 1 }, 'cruzamento');
    expect(todos.some((id) => id.startsWith('cortina-esq|'))).toBe(false);
  });

  it.skipIf(!bytes)('a planta desenha o símbolo comum da porta no vão (folha e arco) e não o traço do kernel', () => {
    const p = projeto();
    const base = projetoComCortina();
    const nivel = p.levels[0]!.id;
    const ops = (proj: Project) =>
      buildPlanGeometry({
        project: proj,
        levelId: nivel,
        resolved: resolveLevel(proj, nivel),
        below: null,
        viewport: { cx: 3, cy: 0, zoom: 100, width: 800, height: 600 },
        theme: LIGHT,
        dark: false,
        selection: [],
        hover: null,
        preview: [],
        inference: null,
        showGrid: false,
      });
    const com = ops(p);
    const sem = ops(base);
    const dentroDoVao = (s: { pts: Array<{ x: number; y: number }> }) => s.pts.every((q) => q.x >= 1.5 && q.x <= 3.0 && Math.abs(q.y) < 1.5);
    const novos = com.strokes.filter(dentroDoVao).length - sem.strokes.filter(dentroDoVao).length;
    expect(novos).toBeGreaterThan(0);
    expect(esquadriasDaCortina(p, nivel)).toHaveLength(1);
  });
});
