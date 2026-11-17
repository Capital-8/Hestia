import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { Project } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useI18n, useT } from '../editor/i18n.ts';
import { activatePane, choosePaneView } from '../editor/paneActivation.ts';
import { activatePaneOnEnter } from '../editor/paneMouseActivation.ts';
import { listPaneViews } from '../editor/paneViews.ts';
import { reconcilePanes, usePanes } from '../editor/paneStore.ts';
import { viewKey } from '../editor/openViews.ts';
import { MAX_PANES, SPLIT_LIMITS, leaves, type LayoutNode, type Pane, type PaneLayout, type SplitPath } from '../editor/panes.ts';
import { tabOf } from '../editor/viewTabActions.ts';
import { SheetView } from './SheetView.tsx';
import { ViewportCanvas } from './ViewportCanvas.tsx';
import { fracaoDoPonteiro, passoDaTecla } from './paneGridMath.ts';
import './paneGrid.css';

/** Dados comuns a toda a grade (um objeto por renderização; o estado vem da store e do projeto). */
interface GridCtx {
  layout: PaneLayout;
  project: Project;
  /** Há mais de um painel: só então existem cabeçalhos e botões de painel. */
  multi: boolean;
}

const OCULTO: CSSProperties = { display: 'none' };
const SPLIT_MIN_PCT = Math.round(SPLIT_LIMITS.minRatio * 100);
const SPLIT_MAX_PCT = Math.round(SPLIT_LIMITS.maxRatio * 100);

/** O nó contém o painel `id` (em qualquer profundidade). */
const contem = (n: LayoutNode, id: string): boolean => leaves(n).some((p) => p.id === id);

/**
 * Grade de painéis: a árvore de `usePanes.layout` vira divisões lado a lado (`row`) ou empilhadas (`column`). Com um
 * painel só, a tela é a mesma de antes (sem cabeçalho). Com maximizado, os demais ficam montados e ocultos.
 */
export function PaneGrid(): ReactElement {
  const layout = usePanes((s) => s.layout);
  const project = useProject();
  // Ao abrir ou trocar de projeto, painel com vista que sumiu volta para a vista ativa do app.
  useEffect(() => {
    reconcilePanes(project);
  }, [project]);
  const ctx: GridCtx = { layout, project, multi: leaves(layout.root).length > 1 };
  return (
    <div className="pane-grid">
      <NodeView node={layout.root} ctx={ctx} oculto={false} path={[]} />
    </div>
  );
}

function NodeView({ node, ctx, oculto, path }: { node: LayoutNode; ctx: GridCtx; oculto: boolean; path: SplitPath }): ReactElement {
  return node.kind === 'leaf' ? <PaneFrame pane={node.pane} ctx={ctx} oculto={oculto} /> : <SplitView node={node} ctx={ctx} oculto={oculto} path={path} />;
}

/** Divisão: dois filhos e a divisória arrastável entre eles. O primeiro filho ocupa `ratio` do espaço livre. */
function SplitView({ node, ctx, oculto, path }: { node: Extract<LayoutNode, { kind: 'split' }>; ctx: GridCtx; oculto: boolean; path: SplitPath }): ReactElement {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const { direction, ratio, first, second } = node;
  const horizontal = direction === 'row';
  const maximizado = ctx.layout.maximizedId;
  const ocultaPrimeiro = maximizado !== null && !contem(first, maximizado);
  const ocultaSegundo = maximizado !== null && !contem(second, maximizado);
  // A divisória é endereçada pelo caminho da raiz até esta divisão: vale para qualquer nível da árvore (grade 2×2 inclusive).
  const ajusta = (r: number): void => usePanes.getState().resizeSplit(path, r);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    arrastando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!arrastando.current || !el) return;
    const r = el.getBoundingClientRect();
    const f = horizontal ? fracaoDoPonteiro(e.clientX, r.left, r.width) : fracaoDoPonteiro(e.clientY, r.top, r.height);
    if (f !== null) ajusta(f);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    arrastando.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const r = passoDaTecla(ratio, e.key);
    if (r === null) return;
    e.preventDefault();
    ajusta(r);
  };

  return (
    <div ref={ref} className={`pane-split ${direction}`} style={oculto ? OCULTO : undefined}>
      <div className="pane-slot" style={{ flex: `${ratio} 1 0`, ...(ocultaPrimeiro ? OCULTO : null) }}>
        <NodeView node={first} ctx={ctx} oculto={ocultaPrimeiro} path={[...path, 'first']} />
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label={t('pane_divider_aria')}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={SPLIT_MIN_PCT}
        aria-valuemax={SPLIT_MAX_PCT}
        className={`pane-split-bar ${direction}`}
        style={maximizado !== null ? OCULTO : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div className="pane-slot" style={{ flex: `${1 - ratio} 1 0`, ...(ocultaSegundo ? OCULTO : null) }}>
        <NodeView node={second} ctx={ctx} oculto={ocultaSegundo} path={[...path, 'second']} />
      </div>
    </div>
  );
}

