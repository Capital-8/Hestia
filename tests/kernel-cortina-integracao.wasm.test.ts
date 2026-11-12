/**
 * Parede cortina, integração de 3D e planta (decisão 0056, fase 1) sobre o Rust REAL: um projeto mínimo com uma cortina de 6 m x 3 m (4 x 2 células) e uma
 * parede comum. Confere o serviço (malha por instâncias, planta nos três níveis, avisos, cache por assinatura), a cena 3D (InstancedMesh por protótipo,
 * vidro em lote posterior) e o desenho sem kernel. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, makeLevel, makeWall, view3dOf, type Project } from '@hestia/model';
import { resolveLevel, ServicoCortina, definirGerenciadorDaCortina, servicoCortina, PAPEL_PLANTA_CORTINA } from '../packages/engine/src/index.ts';
import { cortinaAvisosDeGeometria } from '../packages/engine/src/cortinaIssues.ts';
import { especCortinaTeste, projetoComCortina, tipoCortinaTeste } from '../packages/engine/src/fixtureCortina.ts';
import { ModelScene } from '../packages/render/src/model3d/scene3d.ts';
import { lotesDaCortina } from '../packages/render/src/model3d/cortina3d.ts';
import { cortinaOps } from '../packages/render/src/plan/cortina.ts';
import { LIGHT } from '../packages/render/src/plan/types.ts';
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
});

const opcoes = { edges: false, shadows: false, dark: false } as const;
const niveis = (p: Project) => p.levels.map((l) => resolveLevel(p, l.id));

/** Instâncias totais e protótipos de uma malha. */
const contar = (m: NonNullable<ReturnType<ServicoCortina['malha']>>) => ({
  protos: m.protos.size,
  instancias: m.instancias.reduce((s, g) => s + g.n, 0),
  vidros: m.instancias.filter((g) => g.transparente).reduce((s, g) => s + g.n, 0),
});

describe('parede cortina: serviço sobre o Rust real', () => {
  it.skipIf(!bytes)('a malha vem por instâncias: poucos protótipos, 8 painéis de vidro e os montantes da grade 4 x 2', () => {
    const srv = new ServicoCortina(() => ger);
    const p = projetoComCortina();
    const m = srv.malha(p)!;
    const n = contar(m);
    // 8 painéis (4 x 2), todos de vidro transparente; um único tipo de montante e um de painel = 2 protótipos.
    expect(n.vidros).toBe(8);
    expect(n.protos).toBe(2);
    // Uma instância por segmento de montante: 5 linhas verticais (2 de borda + 3 interiores) x 2 fileiras + 3 linhas horizontais (base, meio, topo) x 4 colunas = 22.
    expect(n.instancias).toBe(8 + 10 + 12);
    expect(m.instancias.every((g) => g.wallId === 'ct1')).toBe(true);
    // Vidro em lote próprio, material do tipo de painel.
    const lotes = lotesDaCortina(m);
    expect(lotes.filter((l) => l.transparente)).toHaveLength(1);
    expect(lotes.filter((l) => l.transparente)[0]!.materialId).toBe('mat_vidro');
    expect(lotes.find((l) => !l.transparente)!.materialId).toBe('mat_aluminio');
    srv.encerrar();
  });

  it.skipIf(!bytes)('planta nos três níveis de detalhe: grosso sem montante; médio e fino com eles', () => {
    const srv = new ServicoCortina(() => ger);
    const p = projetoComCortina();
    const papeis = (d: number) => new Set(srv.planta(p, 'lv_0', 1.2, d)!.map((l) => l.papel));
    expect(papeis(0).has(PAPEL_PLANTA_CORTINA.montante)).toBe(false);
    expect(papeis(0).has(PAPEL_PLANTA_CORTINA.contorno)).toBe(true);
    expect(papeis(1).has(PAPEL_PLANTA_CORTINA.montante)).toBe(true);
    expect(srv.planta(p, 'lv_0', 1.2, 2)!.length).toBeGreaterThanOrEqual(srv.planta(p, 'lv_0', 1.2, 1)!.length);
    expect(srv.planta(p, 'lv_0', 1.2, 1)!.every((l) => l.wallId === 'ct1')).toBe(true);
    srv.encerrar();
  });

  it.skipIf(!bytes)('avisos do Rust: célula menor que o mínimo vira medida traduzida para a parede', () => {
    const srv = new ServicoCortina(() => ger);
    const p = projetoComCortina(especCortinaTeste({ u: { mode: 'fixedNumber', count: 40 } }));
    const avisos = srv.avisos(p)!;
    expect(avisos.some((a) => a.wallId === 'ct1')).toBe(true);
    const issues = cortinaAvisosDeGeometria(avisos);
    expect(issues.some((i) => i.code === 'cortina-celula-pequena' && i.elementId === 'ct1')).toBe(true);
    srv.encerrar();
  });

  it.skipIf(!bytes)('cache por assinatura: editar parede comum mantém a malha; editar a grade a refaz; só o que mudou é reenviado', () => {
    const srv = new ServicoCortina(() => ger);
    const s = new ProjectStore(projetoComCortina());
    const m0 = srv.malha(s.project)!;
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 8 }, b: { x: 3, y: 8 }, height: 3 }) });
    expect(srv.malha(s.project)).toBe(m0);
    s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(especCortinaTeste({ u: { mode: 'fixedNumber', count: 6 } })) });
    const m1 = srv.malha(s.project)!;
    expect(m1).not.toBe(m0);
    expect(contar(m1).vidros).toBe(12);
    srv.encerrar();
  });

  it.skipIf(!bytes)('sem kernel as consultas devolvem null (nada de TypeScript no lugar)', () => {
    const srv = new ServicoCortina(() => null);
    const p = projetoComCortina();
    expect(srv.pronto()).toBe(false);
    expect(srv.malha(p)).toBeNull();
    expect(srv.planta(p, 'lv_0', 1.2)).toBeNull();
    expect(srv.avisos(p)).toBeNull();
  });
});

