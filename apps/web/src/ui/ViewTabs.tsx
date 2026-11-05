import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { activeViewOf, sameView, viewKey } from '../editor/openViews.ts';
import { activateView, closeTab, dropMissingViews, tabOf } from '../editor/viewTabActions.ts';
import { useT } from '../editor/i18n.ts';
import { useNarrow } from './useNarrow.ts';
import { Icon } from './Icon.tsx';

export function ViewTabs(): ReactElement {
  const p = useProject();
  const s = useUi();
  const { t } = useT();
  const active = activeViewOf(s);
  const narrow = useNarrow();

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  const [fitCount, setFitCount] = useState<number>(999);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Abas = vistas abertas (openViews), não os níveis do projeto. Fechar uma aba é o "×" de cada uma.
  const allTabs = s.openViews.flatMap((v) => {
    const t = tabOf(p, v);
    if (!t) return [];
    return [{
      key: viewKey(v),
      label: t.label,
      icon: t.icon,
      active: active !== null && sameView(active, v),
      onClick: () => activateView(v),
      onClose: () => closeTab(v),
    }];
  });

  // Abas que sumiram do projeto (ex.: nível excluído) saem da lista de vistas abertas.
  useEffect(() => dropMissingViews(p), [p]);

  // Fecha o menu suspenso ao clicar fora
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: PointerEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [dropdownOpen]);

  // Medição precisa do espaço disponível para abas (evita qualquer barra de rolagem)
  useEffect(() => {
    const updateFit = () => {
      const container = containerRef.current;
      const controls = controlsRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;

      const totalWidth = container.clientWidth;
      const controlsWidth = controls ? controls.offsetWidth : 60;
      const availableWithoutOverflow = totalWidth - controlsWidth - 20;
      const availableWithOverflow = availableWithoutOverflow - 75;

      const tabElements = Array.from(measure.children) as HTMLElement[];
      let used = 0;
      let allFit = true;
      const widths: number[] = [];

      for (let i = 0; i < tabElements.length; i++) {
        const el = tabElements[i];
        if (!el) continue;
        const w = el.offsetWidth + 2;
        widths.push(w);
        used += w;
        if (used > availableWithoutOverflow) {
          allFit = false;
        }
      }

      if (allFit) {
        setFitCount(allTabs.length);
        return;
      }

      let count = 0;
      let acc = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] ?? 0;
        if (acc + w <= availableWithOverflow) {
          acc += w;
          count++;
        } else {
          break;
        }
      }
      setFitCount(Math.max(1, count));
    };

    updateFit();

    const ro = new ResizeObserver(() => {
      updateFit();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [allTabs.length, p.levels, s.openViews]);

  const activeIndex = allTabs.findIndex((tab) => tab.active);
  let visibleTabs = allTabs;
  let overflowTabs: typeof allTabs = [];

  if (fitCount < allTabs.length) {
    const activeTab = activeIndex >= 0 ? allTabs[activeIndex] : undefined;
    if (activeIndex >= fitCount && activeTab) {
      // Garante que a aba ativa sempre permaneça visível no topo
      const head = allTabs.slice(0, Math.max(1, fitCount - 1));
      visibleTabs = [...head, activeTab];
      const visibleKeys = new Set(visibleTabs.map((t) => t.key));
      overflowTabs = allTabs.filter((t) => !visibleKeys.has(t.key));
    } else {
      visibleTabs = allTabs.slice(0, fitCount);
      overflowTabs = allTabs.slice(fitCount);
    }
  }

  return (
    <div className="viewtabs" role="tablist" aria-label={t('shc_viewtabs_aria')} ref={containerRef}>
      {/* Elemento oculto para medição de tamanho exato de cada aba */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -9999,
          top: -9999,
          visibility: 'hidden',
          pointerEvents: 'none',
          display: 'flex',
          gap: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {allTabs.map((tab) => (
          <div key={tab.key} style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
            <button className="vtab">
              <Icon name={tab.icon} size={14} /> <span className="vtab-label">{tab.label}</span>
            </button>
            <span style={{ width: 20 }} />
          </div>
        ))}
      </div>

      {visibleTabs.map((tab) => (
        <div key={tab.key} style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          <button
            role="tab"
            aria-selected={tab.active}
            className={`vtab${tab.active ? ' on' : ''}`}
            onClick={tab.onClick}
          >
            <Icon name={tab.icon} size={14} /> <span className="vtab-label">{tab.label}</span>
          </button>
          <button
            type="button"
            className="ibtn vtab-close"
            aria-label={t('shc_viewtabs_close', { name: tab.label })}
            title={t('shc_viewtabs_close', { name: tab.label })}
            onClick={tab.onClose}
          >
            ×
          </button>
        </div>
      ))}

      {overflowTabs.length > 0 && (
        <div className="vtab-overflow" ref={overflowRef}>
          <button
            className={`vtab-overflow-btn${overflowTabs.some((tab) => tab.active) ? ' has-active' : ''}`}
            onClick={() => setDropdownOpen((v) => !v)}
            title={t('shc_viewtabs_more')}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
          >
            <span>+{overflowTabs.length}</span>
            <Icon name="down" size={12} />
          </button>

          {dropdownOpen && (
            <div className="vtab-overflow-menu" role="menu">
              {overflowTabs.map((tab) => (
                <div key={tab.key} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    role="menuitem"
                    className={`vtab-overflow-item${tab.active ? ' on' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      tab.onClick();
                      setDropdownOpen(false);
                    }}
                  >
                    <Icon name={tab.icon} size={14} />
                    <span>{tab.label}</span>
                  </button>
                  <button
                    type="button"
                    className="ibtn vtab-close"
                    aria-label={t('shc_viewtabs_close', { name: tab.label })}
                    title={t('shc_viewtabs_close', { name: tab.label })}
                    onClick={tab.onClose}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <span style={{ flex: 1, minWidth: 4 }} />

      <div className="vtab-controls" ref={controlsRef}>
        <button className="ibtn" onClick={() => useUi.setState({ propsOpen: !s.propsOpen, ...(narrow && !s.propsOpen ? { browserOpen: false } : {}) })} title={t('shc_viewtabs_toggle_props')} aria-pressed={s.propsOpen}>
          <Icon name="edit" size={16} />
        </button>
        <button className="ibtn" onClick={() => useUi.setState({ browserOpen: !s.browserOpen, ...(narrow && !s.browserOpen ? { propsOpen: false } : {}) })} title={t('shc_viewtabs_toggle_browser')} aria-pressed={s.browserOpen}>
          <Icon name="levels" size={16} />
        </button>
      </div>
    </div>
  );
}
