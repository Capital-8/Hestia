/* eslint-disable max-lines -- a cena 3D reúne o port GPU (faixas/sombras) e o alizar/esquadrias do plano; extrair depois. */
import * as THREE from 'three';
import { applyPartialStructure, frameOfWall, resolveCeilings, junctionLevel, resolveFloors, resolveRamps, resolveRoofs, resolveSlabs, resolveStairs, stairArrivalTop, type ResolvedLevel } from '@hestia/engine';
import { openingsOfWall, view3dOf, wallBaseElevation, wallHeight, wallsOnLevel, type GraphicsCategory, type Id, type Material, type Opening, type Project, type View3DSettings, type VisualStyle } from '@hestia/model';
import { DARK, LIGHT } from '../plan/types.ts';
import { AVISO } from '../aviso.ts';
import { projetoDaJuncao } from '../plan/viewContext.ts';
import { OrbitCamera, cameraBasis } from './orbit.ts';
import { firstSurfaceDistance } from './pick3d.ts';
import { caixasEPrismasDaAbertura, montarAbertura } from './aberturas3d.ts';
import { arestasDaSilhuetaDeCaixas } from './silhuetaCaixas3d.ts';
import { arestasDosLotes, geometriaDoLote, juntarLotes, loteDeGeometria } from './lotesMalha3d.ts';
import { SombrasDaCena, SOMBRA_MAX_TRIANGULOS, prepararSombraDoQuadro, type FaixaDeSombra } from './sombras3d.ts';
import { LotesPorFaixa, type Faixa3D } from './faixas3d.ts';
import { BITS_PROFUNDIDADE, diagnosticarOrigem, diagnosticarProfundidade, type DiagnosticoOrigem, type DiagnosticoProfundidade } from './precisao3d.ts';
import { buildEaveSolids } from './eaveSolids.ts';
import { buildStairSolids } from './stairSolids.ts';
import { buildGenericSolids } from './genericSolids.ts';
import { buildCadLines } from './cad3d.ts';
import { buildLevels, disposeLevels, layoutLevels } from './levels3d.ts';
import { LEVEL_LINE_OFFSET, levelProjectBox } from './levelsData.ts';
import { buildRampSolids } from './rampSolids.ts';
import { RealcesDaCena } from './realceDaCena3d.ts';
import { buildLevelSolidsComCaixas } from './paredesInstanciadas3d.ts';
import { CaixasDoNivel } from './caixasDoNivel3d.ts';
import { arestasDasCaixas, criarCaixaUnitaria } from './caixas3d.ts';
import { buildCeilingSolids, buildFloorSolids, buildLevelSolids, buildRoofSolids, buildSlabSolids, filtrarParedesDoNivel, type ElementRange, type SolidBatch } from './solids.ts';
import { Materiais3D } from './materiais3d.ts';
import { CacheMalhas, bytesDeNivel, disposeNivel, type EntradaNivel, type PickSource } from './cacheMalhas3d.ts';
import { chavesDeNivel } from './chaveNivel3d.ts';
import { caixaDaSelecao } from './selecao3d.ts';

/** O mínimo do renderer que o gancho de quadro da cena lê (o three chama `scene.onBeforeRender` com o renderer real). */
export interface RendererDeQuadro {
  shadowMap: { autoUpdate: boolean; needsUpdate: boolean; enabled?: boolean };
  /** Tamanho da área de desenho em px CSS (o three fornece; sem ele a sombra fica no tamanho configurado). */
  getSize?(alvo: THREE.Vector2): THREE.Vector2;
}

/** Geometria do modelo em coordenadas de mundo, para a etapa "papel" da prancha (decisão 0040). */
export interface VetoresDaCena {
  /** Triângulos de face: 9 números por triângulo (x, y, z de cada vértice). */
  trianglePositions: Float32Array;
  /** Índices dos triângulos (3 por triângulo); hoje é a sequência 0,1,2…, mas o BVH usa a forma indexada. */
  triangleIndices: Uint32Array;
  /** Arestas: 6 números por segmento (dois pontos). */
  edges: Float32Array;
  /** Caixa do modelo (sem datum, chão ou grade). */
  box: THREE.Box3;
}

/**
 * Opções herdadas. A vista 3D lê arestas e sombras de `view3dOf(p)` (decisão 0015 §2.2): `edges` e `shadows` são
 * ignorados e ficam só por compatibilidade. `dark` vem do tema.
 */
export interface Scene3DOptions {
  edges: boolean;
  shadows: boolean;
  dark: boolean;
  /** Elementos ocultos na vista 3D (Hide in View + temporário). */
  hidden?: ReadonlySet<Id>;
  /** Elementos que o modo Reveal mostra com borda azul. */
  revealed?: ReadonlySet<Id>;
}

/** Ângulo (graus) acima do qual uma aresta da malha é desenhada. */
const EDGE_ANGLE = 28;
/**
 * Margem (m) em X somada à caixa do datum no "Enquadrar": a bolha e o texto do nível ficam além da obra e não podem
 * sair da vista. Vale para os dois lados (o texto cresce para a esquerda da bolha).
 */
const MARGEM_ENQUADRAMENTO_NIVEIS = 6;
/** Fundo do tema, quando `view3d.background` é null. */
const BACKGROUND = { light: '#dfe7ee', dark: '#14171b' };
/** Distância da luz em raios do modelo: |(0,7; −0,5; 1,1)|, a posição do sol antes da vista 3D configurável. */
const SUN_DISTANCE = Math.hypot(0.7, 0.5, 1.1);
/** Cor das bordas do modo Reveal (elementos ocultos reexibidos como contorno, sem preenchimento). */
const REVEAL_COLOR = 0x2563eb;
/** Conjunto de visibilidade vazio (o caso padrão: nada oculto nem revelado). */
const NADA: ReadonlySet<Id> = new Set();

/** Direção unitária do sol, de alvo para luz: azimute em graus (0 = leste, anti-horário) e elevação acima do horizonte. */
export function sunDirection(azimuth: number, elevation: number): THREE.Vector3 {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
}

/** Estilos de linhas: sempre mostram as arestas, com ou sem faces. */
const isLineStyle = (s: VisualStyle): boolean => s === 'hiddenLine' || s === 'wireframe';

