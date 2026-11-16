import { VISUAL_STYLES, type VisualStyle } from '@hestia/model';
import { sameView } from './openViews.ts';
import type { CameraDaPrevia } from './pastePreview.ts';
import {
  DEFAULT_SYNC,
  MAX_PANES,
  PANES_KEY,
  SPLIT_LIMITS,
  findPane,
  leaves,
  type LayoutNode,
  type LayoutPresetId,
  type Pane,
  type PaneCamera2D,
  type PaneId,
  type PaneLayout,
  type PaneLayoutOps,
  type PaneStyle,
  type PaneSync,
  type PaneView,
  type SplitDirection,
  type SplitPath,
} from './panes.ts';
import { safeGet, safeSet } from './storage.ts';

/**
 * Árvore de layout do sistema multitelas (funções puras sobre `PaneLayout`, contrato em `panes.ts`). Nenhuma operação
 * muda a entrada: quando a operação é recusada ou não altera nada, devolve o MESMO objeto recebido.
 */

type Split = Extract<LayoutNode, { kind: 'split' }>;
type Fallback = { view: PaneView; id: PaneId };

const PRESET_PANES: Record<LayoutPresetId, number> = { single: 1, twoColumns: 2, twoRows: 2, oneAndTwo: 3, grid: 4 };
const STYLE_KEYS: readonly (keyof PaneStyle)[] = ['style', 'shadows', 'edges', 'background', 'thinLines'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isVisualStyle = (v: unknown): v is VisualStyle => (VISUAL_STYLES as readonly unknown[]).includes(v);
const isLeafOf = (n: LayoutNode, id: PaneId): boolean => n.kind === 'leaf' && n.pane.id === id;
const leafNode = (pane: Pane): LayoutNode => ({ kind: 'leaf', pane });
const halves = (direction: SplitDirection, first: LayoutNode, second: LayoutNode): LayoutNode => ({
  kind: 'split',
  direction,
  ratio: 0.5,
  first,
  second,
});

function newPane(id: PaneId, view: PaneView): Pane {
  return { id, view, style: {}, sync: { ...DEFAULT_SYNC }, camera3d: null, camera2d: null };
}

/** Primeira folha da subárvore, em ordem de leitura. */
function firstPane(n: LayoutNode): Pane {
  return n.kind === 'leaf' ? n.pane : firstPane(n.first);
}

/** Divisão que contém a folha `id` como filho direto (primeiro ou segundo); null quando não há. */
function parentOf(n: LayoutNode, id: PaneId): Split | null {
  if (n.kind === 'leaf') return null;
  if (isLeafOf(n.first, id) || isLeafOf(n.second, id)) return n;
  return parentOf(n.first, id) ?? parentOf(n.second, id);
}

/** Irmão da folha `id` (o outro filho do pai); null quando a folha não existe. */
function siblingOf(n: LayoutNode, id: PaneId): LayoutNode | null {
  const p = parentOf(n, id);
  if (!p) return null;
  return isLeafOf(p.first, id) ? p.second : p.first;
}

/** Árvore sem a folha `id`: o pai é substituído pelo irmão. Só chamar com a folha presente e mais de uma folha. */
function removeLeaf(n: LayoutNode, id: PaneId): LayoutNode {
  if (n.kind === 'leaf') return n;
  if (isLeafOf(n.first, id)) return n.second;
  if (isLeafOf(n.second, id)) return n.first;
  const first = removeLeaf(n.first, id);
  const second = removeLeaf(n.second, id);
  return first === n.first && second === n.second ? n : { ...n, first, second };
}

/** Troca a folha `id` pelo nó devolvido por `fn`. */
function replaceLeaf(n: LayoutNode, id: PaneId, fn: (p: Pane) => LayoutNode): LayoutNode {
  if (n.kind === 'leaf') return n.pane.id === id ? fn(n.pane) : n;
  const first = replaceLeaf(n.first, id, fn);
  const second = replaceLeaf(n.second, id, fn);
  return first === n.first && second === n.second ? n : { ...n, first, second };
}

/** Troca, por identidade, a divisão `from` pela `to`. */
function swapNode(n: LayoutNode, from: Split, to: Split): LayoutNode {
  if (n === from) return to;
  if (n.kind === 'leaf') return n;
  const first = swapNode(n.first, from, to);
  const second = swapNode(n.second, from, to);
  return first === n.first && second === n.second ? n : { ...n, first, second };
}

/** Aplica `fn` a todos os painéis da árvore (estrutura nova). */
function mapPanes(n: LayoutNode, fn: (p: Pane) => Pane): LayoutNode {
  if (n.kind === 'leaf') return { kind: 'leaf', pane: fn(n.pane) };
  return { ...n, first: mapPanes(n.first, fn), second: mapPanes(n.second, fn) };
}

function editPane(l: PaneLayout, id: PaneId, fn: (p: Pane) => Pane): PaneLayout {
  return { ...l, root: replaceLeaf(l.root, id, (p) => leafNode(fn(p))) };
}

function splitPane(l: PaneLayout, paneId: PaneId, direction: SplitDirection, view: PaneView, newId: PaneId): PaneLayout {
  if (leaves(l.root).length >= MAX_PANES || !findPane(l, paneId) || findPane(l, newId)) return l;
  const root = replaceLeaf(l.root, paneId, (p) =>
    halves(direction, leafNode(p), leafNode(newPane(newId, view))),
  );
  return { root, activeId: newId, maximizedId: null };
}

function closePane(l: PaneLayout, paneId: PaneId): PaneLayout {
  if (leaves(l.root).length < 2) return l;
  const sibling = siblingOf(l.root, paneId);
  if (!sibling) return l;
  const root = mapPanes(removeLeaf(l.root, paneId), (p) =>
    p.sync.lockCameraTo === paneId ? { ...p, sync: { ...p.sync, lockCameraTo: null } } : p,
  );
  return {
    root,
    activeId: l.activeId === paneId ? firstPane(sibling).id : l.activeId,
    maximizedId: l.maximizedId === paneId ? null : l.maximizedId,
  };
}

function resizePane(l: PaneLayout, paneId: PaneId, ratio: number): PaneLayout {
  if (!finite(ratio)) return l;
  const r = clamp(ratio, SPLIT_LIMITS.minRatio, SPLIT_LIMITS.maxRatio);
  const s = parentOf(l.root, paneId);
  // Só o primeiro filho direto controla a fração; o segundo não tem divisória própria aqui.
  if (!s || !isLeafOf(s.first, paneId) || s.ratio === r) return l;
  return { ...l, root: swapNode(l.root, s, { ...s, ratio: r }) };
}

/** Troca a fração da divisão no `path`. Caminho inválido, ratio não finito ou fração igual: o mesmo layout. */
function resizeAtPath(l: PaneLayout, path: SplitPath, ratio: number): PaneLayout {
  if (!finite(ratio)) return l;
  const r = clamp(ratio, SPLIT_LIMITS.minRatio, SPLIT_LIMITS.maxRatio);
  const go = (n: LayoutNode, i: number): LayoutNode => {
    if (n.kind === 'leaf') return n;
    if (i === path.length) return n.ratio === r ? n : { ...n, ratio: r };
    const side = path[i];
    if (side === 'first') {
      const first = go(n.first, i + 1);
      return first === n.first ? n : { ...n, first };
    }
    const second = go(n.second, i + 1);
    return second === n.second ? n : { ...n, second };
  };
  const root = go(l.root, 0);
  return root === l.root ? l : { ...l, root };
}

function setActivePane(l: PaneLayout, paneId: PaneId): PaneLayout {
  if (!findPane(l, paneId)) return l;
  const maximizedId = l.maximizedId !== null && l.maximizedId !== paneId ? paneId : l.maximizedId;
  if (l.activeId === paneId && maximizedId === l.maximizedId) return l;
  return { ...l, activeId: paneId, maximizedId };
}

function toggleMaximizePane(l: PaneLayout, paneId: PaneId): PaneLayout {
  if (!findPane(l, paneId) || leaves(l.root).length < 2) return l;
  if (l.maximizedId === paneId) return { ...l, maximizedId: null };
  return { ...l, maximizedId: paneId, activeId: paneId };
}

function setPaneView(l: PaneLayout, paneId: PaneId, view: PaneView): PaneLayout {
  const p = findPane(l, paneId);
  if (!p || sameView(p.view, view)) return l;
  return editPane(l, paneId, (q) => ({ ...q, view, camera2d: null, camera3d: null }));
}

function setPaneStyle(l: PaneLayout, paneId: PaneId, patch: PaneStyle): PaneLayout {
  const p = findPane(l, paneId);
  if (!p) return l;
  const next: PaneStyle = { ...p.style };
  let changed = false;
  for (const k of STYLE_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === undefined) {
      if (k in next) {
        delete next[k];
        changed = true;
      }
    } else if (next[k] !== v) {
      Object.assign(next, { [k]: v });
      changed = true;
    }
  }
  return changed ? editPane(l, paneId, (q) => ({ ...q, style: next })) : l;
}

