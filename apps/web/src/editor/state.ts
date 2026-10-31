import { create } from 'zustand';
import type { Id, LocationLine, OpeningDimRef, WallDimRef } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import type { Backend } from '@hestia/render';
import { DEFAULT_DISJOIN, DEFAULT_RAMP_OPTIONS, DEFAULT_SNAP, DEFAULT_STAIR_RUN_OPTIONS, type SnapOptions, type ToolId, type ToolOptions } from '@hestia/tools';
import { safeGet, safeSet } from './storage.ts';
import { selectionAfterClick } from './selectionClick.ts';
import { activeViewOf, addView, type OpenView, type PlanKind } from './openViews.ts';
import type { RibbonTabId } from '../ui/ribbon/model.ts';
import { loadDock, type DockLayout } from './dockLayout.ts';
import type { TempViewVisibility } from './viewVisibility.ts';

export type ViewKind = 'plan' | '3d' | 'section' | 'sheet';
export type ThemePref = 'system' | 'light' | 'dark';
/**
 * Tema ao abrir o app: claro, mesmo que o sistema esteja no escuro (o app não herda a preferência do Windows).
 * Quem quiser seguir o sistema ou usar o escuro escolhe no menu Arquivo; a escolha vale só para a sessão.
 */
export const DEFAULT_THEME: ThemePref = 'light';
export type DialogKind = 'wallType' | 'floorType' | 'materials' | 'levels' | 'openingType' | 'start' | 'shortcuts' | 'shortcutsConfig' | 'about' | 'schedule' | 'floorSchedule' | 'slabType' | 'slabSchedule' | 'ceilingType' | 'ceilingSchedule' | 'roofType' | 'roofSchedule' | 'stairType' | 'stairSchedule' | 'rampType' | 'rampSchedule' | 'openingSchedule' | 'graphicsVisibility' | 'lineWeights' | 'dxfLayers' | 'sheet' | 'addView' | 'renumberSheets' | 'revision' | 'publish' | 'roomSchedule' | 'roomCategories' | 'cotasAuto' | 'moveLevel' | 'gridType' | 'units' | 'dimensions' | 'hostedLoss' | 'areaMerge' | 'importCad' | 'manageCad' | null;

export interface UiState {
  tool: ToolId;
  view: ViewKind;
  levelId: Id;
  /** Vista de corte ou elevação aberta quando `view` é 'section'. */
  sectionId: Id | null;
  /** Prancha aberta quando `view` é 'sheet' (decisão 0022). */
  sheetId: Id | null;
  /** Planta de piso, de cobertura ou de área quando `view` é 'plan' (sessão; a cobertura liga `roofPlanMode`). */
  planKind: PlanKind;
  /** Planta de área ativa quando `planKind` é 'area'. */
  areaPlanId: Id | null;
  /** Rótulo em arraste (fantasma), compartilhado por qualquer planta. */
  tagDrag: { planId: Id; roomId: Id; at: Vec2 } | null;
  /** Ferramenta Alinhar ativa na prancha (sessão; decisão 0039). */
  sheetAlign: boolean;
  /** Ferramenta Mover ativa na prancha (sessão; decisão 0039). */
  sheetMove: boolean;
  /** Hide/isolate/reveal temporários por vista (sessão; não vai para o projeto). */
  viewTemp: Record<string, TempViewVisibility>;
  selection: Id[];
  /** Nível selecionado no 3D (a seleção de elementos fica vazia quando há um). */
  selectedLevel: Id | null;
  hover: Id | null;
  options: ToolOptions;
  theme: ThemePref;
  gpu: Backend | 'cpu' | 'pending';
  status: string;
  typed: string;
  prompt: string | null;
  dialog: DialogKind;
  dialogArg: string | null;
  showGrid: boolean;
  /** Intervalo da grade de pontos (m); 0 = automático pelo zoom. Vale para o desenho e para a captura. */
  gridStep: number;
  showUnderlay: boolean;
  /** Pavimento de referência escolhido nas propriedades da vista (null = o de baixo). */
  underlayLevel: string | null;
  /** Projeção tracejada do contorno da cobertura acima do corte (opção da planta, decisão 0013 §2). */
  showRoofProjection: boolean;
  /** Paleta de propriedades e navegador de projeto abertos. */
  propsOpen: boolean;
  browserOpen: boolean;
  /** Disposição dos painéis acoplados (lado do navegador, larguras, divisória). */
  dock: DockLayout;
  tutorial: boolean;
  /** Incrementa quando a pré-visualização da ferramenta muda (força novo desenho). */
  previewTick: number;
  /** Referências de cota escolhidas na sessão (`${provedor}:${ponta}` → referência); somem ao trocar de ferramenta ou seleção. */
  dimOverrides: Record<string, WallDimRef | OpeningDimRef>;
  /**
   * Versão do projeto em que a seleção virou cotas permanentes (botão "I"): enquanto o projeto estiver nela, as cotas
   * temporárias da seleção ficam suspensas para não se sobrepor às pretas. Some na próxima seleção ou alteração.
   */
  dimsSuspendedVersion: number | null;
  /** Cota permanente em edição de valor (duplo clique): o editor de valor lê este id e aplica `drivenEditCommands`. */
  dimEditId: string | null;
  cursor: { x: number; y: number } | null;
  snapKind: string;
  seen3d: boolean;
  /** Aba da faixa escolhida; 'ctx' é a aba contextual verde. */
  ribbon: RibbonTabId;
  /** Aba de antes da contextual: volta para ela quando a contextual some. */
  ribbonBack: RibbonTabId;
  /** Menu Arquivo aberto (aba Arquivo da faixa). */
  fileMenu: boolean;
  /**
   * Vistas abertas na barra, na ordem das abas (sessão, não vai para o projeto). A vista ativa é sempre uma delas:
   * `view`/`levelId`/`sectionId`/`sheetId` continuam sendo a fonte da vista ativa, e esta lista é sincronizada com eles.
   */
  openViews: OpenView[];
}

