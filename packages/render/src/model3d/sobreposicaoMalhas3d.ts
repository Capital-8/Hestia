import * as THREE from 'three';
import type { ModelScene } from './scene3d.ts';

/** Triângulos (mundo) das malhas da cena, com o elemento dono de cada um (pelas faixas `ranges`). */
export interface TrianguloDono {
  id: string;
  v: [number, number, number, number, number, number, number, number, number];
}

export function trianguloDaCena(ms: ModelScene): TrianguloDono[] {
  const out: TrianguloDono[] = [];
  ms.scene.updateMatrixWorld(true);
  ms.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.ranges === undefined) return;
    if (o.userData.caixasPick) return; // caixas de picking, não a malha visível
    const pos = o.geometry.getAttribute('position');
    const idx = o.geometry.getIndex();
    const ranges = o.userData.ranges as Array<{ id: string; start: number; count: number }>;
    const matrizes: THREE.Matrix4[] = [];
    if (o instanceof THREE.InstancedMesh) {
      for (let k = 0; k < o.count; k++) {
        const m = new THREE.Matrix4();
        o.getMatrixAt(k, m);
        matrizes.push(m.premultiply(o.matrixWorld));
      }
    } else matrizes.push(o.matrixWorld.clone());
    const vec = new THREE.Vector3();
    for (const m of matrizes) {
      for (const r of ranges) {
        for (let i = r.start; i < r.start + r.count; i += 3) {
          const t: number[] = [];
          for (let j = 0; j < 3; j++) {
            const vi = idx ? idx.getX(i + j) : i + j;
            vec.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(m);
            t.push(vec.x, vec.y, vec.z);
          }
          out.push({ id: r.id, v: t as TrianguloDono['v'] });
        }
      }
    }
  });
  return out;
}

/**
 * Volume (m³) da sobreposição entre os sólidos de dois conjuntos de elementos, pela malha: em cada ponto de uma grade em planta, os intervalos
 * de cota ocupados por cada conjunto (paridade dos cruzamentos de uma reta vertical com os triângulos) e o comprimento comum.
 * A cena tem z para cima.
 */
export function sobreposicaoDeMalhas(tris: TrianguloDono[], a: (id: string) => boolean, b: (id: string) => boolean, passo = 0.01): { volume: number; volA: number; volB: number } {
  const lado = (f: (id: string) => boolean) => tris.filter((t) => f(t.id));
  const A = lado(a);
  const B = lado(b);
  const cruzamentos = (T: TrianguloDono[]): Map<number, number[]> => {
    const mapa = new Map<number, number[]>();
    const chave = (i: number, j: number): number => i * 100003 + j;
    for (const t of T) {
      const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = t.v;
      // a cena tem z para cima: planta (x, y), cota z
      const px = [x0, x1, x2];
      const pz = [y0, y1, y2];
      const py = [z0, z1, z2];
      const den = (pz[1]! - pz[2]!) * (px[0]! - px[2]!) + (px[2]! - px[1]!) * (pz[0]! - pz[2]!);
      if (Math.abs(den) < 1e-14) continue;
      const i0 = Math.ceil(Math.min(...px) / passo - 1e-9);
      const i1 = Math.floor(Math.max(...px) / passo + 1e-9);
      const j0 = Math.ceil(Math.min(...pz) / passo - 1e-9);
      const j1 = Math.floor(Math.max(...pz) / passo + 1e-9);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          // ponto da grade deslocado por um valor irracional pequeno: evita cair em arestas e contar duas vezes
          const x = i * passo + 1.234e-6;
          const z = j * passo + 2.345e-6;
          const l1 = ((pz[1]! - pz[2]!) * (x - px[2]!) + (px[2]! - px[1]!) * (z - pz[2]!)) / den;
          const l2 = ((pz[2]! - pz[0]!) * (x - px[2]!) + (px[0]! - px[2]!) * (z - pz[2]!)) / den;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const y = l1 * py[0]! + l2 * py[1]! + l3 * py[2]!;
          const k = chave(i, j);
          const lista = mapa.get(k);
          if (lista) lista.push(y);
          else mapa.set(k, [y]);
        }
      }
    }
    return mapa;
  };
  const ca = cruzamentos(A);
  const cb = cruzamentos(B);
  const intervalos = (l: number[]): Array<[number, number]> => {
    const s = l.slice().sort((p, q) => p - q);
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i]!, s[i + 1]!]);
    return out;
  };
  const soma = (l: Array<[number, number]>): number => l.reduce((acc, [p, q]) => acc + (q - p), 0);
  let volume = 0;
  let volA = 0;
  let volB = 0;
  for (const [k, la] of ca) {
    const ia = intervalos(la);
    volA += soma(ia) * passo * passo;
    const lb = cb.get(k);
    if (!lb) continue;
    const ib = intervalos(lb);
    for (const [a0, a1] of ia) for (const [b0, b1] of ib) volume += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) * passo * passo;
  }
  for (const lb of cb.values()) volB += soma(intervalos(lb)) * passo * passo;
  return { volume, volA, volB };
}
