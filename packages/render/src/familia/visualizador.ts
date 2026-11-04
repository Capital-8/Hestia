import { malhaDasPecas, type Malha, type PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  corDaPeca,
  deslocamentoDeExplosao,
  distanciaDeEnquadramento,
  esferaDeEnquadramento,
  geometriaDaMalha,
  pecaVisivel,
  type NivelDetalhe3d,
} from './logica.ts';
import { marcadoresDaPeca, marcadoresVisiveis } from './usinagensMarcadores.ts';

/*
 * Visualizador 3D da família (three.js). FICHA E3-visual. Não tem teste de unidade (precisa de WebGL): o
 * orquestrador confere o resultado abrindo o editor no navegador. Use SEMPRE as funções de `./logica.ts` e
 * `malhaDasPecas` de `@hestia/engine`; não duplique regra de cor, explosão ou visibilidade aqui.
 */

export interface OpcoesVisualizador {
  /** Mapa id de material do projeto → "#rrggbb" (opcional). */
  materiais?: Readonly<Record<string, string>>;
}

export interface CortePlano {
  ativo: boolean;
  eixo: 'x' | 'y' | 'z';
  /** Posição do plano de corte em metros, no sistema da família. Fica visível o lado de MENOR coordenada. */
  posicao: number;
}

/** Uma peça na cena: malha, material próprio (opacidade/seleção), geometria e arestas de realce e marcadores de usinagem. */
interface PecaNaCena {
  peca: PecaResolvida;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  geometria: THREE.BufferGeometry;
  arestas: THREE.LineSegments;
  materialArestas: THREE.LineBasicMaterial;
  marcadores: THREE.Mesh[];
}