/**
 * Projeto com os elementos aceitos. Só os construtores que leem `p.elements` por conta própria (genéricos e CAD) o
 * precisam: os demais recebem as listas resolvidas já filtradas por id (ver `montarNivel`).
 */
function projetoComElementos(p: Project, incluir: (id: Id) => boolean): Project {
  const elements: Project['elements'] = {};
  for (const [id, e] of Object.entries(p.elements)) if (incluir(id)) elements[id] = e;
  return { ...p, elements };
}

/** Estado de uma atualização: a vista 3D, o tema e as arestas e sombras efetivas desta vista. */
interface Frame3D {
  view: View3DSettings;
  dark: boolean;
  /** Arestas das malhas do modelo (paredes, pisos, lajes, telhados, escadas). Nas linhas, sempre. */
  edges: boolean;
  /** Sombras projetadas: só no estilo realista, com `view.shadows`. */
  shadows: boolean;
}

type Escadas = ReturnType<typeof resolveStairs>;
type Rampas = ReturnType<typeof resolveRamps>;

/** Cena 3D do modelo: paredes e pisos por camada com material, esquadrias, luz e chão. */
export class ModelScene {
  readonly scene = new THREE.Scene();
  readonly orbit = new OrbitCamera();
  private model = new THREE.Group();
  /** Sobreposições de realce, fora do modelo: não entram nas malhas do modelo nem no picking por faixas. */
  private realces = new RealcesDaCena(this.scene);
  private conjuntoDaSelecao: { ref: readonly Id[]; ids: Set<Id> } | null = null;
  /** Malhas só de picking no wireframe (fora do modelo; ver `buildPickLayer`). */
  private pickLayer = new THREE.Object3D();
  /** Linhas de nível e rótulos: um grupo só, fora dos níveis (o picking lê `userData.levelId` de cada peça). */
  private niveis3d = new THREE.Group();
  /** Grupo devolvido por `buildLevels` (o que `disposeLevels` libera); null quando a vista esconde os níveis. */
  private niveis: THREE.Group | null = null;
  /** Nível selecionado no 3D (o plano azul do datum); preservado quando o projeto é remontado. */
  private selectedLevel: Id | null = null;
  /** Assinatura do datum montado (ver `assinaturaDosNiveis`): igual = o datum continua válido, não refaz nada. */
  private niveisAssinatura: string | null = null;
  /** Caixa do "Enquadrar": modelo + datum dos níveis (com a margem do texto/bolha em X). */
  private caixaEnquadramento = new THREE.Box3();
  /** Peças de picking do nível que se monta agora (no wireframe a malha não entra na cena: vai para cá). */
  private picks: PickSource[] = [];
  private caixaUnitaria = criarCaixaUnitaria();
  /** Paredes retas e esquadrias como caixas instanciadas (padrão); falso: tudo como geometria, o caminho de referência. */
  private readonly instanciar: boolean;
  /** Lotes globais por categoria/material, divididos em faixas verticais de níveis (culling por frustum, Fase 2.3). */
  private lotes: LotesPorFaixa;
  /** Faixas que podem projetar sombra (o orçamento liga/desliga `castShadow` por faixa). */
  private faixasDeSombra: FaixaDeSombra[] = [];
  /** Direção do sol no mundo (do alvo para a luz), guardada para o enquadramento da câmera do sol. */
  private direcaoSol = new THREE.Vector3(0, 0, 1);
  /** Teto de triângulos do passe de sombra (ver `sombras3d.ts`). */
  readonly sombraMaxTriangulos: number;
  /** Projeto da atualização corrente (o gestor resolve os materiais por id). */
  private projeto: Project | null = null;
  /** Elementos ocultos (Hide in View + temporário) e revelados (Reveal) da atualização corrente. */
  private ocultos: ReadonlySet<Id> = NADA;
  private revelados: ReadonlySet<Id> = NADA;
  /** Projeto sem os elementos ocultos: genéricos e CAD não têm construtor por id (ver `montarNivel`). */
  private semOcultos: Project | null = null;
  /** Projeto só com os elementos revelados: os genéricos do Reveal saem daqui (idem). */
  private soRevelados: Project | null = null;
  /** Materiais por chave (ver `Materiais3D`). */
  private mats = new Materiais3D();
  /** Níveis que a cena mostra agora, e o cache de malhas por nível (ver `update`). */
  private cenaNiveis: EntradaNivel[] = [];
  private cache: CacheMalhas;
  private sequencia = 0;
  private frame: Frame3D = { view: view3dOf({}), dark: false, edges: false, shadows: false };
  private sun = new THREE.DirectionalLight(0xffffff, 2.1);
  private ground: THREE.Mesh;
  private grid: THREE.GridHelper;
  private boxCache = new THREE.Box3();
  /** Reuso do tamanho da tela no gancho de quadro (evita alocar por quadro). */
  private readonly tamanhoTela = new THREE.Vector2();
  /** Sombra sob demanda + orçamento e enquadramento do passe de sombra (ver `sombras3d.ts`). */
  readonly sombras = new SombrasDaCena();
  /** Sombra sob demanda (atalho do app: `sombra.aplicar(renderer)` antes de desenhar). */
  get sombra(): SombrasDaCena['sobDemanda'] {
    return this.sombras.sobDemanda;
  }

  /** Junção sobre os níveis que tocam a faixa de cada nível (`projetoDaJuncao`), como a planta. Falso: projeto inteiro (referência). */
  private readonly reduzirJuncao: boolean;

