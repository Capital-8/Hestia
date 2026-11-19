import * as THREE from 'three';

/** Cores dos eixos da origem (padrão de CAD e three.js): X vermelho, Y verde, Z azul. */
export const COR_EIXO_X = '#e5484d';
export const COR_EIXO_Y = '#30a46c';
export const COR_EIXO_Z = '#3e63dd';

/** Comprimento dos eixos na tela, em pixels (constante em qualquer distância da câmera). */
export const EIXOS_ORIGEM_PX = 36;

/** Proporção da ponta de seta em relação ao comprimento do eixo. */
const SETA = 0.14;

/** Segmentos de um eixo unitário na direção `d`: o corpo e quatro farpas da seta, em coordenadas do mundo do projeto. */
function segmentosDoEixo(d: THREE.Vector3, lado: THREE.Vector3, lado2: THREE.Vector3): number[] {
  const ponta = d.clone();
  const base = d.clone().multiplyScalar(1 - SETA);
  const farpas = [lado, lado.clone().negate(), lado2, lado2.clone().negate()].map((l) => base.clone().addScaledVector(l, SETA * 0.45));
  const out: number[] = [0, 0, 0, ponta.x, ponta.y, ponta.z];
  for (const f of farpas) out.push(ponta.x, ponta.y, ponta.z, f.x, f.y, f.z);
  return out;
}

function linhaDoEixo(cor: string, d: THREE.Vector3, lado: THREE.Vector3, lado2: THREE.Vector3, nome: string): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(segmentosDoEixo(d, lado, lado2), 3));
  const m = new THREE.LineBasicMaterial({ color: new THREE.Color(cor), depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
  const l = new THREE.LineSegments(g, m);
  l.name = nome;
  l.userData = { eixoOrigem: nome, cor };
  l.renderOrder = 1000;
  l.frustumCulled = false;
  // Nunca é alvo de seleção: sem interseção.
  l.raycast = () => undefined;
  return l;
}

/**
 * Escala (m por unidade do eixo unitário) que mantém o eixo com `px` pixels na tela: altura visível no ponto da origem
 * dividida pela altura da tela em pixels. Perspectiva usa a distância da câmera à origem; ortogonal, a altura da câmera.
 */
export function escalaDosEixos(camera: THREE.Camera, alturaPx: number, px = EIXOS_ORIGEM_PX): number {
  const h = Math.max(1, alturaPx);
  let visivel: number;
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const o = camera as THREE.OrthographicCamera;
    visivel = (o.top - o.bottom) / o.zoom;
  } else {
    const p = camera as THREE.PerspectiveCamera;
    const d = Math.max(0.05, camera.position.length());
    visivel = 2 * d * Math.tan(THREE.MathUtils.degToRad(p.fov) / 2);
  }
  return (visivel * px) / h;
}

/**
 * Eixos X, Y e Z saindo da origem (0, 0, 0) do projeto. O mundo do projeto é Z para cima (a câmera orbital usa up = Z, e as
 * paredes têm (x, y) em planta e cota em Z), então o eixo azul aponta para cima e o vermelho e o verde ficam no plano
 * horizontal, coincidindo com X e Y da planta. Não é pickável, não está no modelo (fora do enquadramento e das exportações).
 */
export class EixosDaOrigem3d {
  readonly group = new THREE.Group();
  readonly x: THREE.LineSegments;
  readonly y: THREE.LineSegments;
  readonly z: THREE.LineSegments;

  constructor() {
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);
    this.x = linhaDoEixo(COR_EIXO_X, X, Y, Z, 'x');
    this.y = linhaDoEixo(COR_EIXO_Y, Y, X, Z, 'y');
    this.z = linhaDoEixo(COR_EIXO_Z, Z, X, Y, 'z');
    this.group.name = 'eixos-da-origem';
    this.group.userData = { eixosOrigem: true };
    this.group.add(this.x, this.y, this.z);
    this.group.visible = false;
    this.group.raycast = () => undefined;
  }

  /** Liga ou desliga. Desligado, nada é desenhado. */
  definir(on: boolean): void {
    this.group.visible = on;
  }

  get visivel(): boolean {
    return this.group.visible;
  }

  /** Mantém o comprimento constante na tela para a câmera e a altura de tela dadas. */
  atualizar(camera: THREE.Camera, alturaPx: number): void {
    if (!this.group.visible) return;
    this.group.scale.setScalar(escalaDosEixos(camera, alturaPx));
  }

  dispose(): void {
    for (const l of [this.x, this.y, this.z]) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
  }
}
