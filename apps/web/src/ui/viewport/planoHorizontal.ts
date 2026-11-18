import * as THREE from 'three';

const PLANO = new THREE.Plane();
const NORMAL = new THREE.Vector3(0, 0, 1);
const PONTO = new THREE.Vector3();
const RAIO = new THREE.Raycaster();

/**
 * Ponto (x, y) do sistema do modelo onde o raio da câmera que passa pelo NDC cruza o plano horizontal z = `z` (m).
 * O mundo do Hestia tem Z para cima, então o plano horizontal é o próprio plano XY da cena 3D. Devolve `null`
 * quando o raio é paralelo ao plano ou aponta para o lado contrário (o plano fica atrás da câmera).
 */
export function pontoNoPlanoHorizontal(
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  z: number,
): { x: number; y: number } | null {
  RAIO.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  PLANO.setFromNormalAndCoplanarPoint(NORMAL, PONTO.set(0, 0, z));
  if (!RAIO.ray.intersectPlane(PLANO, PONTO)) return null;
  return { x: PONTO.x, y: PONTO.y };
}
