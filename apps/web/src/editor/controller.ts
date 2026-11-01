/* eslint-disable max-lines */
import { useSyncExternalStore } from 'react';
import type { Vec2 } from '@hestia/geom';
import { cotasAutomaticas, LevelResolveCache, resolveRooms, type AutoCotaOptions, type ResolvedLevel, type SectionResult } from '@hestia/engine';
import {
  ProjectStore,
  copyLinkOf, syncWholeLinkCommand,
  annotationIdsIn, projectGrids, areaPlanOf, areaPlansOfLevel, DEFAULT_AREA_GRAPHICS, isRoom,
  planAnnotationIds,
  levelRoomSeparators,
  buildTemplate,
  createEmptyProject,
  migrateProject,
  newId,
  sectionAnnotationsOf,
  type AnnotationCommand,
  type Command,
  type Id,
  type Project,
  type RoomTag,
  type SectionView,
  type TemplateId,
} from '@hestia/model';
import { annotationAt, roomTagAt, DEFAULT_SNAP, createTool, execWithHostedLoss, isStairTool, sectionInferContext, setPasteClip, type HostedApplyResult, type PointerInfo, type ShortcutCommand, type Tool, type ToolEnv, type ToolId } from '@hestia/tools';
import { ResolucaoCancelada } from '@hestia/engine/src/worker/protocolo.ts';
import type { ClienteResolucao } from '@hestia/engine/src/worker/cliente.ts';
import { kernelExperimentalLigado } from './preferenciasKernel.ts';
import { criarClienteResolucao } from './resolveWorker.ts';
import { transfer } from './transfer.ts';
import type { PastePreviewState } from './pasteLevels/types.ts';
import { consumirManterCameraDaPrevia, guardarOrigemDoColar, limparOrigemDoColar, limparPreviaPreparada, manterCameraDaPrevia, origemDoColar, prepararPrevia, previaPreparada, type OrigemDoColar } from './pastePreview.ts';
import { startCreateSimilar } from './createSimilar.ts';
import { desfazerOuRefazer } from './historyStatus.ts';
import { keptFloorType } from './typeActions.ts'; import { keptSlabType } from './slabTypeActions.ts'; import { PerimeterMode } from './perimeterMode.ts';
import { AUTOSAVE_KEY, safeGet, safeSet } from './storage.ts';
import { useI18n } from './i18n.ts';
import { pedirConfirmacaoHostedLoss } from './hostedLossPrompt.ts';
import { pedirAlerta } from './alertaPrompt.ts';
import { fitBox, levelFrameBox, panBy, planViewOf, referenceAt, roomTagLines, sectionBox, tagBoxModel, underlayIdOf, effectiveGridStep, zoomAt, type Viewport } from '@hestia/render';
import { key3d, setSnap, toggleOrtho, togglePolar, useUi } from './state.ts';
import { defaultOpenViews, type PlanKind } from './openViews.ts';
import { casador } from './shortcutConfig.ts'; import { clearSelectionForTool } from './toolSelection.ts';
import { elevationCommand, type PlanBox } from './elevations.ts';
import { deleteSelectionIn } from './deleteIds.ts';
import { deleteSectionAnnotationsIn, sectionAnnotationIdsIn } from './sectionHandles.ts';
import { hideSelectedCategoryInView, hideSelectionInView, resetAllTemporary, resetTemporaryHidden, temporaryHideSelection, temporaryIsolateSelection, temporarySelectedCategory, toggleRevealHidden, unhideSelectedCategoryInView, unhideSelectionInView, visibilityOf } from './viewVisibility.ts';
import { deleteViewAction, renameViewAction, updateViewAction } from './sectionViewActions.ts';
import { entregarArquivo } from './entregarArquivo.ts';
import { safeFilename } from './nomeArquivo.ts';
import { FluxoEdicao } from './fluxoEdicao.ts';
import { hiddenCreationWarning } from './profileWarning.ts';
import { CacheGeometria } from './geometryCache.ts';
import { abrirComCache, TETO_GEOMETRIA_BYTES, type PortasAbertura } from './geometriaAbertura.ts';
import { aceitaCaractereNumerico } from './entradaNumerica.ts';


/**
 * Ferramentas que continuam disponíveis na planta de área: anotação e as ferramentas de área (ambiente e separador).
 * O resto (parede, porta, piso, laje, forro, telhado, escada, grade...) é do modelo e fica bloqueado nela.
 */
export const AREA_PLAN_TOOLS: readonly ToolId[] = ['select', 'measure', 'dimension', 'text', 'tag', 'detailLine', 'filledRegion', 'room', 'roomsep'];

/** A ferramenta pode rodar na planta de área? */
export const areaPlanToolAllowed = (id: ToolId): boolean => AREA_PLAN_TOOLS.includes(id);

/** Comandos de anotação que, na planta de área, moram em `plan.annotations` (não no nível). */
const PLAN_ANNOTATION_TYPES = new Set<Command['type']>([
  'addDimension', 'updateDimension', 'removeDimension',
  'addText', 'updateText', 'removeText',
  'addDetailLine', 'updateDetailLine', 'removeDetailLine',
  'addDetailRegion', 'updateDetailRegion', 'removeDetailRegion',
  'addTag', 'updateTag', 'removeTag',
]);

const isPlanAnnotation = (c: Command): c is AnnotationCommand => PLAN_ANNOTATION_TYPES.has(c.type);

/** Ambiente cujo rótulo está sob um ponto (mundo), com tolerância de 0,10 m além da caixa do texto. */
function labelHit(p: Project, levelId: Id, scale: number, planId: Id | null, at: Vec2): { roomId: Id; at: Vec2 } | null {
  const plan = planId ? areaPlanOf(p, planId) : areaPlansOfLevel(p, levelId)[0];
  const graphics = plan?.graphics ?? DEFAULT_AREA_GRAPHICS;
  const resolved = resolveRooms(p, levelId);
  for (const r of resolved) {
    const room = p.elements[r.roomId];
    if (!isRoom(room) || !r.polygon) continue;
    const tag = plan?.tags.find((t) => t.roomId === room.id);
    const labelAt = tag?.at ?? room.labelPosition ?? referenceAt(room, r);
    const draft: RoomTag = tag ?? {
      id: `auto:${room.id}`,
      planId: plan?.id ?? '',
      roomId: room.id,
      at: labelAt,
      orientation: 'horizontal',
      leader: graphics.tagDefault.leader,
      fields: [...graphics.tagDefault.fields],
      visible: true,
    };
    const box = tagBoxModel(roomTagLines(p, room, r, draft), scale);
    if (Math.abs(at.x - labelAt.x) <= box.w / 2 + 0.1 && Math.abs(at.y - labelAt.y) <= box.h / 2 + 0.1) return { roomId: room.id, at: labelAt };
  }
  return null;
}

/**
 * Controlador do editor: junta projeto (histórico), ferramenta ativa, seleção e vistas.
 * A interface só lê estado e chama ações; as regras vivem aqui e nos pacotes.
 */
