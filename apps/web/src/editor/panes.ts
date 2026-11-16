import type { Id, VisualStyle } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import type { OpenView } from './openViews.ts';
import type { CameraDaPrevia } from './pastePreview.ts';

/**
 * Contrato do sistema multitelas (onda 0). Só tipos e constantes: a lógica fica em `layoutTree.ts` (árvore de divisões),
 * `paneStyle.ts` (estilos visuais) e no estado por painel. Estado de SESSÃO e preferência da tela: nada disto vai para o
 * projeto, exceto os modelos de vista nomeados (futuro, fora desta onda).
 *
 * Modelo: o layout é uma árvore. Cada folha é um painel (`Pane`); cada nó interno divide o espaço em dois filhos.
 * Um único painel é o ativo (recebe ferramenta, teclado e Properties); os demais são visualizações vivas. A seleção de
 * elementos é do app, compartilhada por todos os painéis.
 */

/** Identificador de painel: estável durante a sessão, único no layout. */
export type PaneId = string;

/** Qual vista o painel mostra. Reaproveita `OpenView` (planta por nível, 3D, corte/elevação, prancha). */
export type PaneView = OpenView;

/**
 * Estilo visual do painel, independente dos outros. Todo campo é opcional: ausente = herda do projeto (o que a vista
 * já usa hoje). `style` vale para 3D e planta/corte (`PLAN_VISUAL_STYLES` limita planta e corte a 3 valores).
 */
export interface PaneStyle {
  style?: VisualStyle;
  /** Sombras do sol (só 3D). */
  shadows?: boolean;
  /** Arestas e silhuetas (só 3D). */
  edges?: boolean;
  /** Cor de fundo `#rrggbb`; ausente = pelo tema. */
  background?: string;
  /** Linhas finas na tela (só planta e corte). */
  thinLines?: boolean;
}

/** Câmera 2D do painel (planta, corte, elevação). Mesmo formato do `Viewport` de `@hestia/render`. */
export interface PaneCamera2D {
  /** Pixels por metro. */
  zoom: number;
  /** Centro da vista, em metros. */
  center: Vec2;
}

/** O que o painel segue do resto do app. Tudo ligado por padrão, exceto a câmera. */
export interface PaneSync {
  /** Acompanha o nível ativo do app (só planta). */
  followLevel: boolean;
  /** Mostra a seleção compartilhada destacada. Desligar deixa o painel sem destaque. */
  followSelection: boolean;
  /** Travar a câmera deste painel à de outro (planta e 3D alinhados); null = livre. */
  lockCameraTo: PaneId | null;
}

/** Folha do layout: um painel. */
export interface Pane {
  id: PaneId;
  view: PaneView;
  style: PaneStyle;
  sync: PaneSync;
  /** Câmera 3D guardada quando o painel é 3D e sai de cena (maximizar/trocar de vista); null = padrão. */
  camera3d: CameraDaPrevia | null;
  /** Câmera 2D guardada por painel; null = enquadrar na abertura. */
  camera2d: PaneCamera2D | null;
}

export type SplitDirection = 'row' | 'column';

/** Nó do layout: folha (painel) ou divisão em dois filhos. */
export type LayoutNode =
  | { kind: 'leaf'; pane: Pane }
  | {
      kind: 'split';
      /** 'row' = filhos lado a lado (divisória vertical); 'column' = um sobre o outro. */
      direction: SplitDirection;
      /** Fração do espaço que o primeiro filho ocupa, dentro de `SPLIT_LIMITS`. */
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

/** Layout completo mais o estado de foco. */
export interface PaneLayout {
  root: LayoutNode;
  /** Painel ativo: sempre existe e é uma folha da árvore. */
  activeId: PaneId;
  /** Painel maximizado (ocupa toda a área; os outros ficam ocultos, não destruídos); null = nenhum. */
  maximizedId: PaneId | null;
}

/** Limites da divisória e do número de painéis (memória de GPU: um contexto por painel). */
export const SPLIT_LIMITS = { minRatio: 0.15, maxRatio: 0.85 } as const;
export const MAX_PANES = 4;

export const DEFAULT_SYNC: PaneSync = { followLevel: true, followSelection: true, lockCameraTo: null };

/** Layouts prontos do menu de vistas. */
export type LayoutPresetId = 'single' | 'twoColumns' | 'twoRows' | 'oneAndTwo' | 'grid';

/** Chave do localStorage do layout (preferência da tela, como `hestia.dock`). */
export const PANES_KEY = 'hestia.panes';

/** Ações do layout (assinaturas que `layoutTree.ts` implementa como funções puras sobre `PaneLayout`). */
export interface PaneLayoutOps {
  /** Divide o painel; o novo painel recebe `view`. Recusa (devolve o mesmo layout) acima de `MAX_PANES`. */
  split(l: PaneLayout, paneId: PaneId, direction: SplitDirection, view: PaneView, newId: PaneId): PaneLayout;
  /** Fecha o painel e promove o irmão. Nunca fecha o último. Se era o ativo, o irmão vira ativo. */
  close(l: PaneLayout, paneId: PaneId): PaneLayout;
  /** Ajusta a fração da divisão que contém `paneId` como primeiro filho direto; respeita `SPLIT_LIMITS`. */
  resize(l: PaneLayout, paneId: PaneId, ratio: number): PaneLayout;
  setActive(l: PaneLayout, paneId: PaneId): PaneLayout;
  toggleMaximize(l: PaneLayout, paneId: PaneId): PaneLayout;
  setView(l: PaneLayout, paneId: PaneId, view: PaneView): PaneLayout;
  setStyle(l: PaneLayout, paneId: PaneId, patch: PaneStyle): PaneLayout;
  applyPreset(l: PaneLayout, preset: LayoutPresetId, views: readonly PaneView[], ids: readonly PaneId[]): PaneLayout;
}

/** Folhas em ordem de leitura (esquerda→direita, cima→baixo). */
export function leaves(n: LayoutNode): Pane[] {
  return n.kind === 'leaf' ? [n.pane] : [...leaves(n.first), ...leaves(n.second)];
}

export function findPane(l: PaneLayout, id: PaneId): Pane | null {
  return leaves(l.root).find((p) => p.id === id) ?? null;
}

/** Id de nível de uma vista de planta, quando houver (apoio a `followLevel`). */
export function levelOfView(v: PaneView): Id | null {
  return v.kind === 'plan' ? v.levelId : null;
}
