import type { ToolId, ToolOptions } from '@hestia/tools';

/**
 * Modelo da faixa de ferramentas (padrão Revit): abas → painéis → itens. A faixa inteira vem destes dados; os
 * componentes só desenham. Ferramenta nova = uma linha numa lista, no painel certo (regra em docs/decisoes/0032).
 */

/** Texto nos dois idiomas. Uma string só vale para os dois (nomes próprios, siglas). */
export type Txt = string | { pt: string; en: string };

export type Size = 'large' | 'small';

export type RibbonTabId =
  | 'arquitetura' | 'estrutura' | 'aco' | 'premoldado' | 'sistemas' | 'inserir' | 'anotar' | 'analisar'
  | 'massa' | 'colaborar' | 'vista' | 'gerenciar' | 'suplementos' | 'modificar' | 'ctx';

/** Ações pontuais da faixa (não são ferramenta). A implementação está em `actions.ts`. */
export type ActionId =
  | 'cotasAuto' | 'dimensionFamilies' | 'typeProps' | 'properties' | 'browser' | 'sameType' | 'sameName' | 'moveLevel' | 'delete'
  | 'zoomFit' | 'thinLines' | 'grid' | 'underlay' | 'roofProjection' | 'graphicsVisibility' | 'view3d' | 'genElevations' | 'newSheet'
  | 'materials' | 'levels' | 'levelTool' | 'lineWeights' | 'units' | 'shortcutsConfig' | 'shortcuts' | 'importCad' | 'manageCad'
  | 'schedWalls' | 'schedFloors' | 'schedSlabs' | 'schedCeilings' | 'schedRoofs' | 'schedStairs' | 'schedRooms' | 'schedOpenings'
  | 'stairSketch' | 'stairTypes' | 'rampTypes' | 'schedRamps' | 'propsSide' | 'browserSide' | 'resetDock' | 'tagAll' | 'wallTags' | 'editPerimeter'
  | 'copySelection' | 'cutSelection' | 'pasteAligned' | 'pasteAlignedLevels' | 'syncLinked' | 'unlinkLinked' | 'createSimilar'
  | 'addViewSheet' | 'publishSheets' | 'sheetsPerLevel';

export type RibbonItem =
  /** Ferramenta do editor: o clique chama `editor.setTool`; mostra o atalho no tooltip. */
  | { kind: 'tool'; tool: ToolId; size: Size; label?: Txt; icon?: string }
  /** Ação pontual (diálogo, alternador, comando). */
  | { kind: 'action'; action: ActionId; size: Size; label?: Txt }
  /** Alternador de opção da ferramenta (modo de desenho): aparece pressionado quando `test` vale. */
  | { kind: 'option'; label: Txt; icon: string; size: Size; test: (o: ToolOptions) => boolean; patch: Partial<ToolOptions>; restart?: ToolId }
  /** Ainda não existe: aparece esmaecido, com tooltip. É o roteiro da interface. */
  | { kind: 'soon'; label: Txt; icon?: string; size: Size }
  /** Botão dividido: clicar no ícone roda `main`; o rótulo com ▾ abre `menu`. */
  | { kind: 'split'; main: RibbonItem; menu: RibbonItem[]; size: Size; label?: Txt }
  /** Pilha de até 3 botões pequenos, da altura de um botão grande. */
  | { kind: 'stack'; items: RibbonItem[] };

export interface RibbonPanel {
  id: string;
  title: Txt;
  items: RibbonItem[];
}

export interface RibbonTab {
  id: RibbonTabId;
  label: Txt;
  panels: RibbonPanel[];
}

export const t = (pt: string, en: string): Txt => ({ pt, en });

/** Construtores: mantêm as listas de abas curtas e legíveis. */
export const tool = (id: ToolId, size: Size = 'large', o: { label?: Txt; icon?: string } = {}): RibbonItem => ({ kind: 'tool', tool: id, size, ...o });
export const act = (action: ActionId, size: Size = 'large', label?: Txt): RibbonItem => ({ kind: 'action', action, size, ...(label ? { label } : {}) });
export const soon = (label: Txt, icon?: string, size: Size = 'large'): RibbonItem => ({ kind: 'soon', label, size, ...(icon ? { icon } : {}) });
export const soonS = (label: Txt, icon?: string): RibbonItem => soon(label, icon, 'small');
export const split = (main: RibbonItem, menu: RibbonItem[], label?: Txt): RibbonItem => ({ kind: 'split', main, menu, size: main.kind === 'stack' ? 'large' : main.size, ...(label ? { label } : {}) });
export const stack = (...items: RibbonItem[]): RibbonItem => ({ kind: 'stack', items });
export const option = (label: Txt, icon: string, test: (o: ToolOptions) => boolean, patch: Partial<ToolOptions>, restart?: ToolId): RibbonItem => ({ kind: 'option', label, icon, size: 'small', test, patch, ...(restart ? { restart } : {}) });
export const panel = (id: string, title: Txt, ...items: RibbonItem[]): RibbonPanel => ({ id, title, items });

export const txt = (x: Txt, lang: 'pt' | 'en'): string => (typeof x === 'string' ? x : x[lang]);