/** Sequências de visibilidade que funcionam no 3D e no corte mesmo com outro perfil de atalhos. */
const VIS_SEQUENCES: Record<string, ShortcutCommand> = {
  HH: 'temporaryHide', HC: 'temporaryCategory', HI: 'temporaryIsolate', IC: 'isolateCategory', HR: 'resetTemporary',
  EH: 'hideInView', VH: 'hideCategoryInView', RH: 'revealHidden', EU: 'unhideInView', VU: 'unhideCategoryInView',
  V1: 'temporaryHide', V2: 'temporaryCategory', V3: 'temporaryIsolate', V4: 'isolateCategory', V5: 'resetTemporary',
  V6: 'hideInView', V7: 'hideCategoryInView', V8: 'revealHidden', V9: 'unhideInView', V0: 'unhideCategoryInView',
};

/** Ferramentas que fazem sentido na vista de corte/elevação. As demais continuam exclusivas da planta. */
const SECTION_TOOLS = new Set<ToolId>(['select', 'measure', 'level', 'dimension', 'angularDimension', 'text', 'detailLine', 'filledRegion', 'tag', 'align', 'move']);

export class Editor {
  readonly store = new ProjectStore(createEmptyProject());
  /** Arraste de rótulo de ambiente em andamento (mundo); vale na planta de piso e na de área. */
  private tagDrag: { planId: Id | null; roomId: Id; offset: Vec2; at: Vec2; moved: boolean } | null = null;
  private suppressNextClick = false;
  /** Buffer próprio dos atalhos de visibilidade no 3D/corte (não depende do perfil configurado). */
  private visBuf = '';
  private visTimer: ReturnType<typeof setTimeout> | undefined;
  private tool: Tool;
  private viewports = new Map<Id, Viewport>();
  /** Resolução por nível: uma edição recalcula só o nível editado e os que dependem dele (ver `LevelResolveCache`). */
  private readonly levels = new LevelResolveCache();
  readonly fluxo = new FluxoEdicao({ aoMudar: () => this.bump(), exatoAssincrono: true }); // provisório na hora, exato em segundo plano (fluxoEdicao.ts)
  readonly provisorios = this.fluxo.provisorios; // a planta os desenha (ui/quadroPlanta.ts); ler aqui liga o cálculo a cada edição
  /** Modo "Criar/Editar perímetro" (perimeterMode.ts): abre-se pelas ferramentas Telhado, Piso, Laje e Forro. */
  readonly perimetro = new PerimeterMode({ env: () => this.env, projeto: () => this.project, ativar: (t) => (t ? this.activate('perimeter', t) : this.activate('select')), atualizar: () => this.bump() });
  /** Cache de geometria por projeto: na abertura restaura os níveis (ver `geometriaAbertura.ts`); só a abertura grava. */
  private readonly portasAbertura: PortasAbertura = {
    cache: new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES }),
    atual: () => this.store.project,
    lerNivel: (id) => this.fluxo.nivelPronto(id) ?? this.levels.get(this.store.project, id),
    pendente: (id) => this.fluxo.pendente(id),
    semear: (id, valor) => this.fluxo.resolucao.semear(id, valor),
  };
  /** Corte por vista: o último resultado válido (pode ser de um projeto anterior, ver `sectionOf`) e o projeto para o qual há pedido em andamento. */
  private sectionCache = new Map<Id, { project: Project; value: SectionResult }>();
  private sectionPending = new Map<Id, Project>();
  private sectionClient: ClienteResolucao | null = null;
  /** Vistas de corte abertas antes de o primeiro resultado chegar: ao chegar, enquadram a vista (como se a caixa existisse na criação). */
  private sectionToFrame = new Set<Id>();
  /** Caixa pedida antes de a vista ter viewport (ex.: enquadrar um CAD ao abrir a planta dele): aplicada na criação. */
  private pendingBox: PlanBox | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  fileName = 'projeto.hestia.json';

  constructor() {
    this.tool = createTool('select', this.env);
    this.store.subscribe(() => {
      this.pruneSelection();
      this.scheduleAutosave(); this.fluxo.atualizar(this.project, this.store.version);
      useUi.setState((s) => ({ previewTick: s.previewTick + 1 }));
    });
  }

  // ---------- ambiente entregue às ferramentas ----------
  private env: ToolEnv = {
    project: () => this.store.project,
    levelId: () => useUi.getState().levelId,
    section: () => {
      const st = useUi.getState();
      if (st.view !== 'section' || !st.sectionId) return null;
      const view = this.project.views.find((v) => v.id === st.sectionId);
      const result = view ? this.sectionOf(view.id) : null;
      if (!view || !result) return null;
      return {
        id: view.id,
        annotations: () => sectionAnnotationsOf(this.project.views.find((v) => v.id === view.id)),
        setAnnotations: (annotations) => this.exec({ type: 'setSectionAnnotations', sectionId: view.id, annotations }),
        inferContext: (extra) => sectionInferContext(result, this.project, st.levelId, 1 / (this.viewport()?.zoom ?? 60), effectiveGridStep(this.viewport()?.zoom ?? 60, st.gridStep), {
          line: { a: view.a, b: view.b, depth: view.depth },
          snap: st.options.snap,
          // Hide in View da vista: o que está oculto não pode virar alvo de captura (grades incluídas).
          hidden: visibilityOf(this.project, st).hidden,
          ...extra,
        }),
        result: () => result,
      };
    },
    // Contrato do ToolEnv (subagente de modelo): as ferramentas de anotação gravam com `planId` quando há planta de área.
    areaPlanId: () => this.areaPlanIdNow(),
    hiddenInView: () => planViewOf(this.store.project, useUi.getState().levelId).hidden,
    underlayLevelId: () => { const st = useUi.getState(); return underlayIdOf(this.store.project, st.levelId, st.showUnderlay, st.underlayLevel); },
    selection: () => useUi.getState().selection,
    setSelection: (ids) => useUi.setState({ selection: ids, ...(ids.length ? { selectedLevel: null } : {}) }),
    exec: (c) => this.exec(c),
    transaction: (l, fn, session) => this.avisandoOculto(() => this.store.transaction(l, fn, session)),
    metersPerPixel: () => 1 / (this.viewport()?.zoom ?? 60),
    gridStep: () => effectiveGridStep(this.viewport()?.zoom ?? 60, useUi.getState().gridStep),
    say: (m) => useUi.setState({ status: m }), lang: () => useI18n.getState().lang, confirmHostedLoss: (losses, message) => pedirConfirmacaoHostedLoss(losses, message),
    alert: (m, ids) => pedirAlerta(m, ids),
    done: () => this.setTool('select'),
    openView: (id) => this.openSection(id),
    options: () => useUi.getState().options, setOptions: (patch) => useUi.setState({ options: { ...useUi.getState().options, ...patch } }),
  };

  get project(): Project { return this.store.project; }

  /** Planta de área ativa (só quando a vista atual é a planta de área), ou null. */
  private areaPlanIdNow(): Id | null {
    const st = useUi.getState();
    return st.view === 'plan' && st.planKind === 'area' ? st.areaPlanId : null;
  }

  /**
   * Roteia um comando: na planta de área, as anotações recebem `planId` e o modelo as guarda em `plan.annotations`
   * (não no nível). As ferramentas já mandam `planId`; o preenchimento aqui é a rede de segurança para comandos
   * antigos e para o modo de compatibilidade sem o contrato novo.
   */
  private exec(c: Command): void {
    this.avisandoOculto(() => this.exec1(c));
  }

  /** Comando vindo de um gesto da vista (alças, por exemplo): passa pelo mesmo aviso/fluxo das ferramentas. */
  applyCommand(c: Command): void {
    this.exec(c);
  }

  /** Política R1: criar na planta de área algo que o perfil oculta não bloqueia a ferramenta, mas avisa na barra de status. */
  private avisandoOculto(run: () => void): void {
    const planId = this.areaPlanIdNow();
    if (!planId) { run(); return; }
    const antes = this.store.project;
    run();
    const aviso = hiddenCreationWarning(antes, this.store.project, planId);
    if (aviso) useUi.setState({ status: aviso });
  }

  private exec1(c: Command): void {
    const planId = this.areaPlanIdNow();
    if (planId && isPlanAnnotation(c) && (!('planId' in c) || c.planId === undefined)) {
      this.store.exec({ ...c, planId } as AnnotationCommand);
      return;
    }
    this.store.exec(c);
  }

  // ---------- vistas ----------
  /** Chave do viewport: cada planta tem o seu (a de cobertura tem outro, do mesmo nível); cada corte ou elevação tem o próprio. */
  private viewKey(): Id {
    const st = useUi.getState();
    return st.view === 'section' ? `sec:${st.sectionId}` : st.planKind === 'roof' ? `roof:${st.levelId}` : st.planKind === 'area' ? `area:${st.areaPlanId ?? st.levelId}` : st.levelId;
  }

  viewport(): Viewport | null {
    return this.viewports.get(this.viewKey()) ?? null;
  }

  setViewport(v: Viewport): void {
    this.viewports.set(this.viewKey(), v);
    useUi.setState((s) => ({ previewTick: s.previewTick + 1 }));
  }

  /** Caixa para enquadrar a vista atual: o nível na planta, o corte na vista de corte. */
  private frameBox(): PlanBox | null {
    const st = useUi.getState();
    if (st.view === 'section') {
      const r = this.sectionOf(st.sectionId);
      return r ? sectionBox(r) : null;
    }
    return levelFrameBox(this.project, st.levelId);
  }

  ensureViewport(width: number, height: number): Viewport {
    const id = this.viewKey();
    const cur = this.viewports.get(id);
    if (cur && cur.width === width && cur.height === height) return cur;
    const base: Viewport = cur ?? { cx: 5, cy: 3.5, zoom: 60, width, height };
    const v = { ...base, width, height };
    if (!cur) {
      const box = this.frameBox();
      if (box) Object.assign(v, fitBox(v, box));
      else if (id.startsWith('sec:') && !this.sectionCache.has(id.slice(4))) this.sectionToFrame.add(id.slice(4));
    }
    if (!cur && this.pendingBox) {
      Object.assign(v, fitBox(v, this.pendingBox));
      this.pendingBox = null;
    }
    this.viewports.set(id, v);
    return v;
  }

  /**
   * Enquadra a vista atual numa caixa (m). Sem viewport ainda (a vista acabou de ser aberta e o canvas vai montar),
   * guarda a caixa para `ensureViewport` aplicar na criação.
   */
  zoomToBox(box: PlanBox | null): void {
    if (!box) return;
    const v = this.viewport();
    if (!v) {
      this.pendingBox = box;
      return;
    }
    this.setViewport(fitBox(v, box));
  }

  zoomExtents(): void {
    const v = this.viewport();
    if (!v) return;
    const box = this.frameBox();
    this.setViewport(box ? fitBox(v, box) : { ...v, cx: 5, cy: 3.5, zoom: 60 });
  }

  /**
   * Corte de uma vista. Nunca calcula na thread da tela: devolve na hora o resultado do projeto atual, se já existe; senão
   * o último resultado válido (de um projeto anterior, que continua na tela) e pede o novo em segundo plano (worker, com as
   * partes por pavimento reaproveitadas, ver `SecaoIncremental`). Quando o novo chega, publica e redesenha. Na primeira
   * abertura, sem resultado anterior, devolve `null` até o cálculo terminar.
   */
  sectionOf(id: Id | null): SectionResult | null {
    if (!id) return null;
    const view = this.project.views.find((x) => x.id === id);
    if (!view) return null;
    const hit = this.sectionCache.get(id);
    if (hit && hit.project === this.project) return hit.value;
    this.requestSection(id);
    return hit?.value ?? null;
  }

  /** O corte desta vista está calculado para o projeto atual? (falso enquanto a tela mostra o resultado anterior ou nada) */
  sectionFresh(id: Id | null): boolean {
    return !!id && this.sectionCache.get(id)?.project === this.project;
  }

  /** Corte pronto para o projeto atual (espera o cálculo em segundo plano). Para testes e fluxos que precisam do resultado exato. */
  async sectionReady(id: Id): Promise<SectionResult | null> {
    for (let i = 0; i < 1000 && !this.sectionFresh(id); i++) {
      if (!this.project.views.some((x) => x.id === id)) return null;
      this.sectionOf(id);
      await new Promise((r) => setTimeout(r, 20));
    }
    return this.sectionCache.get(id)?.value ?? null;
  }

  private requestSection(id: Id): void {
    const project = this.project;
    if (this.sectionPending.get(id) === project) return;
    this.sectionPending.set(id, project);
    this.sectionClient ??= criarClienteResolucao({ usarWorker: true, kernelExperimental: kernelExperimentalLigado() });
    const version = this.store.version;
    void this.sectionClient.resolver('corte', id, project, version).then(
      (value) => {
        if (this.sectionPending.get(id) === project) this.sectionPending.delete(id);
        if (!value) return;
        const first = !this.sectionCache.has(id);
        this.sectionCache.set(id, { project, value: value as SectionResult });
        if (first && this.sectionToFrame.delete(id)) {
          const key = `sec:${id}`;
          const vp = this.viewports.get(key);
          const box = sectionBox(value as SectionResult);
          if (vp && box) this.viewports.set(key, fitBox(vp, box));
        }
        this.bump();
      },
      (e: unknown) => {
        if (this.sectionPending.get(id) === project) this.sectionPending.delete(id);
        if (!(e instanceof ResolucaoCancelada)) console.error('corte', e);
      },
    );
  }

  zoomWheel(screen: { x: number; y: number }, deltaY: number): void { const v = this.viewport(); if (v) this.setViewport(zoomAt(v, screen, Math.exp(-deltaY * 0.0015))); }

  pan(dx: number, dy: number): void { const v = this.viewport(); if (v) this.setViewport(panBy(v, dx, dy)); }

  resolved(levelId: Id, exigirExato = true): ResolvedLevel { return this.fluxo.resolvido(levelId, () => this.levels.get(this.project, levelId), levelId === useUi.getState().levelId, exigirExato); }

  /** Resolução do nível já pronta em segundo plano (ou do cache de geometria), sem calcular. Para a montagem da 3D. */
  resolucaoPronta(levelId: Id): ResolvedLevel | null { return this.fluxo.nivelPronto(levelId); }

  /** Libera os caches de um nível (viewport da planta e resolução). Chamado ao fechar uma aba de planta. */
  releaseLevel(levelId: Id): void {
    this.viewports.delete(levelId);
    this.levels.release(levelId); this.fluxo.liberar(levelId);
  }

  // ---------- ferramentas ----------
  get activeTool(): Tool { return this.tool; }

  /** Aplica comandos pela mesma regra das aberturas hospedadas usada pelas ferramentas (cotas temporárias). */
  applyCommands(label: string, commands: readonly Command[]): HostedApplyResult { return execWithHostedLoss(this.env, label, commands); }

  /** Zera a sequência de visibilidade em andamento (troca de vista/projeto). */
  private limparVisibilidadeBuffer(): void {
    this.visBuf = '';
    if (this.visTimer !== undefined) {
      clearTimeout(this.visTimer);
      this.visTimer = undefined;
    }
  }

  /**
   * Atalhos de visibilidade no 3D/corte com buffer próprio. Eles não passam pelo perfil (o perfil simples usa `H`
   * para reancorar, então `HH` não existiria nele); as sequências do Revit e as do perfil simples são aceitas aqui.
   * Devolve `null` quando a tecla não pertence a nenhuma sequência.
   */
  private atalhoVisibilidadeDaVista(k: string, e: KeyboardEvent): boolean | null {
    // Se o casador já está no meio de uma ferramenta (ME, DI, MV...), a tecla pertence a ela.
    if (casador.pendente) return null;
    if (e.altKey || useUi.getState().typed || this.tool.freeText) return null;
    if (!/^[A-Za-z0-9]$/.test(k)) {
      this.limparVisibilidadeBuffer();
      return null;
    }
    const tentativa = this.visBuf + k.toUpperCase();
    const exato = VIS_SEQUENCES[tentativa];
    if (exato) {
      this.limparVisibilidadeBuffer();
      return this.executaComandoDeVisibilidade(exato);
    }
    if (Object.keys(VIS_SEQUENCES).some((seq) => seq.startsWith(tentativa))) {
      this.visBuf = tentativa;
      if (this.visTimer !== undefined) clearTimeout(this.visTimer);
      this.visTimer = setTimeout(() => {
        this.visTimer = undefined;
        this.visBuf = '';
        if (useUi.getState().status === `Atalho: ${tentativa}…`) useUi.setState({ status: '' });
      }, 2000);
      useUi.setState({ status: `Atalho: ${tentativa}…` });
      return true;
    }
    this.limparVisibilidadeBuffer();
    return null;
  }

  /** Executa um atalho de visibilidade; falso quando o comando é de ferramenta (o chamador decide). */
  private executaComandoDeVisibilidade(cmd: ShortcutCommand): boolean {
    switch (cmd) {
      case 'temporaryHide': temporaryHideSelection(); return true;
      case 'temporaryCategory': temporarySelectedCategory(false); return true;
      case 'temporaryIsolate': temporaryIsolateSelection(); return true;
      case 'isolateCategory': temporarySelectedCategory(true); return true;
      case 'resetTemporary': resetTemporaryHidden(); return true;
      case 'hideInView': hideSelectionInView(); return true;
      case 'hideCategoryInView': hideSelectedCategoryInView(); return true;
      case 'revealHidden': toggleRevealHidden(); return true;
      case 'unhideInView': unhideSelectionInView(); return true;
      case 'unhideCategoryInView': unhideSelectedCategoryInView(); return true;
      default: return false;
    }
  }

  /**
   * Zera o arraste de rótulo e o clique suprimido: os dois valem só para o gesto em que começaram. Sem isto, um
   * `down` no rótulo seguido de `up` com arrasto (que não emite `click`) deixa o clique suprimido armado, e o
   * `tagDrag` residual passa a mover o rótulo antigo no próximo arrasto, em qualquer vista ou projeto.
   */
  private limparArrasteRotulo(): void {
    this.tagDrag = null;
    this.suppressNextClick = false;
    if (useUi.getState().tagDrag) useUi.setState({ tagDrag: null });
  }

  private activate(id: ToolId, tool: Tool = createTool(id, this.env)): void {
    this.limparArrasteRotulo();
    this.tool = tool;
    useUi.setState({ tool: id, typed: '', prompt: null, hover: null });
    this.tool.start();
    this.bump();
  }

  // Perímetro: Telhado, Piso, Laje e Forro abrem o modo; com o modo aberto, trocar de ferramenta não conclui (a barra pede Concluir ou Cancelar).
  setTool(id: ToolId): void {
    // Trocar de ferramenta encerra qualquer arraste de rótulo em andamento (inclusive nos retornos antecipados abaixo).
    this.limparArrasteRotulo();
    const st = useUi.getState();
    // A planta de área é de anotação: ferramentas de modelo não entram nela (nem por atalho, nem ao voltar de um corte).
    if (st.planKind === 'area' && st.view !== '3d' && !areaPlanToolAllowed(id)) {
      useUi.setState({ status: 'Na planta de área ficam disponíveis só as ferramentas de anotação (medir, cota, texto, etiqueta e detalhe).' });
      return;
    }
    if (this.perimetro.intercepta(id)) return;
    // No corte/elevação só entram as ferramentas de leitura e anotação. As de desenho de planta não devem expulsar
    // o usuário da vista: apenas explicam por que não estão disponíveis ali.
    if (st.view === 'section' && !SECTION_TOOLS.has(id)) {
      useUi.setState({ status: 'Esta ferramenta é da planta. No corte use Medir, Cota, Texto, Detalhe, Alinhar ou Mover.' });
      return;
    }
    if (clearSelectionForTool(id)) useUi.setState({ selection: [] });
    this.activate(id);
  }

  bump(): void {
    // Sem campo numérico a caixa some; o buffer digitado não pode sobreviver a ela, senão prende os atalhos de letra sem aviso.
    useUi.setState((s) => {
      const prompt = this.tool.inputPrompt();
      return { previewTick: s.previewTick + 1, prompt, typed: prompt ? s.typed : '' };
    });
  }

  pointer(kind: 'move' | 'down' | 'drag' | 'up' | 'click', info: PointerInfo): void {
    const ui = useUi.getState();
    // Rótulo do ambiente: alvo do arraste na planta de piso e na de área. Só com a ferramenta Selecionar:
    // com Cota/Texto/Etiqueta/Detalhe/Medir ativos, o clique é da ferramenta (a planta de área é de anotação).
    // A posição é do MODELO (vale em todas as vistas).
    if (ui.tool === 'select' && ui.view === 'plan' && (ui.planKind === 'area' || ui.planKind === 'floor')) {
      const levelPlan = ui.planKind === 'area' ? (ui.areaPlanId ? areaPlanOf(this.project, ui.areaPlanId) : undefined) : areaPlansOfLevel(this.project, ui.levelId)[0];
      const planId = levelPlan?.id ?? null;
      const scale = levelPlan?.scale ?? 50;
      if (kind === 'down') {
        // A anotação da vista fica por cima do rótulo do ambiente: com uma cota/texto sob o cursor, o clique é dela.
        const anotacao = annotationAt(this.project, ui.levelId, info.raw, this.env.metersPerPixel(), planId ?? undefined);
        // Etiqueta de ambiente (RoomTag) da vista: é selecionável e arrastável pelo `selectTool` (grava em RoomTag.at).
        const etiqueta = ui.planKind === 'area' && planId ? roomTagAt(this.project, info.raw, this.env.metersPerPixel(), planId) : null;
        const hit = anotacao || etiqueta ? null : labelHit(this.project, ui.levelId, scale, planId, info.raw);
        if (hit) {
          this.tagDrag = { planId, roomId: hit.roomId, offset: { x: hit.at.x - info.raw.x, y: hit.at.y - info.raw.y }, at: hit.at, moved: false };
          useUi.setState({ status: 'Arraste o rótulo e solte para posicionar. A chamada liga ao sair do ambiente.' });
          return;
        }
      }
      if (kind === 'drag' && this.tagDrag) {
        this.tagDrag.at = { x: info.raw.x + this.tagDrag.offset.x, y: info.raw.y + this.tagDrag.offset.y };
        this.tagDrag.moved = true;
        useUi.setState({ tagDrag: { planId: this.tagDrag.planId ?? '', roomId: this.tagDrag.roomId, at: this.tagDrag.at } });
        return;
      }
      if (kind === 'up' && this.tagDrag) {
        const d = this.tagDrag;
        this.tagDrag = null;
        if (d.moved) {
          this.store.exec({ type: 'setRoomLabel', id: d.roomId, position: d.at }, 'Mover rótulo');
          this.suppressNextClick = true;
          useUi.setState({ tagDrag: null, status: 'Rótulo reposicionado em todas as vistas. Ctrl+Z desfaz.' });
        } else {
          // Clique sem arrastar: seleciona o ambiente para configurar o rótulo no painel.
          this.suppressNextClick = true;
          useUi.setState({ tagDrag: null, selection: [d.roomId] });
        }
        return;
      }
      if (kind === 'click' && this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
    }
    // Planta de área: o `selectTool` decide o alvo (anotação da vista antes do modelo e o ambiente por último). O
    // atalho antigo de pegar o ambiente aqui impedia cotas e textos de receberem o clique.
    const t = this.tool;
    switch (kind) {
      case 'move':
        t.move(info);
        if (t.id === 'select') {
          const first = t.preview().find((i) => i.kind === 'highlight');
          useUi.setState({ hover: first && first.kind === 'highlight' ? (first.ids[0] ?? null) : null });
        }
        break;
      case 'down':
        t.down?.(info);
        break;
      case 'drag':
        if (t.drag) t.drag(info);
        else t.move(info);
        break;
      case 'up':
        t.up?.(info);
        break;
      case 'click':
        t.click(info);
        break;
    }
    this.bump();
  }

  // ---------- teclado ----------
  /** Devolve true se a tecla foi consumida. */
  key(e: KeyboardEvent): boolean {
    const ui = useUi.getState();
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    // Na aba de prancha, as teclas de ferramenta e de seleção não valem (o desfazer, com Ctrl, vale).
    if (ui.view === 'sheet' && !mod) return false;
    if (mod && (k === 'z' || k === 'Z')) {
      if (this.stairPickHistory(e.shiftKey)) return true;
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (mod && (k === 'y' || k === 'Y')) {
      if (this.stairPickHistory(true)) return true;
      this.redo();
      return true;
    }
    if (mod && (k === 's' || k === 'S')) {
      this.save();
      return true;
    }
    if (mod && ui.view === 'plan' && /^[cvx]$/i.test(k) && !this.perimetro.ativo) {
      const tecla = k.toLowerCase();
      if (tecla === 'c') return this.copySelection();
      if (tecla === 'x') return this.cutSelection();
      return this.pasteAligned();
    }
    if (mod) return /^a$/i.test(k) && this.perimetro.selecionarTudo();
    if (k === 'F3') {
      const cur = (useUi.getState().options.snap ?? DEFAULT_SNAP).enabled !== false;
      setSnap({ enabled: !cur });
      useUi.setState({ status: !cur ? 'Capturas ativadas (F3)' : 'Capturas desativadas (F3)' });
      return true;
    }
    if (k === 'F8') {
      toggleOrtho();
      return true;
    }
    if (k === 'F10') {
      togglePolar();
      return true;
    }
    if (k === 'F11') {
      const cur = (useUi.getState().options.snap ?? DEFAULT_SNAP).alignment;
      setSnap({ alignment: !cur });
      useUi.setState({ status: !cur ? 'Rastreamento de alinhamento ativado (F11)' : 'Rastreamento de alinhamento desativado (F11)' });
      return true;
    }
    // 3D e corte não trocam de ferramenta: só os atalhos de visibilidade atravessam o `key3d` (HH/HR/RH/EH...).
    if (ui.view === '3d' || ui.view === 'section') {
      const vis = this.atalhoVisibilidadeDaVista(k, e);
      if (vis !== null) return vis;
    }
    if (ui.view === 'section') {
      if (k === 'Escape') {
        // Esc no corte/elevação NUNCA fecha a vista: fechar é só pela aba ou pelo botão "Voltar à planta".
        // Ele cancela a ferramenta ativa e o estado pendente dela; já na Selecionar, limpa seleção, realce e status.
        casador.limpar();
        if (ui.typed) useUi.setState({ typed: '' });
        this.limparArrasteRotulo();
        if (this.tool.id !== 'select') {
          this.tool.cancel();
          if (useUi.getState().hover) useUi.setState({ hover: null });
          this.bump();
        } else if (ui.selection.length > 0 || ui.hover || ui.status) {
          useUi.setState({ selection: [], hover: null, status: '' });
        }
        return true;
      }
      // Delete e Backspace excluem a seleção, como na 3D (decisão 0016 §5). As demais teclas seguem para os
      // atalhos normais de ferramenta/anotação; antes o `key3d` engolia ME/DI/TX/AL.
      if (k === 'Delete' || k === 'Backspace') return key3d(k, ui.selection, () => this.deleteSelection());
    }
    // Na 3D, Esc segue o da planta (cancela a operação, senão volta à Selecionar; decisão 0016 §5). Ferramenta de escolha (Anexar topo): Enter e Tab seguem para a planta, senão a etapa não avança.
    if (ui.view === '3d' && k !== 'Escape' && !(this.tool.pick3d && (k === 'Enter' || k === 'Tab'))) return key3d(k, ui.selection, () => this.deleteSelection());
    if (k === 'Escape') {
      casador.limpar(); if (ui.typed) useUi.setState({ typed: '' });
      // Ferramenta de texto: Esc com texto digitado também cancela o ponto, senão a próxima tecla vira texto.
      if (!ui.typed || this.tool.freeText) { this.limparArrasteRotulo(); if (!this.perimetro.esc()) this.tool.cancel(); }
      this.bump();
      return true;
    }
    // Qualquer outra tecla de controle (Enter, Tab, Delete, Espaço…) interrompe uma sequência em andamento; modificadores não.
    if (k.length > 1 && !['Shift', 'Control', 'Alt', 'Meta'].includes(k)) casador.limpar();
    if (k === 'Enter') {
      if (ui.typed) {
        const ok = this.tool.type(ui.typed);
        if (ok) useUi.setState({ typed: '' });
      } else this.tool.confirm();
      this.bump();
      return true;
    }
    if (k === 'Backspace' && ui.typed) {
      useUi.setState({ typed: ui.typed.slice(0, -1) });
      return true;
    }
    if (k === 'Delete' || k === 'Backspace') {
      // Vértice de piso em foco: a ferramenta o remove antes de a seleção ser excluída.
      if (this.tool.deleteKey?.()) {
        // Repinta a barra da ferramenta (contador de espelhos, aviso) sem esperar o próximo clique.
        this.bump();
        return true;
      }
      if (ui.selection.length && !this.perimetro.ativo) { this.deleteSelection(); return true; }
    }
    if (/^a$/i.test(k) && !ui.typed && this.tool.adjust?.()) { this.bump(); return true; } // A ajusta a rampa livre em andamento
    if (k === 'Tab') {
      this.tool.tab();
      this.bump();
      return true;
    }
    if (k === ' ' && this.tool.id === 'wall') {
      this.tool.space?.();
      this.bump();
      return true;
    }
    // Campo numérico: dígitos, operadores e sufixo de unidade (`120cm`, `5'6"`); ferramenta de texto (freeText): qualquer tecla digitável.
    if (this.tool.inputPrompt() && (this.tool.freeText ? k.length === 1 : aceitaCaractereNumerico(k, ui.typed))) {
      useUi.setState({ typed: ui.typed + k });
      return true;
    }
    if (k === ' ' && (this.tool.id === 'door' || this.tool.id === 'window')) {
      this.tool.space?.(); this.bump();
      return true;
    }
    // Atalho por sequência (ex.: WA). Alt não dispara; digitação ativa ou ferramenta de texto (freeText, sem ponto) não deixa letras virarem atalho.
    if (e.altKey || ui.typed || this.tool.freeText) return false;
    const r = casador.tecla(k);
    if (!r.tratada) return false;
    if (r.comando === 'atalhos' || r.comando === 'unidades') useUi.setState({ dialog: r.comando === 'atalhos' ? 'shortcutsConfig' : 'units', dialogArg: null });
    else if (r.comando === 'createSimilar') startCreateSimilar(this.project, (id) => this.setTool(id));
    else if (r.comando && this.executaComandoDeVisibilidade(r.comando)) { /* executado */ }
    else if (r.comando) this.setTool(r.comando as ToolId);
    return true;
  }

  // ---------- seleção e edição ----------
  private pruneSelection(): void {
    const sel = useUi.getState().selection;
    const p = this.store.project;
    // A seleção guarda ids de elementos, cotas/textos (do nível ou da planta de área) e vistas: só sai o que sumiu.
    const st = useUi.getState();
    const plan = st.view === 'plan' && st.planKind === 'area' && st.areaPlanId ? areaPlanOf(p, st.areaPlanId) : undefined;
    const notes = new Set([...annotationIdsIn(p, st.levelId, sel), ...(plan ? planAnnotationIds(plan).filter((id) => sel.includes(id)) : [])]);
    const views = new Set(p.views.map((v) => v.id));
    const seps = new Set(levelRoomSeparators(p, st.levelId).map((r) => r.id));
    const keep = sel.filter((id) => p.elements[id] || notes.has(id) || sectionAnnotationIdsIn(p).has(id) || views.has(id) || seps.has(id) || projectGrids(p).some((g) => g.id === id));
    if (keep.length !== sel.length) useUi.setState({ selection: keep });
    const lv = useUi.getState().levelId;
    if (!p.levels.some((l) => l.id === lv)) useUi.setState({ levelId: p.levels[0]?.id ?? 'lv_0' });
    const after = useUi.getState();
    if (after.view === 'section' && !p.views.some((v) => v.id === after.sectionId)) useUi.setState({ view: 'plan', sectionId: null });
  }

  // ---------- cortes e elevações ----------
  /** Abre um corte ou elevação na área central, com viewport próprio. */
  openSection(id: Id): void {
    if (this.perimetro.bloqueiaNavegacao() || !this.project.views.some((v) => v.id === id)) return;
    // Ao abrir, enquadra de novo: descarta o viewport guardado desta vista.
    this.viewports.delete(`sec:${id}`);
    useUi.setState({ view: 'section', sectionId: id, selection: [], hover: null });
    this.activate('select');
  }

  /** Volta à planta do nível ativo. */
  closeSection(): void {
    if (useUi.getState().view !== 'section') return;
    useUi.setState({ view: 'plan', sectionId: null, hover: null });
    this.activate('select');
  }

  updateView(id: Id, patch: Partial<Omit<SectionView, 'id'>>): string | null {
    return updateViewAction(this.store, id, patch);
  }

  renameView(id: Id, name: string): boolean {
    return renameViewAction(this.store, id, name);
  }

  deleteView(id: Id): void {
    deleteViewAction(this.store, id);
  }

  /** Gera (ou atualiza) as quatro elevações do nível ativo, em um único passo de desfazer. */
  generateElevations(): void {
    const box = levelFrameBox(this.project, useUi.getState().levelId);
    if (!box) {
      useUi.setState({ status: 'Não há paredes neste nível para gerar elevações.' });
      return;
    }
    this.store.exec(elevationCommand(this.project.views, box, newId), 'Gerar elevações');
    useUi.setState({ status: 'Elevações Norte, Sul, Leste e Oeste geradas. Ctrl+Z desfaz.' });
  }

  deleteSelection(): void {
    if (deleteSectionAnnotationsIn(this.store) === 0) return;
    void deleteSelectionIn(this.store);
  }

  /** Copiar (Ctrl+C): paredes selecionadas e suas aberturas, em memória. */
  copySelection(): boolean { return transfer.copy(this.project, useUi.getState().selection); }

  /** A seleção inteira é copiável? (Recortar só apaga o que o buffer consegue levar.) */
  canCutSelection(ids: readonly Id[] = useUi.getState().selection, p: Project = this.project): boolean {
    if (ids.length === 0) return false;
    const copiaveis = transfer.copyableIds(p, ids);
    return ids.every((id) => copiaveis.includes(id));
  }

  /** Recortar (Ctrl+X): copia e apaga a seleção num passo de desfazer. */
  cutSelection(): boolean {
    const ids = useUi.getState().selection;
    if (!this.canCutSelection(ids)) {
      useUi.setState({ status: 'Recortar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas (com a parede selecionada).' });
      return false;
    }
    if (!transfer.copy(this.project, ids)) return false;
    this.deleteSelection();
    useUi.setState({ status: 'Recortado(s). Ctrl+V cola seguindo o cursor.' });
    return true;
  }

  /** Colar (Ctrl+V): entrega o buffer ao modo Colar, que acompanha o cursor até o clique. */
  pasteAligned(): boolean {
    const clip = transfer.clipBuffer();
    if (!clip) {
      useUi.setState({ status: 'Nada copiado. Use Copiar ou Ctrl+C.' });
      return false;
    }
    setPasteClip(clip);
    this.setTool('paste');
    return useUi.getState().tool === 'paste';
  }

  /** Abre o diálogo "Selecionar níveis" do Colar alinhado aos níveis selecionados. */
  openPasteLevelsDialog(): boolean {
    if (!transfer.hasClip()) {
      useUi.setState({ status: 'Nada copiado. Use Copiar ou Ctrl+C.' });
      return false;
    }
    // Pré-aquece o 3D atrás do diálogo: quando o usuário clicar em "Pré-visualizar", a cena já está montada.
    const st = useUi.getState();
    guardarOrigemDoColar({ view: st.view, levelId: st.levelId, sectionId: st.sectionId, planKind: st.planKind, areaPlanId: st.areaPlanId });
    limparPreviaPreparada();
    // Primeiro o diálogo aparece; o 3D começa a montar atrás dele no quadro seguinte (assim o clique não trava).
    useUi.setState({ dialog: 'selectLevels', dialogArg: null });
    if (st.view !== '3d') {
      setTimeout(() => {
        if (useUi.getState().dialog === 'selectLevels' && origemDoColar()) this.setView('3d');
      }, 150);
    }
    return true;
  }

  /** Fecha o diálogo sem colar e devolve a vista de onde ele foi aberto. */
  cancelPasteLevelsDialog(): void {
    const origem = origemDoColar();
    limparOrigemDoColar();
    limparPreviaPreparada();
    useUi.setState({ dialog: null });
    if (origem && origem.view !== '3d') this.restaurarVistaDeOrigem(origem);
  }

  /** Restaura planta/corte/elevação de origem (o 3D fica montado em segundo plano). */
  private restaurarVistaDeOrigem(o: OrigemDoColar): void {
    if (o.view === 'section') {
      useUi.setState({ view: 'section', sectionId: o.sectionId, levelId: o.levelId });
    } else if (o.view === 'plan') {
      useUi.setState({ view: 'plan', planKind: o.planKind, areaPlanId: o.areaPlanId, sectionId: null, levelId: o.levelId });
    } else {
      useUi.setState({ view: '3d' });
    }
  }

  /**
   * Entra no modo de prévia do colar alinhado: guarda a vista de origem, troca para o 3D enquadrado e abre a aba
   * contextual "Modificar | Colar alinhado" (V confirma, X cancela). Nada é gravado no modelo aqui.
   */
  previewPasteLevels(levelIds: Id[], link: boolean): boolean {
    const clip = transfer.clipBuffer();
    if (!clip) {
      useUi.setState({ status: 'Nada copiado. Use Copiar ou Ctrl+C.' });
      return false;
    }
    const niveis = [...new Set(levelIds)];
    if (niveis.length === 0 || niveis.length !== levelIds.length || !niveis.every((id) => this.project.levels.some((l) => l.id === id))) {
      useUi.setState({ status: 'Escolha ao menos um nível de destino válido.' });
      return false;
    }
    // Limpa um sinal de confirmação que tenha sobrado de uma prévia anterior.
    consumirManterCameraDaPrevia();
    // Calcula o lote e o rascunho ANTES de trocar de vista: o 3D já abre com todos os fantasmas e o "Colar" reaproveita
    // exatamente este lote (sem recalcular nem trocar os ids).
    performance.mark('colar-preparar-inicio');
    const pronta = prepararPrevia(this.project, clip, niveis, link);
    performance.mark('colar-preparar-fim');
    performance.measure('colar-preparar', 'colar-preparar-inicio', 'colar-preparar-fim');
    if (!pronta) {
      useUi.setState({ status: 'Não há o que colar nos níveis escolhidos.' });
      return false;
    }
    // A vista de origem é a de quando o diálogo abriu (o 3D atrás dele é só pré-aquecimento).
    const origem = origemDoColar();
    const st = useUi.getState();
    const preview: PastePreviewState = {
      levelIds: niveis,
      count: transfer.elementCount(clip) * niveis.length,
      originView: origem?.view ?? st.view,
      originLevelId: origem?.levelId ?? st.levelId,
      originSectionId: origem?.sectionId ?? st.sectionId,
      originPlanKind: origem?.planKind ?? st.planKind,
      originAreaPlanId: origem?.areaPlanId ?? st.areaPlanId,
      link,
    };
    performance.mark('colar-vista-inicio');
    this.setView('3d');
    useUi.setState({
      pastePreview: preview,
      selection: [],
      status: `Prévia de ${preview.count} cópia(s) em ${niveis.length} nível(is). V cola; X cancela.`,
    });
    performance.mark('colar-vista-fim');
    performance.measure('colar-vista', 'colar-vista-inicio', 'colar-vista-fim');
    return true;
  }

  /** Confirma a prévia: grava tudo num único passo de desfazer e sai do modo de conferência. */
  confirmPasteLevels(): boolean {
    const preview = useUi.getState().pastePreview;
    if (!preview) return false;
    const pronta = previaPreparada();
    const mesmaPrevia = pronta !== null
      && pronta.link === preview.link
      && pronta.levelIds.length === preview.levelIds.length
      && pronta.levelIds.every((id, i) => id === preview.levelIds[i]);
    const ok = mesmaPrevia
      ? transfer.applyPrepared(this.store, pronta)
      : transfer.pasteToLevels(this.store, preview.levelIds, preview.link) !== null;
    if (ok) manterCameraDaPrevia();
    limparPreviaPreparada();
    limparOrigemDoColar();
    useUi.setState({ pastePreview: null });
    return ok;
  }

  /** Cancela a prévia e volta para a vista de origem, sem tocar no modelo. */
  cancelPasteLevels(): void {
    const preview = useUi.getState().pastePreview;
    limparPreviaPreparada();
    limparOrigemDoColar();
    useUi.setState({ pastePreview: null });
    if (!preview) return;
    this.restaurarVistaDeOrigem({
      view: preview.originView,
      levelId: preview.originLevelId,
      sectionId: preview.originSectionId,
      planKind: preview.originPlanKind ?? 'floor',
      areaPlanId: preview.originAreaPlanId ?? null,
    });
    useUi.setState({ status: 'Colar alinhado cancelado.' });
  }

  /** Cola direto, sem prévia (caminho do botão "Colar" do diálogo). */
  pasteLevelsDirect(levelIds: Id[], link: boolean): boolean {
    const origem = origemDoColar();
    limparOrigemDoColar();
    limparPreviaPreparada();
    const ok = transfer.pasteToLevels(this.store, levelIds, link) !== null;
    // O 3D atrás do diálogo era só pré-aquecimento: quem cola direto volta para a vista de onde abriu.
    if (ok && origem && origem.view !== '3d' && useUi.getState().view === '3d') this.restaurarVistaDeOrigem(origem);
    return ok;
  }

  /** Primeiro vínculo de andar-tipo na seleção (o elemento pode ser a origem ou uma cópia). */
  private linkedSelection(): { linkId: Id; fromId: Id } | null {
    for (const id of useUi.getState().selection) {
      const link = copyLinkOf(this.project, id);
      if (link) return { linkId: link.id, fromId: id };
    }
    return null;
  }

  /** "Sincronizar": leva a geometria/parâmetros do elemento selecionado para as cópias vinculadas. */
  syncLinkedSelection(): boolean {
    const found = this.linkedSelection();
    if (!found) {
      useUi.setState({ status: 'Selecione um elemento de andar-tipo (cópia vinculada) para sincronizar.' });
      return false;
    }
    const command = syncWholeLinkCommand(this.project, found.linkId, found.fromId);
    if (!command) {
      useUi.setState({ status: 'Não há outras cópias vinculadas para sincronizar.' });
      return false;
    }
    this.store.exec(command, 'Sincronizar cópias vinculadas');
    useUi.setState({ status: 'Andar-tipo sincronizado. Ctrl+Z desfaz.' });
    return true;
  }

  /** "Desvincular": as cópias continuam no projeto, mas deixam de fazer parte do andar-tipo. */
  unlinkLinkedSelection(): boolean {
    const found = this.linkedSelection();
    if (!found) {
      useUi.setState({ status: 'Selecione um elemento de andar-tipo (cópia vinculada) para desvincular.' });
      return false;
    }
    this.store.exec({ type: 'deleteCopyLink', id: found.linkId }, 'Desvincular cópias');
    useUi.setState({ status: 'Cópias desvinculadas: continuam no projeto, mas não sincronizam mais. Ctrl+Z desfaz.' });
    return true;
  }

  /** Seleciona todas as paredes e aberturas do nível ativo com o tipo dado. */
  selectAllOfType(typeId: Id): number { return transfer.ofType(this.project, useUi.getState().levelId, typeId); }
  /** "Mesmo tipo" (botão na aba Modificar). */
  selectAllOfSelectedType(): boolean { this.setTool('select'); return transfer.sameType(this.project, useUi.getState().levelId) > 0; }
  /** "Mesmo nome" dos ambientes selecionados (botão na aba Modificar). */
  selectAllOfSelectedName(): boolean { this.setTool('select'); return transfer.sameName(this.project, useUi.getState().levelId) > 0; }

  /** Ctrl+Z / Ctrl+Y no croqui da escada: desfaz ou refaz a última linha pegada. Sem pegada, vale o histórico do modelo. */
  private stairPickHistory(redo: boolean): boolean {
    const t = this.tool;
    if (!isStairTool(t)) return false;
    const done = redo ? t.redoPick() : t.undoPick();
    if (done) this.bump();
    return done;
  }

  // Com o modo de perímetro aberto, desfazer e refazer valem para o rascunho do esboço, nunca para o projeto.
  undo(): void { if (!this.perimetro.historico(false)) desfazerOuRefazer(this.store, 'undo'); }
  redo(): void { if (!this.perimetro.historico(true)) desfazerOuRefazer(this.store, 'redo'); }

  /**
   * Cotas automáticas da planta (camadas por lado: aberturas → paredes → contorno → total). As cotas entram como
   * qualquer cota manual, com `refs` nas pontas de parede (associativas e projetadas no eixo do lado).
   */
  cotasAutomaticasDaPlanta(opts: AutoCotaOptions = {}): void {
    const st = useUi.getState();
    const levelId = st.levelId;
    const plan = st.view === 'plan' && st.planKind === 'area' && st.areaPlanId ? areaPlanOf(this.store.project, st.areaPlanId) : undefined;
    const cotas = cotasAutomaticas(this.store.project, levelId, opts);
    // Na planta de área, as cotas são anotações da vista (`plan.annotations`): entram com `planId`, não no nível.
    // Todas as cotas geradas entram num só passo de desfazer (Ctrl+Z desfaz o lote inteiro).
    this.store.transaction('Cotas automáticas', () => {
      for (const dimension of cotas) this.store.exec({ type: 'addDimension', levelId, ...(plan ? { planId: plan.id } : {}), dimension });
    });
    useUi.setState({
      status: cotas.length > 0
        ? `${cotas.length} cotas automáticas criadas ${plan ? 'na planta de área' : 'no nível'}. Ctrl+Z desfaz.`
        : 'Nenhuma cota gerada: confira as camadas escolhidas e os lados com parede paralela.',
    });
  }

  selectLevel(id: Id, kind: PlanKind = 'floor', areaPlanId: Id | null = null): void {
    if (this.perimetro.bloqueiaNavegacao()) return;
    useUi.setState((s) => ({ levelId: id, planKind: kind, areaPlanId: kind === 'area' ? areaPlanId : null, selection: [], hover: null, view: 'plan', sectionId: null, previewTick: s.previewTick + 1 }));
    this.setTool('select');
  }

  setView(v: 'plan' | '3d'): void {
    if (this.perimetro.bloqueiaNavegacao()) return;
    // Mudar de vista encerra o arraste de rótulo: o gesto pertence à planta em que começou.
    this.limparArrasteRotulo();
    this.limparVisibilidadeBuffer();
    useUi.setState((s) => ({ view: v, hover: null, typed: '', previewTick: s.previewTick + 1 }));
  }

  // ---------- arquivo ----------
  newProject(id: TemplateId): void {
    this.load(buildTemplate(id), 'projeto.hestia.json');
  }

  load(p: Project, name: string): void {
    // Projeto novo (ou aberto): o arraste de rótulo e a visibilidade temporária do projeto anterior não sobrevivem.
    this.limparArrasteRotulo();
    this.limparVisibilidadeBuffer();
    resetAllTemporary();
    this.perimetro.encerrar(); this.store.load(p);
    this.fileName = name;
    this.levels.clear(); this.fluxo.abrir(p, this.store.version).forEach((id) => this.resolved(id));
    void abrirComCache(this.portasAbertura, p);
    this.viewports.clear();
    this.sectionCache.clear(); this.sectionPending.clear(); this.sectionToFrame.clear(); this.sectionClient?.cancelarTodos();
    // Abas de vista são da sessão: projeto novo começa só com o nível ativo, sem herdar abas do anterior.
    useUi.setState({ selection: [], levelId: p.levels[0]?.id ?? 'lv_0', view: 'plan', planKind: 'floor', areaPlanId: null, sectionId: null, openViews: defaultOpenViews(p.levels.map((l) => l.id)), options: { ...useUi.getState().options, wallTypeId: p.defaults.wallTypeId, doorTypeId: p.defaults.doorTypeId, windowTypeId: p.defaults.windowTypeId, floorTypeId: keptFloorType(p, useUi.getState().options.floorTypeId), slabTypeId: keptSlabType(p, useUi.getState().options.slabTypeId) } });
    this.setTool('select');
  }

  openFromText(text: string, name: string): { ok: true } | { ok: false; error: string } {
    try {
      this.load(migrateProject(JSON.parse(text)), name);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Arquivo inválido' };
    }
  }

  /**
   * Salva o projeto. Dentro de um artefato do claude.ai o download direto é bloqueado, então usa a
   * capacidade `downloads` (o viewer confirma). Fora dele, baixa o arquivo; em último caso copia o JSON.
   */
  async save(): Promise<void> {
    const text = JSON.stringify(this.project, null, 1);
    const name = safeFilename(`${this.project.name.trim() || 'projeto'}.hestia.json`);
    safeSet(AUTOSAVE_KEY, text);
    const entrega = await entregarArquivo({ nome: name, conteudo: text });
    if (entrega === 'salvo') {
      this.store.markSaved();
      useUi.setState({ status: `Salvo como ${name}.` });
      return;
    }
    if (entrega === 'cancelado') {
      useUi.setState({ status: 'Salvamento cancelado. O projeto continua guardado neste navegador.' });
      return;
    }
    const downloaded = entrega === 'baixado';
    this.store.markSaved();
    try {
      await navigator.clipboard.writeText(text);
      useUi.setState({ status: downloaded ? `Arquivo ${name} gerado e JSON copiado.` : 'JSON do projeto copiado para a área de transferência.' });
    } catch {
      useUi.setState({ status: downloaded ? `Arquivo ${name} gerado.` : 'Não foi possível baixar. O projeto está guardado neste navegador.' });
    }
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => safeSet(AUTOSAVE_KEY, JSON.stringify(this.project, null, 1)), 800);
  }

  restoreAutosave(): boolean {
    const raw = safeGet(AUTOSAVE_KEY);
    if (!raw) return false;
    try {
      this.load(migrateProject(JSON.parse(raw)), 'projeto.hestia.json');
      return true;
    } catch {
      return false;
    }
  }


}

export const editor = new Editor();

/** Reage a qualquer mudança do projeto (documento + histórico). */
export function useProjectVersion(): number {
  return useSyncExternalStore(
    (cb) => editor.store.subscribe(cb),
    () => editor.store.version,
  );
}
export const useProject = (): Project => {
  useProjectVersion();
  return editor.project;
};
