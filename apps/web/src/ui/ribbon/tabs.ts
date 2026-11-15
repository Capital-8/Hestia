import type { RibbonTab, RibbonTabId } from './model.ts';
import { TAB_ESTRUTURA } from './tabEstrutura.ts';
import { TAB_ANOTAR, TAB_ARQUITETURA, TAB_GERENCIAR, TAB_INSERIR, TAB_MODIFICAR, TAB_VISTA } from './tabsMain.ts';
import { TABS_SOON } from './tabsSoon.ts';

/** Abas na ordem do Revit 2024 (Arquivo vem antes, fora desta lista; a contextual vem depois de Modificar). */
const BY_ID = new Map<RibbonTabId, RibbonTab>([TAB_ARQUITETURA, TAB_ESTRUTURA, TAB_INSERIR, TAB_ANOTAR, TAB_VISTA, TAB_GERENCIAR, TAB_MODIFICAR, ...TABS_SOON].map((tb) => [tb.id, tb]));

export const TAB_ORDER: RibbonTabId[] = [
  'arquitetura', 'estrutura', 'aco', 'premoldado', 'sistemas', 'inserir', 'anotar', 'analisar', 'massa', 'colaborar', 'vista', 'gerenciar', 'suplementos', 'modificar',
];

export const TABS: RibbonTab[] = TAB_ORDER.map((id) => {
  const tb = BY_ID.get(id);
  if (!tb) throw new Error(`aba da faixa sem definição: ${id}`);
  return tb;
});
