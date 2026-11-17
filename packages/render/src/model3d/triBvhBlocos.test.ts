import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTriBvh, raycastTriBvh } from './triBvh.ts';
import { buildBlocosBvh, raycastBlocosBvh } from './triBvhBlocos.ts';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Sopa de triângulos pequenos espalhados num cubo de 20 m, mais triângulos coplanares/duplicados para forçar empates. */
function cena(n: number, seed: number) {
  const r = rng(seed);
  const pos = new Float32Array(n * 9);
  const idx = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) {
    const dup = t > 0 && t % 7 === 0;
    for (let k = 0; k < 9; k++) pos[t * 9 + k] = dup ? pos[(t - 1) * 9 + k]! : (k % 3 === 0 ? r() * 20 : k % 3 === 1 ? r() * 20 : r() * 20) + (k >= 3 ? r() : 0);
    idx[t * 3] = t * 3;
    idx[t * 3 + 1] = t * 3 + 1;
    idx[t * 3 + 2] = t * 3 + 2;
  }
  return { pos, idx };
}

describe('BVH em blocos preguiçoso', () => {
  it('dá o mesmo acerto (face, distância, ponto) que o BVH global em raios aleatórios', () => {
    const { pos, idx } = cena(5000, 7);
    const global = buildTriBvh(pos, idx);
    const blocos = buildBlocosBvh(pos, idx);
    const r = rng(99);
    const accept = (f: number) => f % 3 !== 0;
    for (const side of [THREE.DoubleSide, THREE.FrontSide, THREE.BackSide]) {
      for (let i = 0; i < 400; i++) {
        const o = new THREE.Vector3(r() * 24 - 2, r() * 24 - 2, -5);
        const d = new THREE.Vector3(r() - 0.5, r() - 0.5, 1).normalize();
        const ray = new THREE.Ray(o, d);
        for (const a of [undefined, accept]) {
          const g = raycastTriBvh(global, ray, Infinity, side, a);
          const b = raycastBlocosBvh(blocos, ray, Infinity, side, a);
          expect(b === null).toBe(g === null);
          if (g && b) {
            expect(b.faceIndex).toBe(g.faceIndex);
            expect(b.distance).toBe(g.distance);
            expect(b.point.toArray()).toEqual(g.point.toArray());
          }
        }
      }
    }
  });

  it('só constrói o BVH dos blocos que o raio alcança', () => {
    // Triângulos em fila ao longo de x, na ordem: cada bloco ocupa um trecho do eixo.
    const n = 5120;
    const pos = new Float32Array(n * 9);
    const idx = new Uint32Array(n * 3);
    for (let t = 0; t < n; t++) {
      pos.set([t, 0, 0, t + 1, 0, 0, t, 1, 0], t * 9);
      idx.set([t * 3, t * 3 + 1, t * 3 + 2], t * 3);
    }
    const blocos = buildBlocosBvh(pos, idx);
    raycastBlocosBvh(blocos, new THREE.Ray(new THREE.Vector3(-100, 100, 1), new THREE.Vector3(0, 0, 1)));
    expect(blocos.folhas.filter(Boolean).length).toBe(0);
    const hit = raycastBlocosBvh(blocos, new THREE.Ray(new THREE.Vector3(10.2, 0.2, 1), new THREE.Vector3(0, 0, -1)));
    expect(hit?.faceIndex).toBe(10);
    expect(blocos.folhas.filter(Boolean).length).toBe(1);
  });

  it('geometria vazia não acerta nada', () => {
    const b = buildBlocosBvh(new Float32Array(0), new Uint32Array(0));
    expect(raycastBlocosBvh(b, new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)))).toBeNull();
  });
});

describe('prepararPicking', () => {
  it('monta as caixas em fatias e deixa o primeiro raio sem construir nada além do bloco atingido', async () => {
    const THREEm = await import('three');
    const { prepararPicking, pickElement } = await import('./pick3d.ts');
    const root = new THREEm.Group();
    for (let k = 0; k < 4; k++) {
      const n = 600;
      const pos = new Float32Array(n * 9);
      const idx = new Uint32Array(n * 3);
      for (let t = 0; t < n; t++) {
        pos.set([t, 0, k * 3, t + 1, 0, k * 3, t, 1, k * 3], t * 9);
        idx.set([t * 3, t * 3 + 1, t * 3 + 2], t * 3);
      }
      const g = new THREEm.BufferGeometry();
      g.setAttribute('position', new THREEm.BufferAttribute(pos, 3));
      g.setIndex(new THREEm.BufferAttribute(idx, 1));
      const m = new THREEm.Mesh(g, new THREEm.MeshBasicMaterial({ side: THREEm.DoubleSide }));
      m.userData.ranges = [{ id: `e${k}`, start: 0, count: n * 3 }];
      m.userData.kind = 'wall';
      root.add(m);
    }
    // Relógio falso: cada consulta passa 10 ms, então cada fatia (orçamento 8 ms) faz uma malha só.
    let t = 0;
    const agora = () => (t += 10);
    let r = prepararPicking(root, 8, agora);
    expect(r.total).toBe(4);
    expect(r.feitas).toBe(1);
    while (r.feitas < r.total) r = prepararPicking(root, 8, agora);
    const cam = new THREEm.PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(10.2, 0.2, 20);
    cam.lookAt(10.2, 0.2, 0);
    cam.updateMatrixWorld(true);
    const hit = pickElement(root, cam, { x: 0, y: 0 });
    expect(hit?.id).toBe('e3');
  });
});
