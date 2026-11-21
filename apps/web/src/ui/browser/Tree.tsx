import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon.tsx';

/**
 * Árvore do Navegador de projeto no padrão Revit: nós com caixa ⊞/⊟, ícone pequeno, nome (negrito = vista ativa ou tipo em uso)
 * e menu de botão direito. Duplo clique ou Enter abre/edita; um clique só seleciona.
 */

export interface MenuItem {
  label: string;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Linha divisória antes do item. */
  sep?: boolean;
  hint?: string;
  /** Submenu aberto ao clicar (ex.: disciplinas no menu do nível), expandido dentro do próprio menu. */
  submenu?: MenuItem[];
}

/** Estado da árvore que sobrevive quando o painel é remontado (ex.: movido para o outro lado): nós abertos e nó selecionado. */
const openState = new Map<string, boolean>();
let lastSelected: string | null = null;

interface Sel {
  id: string | null;
  set: (id: string) => void;
  menu: (e: MouseEvent, items: MenuItem[]) => void;
}
const TreeCtx = createContext<Sel>({ id: null, set: () => undefined, menu: () => undefined });

/** Um item do menu; com `submenu`, expande a lista dentro do próprio menu (ex.: as disciplinas do nível). */
function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }): ReactElement {
  const [sub, setSub] = useState(false);
  const submenu = item.submenu;
  if (submenu?.length) {
    return (
      <div>
        <button
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={sub}
          className={`rb-menuitem${item.danger ? ' danger' : ''}`}
          disabled={item.disabled}
          title={item.hint}
          onClick={(e) => {
            e.stopPropagation();
            setSub((v) => !v);
          }}
        >
          <span>{item.label}</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', paddingLeft: 18 }}>▸</span>
        </button>
        {sub && (
          // Expandido na própria lista (não como flyout): o menu do navegador tem rolagem própria e um menu flutuante
          // para fora dele seria recortado.
          <div role="menu" style={{ marginLeft: 12, paddingLeft: 4, borderLeft: '1px solid var(--line)' }}>
            {submenu.map((it, i) => (
              <MenuRow key={i} item={it} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <button role="menuitem" className={`rb-menuitem${item.danger ? ' danger' : ''}`} disabled={item.disabled} title={item.hint} onClick={() => { onClose(); item.run?.(); }}>
      <span>{item.label}</span>
    </button>
  );
}

/** Menu de contexto solto na tela, na posição do clique; fecha com Esc, clique fora ou ao escolher. */
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="rb-menu" role="menu" style={pos}>
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && <hr className="rb-sep" />}
          <MenuRow item={it} onClose={onClose} />
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Raiz da árvore: guarda o nó selecionado e o menu de contexto aberto. */
export function Tree({ children, label }: { children: ReactNode; label: string }): ReactElement {
  const [id, setIdState] = useState<string | null>(lastSelected);
  const setId = (v: string): void => {
    lastSelected = v;
    setIdState(v);
  };
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const ctx: Sel = {
    id,
    set: setId,
    menu: (e, items) => {
      e.preventDefault();
      e.stopPropagation();
      if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    },
  };
  return (
    <TreeCtx.Provider value={ctx}>
      <div className="btree" role="tree" aria-label={label}>{children}</div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </TreeCtx.Provider>
  );
}

export interface NodeProps {
  /** Chave única do nó (seleção). */
  id: string;
  label: ReactNode;
  icon?: string;
  /** Tem filhos (mostra a caixa ⊞/⊟), mesmo vazios. */
  group?: boolean;
  open?: boolean;
  bold?: boolean;
  title?: string;
  /** Texto de ajuda mostrado sob o nó aberto, quando não há filhos. */
  empty?: string;
  /** Duplo clique ou Enter. */
  onOpen?: () => void;
  /** Clique simples (além de selecionar o nó). */
  onSelect?: () => void;
  menu?: MenuItem[];
  /** Arrastar este nó (ex.: vista do navegador para a prancha). */
  drag?: DragData;
  children?: ReactNode;
  /** Conteúdo extra logo depois da linha (painéis inline do tipo). */
  after?: ReactNode;
}

/** Dados de um nó arrastável: MIME próprio, conteúdo JSON e os avisos de início/fim do arraste. */
export interface DragData {
  type: string;
  value: string;
  /** Texto do arraste (fantasma e `text/plain`). */
  label?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

/** Um nó da árvore. Grupos abrem e fecham pela caixa, pela seta do teclado ou por duplo clique. */
export function Node({ id, label, icon, group = false, open: initial = false, bold = false, title, empty, onOpen, onSelect, menu, drag, children, after }: NodeProps): ReactElement {
  const t = useContext(TreeCtx);
  const [open, setOpenState] = useState(() => openState.get(id) ?? initial);
  const [dragging, setDragging] = useState(false);
  const setOpen = (v: boolean): void => {
    openState.set(id, v);
    setOpenState(v);
  };
  const selected = t.id === id;
  const has = group || !!children;
  const toggle = (): void => setOpen(!open);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') { e.preventDefault(); if (onOpen) onOpen(); else if (has) toggle(); }
    else if (e.key === 'ArrowRight' && has && !open) { e.preventDefault(); setOpen(true); }
    else if (e.key === 'ArrowLeft' && has && open) { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      t.menu({ preventDefault: () => undefined, stopPropagation: () => undefined, clientX: r.left + 24, clientY: r.bottom } as unknown as MouseEvent, menu ?? []);
    }
  };
  return (
    <div role="none">
      <div
        role="treeitem"
        tabIndex={0}
        data-node={id}
        aria-selected={selected}
        aria-expanded={has ? open : undefined}
        className={`bnode${selected ? ' sel' : ''}${bold ? ' bold' : ''}${dragging ? ' dragging' : ''}`}
        title={title}
        draggable={drag ? true : undefined}
        onDragStart={(e) => {
          if (!drag) return;
          e.dataTransfer.setData(drag.type, drag.value);
          e.dataTransfer.setData('text/plain', drag.label ?? '');
          e.dataTransfer.effectAllowed = 'copy';
          drag.onStart?.();
          setDragging(true);
        }}
        onDragEnd={() => {
          drag?.onEnd?.();
          setDragging(false);
        }}
        onClick={() => { t.set(id); onSelect?.(); }}
        onDoubleClick={() => { if (onOpen) onOpen(); else if (has) toggle(); }}
        onContextMenu={(e) => { t.set(id); t.menu(e, menu ?? []); }}
        onKeyDown={onKey}
      >
        <span className={`bbox${has ? '' : ' none'}`} aria-hidden="true" onClick={(e) => { e.stopPropagation(); if (has) toggle(); }}>{has ? (open ? '−' : '+') : ''}</span>
        {icon ? <Icon name={icon} size={14} /> : null}
        <span className="blabel">{label}</span>
        {menu && menu.length > 0 ? (
          <button
            type="button"
            className="bnode-menu-btn"
            aria-label="Menu"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              t.set(id);
              t.menu(e, menu);
            }}
          >
            ⋯
          </button>
        ) : null}
      </div>
      {after}
      {has && open && (
        <div className="bkids" role="group">
          {children}
          {!children && empty ? <p className="btree-empty">{empty}</p> : null}
        </div>
      )}
    </div>
  );
}

/** Contexto para nós que precisam do menu a partir de um componente próprio (ex.: tipo com renomear inline). */
export function useTree(): Sel {
  return useContext(TreeCtx);
}