  /**
   * `tetoMalhasBytes`: teto do cache de malhas por nível (padrão `TETO_MALHAS_BYTES`). `reduzirJuncao` (padrão verdadeiro):
   * a junção de cada nível usa o conjunto reduzido da planta; falso usa o projeto inteiro (referência para testes).
   * `instanciar` (padrão verdadeiro): paredes retas e esquadrias viram caixas instanciadas; falso mantém a geometria de sempre.
   * `faixas`: níveis por faixa vertical (culling por frustum) e o teto de faixas; `sombraMaxTriangulos`: orçamento do passe
   * de sombra.
   */
  constructor(
    opcoes: {
      tetoMalhasBytes?: number;
      reduzirJuncao?: boolean;
      instanciar?: boolean;
      niveisPorFaixa?: number;
      faixasMax?: number;
      sombraMaxTriangulos?: number;
    } = {},
  ) {
    this.cache = new CacheMalhas(opcoes.tetoMalhasBytes);
    this.reduzirJuncao = opcoes.reduzirJuncao ?? true;
    this.instanciar = opcoes.instanciar ?? true;
    this.sombraMaxTriangulos = opcoes.sombraMaxTriangulos ?? SOMBRA_MAX_TRIANGULOS;
    this.lotes = new LotesPorFaixa({
      caixaUnitaria: this.caixaUnitaria,
      material: (categoria, materialId, extras) => this.mats.face(extras ?? this.projeto?.materials[materialId], categoria),
      materialArestas: () => this.mats.edge(),
      niveisPorFaixa: opcoes.niveisPorFaixa,
      faixasMax: opcoes.faixasMax,
    });
    // O zoom da órbita não atravessa as paredes do modelo (a cena fornece a primeira superfície sobre o eixo de visão).
    this.orbit.obstacle = (origin, dir) => firstSurfaceDistance(this.model, origin, dir);
    this.scene.add(this.model);
    this.scene.add(this.pickLayer);
    this.niveis3d.userData = { levels: true };
    this.scene.add(this.niveis3d);
    this.scene.add(this.realces.camada);
    // Gancho de quadro do three (antes da lista de desenho e antes do passe de sombra): é onde o orçamento de sombra e o
    // enquadramento do sol acontecem, com a câmera do quadro. Sem ele, a vista teria de chamar a cena a cada rAF.
    this.scene.onBeforeRender = (renderer) => this.antesDeDesenhar(renderer as unknown as RendererDeQuadro);
    const hemi = new THREE.HemisphereLight(0xf4f7fb, 0xb9b2a4, 1.25);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    this.sun.position.set(14, -10, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Chão só com sombra: sem cor, o que está abaixo do nível 0 fica visível; a grade continua.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22, transparent: true, depthWrite: false }),
    );
    this.ground.position.z = -0.03;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(100, 100, 0xb9b3a6, 0xcfcabd);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = -0.02;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.45;
    this.scene.add(this.grid);
  }

  /**
   * Desenha uma peça: a malha, quando o estilo tem faces, e as arestas, quando `edges`. A malha leva `userData.kind`
   * (categoria) e `userData.ranges` (faixas dos elementos, decisão 0016), que é o que o picking lê. No wireframe não há
   * faces na cena (decisão 0015): a geometria vai para a lista de picking, montada à parte no fim (`buildPickLayer`).
   */
  private draw(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: Material | undefined, cat: GraphicsCategory, edges: boolean, ranges: ElementRange[]): void {
    if (this.frame.view.style !== 'wireframe') {
      const mesh = new THREE.Mesh(geo, this.mats.face(m, cat));
      mesh.castShadow = this.frame.shadows;
      mesh.receiveShadow = this.frame.shadows;
      mesh.userData = { kind: cat, ranges };
      parent.add(mesh);
    } else this.picks.push({ geo, owner: parent, kind: cat, ranges });
    if (edges) parent.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, EDGE_ANGLE), this.mats.edge()));
  }

  /**
   * Malhas só de picking no wireframe: sem cor nem profundidade (não aparecem), na transformação do grupo de origem. Fora do
   * modelo (`pickLayer`), para o modelo continuar sem malhas nesse estilo. As peças vêm dos níveis da cena.
   */
  private buildPickLayer(): void {
    const fontes = this.cenaNiveis.flatMap((e) => e.picks);
    if (!fontes.length) return;
    this.model.updateMatrixWorld(true);
    const pick = this.mats.cached('pick', () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    for (const s of fontes) {
      const mesh = new THREE.Mesh(s.geo, pick);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(s.owner.matrixWorld);
      mesh.userData = { kind: s.kind, ranges: s.ranges };
      this.pickLayer.add(mesh);
    }
  }

  /** Tira da cena o modelo e as malhas de picking. Não libera nada: as geometrias são dos níveis (ver `update`). */
  private detach(): void {
    this.model.clear();
    this.pickLayer.clear();
  }

  /**
   * Realce na vista 3D (decisão 0016 §4): a seleção (preenchimento 0,35, arestas firmes) e o elemento sob o cursor
   * (0,15, se não for da seleção). Só refaz a sobreposição que mudou; a malha do modelo não é reconstruída.
   * `aviso` (decisão 0044) é a parede em conflito, em amarelo, por cima dos dois.
   */
  highlight(selection: readonly Id[], hover: Id | null, aviso: readonly Id[] = []): void {
    const color = this.frame.dark ? DARK.select : LIGHT.select;
    this.realces.definir('sel', selection, { color, fill: 0.35, edges: 1 });
    this.realces.definir('hov', hover && !this.naSelecao(selection, hover) ? [hover] : [], { color, fill: 0.15, edges: 0.6 });
    this.realces.definir('aviso', aviso, { color: AVISO, fill: 0.4, edges: 1 });
  }

  /** `selection` tem `id`? Com seleção grande o conjunto é montado uma vez por referência do array, não a cada quadro. */
  private naSelecao(selection: readonly Id[], id: Id): boolean {
    if (selection.length <= 8) return selection.includes(id);
    if (this.conjuntoDaSelecao?.ref !== selection) this.conjuntoDaSelecao = { ref: selection, ids: new Set(selection) };
    return this.conjuntoDaSelecao.ids.has(id);
  }

  /**
   * Atualiza a cena. Cada nível tem a malha montada com a chave do seu conteúdo (ver `chaveNivel3d.ts`): nível com a mesma
   * chave é reaproveitado; o que mudou (o nível editado e os vizinhos por cota, pois a chave deles entra na dele) é montado
   * de novo. O cache guarda as malhas até o teto de bytes (LRU, `cacheMalhas3d.ts`); o que sai da cena e não está no
   * cache é liberado.
   */
  update(p: Project, levels: ResolvedLevel[], opt: Scene3DOptions): void {
    const view = view3dOf(p);
    this.frame = {
      view,
      dark: opt.dark,
      edges: isLineStyle(view.style) || view.edges,
      shadows: view.style === 'realistic' && view.shadows,
    };
    this.mats.marco = { view, dark: opt.dark };
    this.mats.used = new Set();
    this.sombra.marcar();
    // O realce guarda cópias dos triângulos: com o modelo refeito, refaz-se (a seleção e o cursor são lidos de novo).
    this.realces.soltarTodos();
    // Hide in View/Reveal: guardados para `montarNivel` (o filtro por id acontece antes dos builders) e na chave do nível.
    this.ocultos = opt.hidden ?? NADA;
    this.revelados = opt.revealed ?? NADA;
    this.semOcultos = this.ocultos.size ? projetoComElementos(p, (id) => !this.ocultos.has(id)) : p;
    this.soRevelados = this.revelados.size ? projetoComElementos(p, (id) => this.revelados.has(id) && !this.ocultos.has(id)) : p;
    const chaves = chavesDeNivel(
      p,
      JSON.stringify([
        opt.dark,
        this.frame.edges,
        this.frame.shadows,
        view.style,
      ]),
      // A visibilidade entra só na chave do nível que contém o elemento (e na dos vizinhos): ocultar uma parede não remonta o resto.
      { ocultos: this.ocultos, revelados: this.revelados },
    );
    const antes = this.cenaNiveis;
    const atuais: EntradaNivel[] = [];
    const sobras: EntradaNivel[] = [];
    let escadas: Escadas | null = null;
    let rampas: Rampas | null = null;
    for (const lv of levels) {
      const chave = chaves.get(lv.levelId) ?? `sem-chave:${++this.sequencia}`;
      const reuso = this.cache.buscar(lv.levelId, chave);
      if (reuso) {
        for (const k of reuso.mats) this.mats.used.add(k);
        atuais.push(reuso);
        continue;
      }
      escadas ??= resolveStairs(p);
      rampas ??= resolveRamps(p);
      const nova = this.montarNivel(p, lv, chave, escadas, rampas);
      const velha = this.cache.guardar(nova);
      if (velha) sobras.push(velha);
      atuais.push(nova);
    }
    const expulsas = this.cache.enforcar();
    this.projeto = p;
    this.detach();
    this.cenaNiveis = atuais;
    for (const e of atuais) this.model.add(e.grupo);
    if (this.instanciar) {
      const wireframe = view.style === 'wireframe';
      const res = this.lotes.atualizar(
        atuais,
        { instanciar: !wireframe, arestas: this.frame.edges, sombras: this.frame.shadows },
        levels.length === p.levels.length,
      );
      if (wireframe) {
        for (const m of res.solidas) {
          m.visible = false;
          this.pickLayer.add(m);
        }
      } else {
        for (const m of res.solidas) this.model.add(m);
        for (const m of res.instanciadas) this.model.add(m);
      }
      for (const l of res.arestas) this.model.add(l);
      this.faixasDeSombra = res.faixas.map((f) => ({
        caixa: f.caixa.isEmpty() ? null : f.caixa.clone(),
        triangulos: f.triangulos,
        alvos: [...f.solidas, ...f.instanciadas],
      }));
    }
    this.buildPickLayer();
    // Datum dos níveis: uma vez para o projeto (não por nível), fora dos grupos de nível. O nível selecionado é o
    // guardado, então a remontagem do projeto mantém a seleção. Só refaz quando algo que ele desenha mudou (assinatura).
    this.atualizarNiveis(p);
    // Níveis que saíram da cena e não estão mais no cache: liberados (os que ficaram no cache seguem para o reuso).
    const saiu = new Set([...antes, ...sobras, ...expulsas]);
    for (const e of atuais) saiu.delete(e);
    for (const e of saiu) if (!this.cache.contem(e)) disposeNivel(e);
    this.boxCache = new THREE.Box3().setFromObject(this.model);
    this.orbit.sceneRadius = this.boxCache.isEmpty() ? 0 : this.boxCache.getSize(new THREE.Vector3()).length() / 2;
    // "Enquadrar": o modelo mais o datum dos níveis, com folga em X para a bolha e o texto não ficarem fora da vista.
    this.caixaEnquadramento.copy(this.boxCache);
    if (view.showLevels !== false && p.levels.length) {
      const b = levelProjectBox(p, LEVEL_LINE_OFFSET);
      const cotas = p.levels.map((l) => l.elevation);
      this.caixaEnquadramento.union(
        new THREE.Box3(
          new THREE.Vector3(b.minX - MARGEM_ENQUADRAMENTO_NIVEIS, b.minY - MARGEM_ENQUADRAMENTO_NIVEIS, Math.min(...cotas)),
          new THREE.Vector3(b.maxX + MARGEM_ENQUADRAMENTO_NIVEIS, b.maxY + MARGEM_ENQUADRAMENTO_NIVEIS, Math.max(...cotas)),
        ),
      );
    }
    this.orbit.apply();
    const bg = new THREE.Color(view.background ?? (opt.dark ? BACKGROUND.dark : BACKGROUND.light));
    this.ground.visible = view.style !== 'wireframe';
    this.ground.receiveShadow = this.frame.shadows;
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 60, 170);
    this.sun.castShadow = this.frame.shadows;
    this.direcaoSol.copy(sunDirection(view.sunAzimuth, view.sunElevation));
    if (!this.boxCache.isEmpty()) {
      const c = this.boxCache.getCenter(new THREE.Vector3());
      const r = Math.max(8, this.boxCache.getSize(new THREE.Vector3()).length());
      this.sun.target.position.copy(c);
      this.sun.position.copy(c).addScaledVector(this.direcaoSol, r * SUN_DISTANCE);
      // Enquadramento de partida (cobre o modelo inteiro). O enquadramento justo, com o orçamento de sombra, é feito em
      // `antesDeDesenhar`, quando o mapa vai mesmo ser refeito (é lá que a caixa das faixas escolhidas é conhecida).
      const cam = this.sun.shadow.camera;
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 1;
      cam.far = r * 4;
      cam.updateProjectionMatrix();
    }
    // Materiais que esta atualização não usou (outro estilo, outra substituição) saem da memória.
    this.mats.descartarNaoUsados();
  }

  /**
   * Geometria do modelo em coordenadas de mundo, para a etapa "papel" da prancha (decisão 0040). Lê `this.model`, o
   * mesmo grupo que a GPU desenha: as malhas viram triângulos e as `LineSegments` viram as arestas que a vista 3D mostra.
   * Ficam de fora o datum dos níveis, o chão, a grade, a camada de picking e os realces, que não são o modelo.
   * Nada é recalculado: a montagem é a mesma de `update`.
   */
  exportarVetores(): VetoresDaCena {
    this.model.updateMatrixWorld(true);
    const tri: number[] = [];
    const arestas: number[] = [];
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const ponto = (m: THREE.Matrix4, x: number, y: number, z: number): void => {
      v.set(x, y, z).applyMatrix4(m);
      box.expandByPoint(v);
    };
    this.model.traverse((o) => {
      if (!this.visivelNaCena(o)) return;
      if (o instanceof THREE.LineSegments) {
        // Arestas: pares de pontos (cada dois formam um segmento), já no mundo pela matriz do objeto.
        const pos = o.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          arestas.push(v.x, v.y, v.z);
          box.expandByPoint(v);
        }
        return;
      }
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos || pos.count === 0) return;
      const indice = o.geometry.index;
      const matrizes: THREE.Matrix4[] = [];
      if (o instanceof THREE.InstancedMesh) {
        // Instanciada: a matriz do objeto compõe com a de cada instância (paredes e esquadrias em caixas).
        const m = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          matrizes.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, m));
        }
      } else {
        matrizes.push(o.matrixWorld);
      }
      const contar = indice ? indice.count : pos.count;
      for (const m of matrizes) {
        for (let i = 0; i + 2 < contar; i += 3) {
          for (let k = 0; k < 3; k++) {
            const n = indice ? indice.getX(i + k) : i + k;
            ponto(m, pos.getX(n), pos.getY(n), pos.getZ(n));
            v.fromBufferAttribute(pos, n).applyMatrix4(m);
            tri.push(v.x, v.y, v.z);
          }
        }
      }
    });
    const triangleIndices = new Uint32Array(tri.length / 3);
    for (let i = 0; i < triangleIndices.length; i++) triangleIndices[i] = i;
    return {
      trianglePositions: Float32Array.from(tri),
      triangleIndices,
      edges: Float32Array.from(arestas),
      box,
    };
  }

  /** O objeto e todos os seus ancestrais até o modelo estão visíveis? (o que a GPU desenharia) */
  private visivelNaCena(o: THREE.Object3D): boolean {
    for (let atual: THREE.Object3D | null = o; atual && atual !== this.model; atual = atual.parent) {
      if (!atual.visible) return false;
    }
    return true;
  }

  /**
   * Gancho de quadro (`scene.onBeforeRender`, chamado pelo three antes da lista de desenho e antes do passe de sombra):
   * quando o mapa de sombra vai ser refeito, aplica o orçamento de triângulos por faixa e enquadra a câmera do sol na
   * caixa das faixas escolhidas. Fora disso é só uma leitura de dois campos — nada muda com a câmera ou o realce.
   */
  private antesDeDesenhar(renderer: RendererDeQuadro): void {
    this.layoutNiveis();
    if (!this.frame.shadows) return;
    prepararSombraDoQuadro({
      renderer,
      sombras: this.sombras,
      faixas: this.faixasDeSombra,
      sol: this.sun,
      alvo: this.orbit.target,
      direcao: this.direcaoSol,
      camera: this.orbit.camera,
      distancia: this.orbit.distance,
      teto: this.sombraMaxTriangulos,
      tamanhoTela: this.tamanhoTela,
    });
  }

  /**
   * Seleciona um nível no 3D (o plano azul do datum) ou limpa (`null`). O datum é refeito só quando o que ele desenha
   * muda (nível selecionado, níveis, caixa da obra, tema ou visibilidade — ver `assinaturaDosNiveis`). É chamado no
   * clique do 3D e também a cada quadro da vista, então o caminho sem mudança tem de ser barato.
   */
  selecionarNivel(p: Project, levelId: Id | null): void {
    // Atalho do quadro a quadro: mesmo projeto, mesmo nível e datum montado (o que a vista passa sem parar).
    if (this.niveisAssinatura !== null && this.projeto === p && this.selectedLevel === levelId) return;
    this.selectedLevel = levelId;
    this.atualizarNiveis(p);
  }

  /**
   * Refaz o datum dos níveis só quando a assinatura muda. Sem isso, cada fatia da montagem (e cada atualização do
   * projeto) refaria as linhas, as bolhas, os textos e o plano de seleção de todos os níveis.
   */
  private atualizarNiveis(p: Project): void {
    const assinatura = this.assinaturaDosNiveis(p);
    if (assinatura === this.niveisAssinatura) return;
    this.reconstruirNiveis(p, assinatura);
  }

  /**
   * Assinatura barata do que o datum desenha: ids, nomes e cotas dos níveis, a caixa das linhas do datum (`levelProjectBox` com `LEVEL_LINE_OFFSET`), o
   * nível selecionado, o tema e o mostrar/ocultar níveis. Tudo o mais que `update` recebe fica de fora.
   */
  private assinaturaDosNiveis(p: Project): string {
    const b = levelProjectBox(p, LEVEL_LINE_OFFSET);
    const niveis = p.levels.map((l) => `${l.id}\u0001${l.name}\u0001${l.elevation}`).join('\u0002');
    return [
      niveis,
      b.minX,
      b.minY,
      b.maxX,
      b.maxY,
      this.selectedLevel ?? '-',
      this.frame.dark ? 'escuro' : 'claro',
      this.frame.view.showLevels !== false ? 'visiveis' : 'ocultos',
    ].join('|');
  }

  /**
   * Refaz o datum dos níveis para o projeto e o nível selecionado guardados. `showLevels` desligado deixa o grupo vazio
   * (nada é adicionado); o picking e o toggle acham o grupo por `userData.levels`.
   */
  private reconstruirNiveis(p: Project, assinatura: string): void {
    this.liberarNiveis();
    this.niveisAssinatura = assinatura;
    if (this.frame.view.showLevels === false) return;
    const grupo = buildLevels(p, this.selectedLevel, this.frame.dark);
    grupo.userData = { ...grupo.userData, levels: true };
    this.niveis3d.add(grupo);
    this.niveis = grupo;
    this.layoutNiveis();
  }

  /** Libera geometrias, materiais e texturas do datum anterior; o grupo contêiner continua na cena (vazio). */
  private liberarNiveis(): void {
    if (this.niveis) disposeLevels(this.niveis);
    this.niveis = null;
    this.niveis3d.clear();
    this.niveis3d.userData = { levels: true };
  }

  /**
   * Recalcula o datum para a câmera atual. Roda a cada quadro (no `antesDeDesenhar`) para a bolha ficar sempre à
   * esquerda e o conjunto atrás/à esquerda da obra; a escolha do lado e da ponta tem histerese (ver `layoutLevels`).
   */
  private layoutNiveis(): void {
    if (!this.niveis) return;
    const { toCamera } = cameraBasis(this.orbit.azimuth, this.orbit.elevation);
    layoutLevels(this.niveis, this.orbit.camera, toCamera.clone().negate());
  }

  /** Faixas verticais da cena (culling por frustum) e quantas existem agora. */
  get faixas(): readonly Faixa3D[] {
    return this.lotes.faixas;
  }

  /** Último orçamento de sombra aplicado (null antes do primeiro passe de sombra). */
  get orcamentoDeSombra() {
    return this.sombras.ultima;
  }

  /** Enquadramento atual da câmera do sol (nitidez da sombra: metros por texel). */
  get enquadramentoSombra() {
    return this.sombras.enquadramento;
  }

  /** Diagnóstico de precisão da câmera ativa: planos, resolução de profundidade e profundidade reversa. */
  get precisao(): DiagnosticoProfundidade {
    return diagnosticarProfundidade(this.orbit.camera, BITS_PROFUNDIDADE);
  }

  /** Diagnóstico de rebase de origem (RTC) para o modelo atual. */
  get origem(): DiagnosticoOrigem {
    return diagnosticarOrigem(this.boxCache.isEmpty() ? null : this.boxCache);
  }

  /**
   * Monta as malhas de um nível: pisos, lajes, telhados, beirais, paredes, escadas e esquadrias. O grupo e as peças de
   * picking ficam na entrada, com as chaves de material que o nível usou (para o reuso as marcar de novo).
   */
  private montarNivel(p: Project, lv0: ResolvedLevel, chave: string, escadas: Escadas, rampas: Rampas): EntradaNivel {
    const view = this.frame.view;
    const shown = (c: GraphicsCategory): boolean => view.overrides[c].visible;
    const grupo = new THREE.Group();
    grupo.userData = { levelId: lv0.levelId };
    const picks: PickSource[] = [];
    const mats = new Set<string>();
    const picksAnt = this.picks;
    const matsAnt = this.mats.noNivel;
    this.picks = picks;
    this.mats.noNivel = mats;
    // Exibição parcial (decisão 0015 §2.5): as camadas de parede são filtradas antes dos sólidos e das aberturas.
    const lvBase = applyPartialStructure(p, lv0, view.partialStructure);
    // Hide in View: a parede oculta sai antes dos sólidos e das aberturas (a chave do nível já muda com o conjunto). Pisos,
    // lajes, forros, telhados, escadas, rampas e genéricos são filtrados por id nas listas resolvidas logo abaixo.
    const lv = filtrarParedesDoNivel(lvBase, (id) => !this.ocultos.has(id));
    const oculto = (id: Id): boolean => this.ocultos.has(id);
    // Revelado e oculto ao mesmo tempo: o oculto vence (o resolvedor de visibilidade não produz os dois).
    const revelado = (id: Id): boolean => this.revelados.has(id) && !this.ocultos.has(id);
    // Projetos com `elements` filtrado, só para os construtores que varrem o projeto (genéricos e CAD).
    const pGen = this.semOcultos ?? p;
    // Pisos, lajes e telhados do nível: uma malha por material, com os furos e as inclinações (D2); o beiral (C5) à parte.
    // Categoria oculta: não gera as malhas dela (decisão 0015 §2.4).
    const roofs = shown('roof') ? resolveRoofs(p, lv.levelId).filter((r) => !oculto(r.roofId)) : [];
    const eave = buildEaveSolids(p, roofs);
    // Junção do nível sobre o projeto reduzido (a mesma redução da planta, `projetoDaJuncao`): o resultado é o do projeto inteiro.
    const juncao = junctionLevel(this.reduzirJuncao ? projetoDaJuncao(p, lv.levelId) : p, lv.levelId);
    // Escadas do nível (decisão 0011 §1): uma malha por material do tipo; escada com erro não gera malha. A chegada
    // monolítica termina na face inferior da laje que cobre o último espelho (decisão 0012 §2, `stairArrivalTop`); sem
    // laje nem piso sobre o último espelho, fecha no próprio nível (`topZ`), flush com o piso do nível de cima.
    // Paredes com a junção (0023 F4): cada faixa é extrudada só nas partes que sobram dela, como o corte e a planta. As camadas
    // de prismas retangulares viram caixas instanciadas (`paredesInstanciadas3d.ts`); o resto segue como geometria.
    const caixas = this.instanciar ? new CaixasDoNivel() : null;
    const paredes = !shown('wall') ? { batches: [], caixas: [], arestas: [] } : caixas ? buildLevelSolidsComCaixas(lv, juncao, this.frame.edges) : { batches: buildLevelSolids(lv, juncao).batches, caixas: [], arestas: [] };
    for (const c of paredes.caixas) caixas?.adicionar('wall', c.materialId, c.wallId, c.matriz, false);
    caixas?.adicionarArestas(paredes.arestas);
    const floors = shown('floor') ? resolveFloors(p, lv.levelId).filter((f) => !oculto(f.floorId)) : [];
    const ceilings = shown('floor') ? resolveCeilings(p, lv.levelId).filter((c) => !oculto(c.ceilingId)) : [];
    const slabs = shown('slab') ? resolveSlabs(p, lv.levelId).filter((s) => !oculto(s.slabId)) : [];
    const escadasNivel = shown('stair') ? escadas.filter((s) => s.levelId === lv.levelId && !oculto(s.id)) : [];
    const rampasNivel = shown('stair') ? rampas.filter((r) => r.levelId === lv.levelId && !oculto(r.id)) : [];
    const genericos = shown('generic') ? buildGenericSolids(pGen, lv.levelId) : [];
    const batches: SolidBatch[] = [
      ...paredes.batches,
      ...buildFloorSolids(floors, juncao),
      ...buildCeilingSolids(ceilings),
      ...buildSlabSolids(slabs, juncao),
      ...buildRoofSolids(roofs),
      ...eave.batches,
      ...buildStairSolids(escadasNivel, (s) => stairArrivalTop(p, s).top),
      ...buildRampSolids(rampasNivel),
      ...genericos,
    ];
    // Reveal: o modelo normal continua desenhado; os elementos revelados ganham só as arestas azuis (sem preenchimento).
    // As paredes em caixas usam as arestas da união das caixas; o resto usa as arestas dos sólidos, no mesmo ângulo.
    const bordas: number[] = [];
    const arestasDe = (lotes: readonly SolidBatch[]): void => {
      const g = arestasDosLotes(lotes, EDGE_ANGLE);
      if (!g) return;
      for (const x of g.getAttribute('position').array) bordas.push(x);
      g.dispose();
    };
    if (this.revelados.size) {
      // Paredes reveladas: o mesmo construtor das caixas, com as arestas da união (sem as juntas entre peças da camada).
      const revParedes = Object.values(lv.walls).filter((w) => revelado(w.wallId));
      if (shown('wall') && revParedes.length) {
        const pr = buildLevelSolidsComCaixas(filtrarParedesDoNivel(lv, revelado), juncao, true);
        bordas.push(...pr.arestas);
        arestasDe(pr.batches);
      }
      const revPisos = floors.filter((f) => revelado(f.floorId));
      if (revPisos.length) arestasDe(buildFloorSolids(revPisos, juncao));
      const revForros = ceilings.filter((c) => revelado(c.ceilingId));
      if (revForros.length) arestasDe(buildCeilingSolids(revForros));
      const revLajes = slabs.filter((s) => revelado(s.slabId));
      if (revLajes.length) arestasDe(buildSlabSolids(revLajes, juncao));
      const revTelhados = roofs.filter((r) => revelado(r.roofId));
      if (revTelhados.length) {
        arestasDe(buildRoofSolids(revTelhados));
        arestasDe(buildEaveSolids(p, revTelhados).batches);
      }
      const revEscadas = escadasNivel.filter((s) => revelado(s.id));
      if (revEscadas.length) arestasDe(buildStairSolids(revEscadas, (s) => stairArrivalTop(p, s).top));
      const revRampas = rampasNivel.filter((r) => revelado(r.id));
      if (revRampas.length) arestasDe(buildRampSolids(revRampas));
      if (shown('generic')) arestasDe(buildGenericSolids(this.soRevelados ?? p, lv.levelId));
    }
    const materialOf = (id: Id): Material | undefined => p.materials[id] ?? eave.materials[id];
    // Caminho de referência (`instanciar: false`): cada nível tem as suas malhas. Caminho padrão: os sólidos vão para os
    // lotes globais por categoria/material (o gestor de GPU os junta e atualiza por faixa).
    const lotes: SolidBatch[] = [];
    // Prismas das esquadrias (batente em L): como as caixas das esquadrias, só têm arestas nos estilos de linhas (igual ao caminho de geometria).
    const prismasSemArestas = new Set<SolidBatch>();
    if (!this.instanciar) {
      // Lotes do nível juntados por categoria e material: uma malha por grupo (ver `lotesMalha3d.ts`).
      this.desenharLotes(grupo, batches, this.frame.edges, materialOf);
    } else {
      lotes.push(...batches);
      for (const b of batches) this.mats.face(materialOf(b.materialId), b.category);
    }
    // Esquadrias: cada uma tem o seu grupo (no vão); as peças fixas são juntadas por material dentro dele, e a folha aberta
    // fica no pivô da dobradiça.
    for (const w of wallsOnLevel(p, lv.levelId)) {
      // Parede oculta: as aberturas dela também não entram (nem no modelo, nem no picking, nem no Reveal).
      if (oculto(w.id)) continue;
      const f = frameOfWall(p, w.id);
      if (!f) continue;
      for (const o of openingsOfWall(p, w.id)) {
        if (oculto(o.id)) continue;
        // Base e altura resolvidas (paredes anexadas a pisos mudam de cota); sem resolução, as do modelo.
        const rw = lv.walls[w.id];
        const baseZ = rw?.baseZ ?? wallBaseElevation(p, w);
        const altura = rw?.height ?? wallHeight(p, w);
        const linhas = isLineStyle(view.style);
        // Reveal da esquadria: o mesmo contorno azul, das caixas/prismas da montagem (sem preenchimento).
        if (revelado(o.id)) this.bordasDaAbertura(p, o, f, baseZ, altura, view, bordas);
        if (caixas) {
          // Esquadria em caixas instanciadas: as peças em caixa viram instâncias; as peças com seção (batente em L)
          // viram prismas nos lotes de geometria. As arestas do alizar saem da silhueta do grupo, sem as juntas internas.
          const a = caixasEPrismasDaAbertura(p, o, f, baseZ, altura, view);
          if (!a) continue;
          const grupos = new Map<string, number[]>();
          for (const c of a.caixas) {
            caixas.adicionar(o.kind, c.materialId, o.id, c.matriz, linhas && !c.group);
            if (linhas && c.group) {
              const arr = grupos.get(c.group) ?? [];
              for (let i = 0; i < 16; i++) arr.push(c.matriz[i]!);
              grupos.set(c.group, arr);
            }
          }
          for (const pr of a.prismas) {
            const lote = loteDeGeometria(pr.geometry, pr.materialId, o.kind, o.id);
            lotes.push(lote);
            if (!linhas) prismasSemArestas.add(lote);
            this.mats.face(p.materials[pr.materialId], o.kind);
          }
          for (const matrizes of grupos.values()) caixas.adicionarArestas(arestasDaSilhuetaDeCaixas(matrizes));
          continue;
        }
        const m = montarAbertura(p, o, f, baseZ, altura, view, linhas, (parent, geo, mat, cat, edges, ranges) => this.draw(parent, geo, mat, cat, edges, ranges));
        if (!m) continue;
        this.desenharLotes(m.grupo, m.lotes, linhas, materialOf, m.arestasGrupos);
        m.grupo.traverse((c) => {
          c.userData.elementId = o.id;
        });
        grupo.add(m.grupo);
      }
    }
    // Linhas do CAD importado do nível (categoria "genérica"): segmentos com a cor ACI da entidade/camada, na cota do
    // nível mais o deslocamento do desenho. São linhas: não entram nas sombras nem nas arestas dos sólidos.
    if (shown('generic')) {
      const cota = p.levels.find((l) => l.id === lv0.levelId)?.elevation ?? 0;
      const cad = buildCadLines(pGen, lv0.levelId, cota);
      if (cad) grupo.add(cad);
    }
    // Contorno azul do Reveal: uma linha só por nível, no grupo (o cache e o `dispose` a levam junto). `renderOrder` alto
    // para as arestas vencerem as faces coplanares na ordenação; sem preenchimento, o modelo normal continua visível.
    if (bordas.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bordas, 3));
      const linhasReveladas = new THREE.LineSegments(
        geo,
        this.mats.cached(`reveal|${REVEAL_COLOR}`, () => new THREE.LineBasicMaterial({ color: REVEAL_COLOR, depthWrite: false })),
      );
      linhasReveladas.renderOrder = 8;
      linhasReveladas.userData = { reveal: true };
      grupo.add(linhasReveladas);
    }
    // Malhas de picking (invisíveis) e arestas das caixas: no grupo do nível, para o cache, o picking e o realce as acharem.
    const montadas = caixas?.montar(grupo, this.mats.cached('pick', () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })));
    let arestasSolidas: Float32Array | undefined;
    let arestas: Float32Array | undefined;
    if (this.instanciar) {
      for (const c of montadas?.colecoes ?? []) this.mats.face(p.materials[c.materialId], c.categoria);
      if (this.frame.edges) {
        this.mats.edge();
        if (lotes.length) {
          const g = arestasDosLotes(prismasSemArestas.size ? lotes.filter((l) => !prismasSemArestas.has(l)) : lotes, EDGE_ANGLE);
          if (g) {
            arestasSolidas = Float32Array.from(g.getAttribute('position').array);
            g.dispose();
          }
        }
      }
      const arestasCaixas = montadas?.arestas;
      const total = (arestasSolidas?.length ?? 0) + (arestasCaixas?.length ?? 0);
      if (total) {
        arestas = new Float32Array(total);
        if (arestasSolidas) arestas.set(arestasSolidas, 0);
        if (arestasCaixas) arestas.set(arestasCaixas, arestasSolidas?.length ?? 0);
      }
    }
    this.picks = picksAnt;
    this.mats.noNivel = matsAnt;
    const bytes = bytesDeNivel(grupo, picks, montadas?.colecoes, montadas?.arestas, this.instanciar ? lotes : [], arestasSolidas);
    return {
      levelId: lv0.levelId,
      chave,
      grupo,
      picks,
      mats: [...mats],
      bytes: bytes + (arestas?.byteLength ?? 0),
      ...(montadas ? { instancias: montadas.colecoes, arestasCaixas: montadas.arestas } : {}),
      ...(this.instanciar ? { lotes, materiais: eave.materials, ...(arestasSolidas ? { arestasSolidas } : {}), ...(arestas ? { arestas } : {}) } : {}),
    };
  }

  /**
   * Arestas azuis de uma esquadria revelada (Reveal): as caixas e os prismas da mesma montagem normal, só o contorno.
   * A geometria dos prismas é desta chamada (as caixas vão por matriz) e é liberada aqui.
   */
  private bordasDaAbertura(
    p: Project,
    o: Opening,
    f: NonNullable<ReturnType<typeof frameOfWall>>,
    baseZ: number,
    altura: number,
    view: View3DSettings,
    saida: number[],
  ): void {
    const a = caixasEPrismasDaAbertura(p, o, f, baseZ, altura, view);
    if (!a) return;
    for (const c of a.caixas) arestasDasCaixas(c.matriz, saida);
    for (const pr of a.prismas) {
      const g = new THREE.EdgesGeometry(pr.geometry, EDGE_ANGLE);
      for (const x of g.getAttribute('position').array) saida.push(x);
      g.dispose();
      pr.geometry.dispose();
    }
  }

  /**
   * Desenha lotes do nível juntados por categoria e material (ver `lotesMalha3d.ts`): uma malha por grupo, com as faixas de
   * elemento deslocadas (picking e realce continuam por triângulo). As arestas de todos os lotes saem numa linha só, com o
   * mesmo ângulo de antes, e só quando `edges`.
   */
  private desenharLotes(parent: THREE.Object3D, lotes: SolidBatch[], edges: boolean, materialOf: (id: Id) => Material | undefined, arestasGrupos: readonly number[] = []): void {
    for (const b of juntarLotes(lotes)) this.draw(parent, geometriaDoLote(b), materialOf(b.materialId), b.category, false, b.ids);
    // Peças de um grupo físico desenham uma silhueta só: as arestas internas do grupo não entram na linha.
    const arestas = edges ? arestasDosLotes(lotes.filter((b) => !b.group), EDGE_ANGLE) : null;
    if (arestas) parent.add(new THREE.LineSegments(arestas, this.mats.edge()));
    if (edges && arestasGrupos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arestasGrupos, 3));
      parent.add(new THREE.LineSegments(g, this.mats.edge()));
    }
  }

  bounds(): THREE.Box3 {
    return this.boxCache;
  }

  /** Bytes estimados das malhas guardadas no cache por nível (conta contra o teto). */
  get memoriaMalhas(): number {
    return this.cache.total;
  }

  /** Bytes estimados dos buffers globais na GPU (lotes, instâncias e arestas das faixas). */
  get memoriaGpu(): number {
    return this.lotes.bytes;
  }

  /** Orçamento de VRAM contábil da cena (teto e usado; um só para todas as faixas). */
  get orcamentoVram(): { usado: number; teto: number; excedido: boolean } {
    return { usado: this.lotes.orcamento.usado, teto: this.lotes.orcamento.teto, excedido: this.lotes.orcamento.excedido };
  }

  /** Caixa delimitadora (mundo) dos elementos dados (seleção), ou null se vazia/não encontrada. */
  selectionBounds(ids: readonly Id[]): THREE.Box3 | null {
    return caixaDaSelecao(this.model, ids);
  }

  fit(): void {
    if (this.caixaEnquadramento.isEmpty()) {
      this.orbit.target.set(0, 0, 1);
      this.orbit.distance = 14;
      this.orbit.apply();
    } else this.orbit.fit(this.caixaEnquadramento);
  }

  dispose(): void {
    this.detach();
    this.liberarNiveis();
    this.niveisAssinatura = null;
    this.faixasDeSombra = [];
    this.ocultos = NADA;
    this.revelados = NADA;
    this.semOcultos = null;
    this.soRevelados = null;
    this.lotes.dispose();
    this.caixaUnitaria.dispose();
    this.realces.soltarTodos();
    const todas = new Set([...this.cenaNiveis, ...this.cache.limpar()]);
    this.cenaNiveis = [];
    for (const e of todas) disposeNivel(e);
    this.mats.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
  }
}