/** Extrai de uma malha combinada só os triângulos da peça `indice`, para uma geometria própria por peça. */
function malhaDaPeca(m: Malha, indice: number): Malha {
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

/** Direção (do centro para a câmera) de cada vista rápida; a de 'planta' olha de cima. */
const DIRECOES_DE_VISTA: Readonly<Record<'iso' | 'frente' | 'lateral' | 'planta', THREE.Vector3>> = {
  iso: new THREE.Vector3(0.8, -1.1, 0.7).normalize(),
  frente: new THREE.Vector3(0, -1, 0),
  lateral: new THREE.Vector3(1, 0, 0),
  planta: new THREE.Vector3(0, 0, 1),
};

/** Eixo Y unitário: o disco do marcador (cilindro do three) aponta para ele e é girado para a normal da face. */
const EIXO_Y = new THREE.Vector3(0, 1, 0);

export class VisualizadorFamilia {
  private readonly canvas: HTMLCanvasElement;
  private readonly materiais: Readonly<Record<string, string>>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cena = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
  private readonly controles: OrbitControls;
  private readonly raiz = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly geoDisco = new THREE.CylinderGeometry(1, 1, 1, 24);
  private readonly geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  private readonly matMarcador = new THREE.MeshBasicMaterial({
    color: 0x222222,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly ouvintes = new Set<(indice: number | null) => void>();
  private readonly indiceDoObjeto = new WeakMap<THREE.Object3D, number>();
  private visuais: PecaNaCena[] = [];
  private pecas: readonly PecaResolvida[] = [];
  private esfera: { centro: [number, number, number]; raio: number } = { centro: [0, 0, 0], raio: 1 };
  private selecionada: number | null = null;
  private fatorExplosao = 0;
  private opacidade = 1;
  private detalhe: NivelDetalhe3d = 'fino';
  private portas = true;
  private inicioToque: { x: number; y: number } | null = null;
  private quadro: number | null = null;
  private enquadrou = false;
  private destruido = false;

  /** Cria renderer (antialias, fundo transparente), cena, câmera em perspectiva (fov 40°), luzes (hemisférica + direcional) e controles de órbita. Não inicia o laço de desenho sozinho: desenha sob demanda (`requestAnimationFrame` só quando algo muda). */
  constructor(canvas: HTMLCanvasElement, opcoes: OpcoesVisualizador = {}) {
    this.canvas = canvas;
    this.materiais = opcoes.materiais ?? {};
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    const pixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);

    this.camera.up.set(0, 0, 1);
    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = false;
    this.controles.addEventListener('change', this.aoMudarControles);

    const hemisferica = new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 2.2);
    const direcional = new THREE.DirectionalLight(0xffffff, 2.4);
    direcional.position.set(3, -4, 6);
    this.cena.add(hemisferica, direcional, this.raiz);

    canvas.addEventListener('pointerdown', this.aoPointerDown);
    canvas.addEventListener('pointerup', this.aoPointerUp);
    canvas.addEventListener('pointercancel', this.aoPointerCancel);

    this.redimensionar(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1);
    this.agendarDesenho();
  }

  /** Recria as malhas (uma `Mesh` por peça para poder realçar e explodir; vazias em azul translúcido). Mantém a câmera e a seleção quando possível. */
  definirPecas(pecas: readonly PecaResolvida[]): void {
    if (this.destruido) return;
    const selecionadaAnterior = this.selecionada;
    this.limparPecas();
    this.pecas = [...pecas];
    this.esfera = esferaDeEnquadramento(this.pecas);
    const { solidas, vazios } = malhaDasPecas(this.pecas);
    this.pecas.forEach((peca, indice) => {
      const geometria = geometriaDaMalha(malhaDaPeca(peca.vazio ? vazios : solidas, indice));
      const material = this.criarMaterial(peca);
      const mesh = new THREE.Mesh(geometria, material);
      mesh.name = `${peca.nome} #${peca.indice}`;
      mesh.position.fromArray(deslocamentoDeExplosao(peca, this.fatorExplosao, this.esfera.centro));
      mesh.visible = pecaVisivel(peca, this.detalhe, this.portas);
      this.indiceDoObjeto.set(mesh, indice);
      const materialArestas = new THREE.LineBasicMaterial({ color: 0x0078d4 });
      const arestas = new THREE.LineSegments(new THREE.EdgesGeometry(geometria), materialArestas);
      arestas.visible = false;
      mesh.add(arestas);
      const marcadores = this.montarMarcadores(peca);
      for (const marcador of marcadores) mesh.add(marcador);
      this.raiz.add(mesh);
      this.visuais.push({ peca, mesh, material, geometria, arestas, materialArestas, marcadores });
    });
    this.selecionada = selecionadaAnterior !== null && selecionadaAnterior < this.visuais.length ? selecionadaAnterior : null;
    this.aplicarSelecao();
    if (!this.enquadrou && this.visuais.length > 0) {
      this.enquadrou = true;
      this.vista('iso');
    }
    this.agendarDesenho();
  }

  /** Realça a peça de índice `indice` da lista passada a `definirPecas` (arestas azuis e brilho); `null` limpa. */
  selecionar(indice: number | null): void {
    if (this.destruido) return;
    this.selecionada = indice !== null && indice >= 0 && indice < this.visuais.length ? indice : null;
    this.aplicarSelecao();
    this.agendarDesenho();
  }

  /** `cb` recebe o índice da peça clicada (clique sem arrasto) ou `null` ao clicar no vazio. Devolve a função que cancela. */
  aoSelecionar(cb: (indice: number | null) => void): () => void {
    this.ouvintes.add(cb);
    return () => {
      this.ouvintes.delete(cb);
    };
  }

  definirExplodir(fator: number): void {
    if (this.destruido) return;
    this.fatorExplosao = fator;
    for (const visual of this.visuais) {
      visual.mesh.position.fromArray(deslocamentoDeExplosao(visual.peca, this.fatorExplosao, this.esfera.centro));
    }
    this.agendarDesenho();
  }

  /** Opacidade 0.1..1 das peças sólidas (1 = opaco). */
  definirOpacidade(opacidade: number): void {
    if (this.destruido) return;
    const valor = Number.isFinite(opacidade) ? opacidade : 1;
    this.opacidade = Math.max(0.1, Math.min(1, valor));
    for (const visual of this.visuais) {
      if (visual.peca.vazio) continue;
      visual.material.opacity = this.opacidade;
      visual.material.transparent = this.opacidade < 1;
      visual.material.depthWrite = this.opacidade >= 1;
      visual.material.needsUpdate = true;
    }
    this.agendarDesenho();
  }

  definirDetalhe(detalhe: NivelDetalhe3d, portas: boolean): void {
    if (this.destruido) return;
    this.detalhe = detalhe;
    this.portas = portas;
    for (const visual of this.visuais) visual.mesh.visible = pecaVisivel(visual.peca, detalhe, portas);
    this.aplicarSelecao();
    this.agendarDesenho();
  }

  definirCorte(corte: CortePlano): void {
    if (this.destruido) return;
    this.renderer.localClippingEnabled = true;
    if (!corte.ativo) {
      this.renderer.clippingPlanes = [];
    } else {
      const normal = new THREE.Vector3(corte.eixo === 'x' ? -1 : 0, corte.eixo === 'y' ? -1 : 0, corte.eixo === 'z' ? -1 : 0);
      this.renderer.clippingPlanes = [new THREE.Plane(normal, corte.posicao)];
    }
    this.agendarDesenho();
  }

  /** Vistas rápidas: 'iso' (3/4 frontal), 'frente', 'lateral', 'planta'. Enquadra a esfera das peças. */
  vista(nome: 'iso' | 'frente' | 'lateral' | 'planta'): void {
    if (this.destruido) return;
    const [x, y, z] = this.esfera.centro;
    const centro = new THREE.Vector3(x, y, z);
    const direcao = DIRECOES_DE_VISTA[nome];
    const distancia = distanciaDeEnquadramento(this.esfera.raio, this.camera.fov, this.camera.aspect);
    this.camera.up.set(0, nome === 'planta' ? 1 : 0, nome === 'planta' ? 0 : 1);
    this.camera.position.copy(centro).addScaledVector(direcao, distancia);
    this.camera.lookAt(centro);
    this.camera.updateMatrixWorld();
    this.controles.target.copy(centro);
    this.controles.update();
    this.agendarDesenho();
  }

  redimensionar(largura: number, altura: number): void {
    if (this.destruido) return;
    const l = Math.max(1, Math.floor(largura));
    const a = Math.max(1, Math.floor(altura));
    this.renderer.setSize(l, a);
    this.camera.aspect = l / a;
    this.camera.updateProjectionMatrix();
    this.agendarDesenho();
  }

  /** Libera geometrias, materiais, controles, listeners e o renderer. Idempotente. */
  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    if (this.quadro !== null) {
      cancelAnimationFrame(this.quadro);
      this.quadro = null;
    }
    this.canvas.removeEventListener('pointerdown', this.aoPointerDown);
    this.canvas.removeEventListener('pointerup', this.aoPointerUp);
    this.canvas.removeEventListener('pointercancel', this.aoPointerCancel);
    this.controles.removeEventListener('change', this.aoMudarControles);
    this.controles.dispose();
    this.limparPecas();
    this.geoDisco.dispose();
    this.geoCaixa.dispose();
    this.matMarcador.dispose();
    this.ouvintes.clear();
    this.cena.clear();
    this.renderer.dispose();
  }

  /** Constrói os meshes-filho dos marcadores de usinagem da peça (geometrias e material compartilhados; `limparPecas` não libera os compartilhados). */
  private montarMarcadores(peca: PecaResolvida): THREE.Mesh[] {
    const criados: THREE.Mesh[] = [];
    for (const m of marcadoresDaPeca(peca)) {
      const mesh = new THREE.Mesh(m.forma === 'disco' ? this.geoDisco : this.geoCaixa, this.matMarcador);
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

  /** Material da peça: cor de `corDaPeca`, chapado; vazias translúcidas e sem escrever profundidade. */
  private criarMaterial(peca: PecaResolvida): THREE.MeshStandardMaterial {
    const vazio = peca.vazio;
    const opacidade = vazio ? 0.35 : this.opacidade;
    return new THREE.MeshStandardMaterial({
      color: corDaPeca(peca, this.materiais),
      flatShading: true,
      metalness: 0.02,
      roughness: 0.72,
      side: THREE.DoubleSide,
      transparent: vazio || opacidade < 1,
      opacity: opacidade,
      depthWrite: !vazio,
    });
  }

  /** Remove da cena e libera todas as peças montadas. */
  private limparPecas(): void {
    for (const visual of this.visuais) {
      this.raiz.remove(visual.mesh);
      visual.arestas.geometry.dispose();
      visual.materialArestas.dispose();
      visual.geometria.dispose();
      visual.material.dispose();
    }
    this.visuais = [];
    this.pecas = [];
  }

  /** Liga/desliga as arestas azuis e o brilho conforme a peça selecionada; marcadores somem no detalhe grosso (menos na selecionada). */
  private aplicarSelecao(): void {
    this.visuais.forEach((visual, indice) => {
      const ativa = indice === this.selecionada;
      visual.arestas.visible = ativa && visual.mesh.visible;
      visual.material.emissive.setHex(ativa ? 0x0e2a4a : 0x000000);
      visual.material.emissiveIntensity = ativa ? 0.5 : 0;
      for (const marcador of visual.marcadores) marcador.visible = marcadoresVisiveis(this.detalhe, ativa);
    });
  }

  /** Índice da peça visível sob o pixel (CSS), ou null. */
  private pecaSob(clientX: number, clientY: number): number | null {
    const retangulo = this.canvas.getBoundingClientRect();
    if (retangulo.width <= 0 || retangulo.height <= 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - retangulo.left) / retangulo.width) * 2 - 1,
      -((clientY - retangulo.top) / retangulo.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const alvos = this.visuais.filter((visual) => visual.mesh.visible).map((visual) => visual.mesh);
    const primeiro = this.raycaster.intersectObjects(alvos, false)[0];
    if (!primeiro) return null;
    return this.indiceDoObjeto.get(primeiro.object) ?? null;
  }

  private agendarDesenho(): void {
    if (this.destruido || this.quadro !== null) return;
    this.quadro = requestAnimationFrame(() => {
      this.quadro = null;
      if (this.destruido) return;
      this.renderer.render(this.cena, this.camera);
    });
  }

  private readonly aoMudarControles = (): void => {
    this.agendarDesenho();
  };

  private readonly aoPointerDown = (evento: PointerEvent): void => {
    this.inicioToque = { x: evento.clientX, y: evento.clientY };
  };

  private readonly aoPointerUp = (evento: PointerEvent): void => {
    const inicio = this.inicioToque;
    this.inicioToque = null;
    if (this.destruido || inicio === null || evento.button !== 0) return;
    if (Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > 4) return;
    const indice = this.pecaSob(evento.clientX, evento.clientY);
    this.selecionar(indice);
    for (const cb of Array.from(this.ouvintes)) cb(indice);
  };

  private readonly aoPointerCancel = (): void => {
    this.inicioToque = null;
  };
}
