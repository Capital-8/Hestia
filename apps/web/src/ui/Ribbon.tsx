import { useEffect, useMemo, type ReactElement } from 'react';
import type { Opening, Project } from '@hestia/model';
import { openingHasHinge } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { useI18n } from '../editor/i18n.ts';
import { perimeterActions, usePerimeter } from '../editor/perimeter.ts';
import { useUi, setRibbonMin } from '../editor/state.ts';
import { Icon } from './Icon.tsx';
import { txt, type RibbonTab, type RibbonTabId } from './ribbon/model.ts';
import { PanelView } from './ribbon/parts.tsx';
import { FitRow, type FitItem } from './ribbon/FitRow.tsx';
import { contextTab, perimeterTab } from './ribbon/context.ts';
import { TABS } from './ribbon/tabs.ts';
import { useRibbonCtx } from './ribbon/useCtx.ts';
import { prioridadeDoPainel } from './ribbon/panelPriority.ts';
import { PerimeterRibbonPanels } from './perimeter/PerimeterRibbonPanels.tsx';
import './perimeter/perimeter.css';

/**
 * Painel extra da aba contextual de Portas/Janelas: inverte a dobradiça e o sentido da instância selecionada e liga as
 * etiquetas das esquadrias na planta. Usa os mesmos comandos da paleta de propriedades (`updateElements`/`setSettings`).
 * Botões só de ícone (o rótulo fica no tooltip e no aria-label), em coluna.
 */
function OpeningActions({ opening, p }: { opening: Opening; p: Project }): ReactElement {
  const type = p.openingTypes[opening.typeId];
  const hinge = !!type && openingHasHinge(type);
  const tags = p.settings.showOpeningTags === true;
  const set = (patch: Partial<Opening>): void => editor.store.exec({ type: 'updateElements', ids: [opening.id], patch });
  return (
    <div className="rb-panel" role="group" aria-label="Abertura">
      <div className="rb-cols">
        <div className="rb-stack">
          <button className="rb-btn rb-small rb-iconly" title="Inverter sentido (Tab)" aria-label="Inverter sentido" onClick={() => set({ flipFacing: !opening.flipFacing })}>
            <Icon name="rehost" size={16} />
          </button>
          <button className="rb-btn rb-small rb-iconly" title="Inverter dobradiça (Espaço)" aria-label="Inverter dobradiça" disabled={!hinge} onClick={() => set({ flipHand: !opening.flipHand })}>
            <Icon name="door" size={16} />
          </button>
          <button className={`rb-btn rb-small rb-iconly${tags ? ' on' : ''}`} title="Etiquetas de portas e janelas" aria-label="Etiquetas de portas e janelas" aria-pressed={tags} onClick={() => editor.store.exec({ type: 'setSettings', patch: { showOpeningTags: !tags } })}>
            <Icon name="tag" size={16} />
          </button>
        </div>
      </div>
      <div className="rb-title">Abertura</div>
    </div>
  );
}

/** Conteúdo do botão "mais" dos painéis: ícone de painéis e seta. */
const PANELS_MORE = (
  <>
    <Icon name="layers" size={14} />
    <span className="fit-arrow" aria-hidden="true">▾</span>
  </>
);

/**
 * Faixa de ferramentas no padrão Revit: aba Arquivo, 14 abas na ordem do Revit e, depois de Modificar, a aba contextual
 * verde. Todo o conteúdo vem dos dados de `ribbon/` (abas → painéis → itens); aqui só se escolhe a aba e se desenha.
 * O que não cabe na largura recolhe: abas excedentes vão para "»" e painéis para o botão suspenso (ver `FitRow`).
 * Com o modo de perímetro aberto, a aba contextual é a dele (Modo e Desenhar no lugar do slot `perimetro`).
 */
