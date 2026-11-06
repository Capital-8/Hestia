import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEmptyProject, makeWall, view3dOf, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { MARGEM_CHAO_NEUTRO, ModelScene } from '../model3d/scene3d.ts';

const CAM: SheetView3DCamera = { azimuth: 0.6, elevation: 0.45, distance: 12, target: { x: 2, y: 1, z: 1 }, ortho: false };

function parede(): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  return p;
}

describe('snapshot da cena para o render offline', () => {
  it('exporta triângulos, materiais e lotes válidos', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const snap = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      expect(snap.version).toBe(1);
      expect(snap.positions.length).toBeGreaterThan(0);
      expect(snap.indices.length % 3).toBe(0);
      expect(snap.materials.length).toBeGreaterThan(0);
      // Só há parede no projeto. A fonte do tipo é o material de CAMADA (F2): os materiais padrão da parede (tinta, reboco,
      // bloco) não têm preset de textura, então são lisos (0), não reboco pela categoria. Escala 1.0. O último material é o
      // chão neutro (liso, ver o teste próprio); os demais são as paredes. O fallback por categoria é testado em
      // `materialRender.test.ts`.
      expect(snap.materials.slice(0, -1).every((m) => m.tipo === 0 && m.escala === 1)).toBe(true);
      expect(snap.batches.length).toBeGreaterThan(0);
      expect(snap.camera.view.length).toBe(16);
      expect(snap.camera.projection.length).toBe(16);
      for (const b of snap.batches) {
        expect(b.indexStart).toBeGreaterThanOrEqual(0);
        expect(b.indexStart + b.indexCount).toBeLessThanOrEqual(snap.indices.length);
        expect(b.material).toBeGreaterThanOrEqual(0);
        expect(b.material).toBeLessThan(snap.materials.length);
      }
      for (const m of snap.materials) {
        for (const n of [...m.baseColor, m.roughness, m.metallic, m.opacity, m.transmission, m.ior]) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }

      // Modo apresentação: datum/grid/chão/picking/realces fora da imagem.
      cena.modoApresentacao(true);
      const niveis = cena.scene.children.find((o) => o.userData.levels === true);
      expect(niveis?.visible).toBe(false);
      cena.modoApresentacao(false);
      expect(niveis?.visible).toBe(true);
    } finally {
      cena.dispose();
    }
  });

  it('a exportação acrescenta o chão neutro: último lote, 2 triângulos, material cinza liso e maior que o modelo', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const snap = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      const chao = snap.batches[snap.batches.length - 1]!;
      expect(chao.indexCount).toBe(6);
      const m = snap.materials[chao.material]!;
      expect(m.baseColor).toEqual([0.25, 0.25, 0.25]);
      expect([m.roughness, m.metallic, m.opacity, m.tipo, m.escala]).toEqual([0.9, 0, 1, 0, 1]);

      // Vértices do chão e do modelo (os anteriores ao lote do chão).
      const vert = (i: number) => [snap.positions[3 * i]!, snap.positions[3 * i + 1]!, snap.positions[3 * i + 2]!];
      const inicio = chao.indexStart;
      const modelo: number[][] = [];
      for (let i = 0; i < inicio; i++) modelo.push(vert(i));
      const chaoVerts: number[][] = [];
      for (let i = inicio; i < inicio + 6; i++) chaoVerts.push(vert(i));
      const minModelo = [0, 1, 2].map((k) => Math.min(...modelo.map((v) => v[k]!)));
      const maxModelo = [0, 1, 2].map((k) => Math.max(...modelo.map((v) => v[k]!)));
      const minChao = [0, 1, 2].map((k) => Math.min(...chaoVerts.map((v) => v[k]!)));
      const maxChao = [0, 1, 2].map((k) => Math.max(...chaoVerts.map((v) => v[k]!)));
      // Margem de MARGEM_CHAO_NEUTRO em X e Y, em cada lado; o chão fica plano, logo abaixo da base do modelo.
      expect(minChao[0]).toBeCloseTo(minModelo[0]! - MARGEM_CHAO_NEUTRO, 4);
      expect(maxChao[0]).toBeCloseTo(maxModelo[0]! + MARGEM_CHAO_NEUTRO, 4);
      expect(minChao[1]).toBeCloseTo(minModelo[1]! - MARGEM_CHAO_NEUTRO, 4);
      expect(maxChao[1]).toBeCloseTo(maxModelo[1]! + MARGEM_CHAO_NEUTRO, 4);
      expect(maxChao[2]).toBeCloseTo(minModelo[2]! - 0.002, 4);
      expect(minChao[2]).toBeCloseTo(maxChao[2]!, 6);
      // Enrolamento anti-horário visto de cima: normal do primeiro triângulo com z positivo.
      const [a, b, c] = chaoVerts as [number[], number[], number[]];
      const normalZ = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
      expect(normalZ).toBeGreaterThan(0);
    } finally {
      cena.dispose();
    }
  });

  it('o chão só entra na exportação: o viewport continua com o mesmo chão de sombra e nenhum objeto novo', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const filhosAntes = cena.scene.children.length;
      const sombrasAntes = cena.scene.children.filter((o) => o.type === 'Mesh' && (o as { material?: { type?: string } }).material?.type === 'ShadowMaterial');
      cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      cena.exportarCenaDeRender({ aspect: 16 / 9 });
      expect(cena.scene.children.length).toBe(filhosAntes);
      const sombrasDepois = cena.scene.children.filter((o) => o.type === 'Mesh' && (o as { material?: { type?: string } }).material?.type === 'ShadowMaterial');
      expect(sombrasDepois.length).toBe(1);
      expect(sombrasDepois[0]).toBe(sombrasAntes[0]);
    } finally {
      cena.dispose();
    }
  });

  it('sem câmera, o enquadramento automático põe a parede inteira no quadro; com câmera, a câmera dada vence', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const auto = cena.exportarCenaDeRender({ aspect: 16 / 9 });
      const modeloVertices: THREE.Vector3[] = [];
      const fim = auto.batches[auto.batches.length - 1]!.indexStart;
      for (let i = 0; i < fim; i++) modeloVertices.push(new THREE.Vector3(auto.positions[3 * i]!, auto.positions[3 * i + 1]!, auto.positions[3 * i + 2]!));
      const mvp = new THREE.Matrix4().fromArray(auto.camera.projection).multiply(new THREE.Matrix4().fromArray(auto.camera.view));
      const ndc = modeloVertices.map((v) => v.clone().applyMatrix4(mvp));
      for (const v of ndc) {
        expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
      }
      const larguraFrac = (Math.max(...ndc.map((v) => v.x)) - Math.min(...ndc.map((v) => v.x))) / 2;
      const alturaFrac = (Math.max(...ndc.map((v) => v.y)) - Math.min(...ndc.map((v) => v.y))) / 2;
      expect(Math.max(larguraFrac, alturaFrac)).toBeGreaterThan(0.5);

      // Com câmera do usuário: a posição do snapshot é a da câmera dada (alvo + distância na direção de vista).
      const dado = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      const { target: t, distance: d, azimuth: az, elevation: el } = CAM;
      expect(dado.camera.position[0]).toBeCloseTo(t.x + d * Math.cos(el) * Math.cos(az), 4);
      expect(dado.camera.position[1]).toBeCloseTo(t.y + d * Math.cos(el) * Math.sin(az), 4);
      expect(dado.camera.position[2]).toBeCloseTo(t.z + d * Math.sin(el), 4);
    } finally {
      cena.dispose();
    }
  });

  it('a margem do chão cresce com a distância da câmera (3 vezes), com o mínimo de 100 m', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const longe = { ...CAM, distance: 60 };
      const snap = cena.exportarCenaDeRender({ camera: longe, aspect: 16 / 9 });
      const inicio = snap.batches[snap.batches.length - 1]!.indexStart;
      let minX = Infinity;
      for (let i = 0; i < inicio; i++) minX = Math.min(minX, snap.positions[3 * i]!);
      const chaoMinX = Math.min(...Array.from({ length: 6 }, (_, k) => snap.positions[3 * (inicio + k)]!));
      expect(chaoMinX).toBeCloseTo(minX - 180, 4);
    } finally {
      cena.dispose();
    }
  });
});
