import type { ReactElement } from 'react';
import { PLAN_VISUAL_STYLES, levelGraphicsOf, sectionGraphicsOf, view3dOf, type View3DSettings, type ViewGraphics } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { editLevelGraphics, editSectionGraphics, editView3D, showLevelsOn, type GraphicsEdit } from '../editor/graphicsActions.ts';
import { useI18n } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { resetTemporaryHidden, temporaryHideActive, temporaryHideSelection, toggleRevealHidden, visibilityOf } from '../editor/viewVisibility.ts';
import { DETAIL_LABEL, PLAN_SCALES, VISUAL_STYLE_LABEL } from './graphicsLabels.ts';
import { Icon } from './Icon.tsx';
import { FitRow, type FitItem } from './ribbon/FitRow.tsx';

/**
 * Barra de Controle de Vista (como no Revit): faixa fixa na base da vista, com escala, nível de detalhe, estilo visual,
 * sombras e os controles ainda não disponíveis (caminho do sol, região de corte, ocultar/isolar, revelar ocultos).
 * Cada controle grava na vista ativa (planta, corte ou 3D) com um passo de desfazer. Quando a área de desenho estreita,
 * o que não cabe recolhe pelo fim para o botão "»" (ver `FitRow`); escala e nível de detalhe são os últimos a sair.
 */

const SOON = ['Caminho do sol', 'Cortar vista', 'Mostrar região de corte', 'Propriedades temporárias da vista'] as const;
const SOON_EN = ['Sun Path', 'Crop View', 'Show Crop Region', 'Temporary View Properties'] as const;
const SOON_ICON = ['sun', 'crop', 'crop', 'soon'] as const;