describe('parede cortina: cena 3D e planta', () => {
  it.skipIf(!bytes)('a cena monta InstancedMesh por protótipo (vidro depois dos opacos); a parede comum segue como antes', () => {
    definirGerenciadorDaCortina(() => ger);
    const p = projetoComCortina();
    const cena = new ModelScene();
    cena.update(p, niveis(p), opcoes);
    const inst: THREE.InstancedMesh[] = [];
    cena.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData.cortina === true) inst.push(o as THREE.InstancedMesh);
    });
    // Um desenho por (protótipo, material, transparência): montantes e vidro = 2.
    expect(inst).toHaveLength(2);
    expect(inst.reduce((s, m) => s + m.count, 0)).toBe(30);
    const vidro = inst.find((m) => m.userData.transparente === true)!;
    const opaco = inst.find((m) => m.userData.transparente === false)!;
    expect(vidro.count).toBe(8);
    expect(vidro.renderOrder).toBeGreaterThan(opaco.renderOrder);
    expect((vidro.material as THREE.Material).depthWrite).toBe(false);
    expect((opaco.material as THREE.Material).depthWrite).toBe(true);
    // A caixa da cortina serve ao enquadramento e ao picking.
    const b = cena.selectionBounds(['ct1'])!;
    expect(b.max.x - b.min.x).toBeCloseTo(6, 1); // montante de borda embutido em [0, L]
    expect(b.max.z - b.min.z).toBeCloseTo(3, 1);
    cena.dispose();
  });

  it.skipIf(!bytes)('editar só a cortina de outro nível não refaz o lote deste (chave por hash do nível)', () => {
    definirGerenciadorDaCortina(() => ger);
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'N1', elevation: 3 }) });
    s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(especCortinaTeste({ u: { mode: 'fixedNumber', count: 3 } }), 'wt_ct2') });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct2', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
    const cena = new ModelScene();
    const grupoDe = (nivel: string) => {
      let g: THREE.Object3D | null = null;
      cena.scene.traverse((o) => {
        if (o.userData.levelId === nivel && (o as THREE.Group).isGroup && o.children.some((c) => c.userData.cortina === true)) g = o;
      });
      return g;
    };
    cena.update(s.project, niveis(s.project), opcoes);
    const g0 = grupoDe('lv_0');
    const g1 = grupoDe('lv_1');
    expect(g0).not.toBeNull();
    expect(g1).not.toBeNull();
    s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(especCortinaTeste({ u: { mode: 'fixedNumber', count: 5 } }), 'wt_ct2') });
    cena.update(s.project, niveis(s.project), opcoes);
    expect(grupoDe('lv_0')).toBe(g0);
    expect(grupoDe('lv_1')).not.toBe(g1);
    cena.dispose();
  });

  it.skipIf(!bytes)('planta: cortinaOps desenha o contorno e, no médio, os montantes cortados com preenchimento', () => {
    definirGerenciadorDaCortina(() => ger);
    const p = projetoComCortina();
    const paint = view3dOf(p) && ({ visible: true, visual: 'consistent', color: null, halftone: false, alpha: 1, cutPx: 2, projPx: 1 } as never);
    const grosso = cortinaOps(p, 'lv_0', undefined, LIGHT, false, paint, 1.2, 'coarse');
    const medio = cortinaOps(p, 'lv_0', undefined, LIGHT, false, paint, 1.2, 'medium');
    expect(grosso.strokes.length).toBeGreaterThan(0);
    expect(grosso.fills).toHaveLength(0);
    expect(medio.fills.length).toBeGreaterThan(0);
    expect(medio.strokes.length).toBeGreaterThan(grosso.strokes.length);
    // Oculta: nada.
    expect(cortinaOps(p, 'lv_0', new Set(['ct1']), LIGHT, false, paint, 1.2, 'medium').strokes).toHaveLength(0);
  });
});

