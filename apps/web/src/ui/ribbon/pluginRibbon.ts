import { useMemo } from 'react';
import type { ContributionRegistry, PluginText } from '@hestia/plugin-api';
import { pluginRegistry, usePluginRegistryVersion } from '../../plugins/registry.ts';
import { act, panel, t, type RibbonPanel, type RibbonTab, type Txt } from './model.ts';

/**
 * Painéis que os suplementos acrescentam à aba Suplementos (spec 08 §4: o suplemento NUNCA escolhe a aba). Cada botão
 * vira um item `plugin`, que o desenhista da faixa liga ao comando pelo id qualificado.
 */
const toTxt = (x: PluginText): Txt => x;

export function pluginRibbonPanels(reg: ContributionRegistry = pluginRegistry): RibbonPanel[] {
  return reg.ribbonPanels().map((p) => ({
    id: `plug:${p.qid}`,
    title: toTxt(p.title),
    items: p.items.map((it) => ({ kind: 'plugin' as const, command: it.commandQid, label: toTxt(it.title), size: it.size, ...(it.icon ? { icon: it.icon } : {}) })),
  }));
}

/** A aba Suplementos fixa mais os painéis dos suplementos ativos (a aba fixa continua com "Ferramentas externas"). */
export function withPluginPanels(tab: RibbonTab, extra: RibbonPanel[]): RibbonTab {
  return extra.length ? { ...tab, panels: [...tab.panels, ...extra] } : tab;
}

/** Painel "Suplementos" com o botão do gerenciador (instalar, revisar permissões). Sempre presente na faixa. */
const PAINEL_GERENCIADOR: RibbonPanel = panel('sup-gerenciar', t('Suplementos', 'Add-Ins'), act('pluginManager'));

/**
 * Aba Suplementos como a faixa a desenha: fixos (`TABS`, que não mudam) + gerenciador + painéis dos suplementos ativos.
 * O gerenciador entra aqui, e não em `TABS`, para a aba fixa continuar só com "Ferramentas externas".
 */
export function suplementosTab(tab: RibbonTab, extra: RibbonPanel[]): RibbonTab {
  return { ...tab, panels: [...tab.panels, PAINEL_GERENCIADOR, ...extra] };
}

/** Hook da faixa: redesenha quando o registro muda. */
export function usePluginRibbonPanels(): RibbonPanel[] {
  const v = usePluginRegistryVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `v` é a "foto" do registro: muda a cada alteração.
  return useMemo(() => pluginRibbonPanels(), [v]);
}
