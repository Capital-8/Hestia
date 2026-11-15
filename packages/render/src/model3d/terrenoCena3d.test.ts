import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type MalhaTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultOverrides, makeLot, makeTerrain, makeTerrainRegion, type Project } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import { pickElement } from './pick3d.ts';
import { caixaDaSelecao } from './selecao3d.ts';
import type { FonteTerreno } from './terreno3d.ts';
import type { ElementRange } from './solids.ts';

const quad = (x0: number, y0: number, x1: number, y1: number, z: number) => ({
  positions: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z],
  indices: [0, 1, 2, 0, 2, 3],
});

/** Malha de um terreno: quadrado (0,0)-(20,20) na cota 10; região (5,5)-(15,15) na cota 8; saia e base. */
function malhaDe(id: string, regiaoId: string | null, dx = 0): MalhaTerreno {
  const sup = quad(dx, 0, dx + 20, 20, 10);
  const partes: MalhaTerreno['partes'] = [
    { regiaoId: null, papel: 'superficie', ...sup },
    { regiaoId: null, papel: 'saia', positions: [dx, 0, 7, dx + 20, 0, 7, dx + 20, 0, 10, dx, 0, 10], indices: [0, 1, 2, 0, 2, 3] },
    { regiaoId: null, papel: 'base', positions: quad(dx, 0, dx + 20, 20, 7).positions, indices: [0, 2, 1, 0, 3, 2] },
  ];
  if (regiaoId) partes.push({ regiaoId, papel: 'superficie', ...quad(dx + 5, 5, dx + 15, 15, 10.01) });
  return { terrenoId: id, partes };
}

interface Espia extends FonteTerreno {
  chamadas: number;
}
function fonte(ativa: boolean, malhas: (p: Project) => MalhaTerreno[]): Espia {
  const f: Espia = { chamadas: 0, pronto: () => ativa, malha: (p) => (ativa ? (f.chamadas++, malhas(p)) : null) };
  return f;
}

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = (dx: number): number[] => [dx, 0, 10, dx + 20, 0, 10, dx + 20, 20, 10, dx, 20, 10];
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0' }) });
  s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [0, 3, 6, 9].map((k, i) => ({ op: 'addPonto' as const, x: pts(0)[k]!, y: pts(0)[k + 1]!, z: 10 + i * 0 })) });
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn2', levelId: 'lv_0' }) });
  s.exec({ type: 'editTerrainFontes', terrenoId: 'tn2', ops: [0, 3, 6, 9].map((k) => ({ op: 'addPonto' as const, x: pts(30)[k]!, y: pts(30)[k + 1]!, z: 10 })) });
  s.exec({
    type: 'addTerrainRegion',
    regiao: makeTerrainRegion({ id: 'rg1', levelId: 'lv_0', terrenoId: 'tn1', contorno: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], papel: 'plataforma', cota: 8 }),
  });
  return s;
}

const malhasFalsas = (): MalhaTerreno[] => [malhaDe('tn1', 'rg1'), malhaDe('tn2', null, 30)];

function cena(p: Project, f: FonteTerreno): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.fonteTerreno = f;
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
  return ms;
}
const modelo = (ms: ModelScene): THREE.Group => ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
function malhas(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  modelo(ms).traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
}
function linhas(ms: ModelScene): THREE.LineSegments[] {
  const out: THREE.LineSegments[] = [];
  modelo(ms).traverse((o) => o instanceof THREE.LineSegments && out.push(o));
  return out;
}
const gruposTerreno = (ms: ModelScene): THREE.Object3D[] => modelo(ms).children.filter((c) => c.userData['terrenoId'] !== undefined);

function cameraSobre(x: number, y: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  cam.position.set(x, y, 60);
  cam.up.set(0, 1, 0);
  cam.lookAt(x, y, 0);
  cam.updateMatrixWorld();
  return cam;
}