describe('parede cortina: sem o kernel', () => {
  it('3D e planta mostram só o eixo; o aviso cortina-sem-kernel sai pelos avisos', () => {
    definirGerenciadorDaCortina(() => null);
    expect(servicoCortina().pronto()).toBe(false);
    const p = projetoComCortina();
    const cena = new ModelScene();
    cena.update(p, niveis(p), opcoes);
    const linhas: THREE.LineSegments[] = [];
    let instanciadas = 0;
    cena.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData.cortina === true) instanciadas++;
      if ((o as THREE.LineSegments).isLineSegments && o.parent?.userData.levelId === 'lv_0') linhas.push(o as THREE.LineSegments);
    });
    expect(instanciadas).toBe(0);
    expect(linhas.some((l) => l.geometry.getAttribute('position').count === 2)).toBe(true);
    const paint = { visible: true, visual: 'consistent', color: null, halftone: false, alpha: 1, cutPx: 2, projPx: 1 } as never;
    const o = cortinaOps(p, 'lv_0', undefined, LIGHT, false, paint, 1.2, 'medium');
    expect(o.fills).toHaveLength(0);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.pts).toHaveLength(2);
    expect(o.strokes[0]!.dash).toBeDefined();
    cena.dispose();
  });
});

/** Duas cortinas em canto de 90° (ct1 de (0,0) a (6,0); ct2 de (6,0) a (6,4)): o montante de canto sai em `grupos` (fase 3). */
const cantoDe90 = (): Project => {
  const s = new ProjectStore(projetoComCortina(especCortinaTeste({ mullions: { ...especCortinaTeste().mullions, corner: 'mul_ret_50x100' } })));
  s.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, height: 3 }) });
  return s.project;
};

describe('parede cortina: montante de canto (grupos) no 3D', () => {
  it.skipIf(!bytes)('o canto sai em grupos e o 3D gera a malha dele dentro da caixa do encontro; planta e quantidades não o repetem', () => {
    const srv = new ServicoCortina(() => ger);
    const p = cantoDe90();
    const m = srv.malha(p)!;
    // O canto é emitido pela cortina de menor id (ct1), num grupo próprio do montante.
    expect(m.grupos.length).toBeGreaterThan(0);
    expect(m.grupos.every((g) => g.wallId === 'ct1' && g.papel === 0 && !g.transparente)).toBe(true);
    expect(m.grupos.reduce((s, g) => s + g.indices.length / 3, 0)).toBeGreaterThan(0);
    // Quantidades: o canto aparece uma vez (papel 6), com o volume do prisma de 0,1 m x 0,1 m x 3 m (não vem de `grupos`).
    const cantos = srv.quantidades(p)!.filter((q) => q.papel === 6);
    expect(cantos).toHaveLength(1);
    expect(cantos[0]!.n).toBe(1);
    expect(cantos[0]!.volume).toBeCloseTo(0.1 * 0.1 * 3, 5);
    srv.encerrar();

    definirGerenciadorDaCortina(() => ger);
    const cena = new ModelScene();
    cena.update(p, niveis(p), opcoes);
    const avulsas: THREE.Mesh[] = [];
    cena.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.avulsa === true) avulsas.push(o as THREE.Mesh);
    });
    expect(avulsas).toHaveLength(m.grupos.length);
    const malhaCanto = avulsas[0]!;
    const geo = malhaCanto.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(0);
    expect(geo.getIndex()!.count / 3).toBeGreaterThan(0);
    // Vértices no mundo dentro da caixa do encontro: x perto de 6 m, y perto da linha da parede, z de 0 à altura.
    malhaCanto.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    const caixa = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) caixa.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(malhaCanto.matrixWorld));
    expect(caixa.min.x).toBeGreaterThan(5.9);
    expect(caixa.max.x).toBeLessThan(6.1);
    expect(caixa.min.y).toBeGreaterThan(-0.1);
    expect(caixa.max.y).toBeLessThan(0.1);
    expect(caixa.min.z).toBeGreaterThanOrEqual(-1e-6);
    expect(caixa.max.z).toBeLessThanOrEqual(3 + 1e-6);
    // A caixa da cortina ct1 (picking e enquadramento) inclui o canto: vai até x = 6,05.
    expect(cena.selectionBounds(['ct1'])!.max.x).toBeGreaterThan(6.04);
    cena.dispose();
  });
});
