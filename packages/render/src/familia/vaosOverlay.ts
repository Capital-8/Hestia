import type { PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import type {
  CliqueVao3D,
  FaceExternaCaixa,
  HoverVao3D,
  ModoInteracao3DFamilia,
  VaoResolvido,
} from './tiposVisualizador.ts';
import {
  COR_FACE_HOVER,
  COR_FANTASMA,
  COR_FANTASMA_ARESTA,
  COR_FANTASMA_IMA,
  COR_FANTASMA_IMA_ARESTA,
  COR_HOVER_VAO,
  COR_SEL_VAO,
  COR_SETA_FRENTE,
  FACES_EXTERNAS,
  calcularPontoLocalNoVao,
  calcularPosicaoNoVao,
  criarBlocoVisual,
  criarGeometriaSetaFrente,
  descartarBlocoVisual,
  eixoDoModo,
  geometriaFaceExterna,
  limitesDasPecas,
  limitesDosVaos,
  modoUsaChapaFantasma,
  modoUsaFaceExterna,
  selecionarCandidatoVao,
  volumeVao,
  type BlocoVisual,
  type CaixaLimites,
  type FaceExternaVisual,
  type HitVao,
} from './vaosOverlayApoio.ts';

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

    this.highlightHoverVao = criarBlocoVisual(this.geoCaixa, this.geoArestas, 'vao_hover', COR_HOVER_VAO, 0.14, COR_HOVER_VAO, 0.85);
    this.highlightSelVao = criarBlocoVisual(this.geoCaixa, this.geoArestas, 'vao_selecionado', COR_SEL_VAO, 0.18, COR_SEL_VAO, 0.95);
    this.chapaFantasma = criarBlocoVisual(this.geoCaixa, this.geoArestas, 'chapa_fantasma', COR_FANTASMA, 0.48, COR_FANTASMA_ARESTA, 0.95);
    this.highlightFaceHover = criarBlocoVisual(this.geoCaixa, this.geoArestas, 'face_externa_hover', COR_FACE_HOVER, 0.3, COR_FACE_HOVER, 0.95);

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
    descartarBlocoVisual(this.highlightHoverVao);
    descartarBlocoVisual(this.highlightSelVao);
    descartarBlocoVisual(this.chapaFantasma);
    descartarBlocoVisual(this.highlightFaceHover);
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

    const escolhido = selecionarCandidatoVao(candidatos, this.modo, this.grupo);
    const pontoLocal = calcularPontoLocalNoVao(this.grupo, raycaster, escolhido, this.modo);
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
}