export function Ribbon(): ReactElement {
  const lang = useI18n((s) => s.lang);
  const ctx = useRibbonCtx();
  const ribbon = useUi((st) => st.ribbon);
  const ribbonBack = useUi((st) => st.ribbonBack);
  const ribbonMin = useUi((st) => st.ribbonMin);
  const perim = usePerimeter();
  const pTab = useMemo(() => (perim.active ? perimeterTab(perim.target, perim.editing) : null), [perim.active, perim.target, perim.editing]);
  const ctxTab = useMemo(() => (pTab ? null : contextTab(ctx.tool, ctx.selection, ctx.p)), [pTab, ctx.tool, ctx.selection, ctx.p]);
  const key = pTab?.key ?? ctxTab?.key ?? null;
  const ctxLabel = pTab?.label ?? ctxTab?.tab.label;

  // A aba contextual é selecionada sozinha quando nasce (ou quando o assunto muda) e, ao sumir, devolve a aba de antes.
  useEffect(() => {
    const s = useUi.getState();
    if (key && s.ribbon !== 'ctx') useUi.setState({ ribbonBack: s.ribbon, ribbon: 'ctx' });
    else if (!key && s.ribbon === 'ctx') useUi.setState({ ribbon: s.ribbonBack });
  }, [key]);

  const activeId: RibbonTabId = ribbon === 'ctx' && !key ? ribbonBack : ribbon;
  const active: RibbonTab | undefined = activeId === 'ctx' ? ctxTab?.tab : TABS.find((tb) => tb.id === activeId);
  // Escolher uma aba com a faixa recolhida abre o corpo (como no Revit): o toque na aba também revela os painéis.
  const select = (id: RibbonTabId): void => {
    useUi.setState({ ribbon: id });
    if (ribbonMin) setRibbonMin(false);
  };

  const panelItems = (): FitItem[] => {
    if (activeId !== 'ctx' || !pTab) {
      const items: FitItem[] = active?.panels.map((panel) => ({ key: panel.id, priority: prioridadeDoPainel(panel.id), node: <PanelView panel={panel} ctx={ctx} lang={lang} /> })) ?? [];
      // Com uma porta/janela selecionada, a aba contextual ganha os controles de inversão e o alternador de etiquetas.
      const only = activeId === 'ctx' && ctx.selection.length === 1 ? ctx.p.elements[ctx.selection[0]!] : undefined;
      if (only && (only.kind === 'door' || only.kind === 'window')) items.push({ key: 'abertura', priority: 2, node: <OpeningActions opening={only} p={ctx.p} /> });
      return items;
    }
    return pTab.slots.map((slot) => slot.kind === 'panel'
      ? { key: slot.panel.id, priority: prioridadeDoPainel(slot.panel.id), node: <PanelView panel={slot.panel} ctx={ctx} lang={lang} /> }
      : {
        key: 'perimetro',
        priority: 2,
        node: (
          <PerimeterRibbonPanels
            target={perim.target}
            result={perim.result}
            lineKind={perim.lineKind}
            shape={perim.shape}
            modify={perim.modify}
            onLineKind={perimeterActions.setLineKind}
            onShape={perimeterActions.setShape}
            onFinish={perimeterActions.finish}
            onCancel={perimeterActions.cancel}
          />
        ),
      });
  };

  const tabItems: FitItem[] = TABS.map((tb) => {
    const label = txt(tb.label, lang);
    return {
      key: tb.id,
      node: <button className={`rtab${activeId === tb.id ? ' on' : ''}`} onClick={() => select(tb.id)}>{label}</button>,
      menu: <button className={`fit-tab${activeId === tb.id ? ' on' : ''}`} onClick={() => select(tb.id)}>{label}</button>,
      active: activeId === tb.id,
      // Modificar e a aba aberta ficam na linha; as demais saem para o "»" na ordem de sempre (as últimas primeiro).
      priority: tb.id === 'modificar' || activeId === tb.id ? 5 : 0,
    };
  });

  return (
    <>
      <nav className="ribbon-tabs" aria-label={lang === 'pt' ? 'Abas da faixa de ferramentas' : 'Ribbon tabs'}>
        <button className="rtab file" onClick={() => useUi.setState({ fileMenu: true })} aria-haspopup="dialog">
          {lang === 'pt' ? 'Arquivo' : 'File'}
        </button>
        <FitRow
          className="rtabs-fit"
          ariaLabel={lang === 'pt' ? 'Abas' : 'Tabs'}
          items={tabItems}
          moreLabel={lang === 'pt' ? 'Mais abas' : 'More tabs'}
          moreContent="»"
          popClass="tabs"
        />
        {ctxLabel && (
          <button className={`rtab contextual${activeId === 'ctx' ? ' on' : ''}`} onClick={() => select('ctx')}>
            {txt(ctxLabel, lang)}
          </button>
        )}
        <button
          className={`rtab-min${ribbonMin ? ' min' : ''}`}
          onClick={() => setRibbonMin(!ribbonMin)}
          title={ribbonMin ? (lang === 'pt' ? 'Expandir a faixa' : 'Expand ribbon') : lang === 'pt' ? 'Recolher a faixa' : 'Minimize ribbon'}
          aria-label={ribbonMin ? (lang === 'pt' ? 'Expandir a faixa' : 'Expand ribbon') : lang === 'pt' ? 'Recolher a faixa' : 'Minimize ribbon'}
          aria-expanded={!ribbonMin}
        >
          {ribbonMin ? '▴' : '▾'}
        </button>
      </nav>
      {ribbonMin ? <div className="ribbon min" aria-hidden="true" /> : (
        <FitRow
          className={`ribbon${activeId === 'ctx' ? ' ctx' : ''}`}
          role="toolbar"
          ariaLabel={lang === 'pt' ? 'Ferramentas' : 'Tools'}
          items={panelItems()}
          moreLabel={lang === 'pt' ? 'Mais painéis' : 'More panels'}
          moreContent={PANELS_MORE}
          popClass="panels"
        />
      )}
    </>
  );
}
