import { toolLabel, type Lang } from '../../editor/i18n.ts';
import { editor } from '../../editor/controller.ts';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { txt, type RibbonItem } from './model.ts';
import { TABS } from './tabs.ts';
import { SUPLEMENTOS_TAB } from './tabsSoon.ts';
import { pluginRegistry, runPluginCommand } from '../../plugins/registry.ts';

/** Busca de comandos da faixa (campo de pesquisa do InfoCenter): acha ferramentas e ações que existem e as executa. */
export interface Command {
  id: string;
  label: string;
  /** Aba e painel onde o botão mora, para mostrar ao lado do resultado. */
  where: string;
  run: () => void;
}

function leaves(items: RibbonItem[]): RibbonItem[] {
  return items.flatMap((it) => (it.kind === 'stack' ? leaves(it.items) : it.kind === 'split' ? [it.main, ...leaves(it.menu)] : [it]));
}

export function allCommands(lang: Lang): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  for (const tab of TABS) {
    for (const panel of tab.panels) {
      for (const it of leaves(panel.items)) {
        if (it.kind === 'tool') {
          const id = `tool:${it.tool}`;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({ id, label: it.label ? txt(it.label, lang) : toolLabel(it.tool, lang), where: `${txt(tab.label, lang)} › ${txt(panel.title, lang)}`, run: () => editor.setTool(it.tool) });
        } else if (it.kind === 'action') {
          const id = `act:${it.action}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const def = ACTIONS[it.action];
          out.push({ id, label: txt(it.label ?? def.label, lang), where: `${txt(tab.label, lang)} › ${txt(panel.title, lang)}`, run: def.run });
        }
      }
    }
  }
  // SUPLEMENTOS: comandos contribuídos por manifestos (permissão `ui.commands` já conferida pelo registro).
  for (const pc of pluginRegistry.commands()) {
    const id = `plug:${pc.qid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: txt(pc.title, lang), where: `${txt(SUPLEMENTOS_TAB.label, lang)} › ${pc.pluginName}`, run: () => runPluginCommand(pc.qid) });
  }
  return out;
}

const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Até 8 comandos cujo nome contém o texto (sem acento, sem diferenciar maiúsculas); nomes que começam com ele vêm antes. */
export function searchCommands(q: string, lang: Lang, ctx: RibbonCtx): Command[] {
  const needle = norm(q.trim());
  if (!needle) return [];
  const hits = allCommands(lang).filter((c) => {
    if (!norm(c.label).includes(needle)) return false;
    const def = c.id.startsWith('act:') ? ACTIONS[c.id.slice(4) as keyof typeof ACTIONS] : undefined;
    return !def?.disabled?.(ctx);
  });
  hits.sort((a, b) => Number(!norm(a.label).startsWith(needle)) - Number(!norm(b.label).startsWith(needle)));
  return hits.slice(0, 8);
}