/** Painel: cabeçalho (só com 2+ painéis) e a vista. A vista de prancha usa `SheetView`; as demais, o canvas do painel. */
function PaneFrame({ pane, ctx, oculto }: { pane: Pane; ctx: GridCtx; oculto: boolean }): ReactElement {
  const { t } = useT();
  const { layout, project, multi } = ctx;
  const ativo = layout.activeId === pane.id;
  const maximizado = layout.maximizedId === pane.id;
  const cheio = leaves(layout.root).length >= MAX_PANES;
  const nome = tabOf(project, pane.view)?.label ?? t('pane_view_missing');
  const lang = useI18n((s) => s.lang);
  const { splitPane, closePane, toggleMaximize } = usePanes.getState();

  // Todas as vistas do projeto, em grupos. Se a do painel não existe mais, ela aparece à parte como indisponível.
  const grupos = listPaneViews(project, lang);
  const existe = grupos.some((g) => g.options.some((o) => o.key === viewKey(pane.view)));

  return (
    <section
      role="group"
      aria-label={t('pane_aria', { name: nome })}
      className={`pane${multi && ativo ? ' is-active' : ''}`}
      style={oculto ? OCULTO : undefined}
      onPointerEnter={(e) => activatePaneOnEnter(pane.id, e.buttons)}
    >
      {multi && (
        <header className="pane-head" onPointerDown={() => activatePane(pane.id)}>
          <select
            className="select pane-view"
            aria-label={t('pane_view_select')}
            title={t('pane_view_select')}
            value={viewKey(pane.view)}
            onChange={(e) => {
              const v = grupos.flatMap((g) => g.options).find((o) => o.key === e.target.value)?.view;
              if (v) choosePaneView(pane.id, v);
            }}
          >
            {!existe && <option value={viewKey(pane.view)}>{t('pane_view_missing')}</option>}
            {grupos.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="pane-head-spacer" />
          <button
            type="button"
            className="ibtn"
            aria-label={t('pane_split_right')}
            title={cheio ? t('pane_split_limit', { max: MAX_PANES }) : t('pane_split_right')}
            disabled={cheio}
            onClick={() => splitPane(pane.id, 'row', pane.view)}
          >
            <IconeDividir aoLado />
          </button>
          <button
            type="button"
            className="ibtn"
            aria-label={t('pane_split_below')}
            title={cheio ? t('pane_split_limit', { max: MAX_PANES }) : t('pane_split_below')}
            disabled={cheio}
            onClick={() => splitPane(pane.id, 'column', pane.view)}
          >
            <IconeDividir aoLado={false} />
          </button>
          <button
            type="button"
            className="ibtn"
            aria-label={maximizado ? t('pane_restore') : t('pane_maximize')}
            title={maximizado ? t('pane_restore') : t('pane_maximize')}
            aria-pressed={maximizado}
            onClick={() => toggleMaximize(pane.id)}
          >
            <IconeMaximizar />
          </button>
          <button type="button" className="ibtn" aria-label={t('pane_close')} title={t('pane_close')} onClick={() => closePane(pane.id)}>
            ×
          </button>
        </header>
      )}
      <div className="pane-body">
        {pane.view.kind === 'sheet' ? (
          <SheetView sheetId={pane.view.sheetId} />
        ) : (
          <ViewportCanvas paneId={pane.id} onActivate={activatePane} visible={!oculto} />
        )}
      </div>
    </section>
  );
}

function IconeDividir({ aoLado }: { aoLado: boolean }): ReactElement {
  // Retângulo com uma linha de divisão: vertical = lado a lado; horizontal = uma sobre a outra.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {aoLado ? <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.2" /> : <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

function IconeMaximizar(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
