import type { PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import type {
  CliqueVao3D,
  FaceExternaCaixa,
  HoverVao3D,
  ModoInteracao3DFamilia,
  VaoResolvido,
} from './tiposVisualizador.ts';

interface CaixaLimites {
  min: [number, number, number];
  max: [number, number, number];
}

interface HitVao {
  vao: VaoResolvido;
  hit: THREE.Intersection;
  volume: number;
}

interface BlocoVisual {
  grupo: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  arestas: THREE.LineSegments;
  materialArestas: THREE.LineBasicMaterial;
}

interface FaceExternaVisual {
  face: FaceExternaCaixa;
  mesh: THREE.Mesh;
  arestas: THREE.LineSegments;
}

const FACES_EXTERNAS: readonly FaceExternaCaixa[] = [
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

const COR_HOVER_VAO = 0x00a8ff;
const COR_SEL_VAO = 0x0078d4;
const COR_FANTASMA = 0x10b981;
const COR_FANTASMA_ARESTA = 0x059669;
const COR_FANTASMA_IMA = 0x06b6d4;
const COR_FANTASMA_IMA_ARESTA = 0x0e7490;
const COR_FACE_HOVER = 0x0078d4;
const COR_SETA_FRENTE = 0x64748b;

function modoUsaFaceExterna(modo: ModoInteracao3DFamilia): boolean {
  return modo === 'tampo' || modo === 'tamponamento' || modo === 'recorte';
}

function modoUsaChapaFantasma(modo: ModoInteracao3DFamilia): boolean {
  return modo === 'prateleira' || modo === 'divisoria';
}

function eixoDoModo(modo: ModoInteracao3DFamilia): 'x' | 'z' {
  return modo === 'divisoria' ? 'x' : 'z';
}

function volumeVao(vao: VaoResolvido): number {
  return (
    Math.max(0, vao.max[0] - vao.min[0]) *
    Math.max(0, vao.max[1] - vao.min[1]) *
    Math.max(0, vao.max[2] - vao.min[2])
  );
}

function pertoDaBordaDoVao(ponto: THREE.Vector3, vao: VaoResolvido): boolean {
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
function limitesDasPecas(pecas: readonly PecaResolvida[]): CaixaLimites | null {
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
function limitesDosVaos(vaos: readonly VaoResolvido[]): CaixaLimites | null {
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
function pontoMedioRaioNaCaixa(
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
function calcularPosicaoNoVao(
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
function criarGeometriaSetaFrente(): THREE.ShapeGeometry {
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
function geometriaFaceExterna(
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

/**
 * Gerencia overlays 3D interativos para Caixaria por Vãos: caixas de picking de vãos, highlight de hover/seleção,
 * chapa fantasma ao vivo (prateleira/divisória), placas das 6 faces externas e indicador de frente no chão.
 */
export class VaosOverlay {
  readonly grupo = new THREE.Group();

  private readonly geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  private readonly geoArestas = new THREE.EdgesGeometry(this.geoCaixa);
  private readonly geoSeta = criarGeometriaSetaFrente();

  private readonly matPicking = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  });

  private readonly matFaceBase = new THREE.MeshBasicMaterial({
    color: COR_FACE_HOVER,
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  private readonly matArestasFaceBase = new THREE.LineBasicMaterial({
    color: COR_FACE_HOVER,
    transparent: true,
    opacity: 0.28,
  });

  private readonly matSetaFrente = new THREE.MeshBasicMaterial({
    color: COR_SETA_FRENTE,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  private readonly grupoPickingVaos = new THREE.Group();
  private readonly grupoFacesExternas = new THREE.Group();
  private readonly setaFrente: THREE.Mesh;

  private readonly highlightHoverVao: BlocoVisual;
  private readonly highlightSelVao: BlocoVisual;
  private readonly chapaFantasma: BlocoVisual;
  private readonly highlightFaceHover: BlocoVisual;

  private vaos: readonly VaoResolvido[] = [];
  private readonly vaoPorId = new Map<string, VaoResolvido>();
  private readonly vaoDoMesh = new WeakMap<THREE.Object3D, VaoResolvido>();
  private meshesVaos: THREE.Mesh[] = [];

  private readonly faceDoMesh = new WeakMap<THREE.Object3D, FaceExternaCaixa>();
  private readonly facesVisuais: FaceExternaVisual[] = [];

  private limitesPecas: CaixaLimites | null = null;
  private modo: ModoInteracao3DFamilia = 'selecionar';
  private espessuraPadraoMm = 18;
  private vaoSelecionadoId: string | null = null;
  private hoverVaoAtual: HoverVao3D | null = null;
  private hoverFaceAtual: FaceExternaCaixa | null = null;
  private destruido = false;

  constructor() {
    this.grupo.name = 'vaos_overlay';
    this.grupoPickingVaos.name = 'vaos_picking';
    this.grupoFacesExternas.name = 'faces_externas';
    this.grupoFacesExternas.visible = false;

    this.highlightHoverVao = this.criarBlocoVisual('vao_hover', COR_HOVER_VAO, 0.14, COR_HOVER_VAO, 0.85);
    this.highlightSelVao = this.criarBlocoVisual('vao_selecionado', COR_SEL_VAO, 0.18, COR_SEL_VAO, 0.95);
    this.chapaFantasma = this.criarBlocoVisual('chapa_fantasma', COR_FANTASMA, 0.48, COR_FANTASMA_ARESTA, 0.95);
    this.highlightFaceHover = this.criarBlocoVisual('face_externa_hover', COR_FACE_HOVER, 0.3, COR_FACE_HOVER, 0.95);

    for (const face of FACES_EXTERNAS) {
      const mesh = new THREE.Mesh(this.geoCaixa, this.matFaceBase);
      mesh.name = `face_externa_${face}`;
      const arestas = new THREE.LineSegments(this.geoArestas, this.matArestasFaceBase);
      mesh.add(arestas);
      this.faceDoMesh.set(mesh, face);
      this.grupoFacesExternas.add(mesh);
      this.facesVisuais.push({ face, mesh, arestas });
    }

    this.setaFrente = new THREE.Mesh(this.geoSeta, this.matSetaFrente);
    this.setaFrente.name = 'indicador_frente';
    this.setaFrente.position.set(0, -0.35, -0.001);

    this.grupo.add(
      this.grupoPickingVaos,
      this.grupoFacesExternas,
      this.highlightSelVao.grupo,
      this.highlightHoverVao.grupo,
      this.chapaFantasma.grupo,
      this.highlightFaceHover.grupo,
      this.setaFrente,
    );
  }

  /** Atualiza a caixa envolvente de referência (faces externas + indicador de frente) com base nas peças resolvidas. */
  definirPecasLimites(pecas: readonly PecaResolvida[]): void {
    if (this.destruido) return;
    this.limitesPecas = limitesDasPecas(pecas);
    this.atualizarFacesESeta();
  }

  /** Substitui os vãos disponíveis para picking e revalida seleção/hover. */
  definirVaos(vaos: readonly VaoResolvido[]): void {
    if (this.destruido) return;
    this.vaos = [...vaos];
    this.vaoPorId.clear();
    for (const mesh of this.meshesVaos) this.grupoPickingVaos.remove(mesh);
    this.meshesVaos = [];

    for (const vao of this.vaos) {
      this.vaoPorId.set(vao.id, vao);
      const dx = vao.max[0] - vao.min[0];
      const dy = vao.max[1] - vao.min[1];
      const dz = vao.max[2] - vao.min[2];
      if (dx <= 1e-6 || dy <= 1e-6 || dz <= 1e-6) continue;
      const mesh = new THREE.Mesh(this.geoCaixa, this.matPicking);
      mesh.name = `picking_vao_${vao.id}`;
      mesh.position.set((vao.min[0] + vao.max[0]) / 2, (vao.min[1] + vao.max[1]) / 2, (vao.min[2] + vao.max[2]) / 2);
      mesh.scale.set(dx, dy, dz);
      this.vaoDoMesh.set(mesh, vao);
      this.grupoPickingVaos.add(mesh);
      this.meshesVaos.push(mesh);
    }

    if (this.vaoSelecionadoId !== null && !this.vaoPorId.has(this.vaoSelecionadoId)) {
      this.vaoSelecionadoId = null;
    }
    this.aplicarVaoSelecionado();

    if (this.hoverVaoAtual !== null && !this.vaoPorId.has(this.hoverVaoAtual.vaoId)) {
      this.hoverVaoAtual = null;
      this.highlightHoverVao.grupo.visible = false;
      this.chapaFantasma.grupo.visible = false;
    }

    if (this.limitesPecas === null) {
      this.atualizarFacesESeta();
    }
  }

  /** Configura o modo de interação e a espessura padrão (mm) da chapa fantasma. */
  definirModo(modo: ModoInteracao3DFamilia, espessuraPadraoMm: number): void {
    if (this.destruido) return;
    this.modo = modo;
    this.espessuraPadraoMm = Number.isFinite(espessuraPadraoMm) && espessuraPadraoMm > 0 ? espessuraPadraoMm : 18;

    const usaFace = modoUsaFaceExterna(modo);
    this.grupoFacesExternas.visible = usaFace && this.obterLimitesEfetivos() !== null;
    this.grupoPickingVaos.visible = !usaFace;

    if (usaFace) {
      this.hoverVaoAtual = null;
      this.highlightHoverVao.grupo.visible = false;
      this.chapaFantasma.grupo.visible = false;
      this.highlightSelVao.grupo.visible = false;
    } else {
      this.hoverFaceAtual = null;
      this.highlightFaceHover.grupo.visible = false;
      this.aplicarVaoSelecionado();
      if (!modoUsaChapaFantasma(modo)) {
        this.chapaFantasma.grupo.visible = false;
      }
    }
  }

  /** Seleciona visualmente um vão por id (ou limpa quando `null`). */
  selecionarVao(vaoId: string | null): void {
    if (this.destruido) return;
    this.vaoSelecionadoId = vaoId !== null && this.vaoPorId.has(vaoId) ? vaoId : null;
    this.aplicarVaoSelecionado();
  }

  obterHoverVaoAtual(): HoverVao3D | null {
    return this.hoverVaoAtual;
  }

  /** Atualiza hover (vão, chapa fantasma ou face externa) a partir do raycaster preparado. */
  atualizarHover(
    raycaster: THREE.Raycaster,
    clientX: number,
    clientY: number,
    bloqueadoPorPecaNoModoSelecionar: boolean,
  ): { mudouHoverVao: boolean; hoverVao: HoverVao3D | null; mudouVisual: boolean } {
    if (this.destruido) return { mudouHoverVao: false, hoverVao: null, mudouVisual: false };

    const hoverVaoAnterior = this.hoverVaoAtual;
    const hoverFaceAnterior = this.hoverFaceAtual;

    if (modoUsaFaceExterna(this.modo)) {
      const face = this.escolherFaceSob(raycaster);
      this.aplicarFaceHover(face);
      const tinhaVao = hoverVaoAnterior !== null;
      this.hoverVaoAtual = null;
      this.highlightHoverVao.grupo.visible = false;
      this.chapaFantasma.grupo.visible = false;
      return {
        mudouHoverVao: tinhaVao,
        hoverVao: null,
        mudouVisual: tinhaVao || hoverFaceAnterior !== face,
      };
    }

    let mudouVisual = false;
    if (hoverFaceAnterior !== null) {
      this.aplicarFaceHover(null);
      mudouVisual = true;
    }

    if (this.modo === 'selecionar' && bloqueadoPorPecaNoModoSelecionar) {
      const tinhaVao = hoverVaoAnterior !== null;
      this.limparHoverVaoVisual();
      return { mudouHoverVao: tinhaVao, hoverVao: null, mudouVisual: mudouVisual || tinhaVao };
    }

    const resultado = this.resolverVaoSob(raycaster, clientX, clientY);
    if (resultado === null) {
      const tinhaVao = hoverVaoAnterior !== null;
      this.limparHoverVaoVisual();
      return { mudouHoverVao: tinhaVao, hoverVao: null, mudouVisual: mudouVisual || tinhaVao };
    }

    this.hoverVaoAtual = resultado.hover;
    this.posicionarBlocoEmCaixa(this.highlightHoverVao, resultado.vao.min, resultado.vao.max);
    this.highlightHoverVao.grupo.visible = true;

    if (modoUsaChapaFantasma(this.modo)) {
      this.atualizarChapaFantasma(resultado.vao, resultado.hover.eixo, resultado.hover.posicaoNormalizada);
    } else {
      this.chapaFantasma.grupo.visible = false;
    }

    const mudouHoverVao =
      hoverVaoAnterior === null ||
      hoverVaoAnterior.vaoId !== resultado.hover.vaoId ||
      hoverVaoAnterior.eixo !== resultado.hover.eixo ||
      Math.abs(hoverVaoAnterior.posicaoNormalizada - resultado.hover.posicaoNormalizada) > 1e-4 ||
      hoverVaoAnterior.medidaInicioMm !== resultado.hover.medidaInicioMm ||
      hoverVaoAnterior.medidaFimMm !== resultado.hover.medidaFimMm ||
      hoverVaoAnterior.clientX !== resultado.hover.clientX ||
      hoverVaoAnterior.clientY !== resultado.hover.clientY;

    return { mudouHoverVao, hoverVao: resultado.hover, mudouVisual: true };
  }

  /** Limpa qualquer estado de hover ativo. */
  limparHover(): { mudouHoverVao: boolean; mudouVisual: boolean } {
    const tinhaVao = this.hoverVaoAtual !== null;
    const tinhaFace = this.hoverFaceAtual !== null;
    this.limparHoverVaoVisual();
    this.aplicarFaceHover(null);
    return { mudouHoverVao: tinhaVao, mudouVisual: tinhaVao || tinhaFace };
  }

  /** Resolve o clique em vão no ponto atual do raycaster. */
  clicarVao(raycaster: THREE.Raycaster, clientX: number, clientY: number): CliqueVao3D | null {
    if (this.destruido || modoUsaFaceExterna(this.modo)) return null;
    const resultado = this.resolverVaoSob(raycaster, clientX, clientY);
    if (resultado === null) return null;
    const centroX = (resultado.vao.min[0] + resultado.vao.max[0]) / 2;
    const ladoHorizontal = resultado.pontoLocal.x < centroX ? 'esquerda' : 'direita';
    return { ...resultado.hover, ladoHorizontal };
  }

  /** Resolve o clique em uma das 6 faces externas da caixa envolvente. */
  clicarFaceExterna(raycaster: THREE.Raycaster): FaceExternaCaixa | null {
    if (this.destruido || !modoUsaFaceExterna(this.modo)) return null;
    return this.escolherFaceSob(raycaster);
  }

  /** Libera geometrias, materiais e objetos internos. Idempotente. */
  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.descartarBlocoVisual(this.highlightHoverVao);
    this.descartarBlocoVisual(this.highlightSelVao);
    this.descartarBlocoVisual(this.chapaFantasma);
    this.descartarBlocoVisual(this.highlightFaceHover);
    this.geoCaixa.dispose();
    this.geoArestas.dispose();
    this.geoSeta.dispose();
    this.matPicking.dispose();
    this.matFaceBase.dispose();
    this.matArestasFaceBase.dispose();
    this.matSetaFrente.dispose();
    this.grupo.clear();
    this.meshesVaos = [];
    this.vaoPorId.clear();
  }

  private criarBlocoVisual(
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
    const mesh = new THREE.Mesh(this.geoCaixa, material);
    const materialArestas = new THREE.LineBasicMaterial({
      color: corArestas,
      transparent: true,
      opacity: opacidadeArestas,
    });
    const arestas = new THREE.LineSegments(this.geoArestas, materialArestas);
    grupo.add(mesh, arestas);
    return { grupo, mesh, material, arestas, materialArestas };
  }

  private descartarBlocoVisual(bloco: BlocoVisual): void {
    bloco.material.dispose();
    bloco.materialArestas.dispose();
    bloco.grupo.clear();
  }

  private obterLimitesEfetivos(): CaixaLimites | null {
    return this.limitesPecas ?? limitesDosVaos(this.vaos);
  }

  private atualizarFacesESeta(): void {
    const limites = this.obterLimitesEfetivos();
    if (limites === null) {
      this.grupoFacesExternas.visible = false;
      this.setaFrente.position.set(0, -0.35, -0.001);
      return;
    }

    for (const item of this.facesVisuais) {
      const { centro, escala } = geometriaFaceExterna(item.face, limites);
      item.mesh.position.set(centro[0], centro[1], centro[2]);
      item.mesh.scale.set(escala[0], escala[1], escala[2]);
    }
    this.grupoFacesExternas.visible = modoUsaFaceExterna(this.modo);

    const cx = (limites.min[0] + limites.max[0]) / 2;
    const prof = Math.max(0.1, limites.max[1] - limites.min[1]);
    const margem = Math.max(0.08, Math.min(0.18, prof * 0.25));
    this.setaFrente.position.set(cx, limites.min[1] - margem, limites.min[2] - 0.001);

    if (this.hoverFaceAtual !== null) {
      this.aplicarFaceHover(this.hoverFaceAtual);
    }
  }

  private aplicarVaoSelecionado(): void {
    if (this.vaoSelecionadoId === null || modoUsaFaceExterna(this.modo)) {
      this.highlightSelVao.grupo.visible = false;
      return;
    }
    const vao = this.vaoPorId.get(this.vaoSelecionadoId);
    if (vao === undefined) {
      this.highlightSelVao.grupo.visible = false;
      return;
    }
    this.posicionarBlocoEmCaixa(this.highlightSelVao, vao.min, vao.max);
    this.highlightSelVao.grupo.visible = true;
  }

  private limparHoverVaoVisual(): void {
    this.hoverVaoAtual = null;
    this.highlightHoverVao.grupo.visible = false;
    this.chapaFantasma.grupo.visible = false;
  }

  private aplicarFaceHover(face: FaceExternaCaixa | null): void {
    this.hoverFaceAtual = face;
    if (face === null) {
      this.highlightFaceHover.grupo.visible = false;
      return;
    }
    const limites = this.obterLimitesEfetivos();
    if (limites === null) {
      this.highlightFaceHover.grupo.visible = false;
      return;
    }
    const { centro, escala } = geometriaFaceExterna(face, limites);
    this.highlightFaceHover.grupo.position.set(centro[0], centro[1], centro[2]);
    this.highlightFaceHover.grupo.scale.set(escala[0], escala[1], escala[2]);
    this.highlightFaceHover.grupo.visible = true;
  }

  private posicionarBlocoEmCaixa(
    bloco: BlocoVisual,
    min: readonly [number, number, number],
    max: readonly [number, number, number],
  ): void {
    bloco.grupo.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    bloco.grupo.scale.set(
      Math.max(1e-4, max[0] - min[0]),
      Math.max(1e-4, max[1] - min[1]),
      Math.max(1e-4, max[2] - min[2]),
    );
  }

  private atualizarChapaFantasma(vao: VaoResolvido, eixo: 'x' | 'z', posicaoNormalizada: number): void {
    const espM = Math.max(0.004, this.espessuraPadraoMm / 1000);
    const lx = Math.max(1e-4, vao.max[0] - vao.min[0]);
    const ly = Math.max(1e-4, vao.max[1] - vao.min[1]);
    const lz = Math.max(1e-4, vao.max[2] - vao.min[2]);
    const cx = (vao.min[0] + vao.max[0]) / 2;
    const cy = (vao.min[1] + vao.max[1]) / 2;
    const cz = (vao.min[2] + vao.max[2]) / 2;

    if (eixo === 'z') {
      const zPos = vao.min[2] + posicaoNormalizada * lz;
      this.chapaFantasma.grupo.position.set(cx, cy, zPos);
      this.chapaFantasma.grupo.scale.set(lx, ly, Math.min(espM, lz));
    } else {
      const xPos = vao.min[0] + posicaoNormalizada * lx;
      this.chapaFantasma.grupo.position.set(xPos, cy, cz);
      this.chapaFantasma.grupo.scale.set(Math.min(espM, lx), ly, lz);
    }

    const noCentro = posicaoNormalizada === 0.5;
    this.chapaFantasma.material.color.setHex(noCentro ? COR_FANTASMA_IMA : COR_FANTASMA);
    this.chapaFantasma.material.opacity = noCentro ? 0.6 : 0.46;
    this.chapaFantasma.materialArestas.color.setHex(noCentro ? COR_FANTASMA_IMA_ARESTA : COR_FANTASMA_ARESTA);
    this.chapaFantasma.grupo.visible = true;
  }

  private escolherFaceSob(raycaster: THREE.Raycaster): FaceExternaCaixa | null {
    const limites = this.obterLimitesEfetivos();
    if (limites === null) return null;
    this.grupo.updateMatrixWorld(true);
    const alvos = this.facesVisuais.map((f) => f.mesh);
    const hits = raycaster.intersectObjects(alvos, false);
    const primeiro = hits[0];
    if (primeiro === undefined) return null;
    return this.faceDoMesh.get(primeiro.object) ?? null;
  }

  private resolverVaoSob(
    raycaster: THREE.Raycaster,
    clientX: number,
    clientY: number,
  ): { vao: VaoResolvido; pontoLocal: THREE.Vector3; hover: HoverVao3D } | null {
    if (this.meshesVaos.length === 0) return null;
    this.grupo.updateMatrixWorld(true);
    const intersecoes = raycaster.intersectObjects(this.meshesVaos, false);
    if (intersecoes.length === 0) return null;

    const porId = new Map<string, HitVao>();
    for (const hit of intersecoes) {
      const vao = this.vaoDoMesh.get(hit.object);
      if (vao === undefined || porId.has(vao.id)) continue;
      porId.set(vao.id, { vao, hit, volume: volumeVao(vao) });
    }
    const candidatos = Array.from(porId.values());
    if (candidatos.length === 0) return null;

    const escolhido = this.selecionarCandidatoVao(candidatos);
    const pontoLocal = this.calcularPontoLocalNoVao(raycaster, escolhido);
    const eixo = eixoDoModo(this.modo);
    const { posicaoNormalizada, medidaInicioMm, medidaFimMm } = calcularPosicaoNoVao(
      escolhido.vao,
      pontoLocal,
      eixo,
      this.espessuraPadraoMm,
    );

    return {
      vao: escolhido.vao,
      pontoLocal,
      hover: {
        vaoId: escolhido.vao.id,
        posicaoNormalizada,
        medidaInicioMm,
        medidaFimMm,
        eixo,
        clientX,
        clientY,
      },
    };
  }

  private selecionarCandidatoVao(candidatos: HitVao[]): HitVao {
    if (this.modo === 'porta') {
      const divisoesNaBorda = candidatos.filter((c) => {
        if (!c.vao.temDivisao) return false;
        const pt = this.grupo.worldToLocal(c.hit.point.clone());
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

  private calcularPontoLocalNoVao(raycaster: THREE.Raycaster, escolhido: HitVao): THREE.Vector3 {
    const pontoLocal = this.grupo.worldToLocal(escolhido.hit.point.clone());
    if (!modoUsaChapaFantasma(this.modo) || escolhido.hit.face == null) return pontoLocal;

    const eixo = eixoDoModo(this.modo);
    const normal = escolhido.hit.face.normal;
    const incidiuPerpendicular =
      (eixo === 'z' && Math.abs(normal.z) > 0.5) || (eixo === 'x' && Math.abs(normal.x) > 0.5);
    if (!incidiuPerpendicular) return pontoLocal;

    const matrizInversa = new THREE.Matrix4().copy(this.grupo.matrixWorld).invert();
    const raioLocal = raycaster.ray.clone().applyMatrix4(matrizInversa);
    return pontoMedioRaioNaCaixa(raioLocal, escolhido.vao.min, escolhido.vao.max) ?? pontoLocal;
  }
}
