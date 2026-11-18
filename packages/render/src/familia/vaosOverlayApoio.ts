import type { PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import type {
  FaceExternaCaixa,
  ModoInteracao3DFamilia,
  VaoResolvido,
} from './tiposVisualizador.ts';

export interface CaixaLimites {
  min: [number, number, number];
  max: [number, number, number];
}

export interface HitVao {
  vao: VaoResolvido;
  hit: THREE.Intersection;
  volume: number;
}

export interface BlocoVisual {
  grupo: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  arestas: THREE.LineSegments;
  materialArestas: THREE.LineBasicMaterial;
}

export interface FaceExternaVisual {
  face: FaceExternaCaixa;
  mesh: THREE.Mesh;
  arestas: THREE.LineSegments;
}

export const FACES_EXTERNAS: readonly FaceExternaCaixa[] = [
  'esquerda',
  'direita',
  'topo',
  'base',
  'frente',
  'fundo',
];

const TOLERANCIA_IMA_MEIO = 0.03;
const ESPESSURA_FACE_EXTERNA = 0.003;
const MARGEM_BORDA_PORTA_MAX = 0.045;
const FRACAO_BORDA_PORTA = 0.14;

export const COR_HOVER_VAO = 0x00a8ff;
export const COR_SEL_VAO = 0x0078d4;
export const COR_FANTASMA = 0x10b981;
export const COR_FANTASMA_ARESTA = 0x059669;
export const COR_FANTASMA_IMA = 0x06b6d4;
export const COR_FANTASMA_IMA_ARESTA = 0x0e7490;
export const COR_FACE_HOVER = 0x0078d4;
export const COR_SETA_FRENTE = 0x64748b;

export function modoUsaFaceExterna(modo: ModoInteracao3DFamilia): boolean {
  return modo === 'tampo' || modo === 'tamponamento' || modo === 'recorte';
}

export function modoUsaChapaFantasma(modo: ModoInteracao3DFamilia): boolean {
  return modo === 'prateleira' || modo === 'divisoria';
}

export function eixoDoModo(modo: ModoInteracao3DFamilia): 'x' | 'z' {
  return modo === 'divisoria' ? 'x' : 'z';
}

export function volumeVao(vao: VaoResolvido): number {
  return (
    Math.max(0, vao.max[0] - vao.min[0]) *
    Math.max(0, vao.max[1] - vao.min[1]) *
    Math.max(0, vao.max[2] - vao.min[2])
  );
}

export function pertoDaBordaDoVao(ponto: THREE.Vector3, vao: VaoResolvido): boolean {
  const lx = Math.max(0, vao.max[0] - vao.min[0]);
  const lz = Math.max(0, vao.max[2] - vao.min[2]);
  const mx = Math.min(MARGEM_BORDA_PORTA_MAX, lx * FRACAO_BORDA_PORTA);
  const mz = Math.min(MARGEM_BORDA_PORTA_MAX, lz * FRACAO_BORDA_PORTA);
  return (
    ponto.x - vao.min[0] <= mx ||
    vao.max[0] - ponto.x <= mx ||
    ponto.z - vao.min[2] <= mz ||
    vao.max[2] - ponto.z <= mz
  );
}

/** Calcula os limites [min, max] das peças sólidas (ou todas se só houver vazias). */
export function limitesDasPecas(pecas: readonly PecaResolvida[]): CaixaLimites | null {
  const filtrarSolid = pecas.some((p) => !p.vazio);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let tem = false;
  for (const p of pecas) {
    if (filtrarSolid && p.vazio) continue;
    tem = true;
    for (let i = 0; i < 3; i++) {
      const inicio = p.origem[i]!;
      const fim = inicio + p.extensao[i]!;
      if (inicio < min[i]!) min[i] = inicio;
      if (fim > max[i]!) max[i] = fim;
    }
  }
  return tem ? { min, max } : null;
}

/** Calcula a união [min, max] dos vãos quando ainda não há peças. */
export function limitesDosVaos(vaos: readonly VaoResolvido[]): CaixaLimites | null {
  if (vaos.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of vaos) {
    for (let i = 0; i < 3; i++) {
      if (v.min[i]! < min[i]!) min[i] = v.min[i]!;
      if (v.max[i]! > max[i]!) max[i] = v.max[i]!;
    }
  }
  return { min, max };
}

/** Ponto médio do segmento do raio dentro da AABB do vão (fallback para incidência perpendicular ao eixo). */
export function pontoMedioRaioNaCaixa(
  raio: THREE.Ray,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): THREE.Vector3 | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const orig = [raio.origin.x, raio.origin.y, raio.origin.z] as const;
  const dir = [raio.direction.x, raio.direction.y, raio.direction.z] as const;
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!;
    const o = orig[i]!;
    if (Math.abs(d) < 1e-8) {
      if (o < min[i]! || o > max[i]!) return null;
    } else {
      let t1 = (min[i]! - o) / d;
      let t2 = (max[i]! - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  const t = Math.max(0, (Math.max(0, tMin) + Math.max(0, tMax)) / 2);
  return raio.at(t, new THREE.Vector3());
}

/** Calcula posição normalizada (com imã no meio 0.5 ± 3%) e distâncias em mm até início/fim internos do vão. */
export function calcularPosicaoNoVao(
  vao: VaoResolvido,
  pontoLocal: THREE.Vector3,
  eixo: 'x' | 'z',
  espessuraPadraoMm: number,
): { posicaoNormalizada: number; medidaInicioMm: number; medidaFimMm: number } {
  const idx = eixo === 'x' ? 0 : 2;
  const inicio = vao.min[idx]!;
  const fim = vao.max[idx]!;
  const extensao = Math.max(0, fim - inicio);
  const coord = eixo === 'x' ? pontoLocal.x : pontoLocal.z;
  const bruto = extensao > 1e-6 ? Math.max(0, Math.min(1, (coord - inicio) / extensao)) : 0.5;
  const posicaoNormalizada = Math.abs(bruto - 0.5) <= TOLERANCIA_IMA_MEIO ? 0.5 : bruto;
  const extensaoMm = extensao * 1000;
  const meiaEspMm = Math.min(Math.max(0, espessuraPadraoMm) / 2, extensaoMm / 2);
  const medidaInicioMm = Math.round(Math.max(0, posicaoNormalizada * extensaoMm - meiaEspMm));
  const medidaFimMm = Math.round(Math.max(0, (1 - posicaoNormalizada) * extensaoMm - meiaEspMm));
  return { posicaoNormalizada, medidaInicioMm, medidaFimMm };
}

/** Seta discreta no plano XY apontando para -Y (frente do móvel). */
export function criarGeometriaSetaFrente(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.045);
  shape.lineTo(0.042, -0.005);
  shape.lineTo(0.014, -0.005);
  shape.lineTo(0.014, 0.045);
  shape.lineTo(-0.014, 0.045);
  shape.lineTo(-0.014, -0.005);
  shape.lineTo(-0.042, -0.005);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Calcula centro e dimensões da placa externa correspondente à face. */
export function geometriaFaceExterna(
  face: FaceExternaCaixa,
  limites: CaixaLimites,
): { centro: [number, number, number]; escala: [number, number, number] } {
  const { min, max } = limites;
  const dx = Math.max(0.02, max[0] - min[0]);
  const dy = Math.max(0.02, max[1] - min[1]);
  const dz = Math.max(0.02, max[2] - min[2]);
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const offset = ESPESSURA_FACE_EXTERNA / 2;
  switch (face) {
    case 'esquerda':
      return { centro: [min[0] - offset, cy, cz], escala: [ESPESSURA_FACE_EXTERNA, dy, dz] };
    case 'direita':
      return { centro: [max[0] + offset, cy, cz], escala: [ESPESSURA_FACE_EXTERNA, dy, dz] };
    case 'frente':
      return { centro: [cx, min[1] - offset, cz], escala: [dx, ESPESSURA_FACE_EXTERNA, dz] };
    case 'fundo':
      return { centro: [cx, max[1] + offset, cz], escala: [dx, ESPESSURA_FACE_EXTERNA, dz] };
    case 'base':
      return { centro: [cx, cy, min[2] - offset], escala: [dx, dy, ESPESSURA_FACE_EXTERNA] };
    case 'topo':
      return { centro: [cx, cy, max[2] + offset], escala: [dx, dy, ESPESSURA_FACE_EXTERNA] };
  }
}


export function criarBlocoVisual(
  geoCaixa: THREE.BufferGeometry,
  geoArestas: THREE.EdgesGeometry,
  nome: string,
  cor: number,
  opacidade: number,
  corArestas: number,
  opacidadeArestas: number,
): BlocoVisual {
  const grupo = new THREE.Group();
  grupo.name = nome;
  grupo.visible = false;
  const material = new THREE.MeshBasicMaterial({
    color: cor,
    transparent: true,
    opacity: opacidade,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geoCaixa, material);
  const materialArestas = new THREE.LineBasicMaterial({
    color: corArestas,
    transparent: true,
    opacity: opacidadeArestas,
  });
  const arestas = new THREE.LineSegments(geoArestas, materialArestas);
  grupo.add(mesh, arestas);
  return { grupo, mesh, material, arestas, materialArestas };
}

export function descartarBlocoVisual(bloco: BlocoVisual): void {
  bloco.material.dispose();
  bloco.materialArestas.dispose();
  bloco.grupo.clear();
}

export function selecionarCandidatoVao(
  candidatos: HitVao[],
  modo: ModoInteracao3DFamilia,
  grupo: THREE.Object3D,
): HitVao {
  if (modo === 'porta') {
    const divisoesNaBorda = candidatos.filter((c) => {
      if (!c.vao.temDivisao) return false;
      const pt = grupo.worldToLocal(c.hit.point.clone());
      return pertoDaBordaDoVao(pt, c.vao);
    });
    if (divisoesNaBorda.length > 0) {
      divisoesNaBorda.sort((a, b) => a.volume - b.volume || a.hit.distance - b.hit.distance);
      return divisoesNaBorda[0]!;
    }
  }
  const folhas = candidatos.filter((c) => c.vao.folha);
  if (folhas.length > 0) {
    folhas.sort((a, b) => a.hit.distance - b.hit.distance || a.volume - b.volume);
    return folhas[0]!;
  }
  candidatos.sort((a, b) => a.volume - b.volume || a.hit.distance - b.hit.distance);
  return candidatos[0]!;
}

export function calcularPontoLocalNoVao(
  grupo: THREE.Object3D,
  raycaster: THREE.Raycaster,
  escolhido: HitVao,
  modo: ModoInteracao3DFamilia,
): THREE.Vector3 {
  const pontoLocal = grupo.worldToLocal(escolhido.hit.point.clone());
  if (!modoUsaChapaFantasma(modo) || escolhido.hit.face == null) return pontoLocal;
  const eixo = eixoDoModo(modo);
  const normal = escolhido.hit.face.normal;
  const incidiuPerpendicular =
    (eixo === 'z' && Math.abs(normal.z) > 0.5) || (eixo === 'x' && Math.abs(normal.x) > 0.5);
  if (!incidiuPerpendicular) return pontoLocal;
  const matrizInversa = new THREE.Matrix4().copy(grupo.matrixWorld).invert();
  const raioLocal = raycaster.ray.clone().applyMatrix4(matrizInversa);
  return pontoMedioRaioNaCaixa(raioLocal, escolhido.vao.min, escolhido.vao.max) ?? pontoLocal;
}
