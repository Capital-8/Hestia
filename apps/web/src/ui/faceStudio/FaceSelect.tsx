import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import type { Material } from '@hestia/model';
import { useI18n } from '../../editor/i18n.ts';
import './faceStudio.css';

export interface FaceSelectOption {
  value: string;
  label: string;
  swatch?: string;
}

export interface FaceSelectProps {
  id: string;
  value: string;
  options: readonly FaceSelectOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  className?: string;
  onChange: (value: string) => void;
}

interface MenuPos {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const MENU_MAX_H = 300;
const MENU_MIN_W = 210;
const VIEW_MARGIN = 6;
const MENU_GAP = 2;

function computeMenuPos(trigger: HTMLElement): MenuPos {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw - 2 * VIEW_MARGIN, Math.max(rect.width, MENU_MIN_W));
  const left = Math.max(VIEW_MARGIN, Math.min(rect.left, vw - width - VIEW_MARGIN));
  const spaceBelow = vh - rect.bottom - VIEW_MARGIN - MENU_GAP;
  const spaceAbove = rect.top - VIEW_MARGIN - MENU_GAP;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  if (openUp) {
    return {
      left,
      width,
      bottom: Math.max(VIEW_MARGIN, vh - rect.top + MENU_GAP),
      maxHeight: Math.min(MENU_MAX_H, Math.max(110, spaceAbove)),
    };
  }
  return {
    left,
    width,
    top: Math.max(VIEW_MARGIN, rect.bottom + MENU_GAP),
    maxHeight: Math.min(MENU_MAX_H, Math.max(110, spaceBelow)),
  };
}

/**
 * Seletor dropdown estável renderizado em portal (`document.body`) para as Propriedades do Estúdio da Face.
 * Substitui `<select>` nativo que pode fechar imediatamente com listas grandes no Chromium/Linux.
 */
export function FaceSelect({
  id,
  value,
  options,
  searchable,
  searchPlaceholder,
  noResultsLabel,
  className,
  onChange,
}: FaceSelectProps): ReactElement {
  const lang = useI18n((s) => s.lang);
  const pt = lang === 'pt';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState<MenuPos>({ left: 0, width: MENU_MIN_W, top: 0, maxHeight: MENU_MAX_H });

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchable, query]);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    if (triggerRef.current) setMenuPos(computeMenuPos(triggerRef.current));
    setQuery('');
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setMenuPos(computeMenuPos(triggerRef.current));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) {
      searchRef.current?.focus({ preventScroll: true });
    }
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && active) {
      const top = active.offsetTop - list.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const onResize = (): void => {
      if (triggerRef.current) setMenuPos(computeMenuPos(triggerRef.current));
    };
    const onScroll = (e: Event): void => {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (triggerRef.current) setMenuPos(computeMenuPos(triggerRef.current));
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  const menuStyle: CSSProperties = {
    left: menuPos.left,
    width: menuPos.width,
    maxHeight: menuPos.maxHeight,
    ...(menuPos.top !== undefined ? { top: menuPos.top } : { bottom: menuPos.bottom }),
  };

  const placeholder = searchPlaceholder ?? (pt ? 'Buscar…' : 'Search…');
  const emptyText = noResultsLabel ?? (pt ? 'Nenhum item encontrado.' : 'No items found.');

  return (
    <div className={className ? `fs-sel-wrap ${className}` : 'fs-sel-wrap'} ref={wrapRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="fs-sel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        {selected?.swatch !== undefined && (
          <span className="fs-swatch" style={{ background: selected.swatch }} />
        )}
        <span className="fs-sel-lbl">{selected?.label ?? value}</span>
        <span className="fs-sel-chev" aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="fs-sel-menu" style={menuStyle} onKeyDown={onMenuKeyDown}>
            {searchable && (
              <input
                ref={searchRef}
                className="fs-sel-search"
                type="text"
                aria-label={placeholder}
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <div ref={listRef} className="fs-sel-list" role="listbox">
              {filtered.length > 0 ? (
                filtered.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`fs-sel-opt${active ? ' on' : ''}`}
                      onClick={() => {
                        setOpen(false);
                        onChange(opt.value);
                        triggerRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      {opt.swatch !== undefined && (
                        <span className="fs-swatch" style={{ background: opt.swatch }} />
                      )}
                      <span className="fs-sel-lbl">{opt.label}</span>
                    </button>
                  );
                })
              ) : (
                <div className="fs-sel-empty">{emptyText}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Seletor de materiais com busca e amostra de cor integrada. */
export function MatSelect({
  id,
  value,
  materials,
  allowEmpty,
  emptyLabel,
  className,
  onChange,
}: {
  id: string;
  value: string;
  materials: Record<string, Material>;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  onChange: (matId: string) => void;
}): ReactElement {
  const lang = useI18n((s) => s.lang);
  const pt = lang === 'pt';

  const options = useMemo<FaceSelectOption[]>(() => {
    const list: FaceSelectOption[] = Object.values(materials).map((m) => ({
      value: m.id,
      label: m.name,
      swatch: m.color,
    }));
    if (allowEmpty) {
      list.unshift({ value: '', label: emptyLabel ?? '—' });
    }
    return list;
  }, [materials, allowEmpty, emptyLabel]);

  return (
    <FaceSelect
      id={id}
      value={value}
      options={options}
      searchable
      searchPlaceholder={pt ? 'Buscar material…' : 'Search material…'}
      noResultsLabel={pt ? 'Nenhum material encontrado.' : 'No materials found.'}
      className={className}
      onChange={onChange}
    />
  );
}
