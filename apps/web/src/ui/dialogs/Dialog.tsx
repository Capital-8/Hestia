import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { useT } from '../../editor/i18n.ts';
import { Icon } from '../Icon.tsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elementos focáveis visíveis dentro do diálogo, na ordem do documento. */
function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

interface DialogProps {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: '' | 'narrow' | 'mid' | 'wide';
  z?: number;
  /** Ctrl+Enter dentro do diálogo (tratado em captura; os campos numéricos param a propagação). */
  onSubmit?: () => void;
  /**
   * Trap de foco e devolução ao elemento que abriu. `true` por padrão nos diálogos largos ou com `onSubmit`; os demais
   * seguem sem mudança de comportamento.
   */
  trapFocus?: boolean;
}

export function Dialog({ title, sub, onClose, children, footer, size = '', z, onSubmit, trapFocus }: DialogProps): ReactElement {
  const { t } = useT();
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const submitRef = useRef(onSubmit);
  closeRef.current = onClose;
  submitRef.current = onSubmit;
  const manage = trapFocus ?? (size === 'wide' || onSubmit !== undefined);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = root.current;
    if (manage && box) {
      // No toque, focar o primeiro botão (o ✕) desenha um anel de foco sem utilidade; o próprio diálogo recebe o foco.
      const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
      const target = box.querySelector<HTMLElement>('[data-autofocus]') ?? (coarse ? box : focusable(box)[0]);
      target?.focus();
    }
    const h = (e: KeyboardEvent): void => {
      const target = e.target;
      const inSelect = target instanceof HTMLSelectElement;
      if (e.key === 'Escape') {
        if (inSelect) return;
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (!manage) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const submit = submitRef.current;
        if (!submit || inSelect) return;
        e.preventDefault();
        e.stopPropagation();
        submit();
        return;
      }
      if (e.key === 'Tab' && box) {
        const items = focusable(box);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (!box.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', h, true);
    return () => {
      window.removeEventListener('keydown', h, true);
      if (manage && opener && document.contains(opener)) opener.focus();
    };
  }, [manage]);
  return (
    <div className="overlay" style={z ? { zIndex: z } : undefined} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} className={`dialog ${size}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="dhead">
          <h2>{title}</h2>
          {sub ? <span className="sub">{sub}</span> : null}
          <span style={{ flex: 1 }} />
          <button className="ibtn" onClick={onClose} aria-label={t('dlm_btn_close')}><Icon name="close" size={16} /></button>
        </div>
        <div className="dbody">{children}</div>
        {footer ? <div className="dfoot">{footer}</div> : null}
      </div>
    </div>
  );
}
