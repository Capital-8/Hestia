import type { ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { FamiliesTree } from './browser/Families.tsx';
import { CadTree } from './browser/Cad.tsx';
import { Node, Tree } from './browser/Tree.tsx';
import { SchedulesTree, SheetsTree, ViewsTree } from './browser/Views.tsx';
import { PanelHead } from './PanelHead.tsx';

/**
 * Navegador de projeto no padrão Revit: "Vistas (todas)", "Tabelas/Quantidades (todas)", "Pranchas (todas)", "Famílias",
 * "Grupos" e "Links". Duplo clique abre ou edita; botão direito traz as ações (renomear, duplicar, excluir…).
 * Materiais, níveis e pesos de linha saíram daqui: ficam nas abas Gerenciar e Arquitetura da faixa.
 */
export function Browser(): ReactElement {
  const p = useProject();
  const { t } = useT();
  return (
    <aside className="side" aria-label={t('project_browser_title')}>
      <PanelHead panel="browser" name={t('shc_browser_head', { name: p.name })} closeLabel={t('shc_browser_close')}>
        {t('shc_browser_head', { name: p.name })}
      </PanelHead>
      <div className="panel-scroll">
        <Tree label={t('project_browser_title')}>
          <ViewsTree />
          <SchedulesTree />
          <SheetsTree />
          <CadTree />
          <FamiliesTree />
          <Node id="g:groups" label={t('shc_browser_groups')} group empty={t('shc_browser_soon')} />
          <Node id="g:links" label={t('shc_browser_links')} group empty={t('shc_browser_soon')} />
        </Tree>
      </div>
    </aside>
  );
}