/** Pares (vista, id) únicos e pareados por posição, até o menor entre `views` e `ids`. */
function pairsOf(views: readonly PaneView[], ids: readonly PaneId[]): [PaneView, PaneId][] {
  const out: [PaneView, PaneId][] = [];
  const seen = new Set<PaneId>();
  for (let i = 0; i < Math.min(views.length, ids.length); i++) {
    const view = views[i];
    const id = ids[i];
    if (view === undefined || id === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push([view, id]);
  }
  return out;
}

/** Preset efetivo para `k` painéis: o pedido se couber; senão o maior que couber (2 painéis: `twoRows` só se pedido). */
function shapeFor(preset: LayoutPresetId, k: number): LayoutPresetId {
  if (k >= 4) return 'grid';
  if (k === 3) return 'oneAndTwo';
  if (k === 2) return preset === 'twoRows' ? 'twoRows' : 'twoColumns';
  return 'single';
}

function presetTree(shape: LayoutPresetId, take: () => LayoutNode): LayoutNode {
  switch (shape) {
    case 'single':
      return take();
    case 'twoColumns': {
      const a = take();
      return halves('row', a, take());
    }
    case 'twoRows': {
      const a = take();
      return halves('column', a, take());
    }
    case 'oneAndTwo': {
      const a = take();
      const b = take();
      return halves('row', a, halves('column', b, take()));
    }
    case 'grid': {
      const top = halves('row', take(), take());
      const bottom = halves('row', take(), take());
      return halves('column', top, bottom);
    }
  }
}

function applyLayoutPreset(l: PaneLayout, preset: LayoutPresetId, views: readonly PaneView[], ids: readonly PaneId[]): PaneLayout {
  const used = pairsOf(views, ids).slice(0, PRESET_PANES[preset]);
  const first = used[0]?.[1];
  if (first === undefined) return l;
  const queue = used.map(([view, id]) => leafNode(newPane(id, view)));
  const take = (): LayoutNode => queue.shift() as LayoutNode;
  const root = presetTree(shapeFor(preset, used.length), take);
  const activeId = used.some(([, id]) => id === l.activeId) ? l.activeId : first;
  return { root, activeId, maximizedId: null };
}

export const layoutTreeOps: PaneLayoutOps = {
  split: splitPane,
  close: closePane,
  resize: resizePane,
  resizeAt: resizeAtPath,
  setActive: setActivePane,
  toggleMaximize: toggleMaximizePane,
  setView: setPaneView,
  setStyle: setPaneStyle,
  applyPreset: applyLayoutPreset,
};

/** Layout de um painel só, ativo e sem maximizado. */
export function singlePaneLayout(view: PaneView, id: PaneId): PaneLayout {
  return { root: leafNode(newPane(id, view)), activeId: id, maximizedId: null };
}

/** Próximo id `pN` (N≥1, o menor) que não existe no layout. */
export function nextPaneId(l: PaneLayout): PaneId {
  const used = new Set(leaves(l.root).map((p) => p.id));
  for (let n = 1; ; n++) {
    const id = `p${n}`;
    if (!used.has(id)) return id;
  }
}

// ---- validação do que vem do navegador ----

function parseView(raw: unknown): PaneView | null {
  if (!isObj(raw)) return null;
  const kind = raw.kind;
  if (kind === '3d') return { kind: '3d' };
  if (kind === 'plan') {
    const levelId = raw.levelId;
    if (typeof levelId !== 'string') return null;
    const out: Extract<PaneView, { kind: 'plan' }> = { kind: 'plan', levelId };
    const planKind = raw.planKind;
    if (planKind === 'floor' || planKind === 'roof' || planKind === 'area') out.planKind = planKind;
    const areaPlanId = raw.areaPlanId;
    if (typeof areaPlanId === 'string') out.areaPlanId = areaPlanId;
    return out;
  }
  const viewId = raw.viewId;
  if (kind === 'section' && typeof viewId === 'string') return { kind: 'section', viewId };
  const sheetId = raw.sheetId;
  if (kind === 'sheet' && typeof sheetId === 'string') return { kind: 'sheet', sheetId };
  return null;
}

function parseStyle(raw: unknown): PaneStyle {
  const o: Record<string, unknown> = isObj(raw) ? raw : {};
  const out: PaneStyle = {};
  const style = o.style;
  if (isVisualStyle(style)) out.style = style;
  const shadows = o.shadows;
  if (typeof shadows === 'boolean') out.shadows = shadows;
  const edges = o.edges;
  if (typeof edges === 'boolean') out.edges = edges;
  const background = o.background;
  if (typeof background === 'string' && HEX_COLOR.test(background)) out.background = background;
  const thinLines = o.thinLines;
  if (typeof thinLines === 'boolean') out.thinLines = thinLines;
  return out;
}

function parseSync(raw: unknown): PaneSync {
  const o: Record<string, unknown> = isObj(raw) ? raw : {};
  const followLevel = o.followLevel;
  const followSelection = o.followSelection;
  const lockCameraTo = o.lockCameraTo;
  return {
    followLevel: typeof followLevel === 'boolean' ? followLevel : DEFAULT_SYNC.followLevel,
    followSelection: typeof followSelection === 'boolean' ? followSelection : DEFAULT_SYNC.followSelection,
    lockCameraTo: typeof lockCameraTo === 'string' ? lockCameraTo : null,
  };
}

function parseCamera3d(raw: unknown): CameraDaPrevia | null {
  if (!isObj(raw)) return null;
  const { azimuth, elevation, distance, ortho, target } = raw;
  if (!finite(azimuth) || !finite(elevation) || !finite(distance) || typeof ortho !== 'boolean' || !isObj(target)) return null;
  const { x, y, z } = target;
  return finite(x) && finite(y) && finite(z) ? { azimuth, elevation, distance, ortho, target: { x, y, z } } : null;
}

function parseCamera2d(raw: unknown): PaneCamera2D | null {
  if (!isObj(raw)) return null;
  const { zoom, center } = raw;
  if (!finite(zoom) || zoom <= 0 || !isObj(center)) return null;
  const { x, y } = center;
  return finite(x) && finite(y) ? { zoom, center: { x, y } } : null;
}

/** Painel válido e id novo (até MAX_PANES). Registra o id em `ids`. */
function parsePane(raw: unknown, ids: Set<PaneId>): Pane | null {
  if (!isObj(raw)) return null;
  const id = raw.id;
  if (typeof id !== 'string' || id === '' || ids.has(id) || ids.size >= MAX_PANES) return null;
  const view = parseView(raw.view);
  if (!view) return null;
  ids.add(id);
  return {
    id,
    view,
    style: parseStyle(raw.style),
    sync: parseSync(raw.sync),
    camera3d: parseCamera3d(raw.camera3d),
    camera2d: parseCamera2d(raw.camera2d),
  };
}

function parseNode(raw: unknown, ids: Set<PaneId>): LayoutNode | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'leaf') {
    const pane = parsePane(raw.pane, ids);
    return pane ? leafNode(pane) : null;
  }
  if (raw.kind !== 'split') return null;
  const direction = raw.direction;
  const ratio = raw.ratio;
  if ((direction !== 'row' && direction !== 'column') || !finite(ratio)) return null;
  const first = parseNode(raw.first, ids);
  if (!first) return null;
  const second = parseNode(raw.second, ids);
  if (!second) return null;
  return { kind: 'split', direction, ratio: clamp(ratio, SPLIT_LIMITS.minRatio, SPLIT_LIMITS.maxRatio), first, second };
}

