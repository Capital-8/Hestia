/* eslint-disable max-lines -- a vista reúne planta, 3D, corte e o editor da cota; extrair depois. */
import { servicoCortina, servicoGuardaCorpo, subelementoDaCortinaEm } from '@hestia/engine';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { DARK, LIGHT, CamadaFantasmas, ModelScene, PickGpu3d, PlanFrame, PlanScene, aplicarCameraNaOrbita, criarControladorGpu, drawPlanOnCanvas, idsNaCaixaDaTela, pickDimension, pickElement, pickModelPoint, planFrameUpdateOf, reiniciarEstadoGpu, sameView, screenToWorld, sectionLiveOps, sectionOpeningHandles, type ControladorGpu, type GpuContext, type LabelOp, type PlanDrawList, type PreferenciaGpu, type SectionHandle, type Viewport, sectionLabelsAt } from '@hestia/render';
import { formatQuantity, unitsOf, view3dOf, type Id, type Project } from '@hestia/model';
import { useShallow } from 'zustand/react/shallow';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { transfer } from '../editor/transfer.ts';
import { consumirManterCameraDaPrevia, guardarCamera, limparPreviaPreparada, montarPrevia, previaPreparada, restaurarCamera, type CameraDaPrevia } from '../editor/pastePreview.ts';
import { visibilityOf } from '../editor/viewVisibility.ts';
import { usePerimeter } from '../editor/perimeter.ts';
import { hoverSectionAt, sectionPickAt } from '../editor/sectionPick.ts';
import { gestoDoBotaoNoCorte, idsNaCaixaDoCorte, modoDaCaixa, selecaoComCaixa } from '../editor/sectionBoxSelect.ts';
import { sectionDimensionGripAt, sectionDimensionGripCommand, sectionHandleAt, sectionHandleCommand, sectionOpeningValues } from '../editor/sectionHandles.ts';
import { cotaParaEditar, ehDuploClique, type CliqueAnterior } from '../editor/dimDoubleClick.ts';
import { dimensionFormatStyle, dimensionGeometry, dimensionStyleFor, dimensionText, sectionAnnotationsOf } from '@hestia/model';
import { sectionDimensionPoints, type SectionDimensionGrip } from '@hestia/render';
import { clickSelect3d, useUi } from '../editor/state.ts';

/** Tolerância (m) para escolher a linha de cortina sob o cursor na 3D (metade de um montante, com folga). */
const TOLERANCIA_SUB_3D = 0.08;
import { consumirCameraPendente, registrarCena3D, registrarOrbita3D, registrarPreparoCena3D } from '../editor/vista3dAoVivo.ts';
import { thinLinesOn } from '../editor/graphicsActions.ts';
import { buildSectionFrame } from './SectionCanvas.tsx';
import { cursorForView } from './cursor.ts';
import { selecionarNivelNoClique } from './nivelPick3d.ts';
import { NivelCotaEditor, type NivelCotaEditorHandle } from './NivelCotaEditor.tsx';
import { PlanLabels, type PlanLabelsHandle } from './PlanLabels';
import { ViewportOverlays } from './ViewportOverlays.tsx';
import { abrirMenuDeContexto, viewDoMenu } from './useCanvasContextMenu.ts';
import { useDark } from './useDark.ts';
import { encerrarGesto, iniciarGesto, interacaoAtiva, marcarInteracao, msAteLiberar } from '../editor/interacaoAtiva.ts';
import { criarMontagemVista3d, type Montagem3dProgressiva } from './montagem3dProgressiva.ts';
import { QuadroPlanta } from './quadroPlanta.ts';
import { medirQuadro, useContarCommitPerf, usePerfDaUrl } from '../debug/perf/index.ts';
import { eventosDeSolta, gestosComShift, passouDoLimiar } from './planGestos.ts';
import { Progresso3D } from './Progresso3D.tsx';
import { ProgressoAbertura } from './ProgressoAbertura.tsx';
import { registrarPreparo3d } from './preparo3d.ts';
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

/**
 * Rótulos do desenho do corte no zoom corrente (mm de papel → px), com cache por lista e zoom. É o equivalente do
 * `PlanFrame.labels` da planta: sem resolver, o valor da cota cai no estilo de "chip" da interface em vez do texto de cota.
 */
