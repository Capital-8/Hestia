/* eslint-disable max-lines -- a vista reúne planta, 3D, corte e o editor da cota; extrair depois. */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { DARK, LIGHT, CamadaFantasmas, ModelScene, PickGpu3d, PlanFrame, PlanScene, aplicarCameraNaOrbita, criarControladorGpu, drawPlanOnCanvas, pickDimension, pickElement, pickModelPoint, planFrameUpdateOf, reiniciarEstadoGpu, sameView, screenToWorld, type ControladorGpu, type GpuContext, type LabelOp, type PlanDrawList, type PreferenciaGpu, type Viewport } from '@hestia/render';
import { view3dOf, type Id, type Project } from '@hestia/model';
import { useShallow } from 'zustand/react/shallow';
import { editor } from '../editor/controller.ts';
import { transfer } from '../editor/transfer.ts';
import { consumirManterCameraDaPrevia, guardarCamera, limparPreviaPreparada, montarPrevia, previaPreparada, restaurarCamera, type CameraDaPrevia } from '../editor/pastePreview.ts';
import { visibilityOf } from '../editor/viewVisibility.ts';
import { usePerimeter } from '../editor/perimeter.ts';
import { hoverSectionAt, sectionPickAt } from '../editor/sectionPick.ts';
import { clickSelect3d, useUi } from '../editor/state.ts';
import { consumirCameraPendente, registrarOrbita3D } from '../editor/vista3dAoVivo.ts';
import { thinLinesOn } from '../editor/graphicsActions.ts';
import { buildSectionFrame } from './SectionCanvas.tsx';
import { selecionarNivelNoClique } from './nivelPick3d.ts';
import { NivelCotaEditor, type NivelCotaEditorHandle } from './NivelCotaEditor.tsx';
import { PlanLabels, type PlanLabelsHandle } from './PlanLabels';
import { ViewportOverlays } from './ViewportOverlays.tsx';
import { abrirMenuDeContexto, viewDoMenu } from './useCanvasContextMenu.ts';
import { useDark } from './useDark.ts';
import { criarMontagemVista3d, type Montagem3dProgressiva } from './montagem3dProgressiva.ts';
import { QuadroPlanta } from './quadroPlanta.ts';
import { medirQuadro, useContarCommitPerf, usePerfDaUrl } from '../debug/perf/index.ts';
import { eventosDeSolta, gestosComShift, passouDoLimiar } from './planGestos.ts';
import { cliqueAdiadoInicial, decidirCliqueAdiado, type EstadoCliqueAdiado } from './cliqueAdiado.ts';

interface Pt {
  x: number;
  y: number;
}

/** Modificadores capturados no evento: o `down` adiado (D1) sai depois, quando o evento original já não existe. */
interface Mods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** Down guardado enquanto a vista não existe (ver `adiarDown`): ponto, modificadores e a solta que porventura chegue antes. */
interface DownAdiado {
  estado: EstadoCliqueAdiado;
  ponto: Pt;
  mods: Mods;
  frame: number;
  soltura: { ponto: Pt; mods: Mods } | null;
}

/** Rótulos vazios com referência fixa: a planta compara por identidade para não atualizar o estado à toa. */
const NO_LABELS: LabelOp[] = [];

/** Ganchos da vista 3D para a prévia do Colar alinhado. */
export interface ViewportCanvasProps {
  /**
   * Rascunho da prévia já montado pelo integrador. Quando presente, a cena só o desenha; quando ausente, o
   * canvas monta o rascunho a partir do clipboard (`montarPrevia`) enquanto `useUi.pastePreview` existir.
   */
  projetoDePrevia?: Project | null;
}