/**
 * Valida o JSON guardado no navegador. Qualquer coisa inválida (nó, direção, ratio não finito, vista de kind
 * desconhecido, ids repetidos, mais de MAX_PANES folhas) devolve o layout de um painel só (`fallback`). Campos soltos
 * voltam ao padrão: ativo inexistente vira a primeira folha, maximizado e lock inexistentes viram null, estilo inválido
 * é descartado, ratio é clampado.
 */
export function normalizeLayout(raw: unknown, fallback: Fallback): PaneLayout {
  const fb = singlePaneLayout(fallback.view, fallback.id);
  if (!isObj(raw)) return fb;
  const ids = new Set<PaneId>();
  const root = parseNode(raw.root, ids);
  if (!root) return fb;
  const keepLock = (p: Pane): boolean => {
    const target = p.sync.lockCameraTo;
    return target === null || (target !== p.id && ids.has(target));
  };
  const active = raw.activeId;
  const maximized = raw.maximizedId;
  return {
    root: mapPanes(root, (p) => (keepLock(p) ? p : { ...p, sync: { ...p.sync, lockCameraTo: null } })),
    activeId: typeof active === 'string' && ids.has(active) ? active : firstPane(root).id,
    maximizedId: typeof maximized === 'string' && ids.has(maximized) ? maximized : null,
  };
}

/** Lê o layout guardado; qualquer falha (JSON ruim, armazenamento que lança) devolve o layout de um painel. */
export function loadPanes(fallback: Fallback): PaneLayout {
  try {
    const raw = safeGet(PANES_KEY);
    return normalizeLayout(raw === null ? null : JSON.parse(raw), fallback);
  } catch {
    return normalizeLayout(null, fallback);
  }
}

/** Guarda o layout no navegador sem as câmeras (2D e 3D são da sessão: ao reabrir, cada painel enquadra de novo). */
export function savePanes(layout: PaneLayout): void {
  safeSet(PANES_KEY, JSON.stringify({ ...layout, root: mapPanes(layout.root, (p) => ({ ...p, camera2d: null, camera3d: null })) }));
}
