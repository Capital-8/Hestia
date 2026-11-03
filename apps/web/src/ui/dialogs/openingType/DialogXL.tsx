import { useEffect, type ReactElement, type ReactNode } from 'react';
import { useT } from '../../../editor/i18n.ts';
import { Icon } from '../../Icon.tsx';

/**
 * Diálogo largo (`.dialog.xl`) do "Propriedades do tipo" das aberturas. Mesmo comportamento do `Dialog` comum
 * (fecha com Esc, clique fora e botão), com a largura e a altura do padrão ArchiCAD de três colunas.
 */
export function DialogXL({
  title,
  sub,
  onClose,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}): ReactElement {
  const { t } = useT();
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dhead">
          <h2>{title}</h2>
          {sub ? <span className="sub">{sub}</span> : null}
          <span style={{ flex: 1 }} />
          <button className="ibtn" onClick={onClose} aria-label={t('stt_close')}><Icon name="close" size={16} /></button>
        </div>
        <div className="dbody">{children}</div>
        {footer ? <div className="dfoot">{footer}</div> : null}
      </div>
    </div>
  );
}
