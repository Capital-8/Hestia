import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useI18n } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Icon } from './Icon.tsx';
import { searchCommands } from './ribbon/commandSearch.ts';
import { useRibbonCtx } from './ribbon/useCtx.ts';

/**
 * Centro de informações (canto direito da barra de título, como no Revit): pesquisa de comandos da faixa e menu de ajuda.
 * Digitar o nome de um comando mostra onde ele está; Enter ou clique executa.
 */
export function InfoCenter(): ReactElement {
  const lang = useI18n((s) => s.lang);
  const pt = lang === 'pt';
  const ctx = useRibbonCtx();
  const [q, setQ] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const found = useMemo(() => searchCommands(q, lang, ctx), [q, lang, ctx]);

  useEffect(() => {
    const down = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) {
        setHelpOpen(false);
        setQ('');
      }
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, []);

  const run = (i: number): void => {
    found[i]?.run();
    setQ('');
  };
  const help = (dialog: 'shortcutsConfig' | 'shortcuts'): void => {
    setHelpOpen(false);
    useUi.setState({ dialog, dialogArg: null });
  };

  return (
    <div ref={root} className="infocenter">
      <div className="ic-search" onClick={() => input.current?.focus()}>
        <input
          ref={input}
          className="ic-input"
          value={q}
          placeholder={pt ? 'Pesquisar comando' : 'Search commands'}
          aria-label={pt ? 'Pesquisar comando' : 'Search commands'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') run(0);
            if (e.key === 'Escape') setQ('');
          }}
        />
        <Icon name="search" size={15} />
        {q.trim() !== '' && (
          <div className="ic-results" role="listbox">
            {found.length === 0 ? (
              <div className="ic-none">{pt ? 'Nenhum comando encontrado.' : 'No commands found.'}</div>
            ) : (
              found.map((c, i) => (
                <button key={c.id} role="option" aria-selected={i === 0} className="ic-hit" onClick={() => run(i)}>
                  <span>{c.label}</span>
                  <em>{c.where}</em>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button className="qbtn" aria-haspopup="menu" aria-expanded={helpOpen} title={pt ? 'Ajuda' : 'Help'} aria-label={pt ? 'Ajuda' : 'Help'} onClick={() => setHelpOpen((v) => !v)}>
        <Icon name="qhelp" size={18} />
      </button>
      {helpOpen && (
        <div className="ic-help" role="menu">
          <button role="menuitem" className="rb-menuitem" onClick={() => help('shortcutsConfig')}>{pt ? 'Atalhos de teclado…' : 'Keyboard Shortcuts…'}</button>
          <button role="menuitem" className="rb-menuitem" onClick={() => help('shortcuts')}>{pt ? 'Lista de atalhos' : 'Shortcut List'}</button>
          <button role="menuitem" className="rb-menuitem" onClick={() => { setHelpOpen(false); useUi.setState({ tutorial: true }); }}>Tutorial</button>
        </div>
      )}
    </div>
  );
}