function baseLabelsAtZoom(labels: readonly LabelOp[], zoom: number, cache: { current: { labels: readonly LabelOp[]; zoom: number; resolvidos: LabelOp[] } | null }): LabelOp[] {
  const cur = cache.current;
  if (cur && cur.labels === labels && cur.zoom === zoom) return cur.resolvidos;
  const resolvidos = sectionLabelsAt(labels, zoom);
  cache.current = { labels, zoom, resolvidos };
  return resolvidos;
}
/** Retângulo da caixa de seleção do corte; começa oculto e o gesto só muda posição, tamanho e traço. */
const CAIXA_DE_SELECAO_STYLE: CSSProperties = {position: 'absolute', display: 'none', pointerEvents: 'none', zIndex: 2, border: '1.5px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', boxSizing: 'border-box' };

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
  const { t, lang } = useT();
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
  const geracaoMontagem = useRef(0);
  /** Redesenho agendado para refazer a sombra depois do gesto de câmera (ver `renderQuadro`). */
  const sombraAdiada = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montagem = useRef<Montagem3dProgressiva | null>(null);
  // A prancha lê a câmera da MESMA vista 3D (decisão 0040) por `vista3dAoVivo`.
  useEffect(() => {
    const m = model.current;
    registrarOrbita3D(m.orbit);
    registrarCena3D({ scene: m.scene, camera: m.orbit.camera });
    return () => { registrarOrbita3D(null); registrarCena3D(null); };
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
  const secDl = useRef<PlanDrawList | null>(null); // R4: última lista BASE de corte escrita na cena
  const secVazia = useRef<{ bg: string; dl: PlanDrawList } | null>(null); // lista vazia estável quando não há resultado de corte
  const secLive = useRef(false); // as camadas vivas do corte têm conteúdo na cena
  // Rótulos do corte já convertidos do papel para pixels; refeitos só quando a lista base ou o zoom mudam (como no PlanFrame).
  const secBaseLabels = useRef<{ labels: readonly LabelOp[]; zoom: number; resolvidos: LabelOp[] } | null>(null);
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
      secLive.current = false;
    };
    const c = criarControladorGpu({
      host: el,
      preferencia,
      lang,
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
  }, [lang]);

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

  // Montagem da vista 3D: inicia (ou reinicia, se a chave mudou) a montagem em fatias. Serve ao quadro da aba 3D e ao preparo
  // do projeto em segundo plano, que a adianta com a planta na tela (ver `preparo3d.ts`). Devolve true se (re)começou.
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const iniciarMontagem3d = useCallback((darkAgora: boolean, st: ReturnType<typeof useUi.getState>): boolean => {
    const p = editor.project;
    const vis = visibilityOf(p, st);
    // Sombras e arestas são da vista 3D no projeto (decisão 0015 §1): a chave inclui a versão do projeto.
    const v3 = view3dOf(p);
    // A visibilidade temporária/Reveal não muda a versão do projeto: ela precisa entrar na chave para a cena
    // receber `hidden`/`revealed` (sem isto HH/RH mudavam o estado, mas o modelo continuava na tela).
    const visKey = `${[...vis.hidden].sort().join(',')}|${[...vis.revealed].sort().join(',')}`;
    const key = `${editor.store.version}|${darkAgora}|${v3.shadows}|${v3.edges}|${v3.openOpenings === true}|${v3.showLevels !== false}|${visKey}`;
    if (key === modelKey.current) return false;
    modelKey.current = key;
    const m = model.current;
    // Projeto novo ou aberto: a montagem não herda os níveis do anterior (o nível "antigo" iria para a cena com a chave nova).
    if (geracaoMontagem.current !== editor.geracaoDoProjeto) {
      geracaoMontagem.current = editor.geracaoDoProjeto;
      montagem.current?.cancelar();
    }
    // Os níveis entram em fatias (ver montagem3dProgressiva.ts): a tela não espera o projeto inteiro. Depois da
    // primeira montagem, `atualizar` só re-resolve os níveis que a edição alcançou — e nada no tema/visibilidade.
    montagem.current ??= criarMontagemVista3d(m, (id) => editor.resolved(id), (id) => editor.resolucaoPronta(id));
    // Gancho de depuração (`?debug=1`): o e2e de perf espera `montados` chegar ao total de níveis.
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) Object.assign(window, { __hestia3dMontagem: montagem.current });
    montagem.current.atualizar(p, { edges: v3.edges, shadows: v3.shadows, dark: darkAgora, hidden: vis.hidden, revealed: vis.revealed }, st.levelId);
    return true;
  }, []);
  // Kernel Rust carregado depois da primeira montagem: o que foi desenhado sem os guarda-corpos (3D, planta, corte) é invalidado e refeito
  // (mesmo padrão do "calculando…" das paredes). A chave do nível na cena 3D também muda (marca `gc0` -> `gc1`).
  useEffect(
    () =>
      servicoGuardaCorpo().aoMudarPronto(() => {
        modelKey.current = '';
        planFrame.current?.reset();
        quadroRef.current?.invalidar();
        useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
      }),
    [],
  );
  // Idem para a parede cortina: sem o kernel só o eixo aparece; quando ele chega, 3D e planta são refeitos.
  useEffect(
    () =>
      servicoCortina().aoMudarPronto(() => {
        modelKey.current = '';
        planFrame.current?.reset();
        quadroRef.current?.invalidar();
        useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
      }),
    [],
  );
  useEffect(() => {
    registrarPreparo3d(() => {
      iniciarMontagem3d(darkRef.current, useUi.getState());
      return montagem.current ? { montados: montagem.current.montados, total: montagem.current.total } : null;
    });
    return () => registrarPreparo3d(null);
  }, [iniciarMontagem3d]);

  // Miniatura do projeto (salvar na biblioteca): a cena 3D precisa estar montada mesmo com a planta na tela. Monta o que
  // faltar agora e enquadra a câmera se ela nunca foi enquadrada — senão o quadro sai só com o fundo.
  useEffect(() => {
    registrarPreparoCena3D(() => {
      if (!editor.project) return false;
      iniciarMontagem3d(darkRef.current, useUi.getState());
      montagem.current?.montarTudo();
      if (!montagem.current || montagem.current.montados === 0) return false;
      if (!useUi.getState().seen3d) {
        model.current?.fit();
        useUi.setState({ seen3d: true });
      }
      return true;
    });
    return () => registrarPreparoCena3D(null);
  }, [iniciarMontagem3d]);

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
      secLive.current = false;
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
      if (iniciarMontagem3d(dark, st)) {
        // Prévia do Colar alinhado: a cena precisa aparecer completa no mesmo quadro, não pavimento por pavimento.
        if (st.pastePreview && montagem.current && montagem.current.montados < p.levels.length) montagem.current.montarTudo();
        picker?.invalidar();
      }
      // Montagem concluída em segundo plano (preparo do projeto, com a planta na tela): o enquadramento inicial fica para
      // a primeira vez que a aba 3D aparece.
      if (!st.seen3d && montagem.current && montagem.current.total > 0 && montagem.current.montados >= montagem.current.total) {
        m.fit();
        useUi.setState({ seen3d: true });
      }
      // O nível selecionado no datum (clique no 3D) é aplicado à cena a cada quadro; sem mudança, não refaz nada.
      m.selecionarNivel(p, st.selectedLevel);
        // Realce da seleção, do elemento sob o cursor e do aviso de conflito (decisão 0044, amarelo).
        m.highlight(st.selection, st.hover, st.avisoParede ? [st.avisoParede] : []);
        m.highlightSubelemento(p, st.subElemento);
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
      g.gpu.renderer.shadowMap.enabled = view3dOf(p).shadows;
      g.gpu.setSize(w, h, dpr);
      // Animação da câmera (ViewCube, Início): avança a cada quadro e pede o próximo enquanto anima.
      if (m.orbit.step(performance.now())) {
        marcarInteracao();
        useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
      }
      // "Ir para o ponto de vista": aplica a câmera pedida no primeiro quadro depois de abrir a aba 3D.
      const pendente = consumirCameraPendente();
      if (pendente) aplicarCameraNaOrbita(m.orbit, pendente);
      m.orbit.setAspect(w, h);
      // Sombra suja (edição) e gesto de câmera ativo: o mapa novo espera o fim do gesto; a órbita desenha com o anterior.
      const adiarSombra = view3dOf(p).shadows && interacaoAtiva();
      m.sombra.aplicar(g.gpu.renderer, adiarSombra);
      if (adiarSombra && m.sombra.sujo && sombraAdiada.current === null) {
        sombraAdiada.current = setTimeout(() => {
          sombraAdiada.current = null;
          useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
        }, msAteLiberar() + 20);
      }
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
      // Lista BASE do corte: muda só com projeto/vista/tema/seleção/hover/gráficos/anotações/extensões. Fica em `secDl`
      // e só é reenviada quando a referência muda — prévia, inferência e alças vão para as camadas vivas, abaixo.
      const built = buildSectionFrame(v, dark, vis.hidden, vis.revealed, lang);
      if (!built && secVazia.current?.bg !== theme.bg) secVazia.current = { bg: theme.bg, dl: { background: theme.bg, fills: [], strokes: [], labels: [] } };
      const baseDl = built ?? secVazia.current!.dl;
      // Camada viva (t,z): prévia das ferramentas, alças da abertura selecionada e a inferência (marcador/guias/tooltip).
      // Ela não entra na lista base para o hover não reenviar a seção inteira.
      const liveFills: PlanDrawList['fills'] = [];
      const liveStrokes: PlanDrawList['strokes'] = [];
      const liveLabels: PlanDrawList['labels'] = [];
      for (const it of editor.activeTool.preview()) {
        if (it.kind === 'line') liveStrokes.push({ pts: [it.a, it.b], closed: false, widthPx: 1, color: theme.ink, alpha: 1, ...(it.dashed ? { dash: [4, 3] } : {}) });
        else if (it.kind === 'polygon') liveStrokes.push({ pts: it.ring, closed: true, widthPx: 1, color: theme.ink, alpha: 1 });
        else if (it.kind === 'label' && it.dimensionStyle) {
          // Prévia de cota no corte: texto de papel com a fonte da família (sem a caixa do rótulo de interface).
          const estilo = dimensionStyleFor(p.settings, { familyId: st.options.dimensionFamilyId ?? undefined });
          for (const l of sectionLabelsAt([{ at: it.at, text: it.text, center: true, rotation: it.rotation, color: theme.ink, papel: { escala: editor.viewScale(), fontMm: estilo.textHeight > 0 ? estilo.textHeight : 2.5 } }], v.zoom)) liveLabels.push(l);
        } else if (it.kind === 'label') liveLabels.push({ at: it.at, text: it.text, tone: 'info' });
        else if (it.kind === 'point') {
          const r = 3 / Math.max(v.zoom, 1);
          liveStrokes.push({ pts: [{ x: it.at.x - r, y: it.at.y }, { x: it.at.x + r, y: it.at.y }], closed: false, widthPx: 1, color: theme.select, alpha: 1 });
          liveStrokes.push({ pts: [{ x: it.at.x, y: it.at.y - r }, { x: it.at.x, y: it.at.y + r }], closed: false, widthPx: 1, color: theme.select, alpha: 1 });
        }
      }
      const secResult = st.sectionId ? editor.sectionOf(st.sectionId) : null;
      const selectedOpening = st.selection.find((id) => secResult?.openings.some((o) => o.openingId === id));
      if (secResult && selectedOpening) {
        const handles = sectionOpeningHandles(secResult, selectedOpening).filter((h) => h.kind === 'sill' || h.kind === 'head');
        const values = sectionOpeningValues(p, selectedOpening);
        const previewZ = sectionHandlePreview.current;
        const atOf = (h: SectionHandle): Pt => (previewZ !== null && (h.kind === 'sill' || h.kind === 'head') ? { x: h.at.x, y: previewZ } : h.at);
        const r = 3 / Math.max(v.zoom, 1);
        for (const h of handles) {
          const at = atOf(h);
          liveStrokes.push({ pts: [{ x: at.x - r, y: at.y - r }, { x: at.x + r, y: at.y - r }, { x: at.x + r, y: at.y + r }, { x: at.x - r, y: at.y + r }], closed: true, widthPx: 1, color: theme.select, alpha: 1 });
        }
        const sill = handles.find((h) => h.kind === 'sill');
        const head = handles.find((h) => h.kind === 'head');
        if (sill && head && values) {
          const a = atOf(sill);
          const b = atOf(head);
          liveStrokes.push({ pts: [a, b], closed: false, widthPx: 1, color: theme.select, alpha: 0.8, dash: [3, 2] });
          liveLabels.push({ at: { x: a.x, y: a.y }, text: t('cvv_preview_sill', { value: formatQuantity(unitsOf(p), 'length', values.sill, { lang }) }), dx: 6, dy: -8, tone: 'info' });
          liveLabels.push({ at: { x: b.x, y: b.y }, text: t('cvv_preview_height', { value: formatQuantity(unitsOf(p), 'length', values.height, { lang }) }), dx: 6, dy: -8, tone: 'info' });
        }
      }
      const dimDrag = sectionDimDrag.current;
      if (dimDrag && st.sectionId) {
        const cmd = sectionDimensionGripCommand(p, st.sectionId, dimDrag.grip, dimDrag.at);
        const ann = sectionAnnotationsOf(p.views.find((x) => x.id === st.sectionId));
        const r = 3 / Math.max(v.zoom, 1);
        if (dimDrag.grip.kind === 'noteText') {
          // Texto de anotação arrastado: mostra o bloco na posição nova (o desenho base só tem o antigo).
          const t = ann.texts.find((x) => x.id === dimDrag.grip.id);
          if (t) {
            liveLabels.push({ at: { ...dimDrag.at }, text: t.text, tone: 'info', ...(t.rotation ? { rotation: t.rotation } : {}) });
            liveStrokes.push({ pts: [{ x: dimDrag.at.x - r, y: dimDrag.at.y }, { x: dimDrag.at.x + r, y: dimDrag.at.y }], closed: false, widthPx: 1, color: theme.select, alpha: 1 });
            liveStrokes.push({ pts: [{ x: dimDrag.at.x, y: dimDrag.at.y - r }, { x: dimDrag.at.x, y: dimDrag.at.y + r }], closed: false, widthPx: 1, color: theme.select, alpha: 1 });
          }
        } else {
          const dim = ann.dimensions.find((x) => x.id === dimDrag.grip.id);
          const patch = cmd && cmd.type === 'updateDimension' ? cmd.patch : {};
          const next = dim ? { ...dim, ...patch } : undefined;
          if (next && !next.angular) {
            const style = dimensionStyleFor(p.settings, next);
            const pts = sectionDimensionPoints(next);
            const gd = dimensionGeometry(pts.a, pts.b, next.offset, editor.viewScale() / 1000, next.textHeight ?? style.textHeight, next.textAt, {
              extensionGapMm: style.extensionGap,
              extensionOvershootMm: style.extensionOvershoot,
              tickHalfMm: style.tickSize / 2,
              textGapMm: style.textGap,
              centered: style.textPlacement === 'centered',
              readConvention: style.readConvention,
            });
            for (const [a1, b1] of [gd.line, ...gd.extensions]) liveStrokes.push({ pts: [a1, b1], closed: false, widthPx: 1, color: theme.select, alpha: 0.9, dash: [4, 3] });
            liveLabels.push({ at: gd.textAt, text: dimensionText(p, next, unitsOf(p), dimensionFormatStyle(style)), tone: 'info' });
          }
        }
      }
      const live = sectionLiveOps({ project: p, inference: editor.activeTool.inference(), theme });
      liveFills.push(...live.fills);
      liveStrokes.push(...live.strokes);
      liveLabels.push(...live.labels);
      // Rótulos do desenho base no zoom corrente (mm de papel × escala → px), como o `PlanFrame` faz na planta: sem esta
      // passagem o valor da cota chegava à camada HTML sem `fontPx` e saía no estilo de "chip" (`dim-label`), em caixa.
      const baseLabels = baseLabelsAtZoom(baseDl.labels, v.zoom, secBaseLabels);
      const labels = liveLabels.length > 0 ? [...baseLabels, ...liveLabels] : baseLabels;
      const hasLive = liveFills.length > 0 || liveStrokes.length > 0;
      if (g) {
        g.gpu.setSize(w, h, dpr);
        plan.current.setViewport(v);
        if (baseDl !== secDl.current) {
          // A lista base mudou: `setDrawList` limpa TODAS as camadas (inclusive as vivas), que são reaplicadas no mesmo quadro.
          plan.current.setDrawList(baseDl, v);
          secDl.current = baseDl;
          secLive.current = false;
        }
        if (hasLive || secLive.current) {
          plan.current.setSlot('fillsLive', liveFills, [], v);
          plan.current.setSlot('strokesLive', [], liveStrokes, v);
          secLive.current = hasLive;
        }
        safeRender(g, plan.current.scene, plan.current.camera);
      } else if (cpuRef.current) {
        // Sem GPU, o Canvas2D recebe base + viva juntas numa lista só.
        drawPlanOnCanvas(cpuRef.current, { ...baseDl, fills: [...baseDl.fills, ...liveFills], strokes: [...baseDl.strokes, ...liveStrokes], labels }, v, dpr);
      }
      publish(labels, v);
      labelLayer.current?.syncView(v);
      return;
    }
    secDl.current = null;
    secLive.current = false;
    // Planta: pan e zoom mudam a câmera; geometria, sobreposição e grade só são refeitas quando a chave muda (PlanFrame).
    const quadro = (quadroRef.current ??= new QuadroPlanta({ provisorios: editor.provisorios, resolverReferencia: (id) => editor.resolved(id, false), pendente: (id) => editor.fluxo.pendente(id), pedirQuadro: () => useUi.setState((x) => ({ previewTick: x.previewTick + 1 })) }));
    // Grade visível quando o botão de grade está ligado ou quando a captura por grade está ativa (o que se captura, se vê).
    const gridOn = st.showGrid || (st.options.snap?.enabled !== false && !!st.options.snap?.grid);
    const areaPlan = st.planKind === 'area' && st.areaPlanId ? (p.areaPlans ?? []).find((x) => x.id === st.areaPlanId) : undefined;
    const visKey = `${[...vis.hidden].sort().join(',')}|${[...vis.revealed].sort().join(',')}`;
    const extra = quadro.desenhar({ quadro: pf, cena: g ? plan.current : null, v, tema: theme, nivel: st.levelId, versao: editor.store.version, contexto: [dark, !!g, v.zoom, st.showUnderlay, st.underlayLevel, st.showRoofProjection, gridOn, st.gridStep, st.planKind, areaPlan ? JSON.stringify(areaPlan) : '', st.tagDrag ? st.tagDrag.roomId : '', visKey].join('|'), atualizar: () => { const estado = { project: p, version: editor.store.version, levelId: st.levelId, v, theme, dark, gpu: !!g, showGrid: gridOn, showUnderlay: st.showUnderlay, underlayLevel: st.underlayLevel, showRoofProjection: st.showRoofProjection, roofPlanMode: st.planKind === 'roof', areaPlan, tagGhost: st.tagDrag ? { roomId: st.tagDrag.roomId, at: st.tagDrag.at } : undefined, thinLines: thinLinesOn(p, { levelId: st.levelId }), selection: st.selection, hover: st.hover, aviso: st.avisoParede, preview: editor.activeTool.preview(), inference: editor.activeTool.inference(), resolve: quadro.resolver, sketch, hidden: vis.hidden, revealed: vis.revealed, lang, subelemento: st.subElemento }; return planFrameUpdateOf(estado); } });
    if (g) {
      g.gpu.setSize(w, h, dpr);
      plan.current.setViewport(v);
      safeRender(g, plan.current.scene, plan.current.camera);
    } else if (cpuRef.current) drawPlanOnCanvas(cpuRef.current, QuadroPlanta.comProvisorio(pf.drawList(theme), extra), v, dpr);
    publish(pf.labels, v);
    // Alinha a camada HTML de texto no mesmo requestAnimationFrame do canvas da planta.
    // Isso evita o atraso de um render React entre a câmera e o texto da cota durante pan/zoom.
    labelLayer.current?.syncView(v);
  }, [size, ready, dark, sketch, rascunhoDaPrevia, iniciarMontagem3d, t, lang]);

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
  const drag = useRef<{ mode: 'tool' | 'pan' | 'orbit' | 'marquee' | 'none'; start: Pt; last: Pt; moved: boolean; pick: boolean; shiftPending?: boolean }>({ mode: 'none', start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, moved: false, pick: false });
  /** Retângulo da caixa de seleção do corte (DOM, atualizado sem re-render enquanto o botão está preso). */
  const caixaRef = useRef<HTMLDivElement>(null);
  const mostrarCaixa = (a: Pt, b: Pt): void => {
    const el = caixaRef.current;
    if (!el) return;
    el.style.display = 'block';
    el.style.left = `${Math.min(a.x, b.x)}px`;
    el.style.top = `${Math.min(a.y, b.y)}px`;
    el.style.width = `${Math.abs(b.x - a.x)}px`;
    el.style.height = `${Math.abs(b.y - a.y)}px`;
    // Janela (esquerda→direita) sólida; cruzamento (direita→esquerda) tracejada, como na planta.
    // Igual à caixa da planta (`previewOverlay`, polígono do Selecionar): preenchimento de 14% na cor de destaque, borda de
    // 1,5 px, tracejada no cruzamento (direita para a esquerda). O --accent-soft é opaco e escondia o modelo.
    el.style.borderStyle = b.x >= a.x ? 'solid' : 'dashed';
  };
  const ocultarCaixa = (): void => { if (caixaRef.current) caixaRef.current.style.display = 'none'; };
  /** Aplica a caixa do corte: converte as pontas para (t,z) e troca (ou soma, com Shift/Ctrl) a seleção. */
  const aplicarCaixaDoCorte = (a: Pt, b: Pt, somar: boolean): void => {
    const v = editor.viewport();
    const st = useUi.getState();
    const result = st.sectionId ? editor.sectionOf(st.sectionId) : null;
    if (!v || !result) return;
    const ids = idsNaCaixaDoCorte(result, screenToWorld(v, a), screenToWorld(v, b));
    useUi.setState({ selection: selecaoComCaixa(st.selection, ids, somar), selectedLevel: null });
  };
  /** Caixa da seleção na 3D (arrasto com Selecionar): pontas da tela viram NDC, como `elementAt3d`; janela ou cruzamento pelo sentido. */
  const aplicarCaixaDa3d = (a: Pt, b: Pt, somar: boolean): void => {
    const r = host.current!.getBoundingClientRect();
    const ndc = (p: Pt): Pt => ({ x: (p.x / r.width) * 2 - 1, y: 1 - (p.y / r.height) * 2 });
    const na = ndc(a);
    const nb = ndc(b);
    const ids = idsNaCaixaDaTela(model.current.scene, model.current.orbit.camera, { x0: na.x, y0: na.y, x1: nb.x, y1: nb.y }, modoDaCaixa(a, b));
    useUi.setState((st) => ({ selection: selecaoComCaixa(st.selection, ids, somar), selectedLevel: null }));
  };
  const gesture = useRef<{ dist: number; mid: Pt } | null>(null);
  const spaceDown = useRef(false);
  /** Botão direito pressionado: solto sem arrasto (mais de 4 px) abre o menu de contexto. */
  const rightPress = useRef<{ start: Pt; moved: boolean } | null>(null);
  /** Alça de abertura sendo arrastada no corte e a cota provisória do arraste. */
  const sectionHandleDrag = useRef<{ handle: SectionHandle } | null>(null);
  const sectionHandlePreview = useRef<number | null>(null);
  /** Alça de cota do corte em arraste e o ponto atual (prévia ao vivo; só grava ao soltar). */
  const sectionDimDrag = useRef<{ grip: SectionDimensionGrip; at: Pt } | null>(null);
  /** Último clique sem arrasto da Selecionar, para o duplo clique em cota. */
  const ultimoCliqueSel = useRef<CliqueAnterior | null>(null);
  /** Down adiado até a vista existir (D1): `load`/`newProject` limpam o mapa de viewports até o quadro seguinte. */
  const downAdiado = useRef<DownAdiado | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space') spaceDown.current = true;
      if (e.key === 'Escape' && sectionDimDrag.current) { sectionDimDrag.current = null; useUi.setState((st) => ({ previewTick: st.previewTick + 1 })); }
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
  // Ferramenta que declara `hover3d` (Porta na cortina) recebe, na 3D, o ponto e a altura da superfície sob o cursor.
  const infoDe = (s: Pt, m: Mods) => {
    if (useUi.getState().view === '3d' && editor.activeTool.hover3d) {
      const el = elementAt3d(s);
      return { raw: el ? { x: el.point.x, y: el.point.y } : { x: 0, y: 0 }, ...m, hit3d: el?.id ?? null, hitZ: el?.point.z };
    }
    return { raw: screenToWorld(editor.viewport() as Viewport, s), ...m };
  };
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
      // Selecionar + botão esquerdo sem Alt nem Espaço: o arrasto desenha a caixa de seleção (janela ou cruzamento) em vez
      // de orbitar. Alt+esquerdo, Espaço, meio e Shift+meio seguem como antes. Com a prévia do Colar, a órbita fica.
      if (!emPrevia && e.button === 0 && !spaceDown.current && !e.altKey && editor.activeTool.id === 'select') {
        drag.current = { mode: 'marquee', start: s, last: s, moved: false, pick: true };
        if (useUi.getState().hover) useUi.setState({ hover: null });
        return;
      }
      const mode = isOrbitReq ? 'orbit' : isPanReq ? 'pan' : (e.button === 0 ? 'orbit' : 'none');
      drag.current = { mode, start: s, last: s, moved: false, pick: e.button === 0 && !spaceDown.current && !e.altKey && !emPrevia };
      if (mode === 'orbit' || mode === 'pan') iniciarGesto();
      // Ao pressionar, o realce some: enquanto arrasta, o cursor orbita e não destaca.
      if (useUi.getState().hover) useUi.setState({ hover: null });
      return;
    }
    // Corte/elevação: ferramentas de anotação e edição usam o mesmo pointer da planta, em coordenadas (t,z).
    if (view === 'section') {
      const stNow = useUi.getState();
      const vNow = editor.viewport();
      const result = stNow.sectionId ? editor.sectionOf(stNow.sectionId) : null;
      if (vNow && e.button === 0 && !spaceDown.current && !e.altKey && !isMiddleBtn && editor.activeTool.id === 'select' && stNow.selection.length > 0) {
        // A alça da cota selecionada tem prioridade sobre a abertura, a caixa de seleção e o pick de elementos.
        const w = screenToWorld(vNow, s);
        const grip = sectionDimensionGripAt(editor.project, stNow.sectionId, stNow.selection, w, 8 / vNow.zoom, 10 / vNow.zoom, editor.viewScale());
        if (grip) {
          sectionDimDrag.current = { grip, at: w };
          drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
          if (useUi.getState().hover) useUi.setState({ hover: null });
          useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
          return;
        }
      }
      if (result && vNow && e.button === 0 && !spaceDown.current && !e.altKey && !isMiddleBtn && editor.activeTool.id === 'select') {
        const handle = sectionHandleAt(result, screenToWorld(vNow, s), 8 / vNow.zoom, stNow.selection);
        if (handle) {
          sectionHandleDrag.current = { handle };
          sectionHandlePreview.current = handle.at.y;
          drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
          return;
        }
      }
      const sectionTool = editor.activeTool.id !== 'select';
      if (sectionTool && e.button === 0 && !spaceDown.current && !e.altKey && !isMiddleBtn) {
        // A vista pode ainda estar no primeiro quadro depois de abrir o corte; não entregue ponto sem viewport.
        if (!editor.viewport()) return;
        drag.current = { mode: 'tool', start: s, last: s, moved: false, pick: false };
        if (useUi.getState().hover) useUi.setState({ hover: null });
        editor.pointer('down', info(e, s));
        return;
      }
      // Sem ferramenta ativa, o botão esquerdo faz caixa de seleção como na planta; sem arrasto, seleciona (decisão 0016).
      // Meio, Espaço e Alt arrastam a vista (pan).
      if (gestoDoBotaoNoCorte({ botao: e.button, espaco: spaceDown.current, alt: e.altKey }) === 'caixa') {
        drag.current = { mode: 'marquee', start: s, last: s, moved: false, pick: true };
        if (useUi.getState().hover) useUi.setState({ hover: null });
        return;
      }
      drag.current = { mode: 'pan', start: s, last: s, moved: false, pick: e.button === 0 && !spaceDown.current };
      if (useUi.getState().hover) useUi.setState({ hover: null });
      return;
    }
    if (isPanReq || isMiddleBtn) {
      drag.current = { mode: 'pan', start: s, last: s, moved: false, pick: false };
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
        marcarInteracao();
        model.current.orbit.zoom(-(d - gesture.current.dist) * 3);
        model.current.orbit.pan(mid.x - gesture.current.mid.x, mid.y - gesture.current.mid.y);
        useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
      }
      gesture.current = { dist: d, mid };
      return;
    }
    const d = drag.current;
    if (view === '3d') {
      if (d.mode === 'marquee') {
        if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
        if (d.moved) mostrarCaixa(d.start, s);
        d.last = s;
        return;
      }
      if (d.mode === 'orbit') { marcarInteracao(); model.current.orbit.orbit(s.x - d.last.x, s.y - d.last.y); }
      else if (d.mode === 'pan') { marcarInteracao(); model.current.orbit.pan(s.x - d.last.x, s.y - d.last.y); }
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
    // Sem botão pressionado, o corte realça o elemento sob o cursor (decisão 0016). Com ferramenta, o pointer
    // segue o mesmo fluxo da planta, em coordenadas (t,z).
    if (view === 'section') {
      if (d.mode === 'marquee') {
        if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
        if (d.moved) mostrarCaixa(d.start, s);
        return;
      }
      if (sectionDimDrag.current) {
        const v = editor.viewport();
        if (v) {
          sectionDimDrag.current.at = screenToWorld(v, s);
          useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
        }
        return;
      }
      if (sectionHandleDrag.current) {
        const v = editor.viewport();
        if (v) {
          sectionHandlePreview.current = screenToWorld(v, s).y;
          useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
        }
        return;
      }
      if (d.mode === 'tool') {
        if (!editor.viewport()) return;
        if (!d.moved && passouDoLimiar(Math.hypot(s.x - d.start.x, s.y - d.start.y))) d.moved = true;
        const inf = info(e, s);
        editor.pointer(d.moved ? 'drag' : 'move', inf);
        // A barra de status também acompanha o corte: as coordenadas já vêm em (t,z) e o tipo de snap é o da inferência.
        useUi.setState({ cursor: inf.raw, snapKind: editor.activeTool.inference()?.kind ?? '' });
        d.last = s;
        return;
      }
      if (d.mode === 'none') {
        // Sem ferramenta, o ponteiro só realça o elemento (Selecionar); com ferramenta, ele alimenta a inferência para
        // a prévia e a barra de status acompanharem o cursor mesmo entre cliques (como na planta).
        const inf = editor.viewport() ? info(e, s) : null;
        const ferramentaAtiva = editor.activeTool.id !== 'select';
        if (inf && ferramentaAtiva) editor.pointer('move', inf);
        if (inf) useUi.setState({ cursor: inf.raw, snapKind: ferramentaAtiva ? (editor.activeTool.inference()?.kind ?? '') : '' });
        if (!ferramentaAtiva) hoverSectionAt(s);
        // Cursor de alça sobre a alça da cota selecionada (o resto do tempo, a seta da Selecionar).
        const vh = editor.viewport();
        if (host.current && vh && !ferramentaAtiva) {
          const stH = useUi.getState();
          const sobre = stH.selection.length > 0 && !!sectionDimensionGripAt(editor.project, stH.sectionId, stH.selection, screenToWorld(vh, s), 8 / vh.zoom, 10 / vh.zoom, editor.viewScale());
          host.current.style.cursor = sobre ? 'move' : 'default';
        }
      }
      return;
    }
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
    encerrarGesto();
    const s = local(e);
    pointers.current.delete(e.pointerId);
    if (sectionDimDrag.current) {
      const { grip } = sectionDimDrag.current;
      sectionDimDrag.current = null;
      const v = editor.viewport();
      const sid = useUi.getState().sectionId;
      const cmd = v && sid ? sectionDimensionGripCommand(editor.project, sid, grip, screenToWorld(v, s)) : null;
      if (cmd) {
        editor.applyCommand(cmd);
        const msg = grip.kind === 'noteText' ? t('cvv_note_moved') : grip.kind === 'text' ? t('cvv_dim_text_moved') : t('cvv_dim_offset_updated');
        useUi.setState({ status: { key: 'cvv_undo_hint', args: { msg } } });
      }
      useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
      drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
      return;
    }
    if (sectionHandleDrag.current) {
      const dragHandle = sectionHandleDrag.current;
      sectionHandleDrag.current = null;
      const v = editor.viewport();
      const z = v ? screenToWorld(v, s).y : sectionHandlePreview.current;
      sectionHandlePreview.current = null;
      if (z !== null) {
        const cmd = sectionHandleCommand(editor.project, dragHandle.handle, z);
        if (cmd) {
          editor.applyCommand(cmd);
          const kindKey = dragHandle.handle.kind === 'sill' ? 'cvv_sill_updated' : dragHandle.handle.kind === 'head' ? 'cvv_head_updated' : 'cvv_side_updated';
          useUi.setState({ status: { key: 'cvv_undo_hint', args: { msg: t(kindKey) } } });
        }
      }
      useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
      drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
      return;
    }
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
      if (!editor.viewport()) return;
      // Shift pendente sem arrasto: é um toque com shift (trava ortogonal) e a ferramenta recebe down, up e click.
      const inf = d.shiftPending ? { ...info(e, s), shift: true } : info(e, s);
      if (d.shiftPending) editor.pointer('down', inf);
      for (const ev of eventosDeSolta(d.moved)) editor.pointer(ev, inf);
    }
    // Caixa do corte: arrasto solta a caixa; sem arrasto, cai no clique abaixo (seleciona o elemento ou limpa o vazio).
    if (d.mode === 'marquee') {
      ocultarCaixa();
      if (d.moved) {
        if (useUi.getState().view === '3d') aplicarCaixaDa3d(d.start, s, e.shiftKey || e.ctrlKey);
        else aplicarCaixaDoCorte(d.start, s, e.shiftKey || e.ctrlKey);
      }
    }
    // Clique sem arrasto na vista 3D. Com ferramenta que aceita pick3d: vai o ponto da superfície sob o cursor (no plano).
    // Sem essa ferramenta (seleção): seleciona o elemento sob o cursor; Shift/Ctrl acrescenta ou alterna (decisão 0016 §3).
    // Clique no vazio deseleciona.
    if (!d.moved && d.pick && useUi.getState().view === '3d') {
      const hit = pick3dAt(s);
      const el = elementAt3d(s);
      if (editor.activeTool.pick3d) {
        if (hit || el) {
          editor.pointer('click', { raw: hit ?? { x: 0, y: 0 }, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, hit3d: el?.id ?? null, hitZ: el?.point.z });
        } else {
          // Clique no vazio cancela/sai para a ferramenta de seleção
          editor.activeTool.cancel();
          clickSelect3d(null, false);
          useUi.setState({ status: { key: 'cvv_select_mode' } });
        }
      } else {
        // Um elemento sob o cursor tem prioridade: a anotação do nível (texto/bolha) não pode bloquear parede/telhado.
        if (el) {
          const antes = useUi.getState().selection;
          const comum = !(e.shiftKey || e.ctrlKey || e.metaKey);
          clickSelect3d(el.id, !comum);
          // Parede cortina já selecionada sozinha: o clique sobre a linha ou o painel escolhe o subelemento (sem nada, a parede inteira).
          useUi.setState({ subElemento: comum && antes.length === 1 && antes[0] === el.id ? subelementoDaCortinaEm(editor.project, el.id, el.point, TOLERANCIA_SUB_3D) : null });
        }
        else if (!selecionarNivelNoClique(model.current, host.current!.getBoundingClientRect(), s)) clickSelect3d(null, e.shiftKey || e.ctrlKey || e.metaKey);
      }
    }
    // Clique sem arrasto no corte ou na elevação: o mesmo caminho da 3D (clickSelect3d, que usa selectionAfterClick).
    if (!d.moved && d.pick && useUi.getState().view === 'section') clickSelect3d(sectionPickAt(s)?.id ?? null, e.shiftKey || e.ctrlKey || e.metaKey);
    // Duplo clique em cota permanente (Selecionar, planta ou corte): abre o editor de valor (dimEditId, frente I3).
    if (!d.moved && e.button === 0 && editor.activeTool.id === 'select' && useUi.getState().view !== '3d') {
      const agora: CliqueAnterior = { t: performance.now(), x: s.x, y: s.y };
      if (ehDuploClique(ultimoCliqueSel.current, agora)) {
        ultimoCliqueSel.current = null;
        const st2 = useUi.getState();
        const vv = editor.viewport();
        if (vv) {
          const alvo = st2.view === 'section'
            ? ({ vista: 'section', sectionId: st2.sectionId, hitId: sectionPickAt(s)?.id ?? null } as const)
            : ({ vista: 'plan', levelId: st2.levelId, planId: st2.planKind === 'area' ? (st2.areaPlanId ?? undefined) : undefined, mpp: 1 / vv.zoom } as const);
          const id = cotaParaEditar(editor.project, alvo, screenToWorld(vv, s));
          if (id) useUi.setState({ dimEditId: id });
        }
      } else ultimoCliqueSel.current = agora;
    }
    // Arrasto que começou sobre o seletor de escala deixa o foco no <select>, e aí Delete e os atalhos são ignorados: solta o foco.
    if (d.moved && document.activeElement?.tagName === 'SELECT') (document.activeElement as HTMLElement).blur();
    drag.current = { mode: 'none', start: s, last: s, moved: false, pick: false };
    // O cursor é derivado do ref de arraste; sem este quadro ele ficaria em `grabbing` ao soltar o pan.
    useUi.setState((st) => ({ previewTick: st.previewTick + 1 }));
  };

  /**
   * Cancelamento do navegador (toque interrompido, perda de captura): não é clique e não pode gerar geometria.
   * Zera o gesto sem enviar `up`/`click` à ferramenta (D4). Só cancela a ferramenta quando o gesto era dela e o
   * `down` já havia saído — com down adiado (D1) ou Shift pendente a ferramenta nem começou, não há estado a desfazer.
   */
  const onCancel = (e: RPointerEvent): void => {
    encerrarGesto();
    const fim = pointers.current.get(e.pointerId) ?? drag.current.last;
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    rightPress.current = null;
    if (sectionDimDrag.current) { sectionDimDrag.current = null; useUi.setState((st) => ({ previewTick: st.previewTick + 1 })); }
    const d = drag.current;
    if (d.mode === 'marquee') ocultarCaixa();
    if (d.mode === 'tool' && !downAdiado.current && !d.shiftPending) editor.activeTool.cancel?.();
    cancelarDownAdiado();
    drag.current = { mode: 'none', start: fim, last: fim, moved: false, pick: false };
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const st = useUi.getState();
    if (st.view === '3d') {
      marcarInteracao();
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

  // Uma única política para as três vistas (cursor.ts): Selecionar é sempre a seta, a mão só existe durante pan/orbit,
  // alças do corte pedem o eixo e as ferramentas de desenho usam texto/mover/mira.
  const handleKind = sectionHandleDrag.current?.handle.kind;
  const handleAxis = handleKind ? (handleKind === 'sill' || handleKind === 'head' ? 'vertical' : 'horizontal') : null;
  const cursorCss = cursorForView({
    view: ui.view,
    tool: ui.tool,
    // A caixa usa a seta (Selecionar), como a planta; só pan/orbit pedem a mão.
    drag: drag.current.mode === 'marquee' ? 'none' : drag.current.mode,
    moved: drag.current.moved,
    handle: handleAxis,
  });
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
      <div ref={caixaRef} style={CAIXA_DE_SELECAO_STYLE} />
      {ui.view === '3d' && <Progresso3D />}
      <ProgressoAbertura />
    </div>
  );
}
