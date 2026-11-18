import type { Malha, PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import { corDaPeca } from './logica.ts';
import { marcadoresDaPeca } from './usinagensMarcadores.ts';

export interface PecaNaCena {
  peca: PecaResolvida;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  geometria: THREE.BufferGeometry;
  arestas: THREE.LineSegments;
  materialArestas: THREE.LineBasicMaterial;
  marcadores: THREE.Mesh[];
}

export const DIRECOES_DE_VISTA: Readonly<Record<'iso' | 'frente' | 'lateral' | 'planta', THREE.Vector3>> = {
  iso: new THREE.Vector3(0.8, -1.1, 0.7).normalize(),
  frente: new THREE.Vector3(0, -1, 0),
  lateral: new THREE.Vector3(1, 0, 0),
  planta: new THREE.Vector3(0, 0, 1),
};

const EIXO_Y = new THREE.Vector3(0, 1, 0);

export function malhaDaPeca(m: Malha, indice: number): Malha {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const pecaDoTriangulo: number[] = [];
  for (let t = 0; t < m.pecaDoTriangulo.length; t++) {
    if (m.pecaDoTriangulo[t] !== indice) continue;
    const base = positions.length / 3;
    for (let v = 0; v < 3; v++) {
      const vertice = m.indices[t * 3 + v]!;
      positions.push(m.positions[vertice * 3]!, m.positions[vertice * 3 + 1]!, m.positions[vertice * 3 + 2]!);
      normals.push(m.normals[vertice * 3]!, m.normals[vertice * 3 + 1]!, m.normals[vertice * 3 + 2]!);
    }
    indices.push(base, base + 1, base + 2);
    pecaDoTriangulo.push(indice);
  }
  return { positions, normals, indices, pecaDoTriangulo };
}

export function montarMarcadoresPeca(
  peca: PecaResolvida,
  geoDisco: THREE.CylinderGeometry,
  geoCaixa: THREE.BoxGeometry,
  matMarcador: THREE.MeshBasicMaterial,
): THREE.Mesh[] {
  const criados: THREE.Mesh[] = [];
  for (const m of marcadoresDaPeca(peca)) {
    const mesh = new THREE.Mesh(m.forma === 'disco' ? geoDisco : geoCaixa, matMarcador);
    mesh.position.fromArray(m.centro);
    if (m.forma === 'disco') {
      mesh.quaternion.setFromUnitVectors(EIXO_Y, new THREE.Vector3(m.normal[0], m.normal[1], m.normal[2]));
      mesh.scale.set(m.raio, m.altura, m.raio);
    } else {
      mesh.scale.set(m.dimensoes[0], m.dimensoes[1], m.dimensoes[2]);
    }
    criados.push(mesh);
  }
  return criados;
}

export function criarMaterialPeca(
  peca: PecaResolvida,
  materiais: Readonly<Record<string, string>>,
  opacidadePadrao: number,
): THREE.MeshStandardMaterial {
  const vazio = peca.vazio;
  const opacidade = vazio ? 0.35 : opacidadePadrao;
  return new THREE.MeshStandardMaterial({
    color: corDaPeca(peca, materiais),
    flatShading: true,
    metalness: 0.02,
    roughness: 0.72,
    side: THREE.DoubleSide,
    transparent: vazio || opacidade < 1,
    opacity: opacidade,
    depthWrite: !vazio,
  });
}