describe('terreno na vista 3D', () => {
  it('desenha uma malha por terreno e material (categoria site), com saia e base', () => {
    const ms = cena(projeto().project, fonte(true, malhasFalsas));
    const ms2 = malhas(ms);
    expect(ms2.length).toBeGreaterThan(0);
    expect(ms2.every((m) => m.userData['kind'] === 'site')).toBe(true);
    expect(gruposTerreno(ms)).toHaveLength(2);
    // tn1: superfície 2 + saia 2 + base 2 + região 2 = 8 triângulos em uma malha (mesma cor padrão)
    const g1 = gruposTerreno(ms).find((g) => g.userData['terrenoId'] === 'tn1')!;
    const m1: THREE.Mesh[] = [];
    g1.traverse((o) => o instanceof THREE.Mesh && m1.push(o));
    expect(m1).toHaveLength(1);
    expect(m1[0]!.geometry.index!.count / 3).toBe(8);
  });

  it('ElementRange por terreno e por região: clicar na região seleciona a região, fora dela o terreno', () => {
    const ms = cena(projeto().project, fonte(true, malhasFalsas));
    const faixas = malhas(ms).flatMap((m) => m.userData['ranges'] as ElementRange[]);
    expect(new Set(faixas.map((r) => r.id))).toEqual(new Set(['tn1', 'tn2', 'rg1']));
    const raiz = modelo(ms);
    expect(pickElement(raiz, cameraSobre(10, 10), { x: 0, y: 0 })?.id).toBe('rg1');
    expect(pickElement(raiz, cameraSobre(10, 10), { x: 0, y: 0 })?.kind).toBe('site');
    const fora = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
    fora.position.set(2, 2, 60);
    fora.lookAt(2, 2, 0);
    fora.updateMatrixWorld();
    expect(pickElement(raiz, fora, { x: 0, y: 0 })?.id).toBe('tn1');
    expect(pickElement(raiz, cameraSobre(40, 10), { x: 0, y: 0 })?.id).toBe('tn2');
  });

  it('realce e caixa da seleção funcionam para a região e para o terreno', () => {
    const ms = cena(projeto().project, fonte(true, malhasFalsas));
    const cr = caixaDaSelecao(modelo(ms), ['rg1'])!;
    expect(cr.min.x).toBeCloseTo(5, 6);
    expect(cr.max.x).toBeCloseTo(15, 6);
    const ct = ms.selectionBounds(['tn2'])!;
    expect(ct.min.x).toBeCloseTo(30, 6);
    ms.highlight(['rg1'], 'tn2');
    expect(() => ms.highlight([], null)).not.toThrow();
  });

  it('categoria site desligada some do 3D; terreno oculto também', () => {
    const p = projeto().project;
    const overrides = { ...defaultOverrides(), site: { visible: false, transparency: 0, halftone: false } };
    const semSite = cena({ ...p, view3d: { overrides } as Project['view3d'] }, fonte(true, malhasFalsas));
    expect(malhas(semSite)).toHaveLength(0);
    const ms = new ModelScene({ instanciar: false });
    ms.fonteTerreno = fonte(true, malhasFalsas);
    ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false, hidden: new Set(['tn1']) });
    expect(gruposTerreno(ms).map((g) => g.userData['terrenoId'])).toEqual(['tn2']);
  });

  it('sem kernel: só a borda tracejada de reserva, sem exceção e sem malha', () => {
    const ms = cena(projeto().project, fonte(false, malhasFalsas));
    expect(malhas(ms)).toHaveLength(0);
    const l = linhas(ms).filter((x) => x.userData['terrenoReserva']);
    expect(l).toHaveLength(2);
    expect(l[0]!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('kernel que recusa os dados (malha nula com kernel pronto): sem exceção', () => {
    const f: FonteTerreno = { pronto: () => true, malha: () => null };
    expect(() => cena(projeto().project, f)).not.toThrow();
  });

  it('editar T1 não reconstrói T2 (cache por terreno); sem mudança, a malha nem é pedida', () => {
    const s = projeto();
    const f = fonte(true, malhasFalsas);
    const ms = cena(s.project, f);
    const antes = new Map(gruposTerreno(ms).map((g) => [g.userData['terrenoId'] as string, g]));
    const chamadas = f.chamadas;
    // sem mudança no terreno
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), { edges: false, shadows: false, dark: false });
    expect(f.chamadas).toBe(chamadas);
    // edita T1
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn1', ops: [{ op: 'movePonto', i: 0, x: 1, y: 1, z: 11 }] });
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), { edges: false, shadows: false, dark: false });
    const depois = new Map(gruposTerreno(ms).map((g) => [g.userData['terrenoId'] as string, g]));
    expect(depois.get('tn2')).toBe(antes.get('tn2'));
    expect(depois.get('tn1')).not.toBe(antes.get('tn1'));
    expect(f.chamadas).toBe(chamadas + 1);
  });

  it('o lote (kind lot) não aparece no 3D', () => {
    const s = projeto();
    const sem = malhas(cena(s.project, fonte(true, malhasFalsas))).length;
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }], lados: [0, 1, 2, 3].map(() => ({ papel: 'lateral' as const, recuo: 1 })) }) });
    const ms = cena(s.project, fonte(true, malhasFalsas));
    expect(malhas(ms).length).toBe(sem);
    const ids = new Set(malhas(ms).flatMap((m) => (m.userData['ranges'] as ElementRange[]).map((r) => r.id)));
    expect(ids.has('lt1')).toBe(false);
  });

  it('terreno de 50 000 vértices: a cena monta sem travar (tempo registrado; alvo, não bloqueio)', () => {
    const n = 224; // 224 x 224 = 50 176 vértices
    const positions: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) positions.push(i, j, Math.sin(i / 9) * Math.cos(j / 9) * 3);
    const indices: number[] = [];
    for (let j = 0; j + 1 < n; j++) {
      for (let i = 0; i + 1 < n; i++) {
        const a = j * n + i;
        indices.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
      }
    }
    const s = projeto();
    const grande = (): MalhaTerreno[] => [{ terrenoId: 'tn1', partes: [{ regiaoId: null, papel: 'superficie', positions, indices }] }];
    const t0 = performance.now();
    const ms = cena(s.project, fonte(true, grande));
    const ms1 = performance.now() - t0;
    expect(malhas(ms).length).toBeGreaterThan(0);
    expect(ms1).toBeLessThan(30_000);
  });
});