export function ViewControlBar(): ReactElement | null {
  const p = useProject();
  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  const lang = useI18n((s) => s.lang);
  const selection = useUi((s) => s.selection);
  const viewTemp = useUi((s) => s.viewTemp);
  const pt = lang === 'pt';
  if (view === 'sheet' || view === 'animation') return null;

  const is3d = view === '3d';
  const g: ViewGraphics | View3DSettings = is3d ? view3dOf(p) : view === 'section' ? sectionGraphicsOf(p) : levelGraphicsOf(p, levelId);
  const report = (r: GraphicsEdit): void => {
    if (!r.ok) useUi.setState({ status: r.error ?? 'Não foi possível alterar a vista.' });
  };
  const editPlan = (patch: Partial<Pick<ViewGraphics, 'scale' | 'detail' | 'style'>>): void =>
    report(view === 'section' ? editSectionGraphics(editor.store, patch) : editLevelGraphics(editor.store, levelId, patch));
  const edit3d = (patch: Partial<Pick<View3DSettings, 'style' | 'shadows' | 'edges' | 'openOpenings' | 'showLevels'>>): void => report(editView3D(editor.store, patch));

  const scale = !is3d ? (g as ViewGraphics).scale : 0;
  const v3 = is3d ? (g as View3DSettings) : null;
  const sep = (): ReactElement => <span className="vcb-sep" />;
  const toggle = (label: string, icon: string, on: boolean, onClick: () => void, tip: string): ReactElement => (
    <button className={`vcb-btn${on ? ' on' : ''}`} aria-pressed={on} title={tip} onClick={onClick}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
  const iconToggle = (icon: string, on: boolean, onClick: () => void, tip: string): ReactElement => (
    <button className={`vcb-btn${on ? ' on' : ''}`} aria-pressed={on} aria-label={tip} title={tip} onClick={onClick}>
      <Icon name={icon} size={14} />
    </button>
  );

  // Campo com ícone e lista. Na barra só aparece o ícone; no popup, o rótulo ao lado da lista.
  const field = (icon: string, tip: string, label: string, control: ReactElement, inPop: boolean): ReactElement => (
    <label className="vcb-field" title={tip}>
      <Icon name={icon} size={14} />
      {inPop && <span>{label}</span>}
      {control}
    </label>
  );
  const scaleLabel = pt ? 'Escala' : 'Scale';
  const detailLabel = pt ? 'Nível de detalhe' : 'Detail level';
  const styleLabel = pt ? 'Estilo visual' : 'Visual style';
  const scaleCtl = (
    <select className="vcb-select" value={PLAN_SCALES.includes(scale) ? String(scale) : ''} aria-label={scaleLabel} onChange={(e) => e.target.value && editPlan({ scale: Number(e.target.value) })}>
      {!PLAN_SCALES.includes(scale) && <option value="">1 : {scale}</option>}
      {PLAN_SCALES.map((n) => <option key={n} value={n}>{`1 : ${n}`}</option>)}
    </select>
  );
  const detailCtl = (
    <select className="vcb-select" value={(g as ViewGraphics).detail} aria-label={detailLabel} onChange={(e) => editPlan({ detail: e.target.value as ViewGraphics['detail'] })}>
      {(Object.keys(DETAIL_LABEL) as Array<keyof typeof DETAIL_LABEL>).map((k) => <option key={k} value={k}>{DETAIL_LABEL[k]}</option>)}
    </select>
  );
  const styleCtl = (
    <select
      className="vcb-select"
      value={g.style}
      aria-label={styleLabel}
      onChange={(e) => (is3d ? edit3d({ style: e.target.value as View3DSettings['style'] }) : editPlan({ style: e.target.value as ViewGraphics['style'] }))}
    >
      {(is3d ? (Object.keys(VISUAL_STYLE_LABEL) as Array<keyof typeof VISUAL_STYLE_LABEL>) : PLAN_VISUAL_STYLES).map((k) => <option key={k} value={k}>{VISUAL_STYLE_LABEL[k]}</option>)}
    </select>
  );

  // Itens da barra, na ordem visual. `node` vai para a barra; `menu` (padrão: o próprio `node`) vai para o popup. Os
  // separadores entram no `node` do item que vem depois, para sair junto com ele.
  const items: FitItem[] = [];
  const grouped = (key: string, priority: number, el: ReactElement, lead: boolean): FitItem => ({
    key,
    priority,
    node: lead ? <>{sep()}{el}</> : el,
    menu: el,
  });
  const scaleTip = pt ? 'Escala da vista ativa' : 'Active view scale';
  const detailTip = pt ? 'Nível de detalhe' : 'Detail level';
  const styleTip = pt ? 'Estilo visual' : 'Visual style';
  if (!is3d) {
    items.push({ key: 'escala', priority: 3, node: field('scale', scaleTip, scaleLabel, scaleCtl, false), menu: field('scale', scaleTip, scaleLabel, scaleCtl, true) });
    items.push({ key: 'detalhe', priority: 3, node: field('detail', detailTip, detailLabel, detailCtl, false), menu: field('detail', detailTip, detailLabel, detailCtl, true) });
  }
  items.push({ key: 'estilo', priority: 2, node: field('style', styleTip, styleLabel, styleCtl, false), menu: field('style', styleTip, styleLabel, styleCtl, true) });
  if (v3) {
    items.push(grouped('sombras', 1, toggle(pt ? 'Sombras' : 'Shadows', 'sun', v3.shadows, () => edit3d({ shadows: !v3.shadows }), pt ? 'Liga ou desliga as sombras do sol' : 'Toggle sun shadows'), true));
    items.push(grouped('arestas', 1, toggle(pt ? 'Arestas' : 'Edges', 'cube', v3.edges, () => edit3d({ edges: !v3.edges }), pt ? 'Mostra as arestas dos elementos' : 'Show element edges'), false));
    items.push(grouped('vaos', 1, toggle(pt ? 'Abrir vãos' : 'Open openings', 'door', v3.openOpenings === true, () => edit3d({ openOpenings: !(v3.openOpenings === true) }), pt ? 'Mostra portas e janelas abertas' : 'Show doors and windows open'), false));
    // Níveis de referência (datum) no 3D: só ícone, como os demais alternadores da barra. Ausente no projeto = ligados.
    const levelsOn = showLevelsOn(v3);
    const levelsTip = pt ? 'Mostrar/ocultar níveis de referência' : 'Show/hide reference levels';
    items.push(grouped('niveis', 1, iconToggle('levels', levelsOn, () => edit3d({ showLevels: !levelsOn }), levelsTip), false));
  }
  // Visibilidade temporária e Reveal valem em todas as vistas (planta, área, corte e 3D).
  void viewTemp;
  const vis = visibilityOf(p, useUi.getState());
  const tempOn = temporaryHideActive();
  const tempTip = pt ? 'Ocultar/restaurar temporário (HH/HR)' : 'Temporary hide/reset (HH/HR)';
  const tempBtn = toggle(pt ? (tempOn ? 'Restaurar' : 'Ocultar') : tempOn ? 'Reset' : 'Hide', 'isolate', tempOn, () => {
    if (tempOn) resetTemporaryHidden();
    else if (selection.length > 0) temporaryHideSelection();
    else useUi.setState({ status: pt ? 'Selecione elementos para ocultar temporariamente.' : 'Select elements to hide temporarily.' });
  }, tempTip);
  items.push(grouped('temporario', 1, tempBtn, true));
  const revealTip = pt ? (vis.reveal ? 'Sair de Revelar elementos ocultos (RH)' : 'Revelar elementos ocultos (RH)') : vis.reveal ? 'Exit Reveal Hidden Elements (RH)' : 'Reveal Hidden Elements (RH)';
  items.push(grouped('revelar', 1, iconToggle('eye', vis.reveal, toggleRevealHidden, revealTip), false));
  SOON.forEach((label, i) => {
    const en = SOON_EN[i] ?? label;
    const icon = SOON_ICON[i] ?? 'soon';
    const tip = `${pt ? label : en}\n— ${pt ? 'ainda não disponível' : 'not available yet'}`;
    const btn = (
      <button className="vcb-btn soon" disabled title={tip} aria-label={pt ? label : en}>
        <Icon name={icon} size={14} />
      </button>
    );
    const menu = (
      <button className="vcb-btn soon" disabled title={tip}>
        <Icon name={icon} size={14} />
        <span>{pt ? label : en}</span>
      </button>
    );
    items.push({ key: `soon-${i}`, priority: 0, node: i === 0 ? <>{sep()}{btn}</> : btn, menu });
  });

  return (
    <FitRow
      className="vcb"
      role="toolbar"
      ariaLabel={pt ? 'Barra de controle da vista' : 'View control bar'}
      items={items}
      moreLabel={pt ? 'Mais controles da vista' : 'More view controls'}
      moreContent="»"
      popClass="vcb-pop"
    />
  );
}
