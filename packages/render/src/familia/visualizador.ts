import { malhaDasPecas, type CorpoResolvido, type LigacaoResolvida, type PecaResolvida } from '@hestia/engine';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  deslocamentoDeExplosao,
  distanciaDeEnquadramento,
  esferaDeEnquadramento,
  geometriaDaMalha,
  pecaVisivel,
  type NivelDetalhe3d,
} from './logica.ts';
import { CorposNaCena } from './visualizadorCorpos.ts';
import { LigacoesNaCena } from './visualizadorLigacoes.ts';
import { marcadoresVisiveis } from './usinagensMarcadores.ts';
import type {
  CliqueFace3D,
  CliqueVao3D,
  HoverVao3D,
  ModoInteracao3DFamilia,
  VaoResolvido,
} from './tiposVisualizador.ts';
import { VaosOverlay } from './vaosOverlay.ts';

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

import { DIRECOES_DE_VISTA, criarMaterialPeca, malhaDaPeca, montarMarcadoresPeca, type PecaNaCena } from './visualizadorPecas.ts';

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
  private readonly ouvintesPassarVao = new Set<(hover: HoverVao3D | null) => void>();
  private readonly ouvintesClicarVao = new Set<(clique: CliqueVao3D) => void>();
  private readonly ouvintesClicarFace = new Set<(clique: CliqueFace3D) => void>();
  private readonly indiceDoObjeto = new WeakMap<THREE.Object3D, number>();
  private readonly vaosOverlay = new VaosOverlay();
  private readonly corposCena = new CorposNaCena();
  private readonly ligacoesCena = new LigacoesNaCena();
  private visuais: PecaNaCena[] = [];
  private pecas: readonly PecaResolvida[] = [];
  private esfera: { centro: [number, number, number]; raio: number } = { centro: [0, 0, 0], raio: 1 };
  private selecionada: number | null = null;
  private modoInteracao: ModoInteracao3DFamilia = 'selecionar';
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
    this.raiz.add(this.vaosOverlay.grupo, this.corposCena.grupo, this.ligacoesCena.grupo);
    this.cena.add(hemisferica, direcional, this.raiz);

    canvas.addEventListener('pointerdown', this.aoPointerDown);
    canvas.addEventListener('pointermove', this.aoPointerMove);
    canvas.addEventListener('pointerleave', this.aoPointerLeave);
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
    this.esfera = this.esferaAtual();
    const { solidas, vazios } = malhaDasPecas(this.pecas);
    this.pecas.forEach((peca, indice) => {
      const geometria = geometriaDaMalha(malhaDaPeca(peca.vazio ? vazios : solidas, indice));
      const material = criarMaterialPeca(peca, this.materiais, this.opacidade);
      const mesh = new THREE.Mesh(geometria, material);
      mesh.name = `${peca.nome} #${peca.indice}`;
      mesh.position.fromArray(deslocamentoDeExplosao(peca, this.fatorExplosao, this.esfera.centro));
      mesh.visible = pecaVisivel(peca, this.detalhe, this.portas);
      this.indiceDoObjeto.set(mesh, indice);
      const materialArestas = new THREE.LineBasicMaterial({ color: 0x0078d4 });
      const arestas = new THREE.LineSegments(new THREE.EdgesGeometry(geometria), materialArestas);
      arestas.visible = false;
      mesh.add(arestas);
      const marcadores = montarMarcadoresPeca(peca, this.geoDisco, this.geoCaixa, this.matMarcador);
      for (const marcador of marcadores) mesh.add(marcador);
      this.raiz.add(mesh);
      this.visuais.push({ peca, mesh, material, geometria, arestas, materialArestas, marcadores });
    });
    this.vaosOverlay.definirPecasLimites(this.pecas);
    this.selecionada = selecionadaAnterior !== null && selecionadaAnterior < this.visuais.length ? selecionadaAnterior : null;
    this.aplicarSelecao();
    if (!this.enquadrou && this.visuais.length > 0) {
      this.enquadrou = true;
      this.vista('iso');
    }
    this.agendarDesenho();
  }

  /** Malhas dos corpos (ficha B2): sólidos em cor do material, vazios em azul translúcido. Lista vazia limpa. Não mexe na câmera de peças. */
  definirCorpos(corpos: readonly CorpoResolvido[]): void {
    if (this.destruido) return;
    this.corposCena.definir(corpos, this.materiais, this.opacidade, this.detalhe);
    this.esfera = this.esferaAtual();
    if (!this.enquadrou && (this.visuais.length > 0 || this.corposCena.temMalha())) {
      this.enquadrou = true;
      this.vista('iso');
    }
    this.agendarDesenho();
  }

  /** Marcadores das ligações (ficha C2b): disco na seção e seta na direção, na cor do domínio; a selecionada fica realçada. Lista vazia limpa. */
  definirLigacoes(ligacoes: readonly LigacaoResolvida[], selecionada: string | null): void {
    if (this.destruido) return;
    this.ligacoesCena.definir(ligacoes, selecionada);
    this.agendarDesenho();
  }

  /** Esfera de enquadramento: das peças quando há peças; sem peças, dos corpos (se houver). */
  private esferaAtual(): { centro: [number, number, number]; raio: number } {
    if (this.pecas.length > 0) return esferaDeEnquadramento(this.pecas);
    return this.corposCena.esfera() ?? esferaDeEnquadramento(this.pecas);
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

  /** Define os vãos resolvidos da caixaria para picking, destaque e chapa fantasma no 3D. */
  definirVaos(vaos: readonly VaoResolvido[]): void {
    if (this.destruido) return;
    const estavaEmHover = this.vaosOverlay.obterHoverVaoAtual() !== null;
    this.vaosOverlay.definirVaos(vaos);
    if (estavaEmHover && this.vaosOverlay.obterHoverVaoAtual() === null) {
      this.notificarPassarVao(null);
    }
    this.agendarDesenho();
  }

  /** Define o modo de interação 3D (seleção, inserção em vãos ou faces externas) e a espessura padrão (mm) para a chapa fantasma. */
  definirModoInteracao(modo: ModoInteracao3DFamilia, espessuraPadraoMm = 18): void {
    if (this.destruido) return;
    const estavaEmHover = this.vaosOverlay.obterHoverVaoAtual() !== null;
    this.modoInteracao = modo;
    this.vaosOverlay.definirModo(modo, espessuraPadraoMm);
    if (estavaEmHover && this.vaosOverlay.obterHoverVaoAtual() === null) {
      this.notificarPassarVao(null);
    }
    this.agendarDesenho();
  }

  /** Define se `porta` no 3D aplica no módulo inteiro (cobrindo divisórias) ou só no sub-vão clicado. */
  definirAlvoPorta(alvo: 'inteiro' | 'vao'): void {
    if (this.destruido) return;
    this.vaosOverlay.definirAlvoPorta(alvo);
  }

  /** Realça o vão com `vaoId` (ou limpa o destaque quando `null`). */
  selecionarVao(vaoId: string | null): void {
    if (this.destruido) return;
    this.vaosOverlay.selecionarVao(vaoId);
    this.agendarDesenho();
  }

  /** Registra ouvinte de hover sobre vãos no 3D. Devolve a função que cancela. */
  aoPassarVao(cb: (hover: HoverVao3D | null) => void): () => void {
    this.ouvintesPassarVao.add(cb);
    return () => {
      this.ouvintesPassarVao.delete(cb);
    };
  }

  /** Registra ouvinte de clique em vão no 3D (clique sem arrasto). Devolve a função que cancela. */
  aoClicarVao(cb: (clique: CliqueVao3D) => void): () => void {
    this.ouvintesClicarVao.add(cb);
    return () => {
      this.ouvintesClicarVao.delete(cb);
    };
  }

  /** Registra ouvinte de clique em face externa (modos tampo, tamponamento e recorte). Devolve a função que cancela. */
  aoClicarFaceExterna(cb: (clique: CliqueFace3D) => void): () => void {
    this.ouvintesClicarFace.add(cb);
    return () => {
      this.ouvintesClicarFace.delete(cb);
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
    this.corposCena.definirOpacidade(this.opacidade);
    this.agendarDesenho();
  }

  definirDetalhe(detalhe: NivelDetalhe3d, portas: boolean): void {
    if (this.destruido) return;
    this.detalhe = detalhe;
    this.portas = portas;
    for (const visual of this.visuais) visual.mesh.visible = pecaVisivel(visual.peca, detalhe, portas);
    this.corposCena.definirDetalhe(detalhe);
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
    this.canvas.removeEventListener('pointermove', this.aoPointerMove);
    this.canvas.removeEventListener('pointerleave', this.aoPointerLeave);
    this.canvas.removeEventListener('pointerup', this.aoPointerUp);
    this.canvas.removeEventListener('pointercancel', this.aoPointerCancel);
    this.controles.removeEventListener('change', this.aoMudarControles);
    this.controles.dispose();
    this.limparPecas();
    this.corposCena.destruir();
    this.ligacoesCena.destruir();
    this.vaosOverlay.destruir();
    this.raiz.remove(this.vaosOverlay.grupo);
    this.geoDisco.dispose();
    this.geoCaixa.dispose();
    this.matMarcador.dispose();
    this.ouvintes.clear();
    this.ouvintesPassarVao.clear();
    this.ouvintesClicarVao.clear();
    this.ouvintesClicarFace.clear();
    this.cena.clear();
    this.renderer.dispose();
  }


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

  /** Prepara o raycaster a partir da posição do ponteiro em coordenadas CSS; devolve falso se o canvas não tem área. */
  private prepararRaycaster(clientX: number, clientY: number): boolean {
    const retangulo = this.canvas.getBoundingClientRect();
    if (retangulo.width <= 0 || retangulo.height <= 0) return false;
    const ndc = new THREE.Vector2(
      ((clientX - retangulo.left) / retangulo.width) * 2 - 1,
      -((clientY - retangulo.top) / retangulo.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return true;
  }

  /** Índice da peça visível sob o pixel (CSS), ou null. */
  private pecaSob(clientX: number, clientY: number): number | null {
    if (!this.prepararRaycaster(clientX, clientY)) return null;
    const alvos = this.visuais.filter((visual) => visual.mesh.visible).map((visual) => visual.mesh);
    const primeiro = this.raycaster.intersectObjects(alvos, false)[0];
    if (!primeiro) return null;
    return this.indiceDoObjeto.get(primeiro.object) ?? null;
  }

  private notificarPassarVao(hover: HoverVao3D | null): void {
    for (const cb of Array.from(this.ouvintesPassarVao)) cb(hover);
  }

  private notificarClicarVao(clique: CliqueVao3D): void {
    for (const cb of Array.from(this.ouvintesClicarVao)) cb(clique);
  }

  private notificarClicarFace(clique: CliqueFace3D): void {
    for (const cb of Array.from(this.ouvintesClicarFace)) cb(clique);
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

  private readonly aoPointerMove = (evento: PointerEvent): void => {
    if (this.destruido || evento.buttons !== 0) return;
    if (!this.prepararRaycaster(evento.clientX, evento.clientY)) return;
    const bloqueadoPorPeca = this.modoInteracao === 'selecionar' && this.pecaSob(evento.clientX, evento.clientY) !== null;
    const resultado = this.vaosOverlay.atualizarHover(
      this.raycaster,
      evento.clientX,
      evento.clientY,
      bloqueadoPorPeca,
    );
    if (resultado.mudouHoverVao) this.notificarPassarVao(resultado.hoverVao);
    if (resultado.mudouVisual) this.agendarDesenho();
  };

  private readonly aoPointerLeave = (): void => {
    if (this.destruido) return;
    const { mudouHoverVao, mudouVisual } = this.vaosOverlay.limparHover();
    if (mudouHoverVao) this.notificarPassarVao(null);
    if (mudouVisual) this.agendarDesenho();
  };

  private readonly aoPointerUp = (evento: PointerEvent): void => {
    const inicio = this.inicioToque;
    this.inicioToque = null;
    if (this.destruido || inicio === null || evento.button !== 0) return;
    if (Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > 4) return;

    if (this.modoInteracao === 'tampo' || this.modoInteracao === 'tamponamento' || this.modoInteracao === 'recorte') {
      if (!this.prepararRaycaster(evento.clientX, evento.clientY)) return;
      let face = this.vaosOverlay.clicarFaceExterna(this.raycaster);
      if (face === null) {
        const indice = this.pecaSob(evento.clientX, evento.clientY);
        const peca = indice === null ? undefined : this.pecas[indice];
        if (peca !== undefined && (peca.papel === 'tampo' || peca.papel === 'topo')) {
          face = 'topo';
        }
      }
      if (face !== null) {
        this.notificarClicarFace({ face, clientX: evento.clientX, clientY: evento.clientY });
      }
      return;
    }

    if (this.modoInteracao === 'selecionar') {
      const indice = this.pecaSob(evento.clientX, evento.clientY);
      this.selecionar(indice);
      for (const cb of Array.from(this.ouvintes)) cb(indice);
      if (indice === null && this.prepararRaycaster(evento.clientX, evento.clientY)) {
        const clique = this.vaosOverlay.clicarVao(this.raycaster, evento.clientX, evento.clientY);
        this.selecionarVao(clique?.vaoId ?? null);
        if (clique !== null) this.notificarClicarVao(clique);
      } else {
        this.selecionarVao(null);
      }
      return;
    }

    if (!this.prepararRaycaster(evento.clientX, evento.clientY)) return;
    const clique = this.vaosOverlay.clicarVao(this.raycaster, evento.clientX, evento.clientY);
    if (clique !== null) {
      this.selecionarVao(clique.vaoId);
      this.notificarClicarVao(clique);
    }
  };

  private readonly aoPointerCancel = (): void => {
    this.inicioToque = null;
  };
}