/** Desenha o plano (GPU ou CPU) e o 3D, e traduz o ponteiro em chamadas ao editor. */
export function ViewportCanvas({ projetoDePrevia }: ViewportCanvasProps = {}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const labelLayer = useRef<PlanLabelsHandle>(null);
  const gpuRef = useRef<{ gpu: GpuContext; canvas: HTMLCanvasElement } | null>(null);
  const cpuRef = useRef<HTMLCanvasElement | null>(null);
  const pickGpu = useRef<PickGpu3d | null>(null);
  const pickSize = useRef({ w: 0, h: 0 });
  const plan = useRef(new PlanScene());
  const model = useRef(new ModelScene());
  // Prévia do Colar alinhado: camada de fantasmas, rascunho em cache e a câmera de antes do comando.
  const fantasmas = useRef<CamadaFantasmas | null>(null);
  const previaProjeto = useRef<{ chave: string; projeto: Project } | null>(null);
  const previaRascunho = useRef<Project | null>(null);
  const cameraAntesDaPrevia = useRef<CameraDaPrevia | null>(null);
  // Ganchos de depuração (?debug=1): câmera orbital do 3D e a cena 3D (o e2e conta as peças do modelo).
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) Object.assign(window, { __hestia3d: model.current.orbit, __hestia3dModel: model.current });
  const modelKey = useRef('');
  const montagem = useRef<Montagem3dProgressiva | null>(null);
  // A prancha lê a câmera da MESMA vista 3D (decisão 0040) por `vista3dAoVivo`.
  useEffect(() => {
    const m = model.current;
    registrarOrbita3D(m.orbit);
    return () => registrarOrbita3D(null);
  }, []);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Rótulos da planta e a vista deles: o estado só troca quando o conteúdo ou a vista muda (`publish`).
  const [labels, setLabels] = useState<LabelOp[]>(NO_LABELS);
  const [labelView, setLabelView] = useState<Viewport | null>(null);
  const [ready, setReady] = useState(false);
  const cotaRef = useRef<NivelCotaEditorHandle>(null);
  const dark = useDark();
  // Esboço do perímetro em edição: só a planta o desenha; o quadro refaz a sobreposição quando ele muda.
  const perim = usePerimeter();
  const sketch = useMemo(
    () => (perim.active && perim.draft && perim.result ? { draft: perim.draft, result: perim.result, hover: perim.hoverId, box: perim.selectionBox } : null),
    [perim.active, perim.draft, perim.result, perim.hoverId, perim.selectionBox],
  );
  // Só o que a própria tela lê: a mudança de outros campos não re-renderiza a planta (o redesenho sai do agendamento abaixo).
  const ui = useUi(useShallow((s) => ({ view: s.view, gpu: s.gpu, prompt: s.prompt, typed: s.typed, hover: s.hover, tool: s.tool })));
  const selection = useUi((s) => s.selection);
  /** Prévia do Colar alinhado (só reage ao estado; quem o preenche é o controlador). */
  const previewState = useUi((s) => s.pastePreview);
  const frame = useRef(0);
  const dprRef = useRef(1);
  const planFrame = useRef<PlanFrame | null>(null);
  const secDl = useRef<PlanDrawList | null>(null); // R4: última lista de corte escrita na cena
  const quadroRef = useRef<QuadroPlanta | null>(null); // provisório na hora, exato depois da pintura (quadroPlanta.ts)
  const shownLabels = useRef<LabelOp[]>(NO_LABELS);
  const shownView = useRef<Viewport | null>(null);

  // Instrumentação de desempenho (Fase 0.2): só liga com `?perf=1`; sem o parâmetro não há medição nem overlay.
  // Os hooks rodam antes do boot para que o contexto criado em seguida já saia instrumentado.
  usePerfDaUrl();
  useContarCommitPerf();

  // ---- inicialização: GPU primeiro, CPU só sem suporte ----
  const controlador = useRef<ControladorGpu | null>(null);
  useEffect(() => {
    const el = host.current!;
    const qs = new URLSearchParams(location.search);
    // WebGPU só quando pedido (?gpu=webgpu) até ser validado em GPU real; o padrão é WebGL2 (docs/decisoes/0003).
    const preferencia: PreferenciaGpu = qs.get('cpu') === '1' ? 'cpu' : qs.get('gpu') === 'webgpu' ? 'auto' : 'webgl2';
    reiniciarEstadoGpu(preferencia);
    // Troca de backend ou restauração do contexto: os recursos de GPU sumiram, então a cena e o picking são refeitos.
    const limpar = (): void => {
      pickGpu.current?.dispose();
      pickGpu.current = null;
      pickSize.current = { w: 0, h: 0 };
      gpuRef.current = null;
      cpuRef.current = null;
      modelKey.current = '';
      planFrame.current?.reset();
      quadroRef.current?.invalidar();
      secDl.current = null;
    };
    const c = criarControladorGpu({
      host: el,
      preferencia,
      aoLimpar: limpar,
      aoStatus: (status) => useUi.setState({ status }),
      aoMontar: ({ gpu, canvas }) => {
        if (gpu) {
          gpu.gpu.renderer.shadowMap.enabled = true;
          gpuRef.current = gpu;
          useUi.setState({ gpu: gpu.gpu.backend });
        } else {
          cpuRef.current = canvas;
          useUi.setState({ gpu: 'cpu' });
        }
        setSize({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) });
        setReady(true);
        useUi.setState((s) => ({ previewTick: s.previewTick + 1 }));
      },
    });
    controlador.current = c;
    void c.iniciar();
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => {
      montagem.current?.cancelar();
      ro.disconnect();
      c.dispose();
      controlador.current = null;
      fantasmas.current?.dispose();
      fantasmas.current = null;
    };
  }, []);

  const safeRender = (g: { gpu: GpuContext }, scene: Parameters<GpuContext['render']>[0], camera: Parameters<GpuContext['render']>[1]): void => {
    try { g.gpu.render(scene, camera); } catch { controlador.current?.falhouRender(); }
  };

  /** Publica os rótulos e a vista só quando mudam: a planta não re-renderiza a cada quadro (`null`: sem planta). */
  const publish = (next: LabelOp[], vw: Viewport | null): void => {
    if (next !== shownLabels.current) setLabels((shownLabels.current = next));
    if (!sameView(shownView.current, vw)) setLabelView((shownView.current = vw && { ...vw }));
  };

  /**
   * Rascunho da prévia: o `projetoDePrevia` do integrador, quando vier; senão monta a partir do clipboard.
   * O cache evita remontar (e sortear ids novos) a cada quadro do rAF.
   */
  const rascunhoDaPrevia = useCallback((levelIds: readonly Id[], link: boolean): Project | null => {
    if (projetoDePrevia) return projetoDePrevia;
    // O controlador já calculou o rascunho antes de trocar para o 3D: usa o mesmo (e os mesmos ids do "Colar").
    const pronta = previaPreparada();
    if (pronta && pronta.link === link && pronta.levelIds.length === levelIds.length && pronta.levelIds.every((id, i) => id === levelIds[i])) return pronta.draft;
    const chave = `${editor.store.version}|${levelIds.join(',')}|${link}`;
    const guardado = previaProjeto.current;
    if (guardado && guardado.chave === chave) return guardado.projeto;
    const clip = transfer.clipBuffer();
    if (!clip) return null;
    const projeto = montarPrevia(editor.project, clip, levelIds, link);
    previaProjeto.current = projeto ? { chave, projeto } : null;
    return projeto;
  }, [projetoDePrevia]);

  // ---- desenho ----
  const renderQuadro = useCallback(() => {
    const st = useUi.getState();
    const { w, h } = size;
    if (!ready || w < 10 || h < 10) return;
    // Saiu da prévia do Colar alinhado: tira os fantasmas e devolve a câmera de antes do comando.
    if (!st.pastePreview && fantasmas.current) {
      fantasmas.current.limpar();
      fantasmas.current.grupo.removeFromParent();
      previaProjeto.current = null;
      previaRascunho.current = null;
      limparPreviaPreparada();
      if (!consumirManterCameraDaPrevia() && restaurarCamera(model.current.orbit, cameraAntesDaPrevia.current)) cameraAntesDaPrevia.current = null;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    const g = gpuRef.current;
    const p = editor.project;
    const vis = visibilityOf(p, st);
    const theme = dark ? DARK : LIGHT;
    if (st.view === '3d') {
      secDl.current = null;
      if (!g) return;
      const m = model.current;
      // Na prévia do Colar alinhado não há realce de cursor (os cliques de edição estão desligados).
      if (st.pastePreview && st.hover) useUi.setState({ hover: null });
      // Picking por ID buffer na GPU (R3): WebGL2 com MRT. No WebGPU (ou sem suporte) o BVH continua respondendo.
      const picker =
        g.gpu.backend === 'webgl2'
          ? (pickGpu.current ??= new PickGpu3d({
              renderer: g.gpu.renderer,
              raiz: m.scene,
              aoResolver: () => useUi.setState((x) => ({ previewTick: x.previewTick + 1 })),
            }))
          : null;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (picker && (pickSize.current.w !== pw || pickSize.current.h !== ph)) {
        picker.redimensionar(pw, ph);
        pickSize.current = { w: pw, h: ph };
      }
      // Sombras e arestas são da vista 3D no projeto (decisão 0015 §1): a chave inclui a versão do projeto.
      const v3 = view3dOf(p);
      // A visibilidade temporária/Reveal não muda a versão do projeto: ela precisa entrar na chave para a cena
      // receber `hidden`/`revealed` (sem isto HH/RH mudavam o estado, mas o modelo continuava na tela).
      const visKey = `${[...vis.hidden].sort().join(',')}|${[...vis.revealed].sort().join(',')}`;
      const key = `${editor.store.version}|${dark}|${v3.shadows}|${v3.edges}|${v3.openOpenings === true}|${v3.showLevels !== false}|${visKey}`;
      if (key !== modelKey.current) {
        modelKey.current = key;
        // Os níveis entram em fatias (ver montagem3dProgressiva.ts): a tela não espera o projeto inteiro. Depois da
        // primeira montagem, `atualizar` só re-resolve os níveis que a edição alcançou — e nada no tema/visibilidade.
        montagem.current ??= criarMontagemVista3d(m, (id) => editor.resolved(id), (id) => editor.resolucaoPronta(id));
        // Gancho de depuração (`?debug=1`): o e2e de perf espera `montados` chegar ao total de níveis.
        if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) Object.assign(window, { __hestia3dMontagem: montagem.current });
        montagem.current.atualizar(p, { edges: v3.edges, shadows: v3.shadows, dark, hidden: vis.hidden, revealed: vis.revealed }, st.levelId);
        // Prévia do Colar alinhado: a cena precisa aparecer completa no mesmo quadro, não pavimento por pavimento.
        if (st.pastePreview && montagem.current.montados < p.levels.length) montagem.current.montarTudo();
        picker?.invalidar();
      }
      // O nível selecionado no datum (clique no 3D) é aplicado à cena a cada quadro; sem mudança, não refaz nada.
      m.selecionarNivel(p, st.selectedLevel);
      // Realce da seleção e do elemento sob o cursor: só a sobreposição muda, o modelo não é refeito (decisão 0016 §4).
      m.highlight(st.selection, st.hover);
      // Prévia do Colar alinhado: fantasmas violeta do rascunho, enquadrados uma vez por rascunho.
      const camada = (fantasmas.current ??= new CamadaFantasmas());
      if (st.pastePreview) {
        if (!cameraAntesDaPrevia.current) cameraAntesDaPrevia.current = guardarCamera(m.orbit);
        const rascunho = rascunhoDaPrevia(st.pastePreview.levelIds, st.pastePreview.link);
        if (rascunho) {
          camada.atualizar(rascunho, p);
          if (camada.grupo.parent !== m.scene) m.scene.add(camada.grupo);
          if (previaRascunho.current !== rascunho) {
            previaRascunho.current = rascunho;
            // Enquadra a origem e os destinos: a caixa do modelo mais a dos fantasmas.
            const caixa = camada.caixa.union(m.bounds());
            if (!caixa.isEmpty()) m.orbit.fit(caixa);
          }
        } else {
          camada.limpar();
          camada.grupo.removeFromParent();
        }
      }
      g.gpu.renderer.shadowMap.enabled = v3.shadows;
      g.gpu.setSize(w, h, dpr);
      // Animação da câmera (ViewCube, Início): avança a cada quadro e pede o próximo enquanto anima.
      if (m.orbit.step(performance.now())) useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
      // "Ir para o ponto de vista": aplica a câmera pedida no primeiro quadro depois de abrir a aba 3D.
      const pendente = consumirCameraPendente();
      if (pendente) aplicarCameraNaOrbita(m.orbit, pendente);
      m.orbit.setAspect(w, h);
      m.sombra.aplicar(g.gpu.renderer);
      safeRender(g, m.scene, m.orbit.camera);
      publish(NO_LABELS, null);
      return;
    }
    const antes = editor.viewport();
    const v = editor.ensureViewport(w, h);
    // O tamanho do canvas mudou: as cotas (HTML) recalculam a posição com a vista nova (C07).
    if (antes && antes !== v) useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    const pf = (planFrame.current ??= new PlanFrame(plan.current));
    // Vista de corte: a cena é refeita por inteiro (ver `PlanFrame`).
    if (st.view === 'section') {
      pf.reset(); quadroRef.current?.invalidar();
      const dl: PlanDrawList = buildSectionFrame(v, dark, vis.hidden, vis.revealed) ?? { background: theme.bg, fills: [], strokes: [], labels: [] };
      // R4: a lista do corte é cacheada por projeto/vista/tema/seleção — pan e zoom não geram geometria nova. Só reenvia
      // quando a referência muda (o `SectionFrame` devolve a mesma lista nos quadros seguintes).
      if (g) { g.gpu.setSize(w, h, dpr); plan.current.setViewport(v); if (dl !== secDl.current) { plan.current.setDrawList(dl, v); secDl.current = dl; } safeRender(g, plan.current.scene, plan.current.camera); }
      else if (cpuRef.current) drawPlanOnCanvas(cpuRef.current, dl, v, dpr);
      publish(dl.labels, v);
      labelLayer.current?.syncView(v);
      return;
    }
    secDl.current = null;
    // Planta: pan e zoom mudam a câmera; geometria, sobreposição e grade só são refeitas quando a chave muda (PlanFrame).
    const quadro = (quadroRef.current ??= new QuadroPlanta({ provisorios: editor.provisorios, resolverReferencia: (id) => editor.resolved(id, false), pendente: (id) => editor.fluxo.pendente(id), pedirQuadro: () => useUi.setState((x) => ({ previewTick: x.previewTick + 1 })) }));
    // Grade visível quando o botão de grade está ligado ou quando a captura por grade está ativa (o que se captura, se vê).
    const gridOn = st.showGrid || (st.options.snap?.enabled !== false && !!st.options.snap?.grid);
    const areaPlan = st.planKind === 'area' && st.areaPlanId ? (p.areaPlans ?? []).find((x) => x.id === st.areaPlanId) : undefined;
    const visKey = `${[...vis.hidden].sort().join(',')}|${[...vis.revealed].sort().join(',')}`;
    const extra = quadro.desenhar({ quadro: pf, cena: g ? plan.current : null, v, tema: theme, nivel: st.levelId, versao: editor.store.version, contexto: [dark, !!g, v.zoom, st.showUnderlay, st.underlayLevel, st.showRoofProjection, gridOn, st.gridStep, st.planKind, areaPlan ? JSON.stringify(areaPlan) : '', st.tagDrag ? st.tagDrag.roomId : '', visKey].join('|'), atualizar: () => planFrameUpdateOf({ project: p, version: editor.store.version, levelId: st.levelId, v, theme, dark, gpu: !!g, showGrid: gridOn, showUnderlay: st.showUnderlay, underlayLevel: st.underlayLevel, showRoofProjection: st.showRoofProjection, roofPlanMode: st.planKind === 'roof', areaPlan, tagGhost: st.tagDrag ? { roomId: st.tagDrag.roomId, at: st.tagDrag.at } : undefined, thinLines: thinLinesOn(p, { levelId: st.levelId }), selection: st.selection, hover: st.hover, preview: editor.activeTool.preview(), inference: editor.activeTool.inference(), resolve: quadro.resolver, sketch, hidden: vis.hidden, revealed: vis.revealed }) });
    if (g) {
      g.gpu.setSize(w, h, dpr);
      plan.current.setViewport(v);
      safeRender(g, plan.current.scene, plan.current.camera);
    } else if (cpuRef.current) drawPlanOnCanvas(cpuRef.current, QuadroPlanta.comProvisorio(pf.drawList(theme), extra), v, dpr);
    publish(pf.labels, v);
    // Alinha a camada HTML de texto no mesmo requestAnimationFrame do canvas da planta.
    // Isso evita o atraso de um render React entre a câmera e o texto da cota durante pan/zoom.
    labelLayer.current?.syncView(v);
  }, [size, ready, dark, sketch, rascunhoDaPrevia]);

  // Um quadro do rAF: o trabalho de CPU é medido do começo ao fim do desenho; com `?perf=1`, os contadores agrupam
  // draw calls/upload/rebuilds entre estes dois pontos. Sem perf, os métodos são no-op.
  const render = useCallback(() => medirQuadro(renderQuadro), [renderQuadro]);

  // Qualquer mudança do estado agenda um quadro; o quadro decide o que refazer (ver PlanFrame).
  useEffect(() => {
    const sched = (): void => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(render); };
    sched();
    const off = useUi.subscribe(sched);
    return () => { off(); cancelAnimationFrame(frame.current); };
  }, [render]);

  // Entrou na prévia do Colar alinhado: o realce do cursor não fica preso ao elemento de antes.
  useEffect(() => {
    if (previewState && useUi.getState().hover) useUi.setState({ hover: null });
  }, [previewState]);

  // ---- ponteiro ----
  const pointers = useRef(new Map<number, Pt>());
  /** `pick`: o ponteiro foi o botão esquerdo sem Espaço, então um clique sem arrasto na vista 3D escolhe um elemento (Shift pode ser pan). */
  /** `shiftPending`: Shift com ferramenta de desenho na planta; sem arrasto é clique com shift (trava ortogonal), com arrasto vira pan. */
  const drag = useRef<{ mode: 'tool' | 'pan' | 'orbit' | 'none'; start: Pt; last: Pt; moved: boolean; pick: boolean; shiftPending?: boolean }>({ mode: 'none', start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, moved: false, pick: false });
  const gesture = useRef<{ dist: number; mid: Pt } | null>(null);
  const spaceDown = useRef(false);
  /** Botão direito pressionado: solto sem arrasto (mais de 4 px) abre o menu de contexto. */
  const rightPress = useRef<{ start: Pt; moved: boolean } | null>(null);
  /** Down adiado até a vista existir (D1): `load`/`newProject` limpam o mapa de viewports até o quadro seguinte. */
  const downAdiado = useRef<DownAdiado | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space') spaceDown.current = true;
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    // Alt-tab com Espaço pressionado perde o keyup: sem o reset, todo clique esquerdo viraria pan para sempre (D3).
    const soltar = (): void => { spaceDown.current = false; };
    const visibilidade = (): void => { if (document.hidden) spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', soltar);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', soltar);
      document.removeEventListener('visibilitychange', visibilidade);
    };
  }, []);

  // Desmontou com um `down` adiado (D1): cancela o quadro pendente para não entregar ponteiro a um canvas que sumiu.
  useEffect(() => () => {
    const a = downAdiado.current;
    if (a) cancelAnimationFrame(a.frame);
    downAdiado.current = null;
  }, []);

  // Atalhos de visibilidade no 3D/corte também passam por aqui, em captura: o App ignora teclas quando o foco está
  // num <select> ou quando a caixa de texto está aberta, e isso deixava HH/HR/EH sem efeito justamente depois de usar
  // a barra de controle da vista. Só as primeiras teclas das sequências são interceptadas; o restante segue normal.
  useEffect(() => {
    const atalhoDeVisibilidade = (e: KeyboardEvent): void => {
      const st = useUi.getState();
      if (st.view !== '3d' && st.view !== 'section') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      if (!/^[herv0-9]$/i.test(e.key)) return;
      if (editor.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', atalhoDeVisibilidade, true);
    return () => window.removeEventListener('keydown', atalhoDeVisibilidade, true);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Ponto do plano (m) da superfície 3D sob o cursor; null se o raio não atinge o modelo. */
  const pick3dAt = (s: Pt): Pt | null => {
    const r = host.current!.getBoundingClientRect();
    return pickModelPoint(model.current.scene, model.current.orbit.camera, { x: (s.x / r.width) * 2 - 1, y: 1 - (s.y / r.height) * 2 }, pickGpu.current ?? undefined);
  };
  /** Elemento (parede, abertura, piso, laje, telhado, escada) sob o cursor na vista 3D; null no vazio (decisão 0016). */
  const elementAt3d = (s: Pt) => {
    const r = host.current!.getBoundingClientRect();
    return pickElement(model.current.scene, model.current.orbit.camera, { x: (s.x / r.width) * 2 - 1, y: 1 - (s.y / r.height) * 2 }, pickGpu.current ?? undefined);
  };
  /**
   * Realce ao passar o cursor sobre o 3D. Um raio por quadro (não por evento de ponteiro): o último ponto ganha.
   */
  const hover3d = useRef<{ at: Pt | null; frame: number }>({ at: null, frame: 0 });
  const pickHover3d = (s: Pt): void => {
    hover3d.current.at = s;
    if (hover3d.current.frame) return;
    hover3d.current.frame = requestAnimationFrame(() => {
      hover3d.current.frame = 0;
      const at = hover3d.current.at;
      if (!at || useUi.getState().view !== '3d') return;
      const id = elementAt3d(at)?.id ?? null;
      if (useUi.getState().hover !== id) useUi.setState({ hover: id });
    });
  };
  const modsDe = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Mods => ({
    shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey,
  });
  /** `info` a partir de ponto e modificadores já capturados (o `down` adiado sai depois do evento original). */
  const infoDe = (s: Pt, m: Mods) => ({ raw: screenToWorld(editor.viewport() as Viewport, s), ...m });
  const info = (e: RPointerEvent, s: Pt) => infoDe(s, modsDe(e));

  const cancelarDownAdiado = (): void => {
    const a = downAdiado.current;
    if (!a) return;
    cancelAnimationFrame(a.frame);
    downAdiado.current = null;
  };

  /**
   * Entrega o `down` adiado assim que a vista existe (D1). A sequência sai na ordem da ferramenta — down → (drag) →
   * up → click — e só uma vez: quem decide é a máquina pura em `cliqueAdiado.ts`.
   */
  const tentarEntregarDownAdiado = (): void => {
    const a = downAdiado.current;
    if (!a) return;
    const r = decidirCliqueAdiado(a.estado, { tipo: 'quadro', vistaPronta: editor.viewport() !== null });
    a.estado = r.estado;
    if (r.acao === 'abandonar') {
      downAdiado.current = null;
      drag.current = { mode: 'none', start: a.ponto, last: a.ponto, moved: false, pick: false };
      return;
    }
    if (r.acao === 'nenhuma') { a.frame = requestAnimationFrame(tentarEntregarDownAdiado); return; }
    downAdiado.current = null;
    editor.pointer('down', infoDe(a.ponto, a.mods));
    if (r.acao !== 'entregar-solto' || !a.soltura) return;
    // O `up` chegou durante a espera: fecha o gesto agora, sem segundo `down` e sem click quando houve arrasto.
    const fim = infoDe(a.soltura.ponto, a.soltura.mods);
    if (drag.current.moved) editor.pointer('drag', fim);
    for (const ev of eventosDeSolta(drag.current.moved)) editor.pointer(ev, fim);
    drag.current = { mode: 'none', start: a.soltura.ponto, last: a.soltura.ponto, moved: false, pick: false };
  };

  /** Arma o `down` adiado: guarda o ponto/modificadores e tenta de novo a cada quadro (ver `MAX_TENTATIVAS_VISTA`). */
  const adiarDown = (e: RPointerEvent, s: Pt): void => {
    cancelarDownAdiado();
    downAdiado.current = { estado: cliqueAdiadoInicial(), ponto: s, mods: modsDe(e), frame: requestAnimationFrame(tentarEntregarDownAdiado), soltura: null };
  };

  const onDown = (e: RPointerEvent): void => {
    host.current?.setPointerCapture(e.pointerId);
    const s = local(e);
    pointers.current.set(e.pointerId, s);
    // Um novo `down` encerra qualquer adiamento anterior (ex.: segundo dedo): o gesto pendente não entrega mais nada.
    cancelarDownAdiado();
    const view = useUi.getState().view;
    // Prévia do Colar alinhado: os cliques de edição são ignorados; orbitar, pan e zoom continuam.
    const emPrevia = useUi.getState().pastePreview !== null;
    // Com a cota aberta, um clique fora do input aplica e fecha (o input não propaga o pointerdown).
    if (cotaRef.current?.fecharSeAberto()) return;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      drag.current.mode = 'none';
      return;
    }
    const isMiddleBtn = e.button === 1;
    const isOrbitReq = (isMiddleBtn && e.shiftKey) || (e.button === 0 && e.altKey);
    // Na planta, Shift com a Selecionar é da seleção (soma e janela), inclusive no Selecionar do esboço do perímetro. Com
    // ferramenta de desenho, Shift sem arrasto trava ortogonal (vai à ferramenta com shift); só vira pan se o ponteiro se
    // mover (onMove). Na vista de corte, Shift arrasta a vista.
    const { shiftDesenho: shiftDraw, shiftPan } = gestosComShift({
      view, botao: e.button, shift: e.shiftKey, espaco: spaceDown.current,
      ferramenta: editor.activeTool.id, selecionandoNoEsboco: editor.perimetro.selecionandoLinhas(),
    });
    const isPanReq = (isMiddleBtn && !e.shiftKey) || (e.button === 0 && (spaceDown.current || shiftPan));
    // Botão direito: o menu abre ao soltar sem arrasto (onUp). Não cancela a ferramenta: "Cancelar" está no menu.
    if (e.button === 2) { if (emPrevia) return; rightPress.current = { start: s, moved: false }; return; }
    if (view === '3d') {
      // Clique na etiqueta/linha de cota: abre o editor ali mesmo, sem começar a órbita.
      if (!emPrevia && e.button === 0 && !spaceDown.current && !e.altKey) {
        const r = host.current!.getBoundingClientRect();
        const dim = pickDimension(model.current.scene, model.current.orbit.camera, {
          x: (s.x / r.width) * 2 - 1,
          y: 1 - (s.y / r.height) * 2,
        });
        if (dim) {
          cotaRef.current?.abrir(dim, { width: r.width, height: r.height });
          drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
          return;
        }
      }
      const mode = isOrbitReq ? 'orbit' : isPanReq ? 'pan' : (e.button === 0 ? 'orbit' : 'none');
      drag.current = { mode, start: s, last: s, moved: false, pick: e.button === 0 && !spaceDown.current && !e.altKey && !emPrevia };
      // Ao pressionar, o realce some: enquanto arrasta, o cursor orbita e não destaca.
      if (useUi.getState().hover) useUi.setState({ hover: null });
      return;
    }
    // Na vista de corte não há ferramentas: o botão esquerdo arrasta a vista e, sem arrasto, seleciona (decisão 0016).
    if (isPanReq || isMiddleBtn || view === 'section') {
      // Corte: sem Espaço, o botão esquerdo também seleciona no soltar se não houve arrasto (Shift incluso).
      drag.current = { mode: 'pan', start: s, last: s, moved: false, pick: view === 'section' && e.button === 0 && !spaceDown.current };
      if (view === 'section' && useUi.getState().hover) useUi.setState({ hover: null });
      return;
    }
    drag.current = { mode: 'tool', start: s, last: s, moved: false, pick: false, shiftPending: shiftDraw };
    // Com Shift pendente, o 'down' só vai ao soltar (ver onUp), para não começar um gesto da ferramenta antes de saber se é pan.
    if (shiftDraw) return;
    // Sem vista (logo após load/newProject), adiar em vez de descartar: o render a recria no quadro seguinte (D1).
    if (!editor.viewport()) { adiarDown(e, s); return; }
    editor.pointer('down', info(e, s));
  };

  const onMove = (e: RPointerEvent): void => {
    const s = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, s);
    if (rightPress.current) { if (Math.hypot(s.x - rightPress.current.start.x, s.y - rightPress.current.start.y) > 4) rightPress.current.moved = true; return; }
    const view = useUi.getState().view;
    if (gesture.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (view !== '3d') {
        editor.pan(mid.x - gesture.current.mid.x, mid.y - gesture.current.mid.y);
        editor.zoomWheel(mid, -(d - gesture.current.dist) * 2.4);
      } else {
        model.current.orbit.zoom(-(d - gesture.current.dist) * 3);
        model.current.orbit.pan(mid.x - gesture.current.mid.x, mid.y - gesture.current.mid.y);
        useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
      }
      gesture.current = { dist: d, mid };
      return;
    }
    const d = drag.current;
    if (view === '3d') {
      if (d.mode === 'orbit') model.current.orbit.orbit(s.x - d.last.x, s.y - d.last.y);
      else if (d.mode === 'pan') model.current.orbit.pan(s.x - d.last.x, s.y - d.last.y);
      if (d.mode !== 'none') {
        if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
        d.last = s;
        useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
      } else if (!useUi.getState().pastePreview) pickHover3d(s);
      return;
    }
    if (d.mode === 'pan') {
      if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
      editor.pan(s.x - d.last.x, s.y - d.last.y);
      d.last = s;
      return;
    }
    // Sem botão pressionado, o corte realça o elemento sob o cursor (decisão 0016).
    if (view === 'section') { if (d.mode === 'none') hoverSectionAt(s); return; }
    // Shift pendente que passou do limiar é arrasto da vista (pan), como antes; a ferramenta não recebe o gesto.
    if (d.shiftPending && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) {
      d.shiftPending = false; d.mode = 'pan'; d.moved = true;
      editor.pan(s.x - d.start.x, s.y - d.start.y);
      d.last = s;
      return;
    }
    // Down adiado (D1): a ferramenta ainda não recebeu 'down', então nada de move/drag antes dele. O deslocamento
    // local continua sendo medido para o click/arrasto ser decidido no quadro em que a vista aparecer.
    if (downAdiado.current) {
      if (d.mode === 'tool') {
        if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
        d.last = s;
      }
      return;
    }
    const v = editor.viewport();
    if (!v) return;
    const inf = info(e, s);
    useUi.setState({ cursor: inf.raw, snapKind: editor.activeTool.inference()?.kind ?? '' });
    if (d.mode === 'tool') {
      if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
      editor.pointer(d.moved ? 'drag' : 'move', inf);
      d.last = s;
    } else {
      editor.pointer('move', inf);
    }
  };

  const onUp = (e: RPointerEvent): void => {
    const s = local(e);
    pointers.current.delete(e.pointerId);
    if (rightPress.current && e.button === 2) {
      const rp = rightPress.current;
      rightPress.current = null;
      // Alvo sob o cursor: 3D e corte pelo pick da vista; planta pelo realce da Selecionar (sem ferramenta, é null).
      if (!rp.moved) {
        // Na prévia do Colar alinhado o botão direito não abre o menu de edição.
        if (useUi.getState().pastePreview) return;
        abrirMenuDeContexto(e.clientX, e.clientY, useUi.getState().view === '3d' ? (elementAt3d(s)?.id ?? null) : useUi.getState().view === 'section' ? (sectionPickAt(s)?.id ?? null) : useUi.getState().hover, viewDoMenu(useUi.getState().view));
      }
      return;
    }
    if (gesture.current) {
      if (pointers.current.size < 2) gesture.current = null;
      return;
    }
    if (downAdiado.current) {
      // O `up` chegou antes de a vista existir: registra e deixa o rAF fechar down → up → click; nada de click solto.
      const a = downAdiado.current;
      a.estado = decidirCliqueAdiado(a.estado, { tipo: 'soltar' }).estado;
      a.soltura = { ponto: s, mods: modsDe(e) };
      return;
    }
    const d = drag.current;
    if (d.mode === 'tool') {
      // Shift pendente sem arrasto: é um toque com shift (trava ortogonal) e a ferramenta recebe down, up e click.
      const inf = d.shiftPending ? { ...info(e, s), shift: true } : info(e, s);
      if (d.shiftPending) editor.pointer('down', inf);
      for (const ev of eventosDeSolta(d.moved)) editor.pointer(ev, inf);
    }
    // Clique sem arrasto na vista 3D. Com ferramenta que aceita pick3d: vai o ponto da superfície sob o cursor (no plano).
    // Sem essa ferramenta (seleção): seleciona o elemento sob o cursor; Shift/Ctrl acrescenta ou alterna (decisão 0016 §3).
    // Clique no vazio deseleciona.
    if (!d.moved && d.pick && useUi.getState().view === '3d') {
      const hit = pick3dAt(s);
      const el = elementAt3d(s);
      if (editor.activeTool.pick3d) {
        if (hit || el) {
          editor.pointer('click', { raw: hit ?? { x: 0, y: 0 }, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, hit3d: el?.id ?? null });
        } else {
          // Clique no vazio cancela/sai para a ferramenta de seleção
          editor.activeTool.cancel();
          clickSelect3d(null, false);
          useUi.setState({ status: 'Modo de seleção ativado.' });
        }
      } else {
        // Um elemento sob o cursor tem prioridade: a anotação do nível (texto/bolha) não pode bloquear parede/telhado.
        if (el) clickSelect3d(el.id, e.shiftKey || e.ctrlKey || e.metaKey);
        else if (!selecionarNivelNoClique(model.current, host.current!.getBoundingClientRect(), s)) clickSelect3d(null, e.shiftKey || e.ctrlKey || e.metaKey);
      }
    }
    // Clique sem arrasto no corte ou na elevação: o mesmo caminho da 3D (clickSelect3d, que usa selectionAfterClick).
    if (!d.moved && d.pick && useUi.getState().view === 'section') clickSelect3d(sectionPickAt(s)?.id ?? null, e.shiftKey || e.ctrlKey || e.metaKey);
    // Arrasto que começou sobre o seletor de escala deixa o foco no <select>, e aí Delete e os atalhos são ignorados: solta o foco.
    if (d.moved && document.activeElement?.tagName === 'SELECT') (document.activeElement as HTMLElement).blur();
    drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
  };

  /**
   * Cancelamento do navegador (toque interrompido, perda de captura): não é clique e não pode gerar geometria.
   * Zera o gesto sem enviar `up`/`click` à ferramenta (D4). Só cancela a ferramenta quando o gesto era dela e o
   * `down` já havia saído — com down adiado (D1) ou Shift pendente a ferramenta nem começou, não há estado a desfazer.
   */
  const onCancel = (e: RPointerEvent): void => {
    const fim = pointers.current.get(e.pointerId) ?? drag.current.last;
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    rightPress.current = null;
    const d = drag.current;
    if (d.mode === 'tool' && !downAdiado.current && !d.shiftPending) editor.activeTool.cancel?.();
    cancelarDownAdiado();
    drag.current = { mode: 'none', start: fim, last: fim, moved: false, pick: false };
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const st = useUi.getState();
    if (st.view === '3d') {
      // Zoom para o ponto sob o cursor: ao aproximar, o target deriva em direção ao ponto 3D sob o cursor.
      // Isso faz a órbita subsequente girar ao redor do que o usuário estava inspecionando (comportamento Revit/Blender).
      if (e.deltaY < 0) {
        const s = local(e);
        const r = host.current!.getBoundingClientRect();
        const ndc = { x: (s.x / r.width) * 2 - 1, y: 1 - (s.y / r.height) * 2 };
        const hit = pickModelPoint(model.current.scene, model.current.orbit.camera, ndc, pickGpu.current ?? undefined);
        if (hit) {
          // Quanto mais rola o scroll, mais o target se move em direção ao ponto sob o cursor.
          // Factor pequeno: movimento suave e sem saltos; acumula com vários scrolls.
          const factor = Math.min(0.12, Math.abs(e.deltaY) * 0.001);
          const orb = model.current.orbit;
          orb.target.x += (hit.x - orb.target.x) * factor;
          orb.target.y += (hit.y - orb.target.y) * factor;
        }
      }
      model.current.orbit.zoom(e.deltaY);
      useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    } else editor.zoomWheel(local(e), e.deltaY);
  };
  useEffect(() => {
    const el = host.current!;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Saiu do canvas: o realce do 3D e o do corte somem (o da planta não é tocado). */
  const onLeave = (): void => { if (['3d', 'section'].includes(useUi.getState().view) && useUi.getState().hover) useUi.setState({ hover: null }); };

  // Cursores refinados estilo Revit:
  // - No 3D: sobre objeto = pointer; arrastando órbita/pan = grabbing; repouso = default
  const isDragging = drag.current.mode !== 'none' && drag.current.moved;
  const cursorCss = ui.view === '3d'
    ? (isDragging ? 'grabbing' : (ui.hover ? 'pointer' : 'default'))
    : ui.view === 'section'
    ? (ui.hover ? 'pointer' : 'grab')
    : ui.tool === 'select'
    ? 'default'
    : 'crosshair';
  return (
    <div
      ref={host}
      className="canvas-wrap"
      style={{ cursor: cursorCss }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onPointerLeave={onLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <PlanLabels ref={labelLayer} labels={ui.view !== '3d' && labelView ? labels : NO_LABELS} v={labelView} />
      <ViewportOverlays host={host} model={model.current} selection={selection} ui={ui} />
      <NivelCotaEditor ref={cotaRef} />
    </div>
  );
}