const SNAP_KEY = 'hestia.snap';
const SNAP_FLAGS = Object.keys(DEFAULT_SNAP) as Array<keyof SnapOptions>;

/** Capturas guardadas no navegador (preferência da tela, não do projeto). Sem armazenamento ou dado inválido: padrão. */
function loadSnap(): SnapOptions {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return DEFAULT_SNAP;
    const saved = JSON.parse(raw) as Partial<Record<keyof SnapOptions, unknown>>;
    const out: SnapOptions = { ...DEFAULT_SNAP };
    for (const k of SNAP_FLAGS) {
      const v = saved[k];
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return DEFAULT_SNAP;
  }
}

const GRID_STEP_KEY = 'hestia.gridStep';

/** Intervalo da grade guardado no navegador; sem armazenamento ou valor inválido: automático (0). */
function loadGridStep(): number {
  try {
    const n = Number(localStorage.getItem(GRID_STEP_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Define o intervalo da grade (m; 0 = automático) e o guarda no navegador. */
export function setGridStep(step: number): void {
  const n = Number.isFinite(step) && step > 0 ? step : 0;
  useUi.setState({ gridStep: n });
  try {
    localStorage.setItem(GRID_STEP_KEY, String(n));
  } catch {
    // Armazenamento indisponível: o intervalo vale só nesta sessão.
  }
}

/** Altera capturas (em parte ou todas) e guarda no navegador para sobreviver ao recarregamento. */
export function setSnap(patch: Partial<SnapOptions>): void {
  const snap: SnapOptions = { ...(useUi.getState().options.snap ?? DEFAULT_SNAP), ...patch };
  // A grade de pontos e a captura por grade são uma chave só: o que se vê é o que se captura.
  useUi.setState((s) => ({ options: { ...s.options, snap }, ...(patch.grid === undefined ? {} : { showGrid: patch.grid }) }));
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    // Armazenamento indisponível (janela privada, dados bloqueados): a captura vale só nesta sessão.
  }
}

/** Liga/desliga o modo ortogonal global (F8): só a projeção nos eixos 0°/90° enquanto ativo. */
export function toggleOrtho(): boolean {
  const s = useUi.getState();
  const am = s.options.angleMode ?? { ortho: s.options.orthoLock, polar: false, polarIncrementDeg: 15 };
  const next = !am.ortho;
  useUi.setState({
    options: { ...s.options, orthoLock: next, angleMode: { ...am, ortho: next } },
    status: next ? 'Orto ativado (F8): apenas 0°/90°.' : 'Orto desativado (F8).',
  });
  return next;
}

/** Liga/desliga o rastreamento polar (F10) nos múltiplos do incremento do grupo Orto/Polar. */
export function togglePolar(): boolean {
  const s = useUi.getState();
  const am = s.options.angleMode ?? { ortho: s.options.orthoLock, polar: false, polarIncrementDeg: 15 };
  const next = !am.polar;
  useUi.setState({
    options: { ...s.options, angleMode: { ...am, polar: next } },
    status: next ? `Polar ativado (F10): múltiplos de ${am.polarIncrementDeg}°.` : 'Polar desativado (F10).',
  });
  return next;
}

/** Incremento polar personalizado em graus (15, 22,5, 30, 45...); valores fora de 0–180 são recusados. */
export function setPolarIncrement(deg: number): void {
  if (!Number.isFinite(deg) || deg <= 0 || deg > 180) {
    useUi.setState({ status: 'O incremento polar deve estar entre 0,1° e 180°.' });
    return;
  }
  const s = useUi.getState();
  const am = s.options.angleMode ?? { ortho: s.options.orthoLock, polar: false, polarIncrementDeg: 15 };
  useUi.setState({ options: { ...s.options, angleMode: { ...am, polarIncrementDeg: deg } }, status: `Incremento polar: ${deg}°.` });
}

/**
 * Projeção tracejada da cobertura acima do corte (decisão 0013 §2): preferência da tela, não do projeto, como a captura.
 * Guardada no navegador; sem armazenamento ou valor inválido, vale ligada (padrão).
 */
export const ROOF_PROJECTION_KEY = 'hestia.roofProjection';

/** Lê a preferência guardada. Ausente, inválida ou armazenamento indisponível: ligada. */
export function readRoofProjection(): boolean {
  return safeGet(ROOF_PROJECTION_KEY) !== 'false';
}

/** Liga ou desliga a projeção da cobertura e guarda a escolha. Sem armazenamento, vale só nesta sessão. */
export function setRoofProjection(on: boolean): void {
  useUi.setState({ showRoofProjection: on });
  safeSet(ROOF_PROJECTION_KEY, on ? 'true' : 'false');
}

/** Alterna a projeção da cobertura (alternador da faixa, aba Vista, e a caixa de Propriedades usam o mesmo estado). */
export function toggleRoofProjection(): void {
  setRoofProjection(!useUi.getState().showRoofProjection);
}

/**
 * Clique na vista 3D (sem arrasto, decisão 0016 §3): o elemento sob o cursor vai para a seleção comum (planta, árvore e
 * propriedades). `hit` null é o vazio. Com `additive` (Shift/Ctrl), entra ou sai da seleção.
 */
export function clickSelect3d(hit: Id | null, additive: boolean): void {
  const ui = useUi.getState();
  const next = selectionAfterClick(ui.selection, hit, additive);
  useUi.setState({ selection: next, selectedLevel: null });
}

/** Seleciona um nível no 3D (ou limpa); a seleção de elementos fica vazia quando há um nível. */
export function selectLevel(id: Id | null): void {
  useUi.setState({ selectedLevel: id, ...(id ? { selection: [] } : {}) });
}

/**
 * Teclas de exclusão nas vistas 3D e de corte (decisão 0016 §5): Delete e Backspace excluem a seleção por `remove`.
 * Esc não passa por aqui: segue o da planta no controlador. Devolve se a tecla foi consumida (sem seleção, nada é consumido).
 */
export function key3d(k: string, selection: readonly Id[], remove: () => void): boolean {
  if (!selection.length || !['Delete', 'Backspace'].includes(k)) return false;
  remove();
  return true;
}

export const DEFAULT_OPTIONS: ToolOptions = {
  snap: loadSnap(),
  wallTypeId: 'wt_alv14',
  locationLine: 'wallCenter' as LocationLine,
  wallHeight: 2.8,
  chain: true,
  wallShape: 'line',
  doorTypeId: 'ot_p80',
  windowTypeId: 'ot_j120',
  openingFacingMode: 'cursor',
  openingToward: 'cursor',
  openingAnchor: 'center',
  openingClear: 0.1,
  orthoLock: false,
  angleMode: { ortho: false, polar: false, polarIncrementDeg: 15 },
  arrayCount: 3,
  arrayKind: 'linear',
  arrayAngle: 360,
  arrayAnchor: 'second',
  alignPrefer: 'faces',
  offsetDistance: 1,
  trimMode: 'unico',
  rotateCopy: false,
  mirrorCopy: true,
  offsetCopy: true,
  moveDisjoin: DEFAULT_DISJOIN.move,
  rotateDisjoin: DEFAULT_DISJOIN.rotate,
  mirrorDisjoin: DEFAULT_DISJOIN.mirror,
  floorTypeId: 'ft_ceram',
  floorOffset: 0,
  slabTypeId: 'ls_mac12',
  slabOffset: 0,
  slabSlopePercent: 2,
  ceilingTypeId: 'ct_gesso',
  ceilingOffset: 2.6,
  roofTypeId: 'rt_ceramica',
  roofSlope: 30,
  roofOverhang: 0.5,
  roofOffset: null,
  stair: { primitive: 'line', baseOffset: 0, topOffset: 0, height: 2.8, topLevelId: null },
  stairRun: DEFAULT_STAIR_RUN_OPTIONS,
  ramp: DEFAULT_RAMP_OPTIONS,
};

/**
 * Padrão ao abrir o projeto (decisão a confirmar): só o nível ativo fica aberto. Ver o relatório da frente D.
 * Para mudar para "todos os níveis", troque esta constante por uma lista com todas as plantas (ou calcule-a ao carregar).
 */
export const DEFAULT_OPEN_VIEWS: OpenView[] = [{ kind: 'plan', levelId: 'lv_0' }];

export const useUi = create<UiState>(() => ({
  tool: 'select',
  view: 'plan',
  levelId: 'lv_0',
  planKind: 'floor',
  areaPlanId: null,
  tagDrag: null,
  sheetAlign: false,
  sheetMove: false,
  viewTemp: {},
  sectionId: null,
  sheetId: null,
  selection: [],
  selectedLevel: null,
  hover: null,
  options: DEFAULT_OPTIONS,
  theme: DEFAULT_THEME,
  gpu: 'pending',
  status: 'Pronto.',
  typed: '',
  prompt: null,
  dialog: null,
  dialogArg: null,
  // Os pontos e a captura por grade são uma chave só: abrem como a captura foi deixada (`setSnap({ grid })` mantém os dois juntos).
  showGrid: loadSnap().grid,
  gridStep: loadGridStep(),
  showUnderlay: true,
  underlayLevel: null,
  showRoofProjection: readRoofProjection(),
  propsOpen: typeof window === 'undefined' || window.innerWidth > 900,
  browserOpen: typeof window === 'undefined' || window.innerWidth > 900,
  dock: loadDock(),
  tutorial: false,
  previewTick: 0,
  dimOverrides: {},
  dimsSuspendedVersion: null,
  dimEditId: null,
  cursor: null,
  snapKind: '',
  seen3d: false,
  ribbon: 'arquitetura',
  ribbonBack: 'arquitetura',
  fileMenu: false,
  openViews: DEFAULT_OPEN_VIEWS.map((v) => ({ ...v })),
}));

/**
 * Toda vista ativa entra na lista de vistas abertas (abrir um nível já aberto só ativa, pois `addView` não duplica).
 * Assim, qualquer caminho que muda a vista (árvore, ribbon, corte, prancha, ferramenta de planta) abre a aba sem
 * precisar de cada chamador. O fechamento é feito por `closeView` (ver ViewTabs em ui/ViewTabs.tsx).
 */
/** Botão do aplicativo ("H"): o menu Arquivo fechado abre e o aberto fecha. */
export function alternaFileMenu(aberto: boolean): boolean {
  return !aberto;
}

/** Alterna o menu Arquivo pelo botão da barra de título. */
export function toggleFileMenu(): void {
  useUi.setState((s) => ({ fileMenu: alternaFileMenu(s.fileMenu) }));
}

useUi.subscribe((s, prev) => {
  if (s.view === prev.view && s.levelId === prev.levelId && s.planKind === prev.planKind && s.areaPlanId === prev.areaPlanId && s.sectionId === prev.sectionId && s.sheetId === prev.sheetId) return;
  const active = activeViewOf(s);
  if (!active) return;
  const next = addView(s.openViews, active);
  if (next !== s.openViews) useUi.setState({ openViews: next });
});

/** Escolhe, só para a sessão, a referência de uma ponta de cota (alça ou troca rápida). */
export function setDimOverride(key: string, ref: WallDimRef | OpeningDimRef): void {
  useUi.setState((s) => ({ dimOverrides: { ...s.dimOverrides, [key]: ref } }));
}

/** Remove a troca de uma ponta (volta ao padrão do projeto). */
export function clearDimOverride(key: string): void {
  useUi.setState((s) => {
    const { [key]: _removida, ...resto } = s.dimOverrides;
    return { dimOverrides: resto };
  });
}

/** Limpa as referências de sessão (volta ao padrão do projeto). */
export function clearDimOverrides(): void {
  if (Object.keys(useUi.getState().dimOverrides).length > 0) useUi.setState({ dimOverrides: {} });
}

/**
 * Suspende as cotas temporárias da seleção depois de ela virar cotas permanentes (botão "I"). A suspensão vale só
 * enquanto o projeto estiver na `version` da conversão: a próxima seleção ou alteração (inclusive o desfazer) a desfaz.
 */
export function suspendSelectionDims(version: number): void {
  useUi.setState({ dimsSuspendedVersion: version });
}

/** Devolve as cotas temporárias da seleção (fim da suspensão). */
export function clearDimsSuspension(): void {
  if (useUi.getState().dimsSuspendedVersion !== null) useUi.setState({ dimsSuspendedVersion: null });
}

// As trocas rápidas e a suspensão valem para a ferramenta e a seleção em que foram feitas.
useUi.subscribe((s, prev) => {
  if (s.tool === prev.tool && s.selection === prev.selection) return;
  clearDimOverrides();
  clearDimsSuspension();
});
