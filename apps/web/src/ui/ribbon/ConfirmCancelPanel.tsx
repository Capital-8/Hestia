import type { ReactElement, ReactNode } from 'react';
import { t, type Lang } from '../../editor/i18n.ts';
import type { PastePreviewState } from '../../editor/pasteLevels/types.ts';

/** Ícone 32×32 no estilo da faixa: as cores vêm de `--revit-green` e `--danger`, como no modo de perímetro. */
function Ic({ size = 32, children }: { size?: number; children: ReactNode }): ReactElement {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {children}
    </svg>
  );
}

export interface ConfirmCancelPanelProps {
  /** Prévia aberta: níveis de destino e total de cópias que serão criadas. */
  preview: PastePreviewState;
  /** Nomes dos níveis de destino, na ordem do projeto. */
  levelNames: string[];
  /** V verde: grava as cópias num único passo de desfazer. */
  onConfirm: () => void;
  /** X vermelho: cancela tudo e volta à vista de origem, sem tocar no modelo. */
  onCancel: () => void;
  lang: Lang;
}

/**
 * Painéis da aba contextual "Modificar | Colar alinhado": Modo (V confirma, X cancela, no mesmo visual do modo de
 * perímetro) e a Prévia (só informação: níveis de destino e total de cópias, sem interação).
 */
export function ConfirmCancelPanel({ preview, levelNames, onConfirm, onCancel, lang }: ConfirmCancelPanelProps): ReactElement {
  const niveis = levelNames.length ? levelNames.join(', ') : '—';
  return (
    <>
      <div className="rb-panel" role="group" aria-label={t(lang, 'shr_mode')}>
        <div className="rb-cols">
          <button
            className="rb-btn rb-large"
            title={t(lang, 'shr_paste_levels_tip')}
            aria-label={t(lang, 'tool_paste')}
            onClick={onConfirm}
          >
            <Ic>
              <path d="M5 17L12.5 24.5L27 7" fill="none" style={{ stroke: 'var(--revit-green)' }} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Ic>
            <span className="rb-lbl">{t(lang, 'tool_paste')}</span>
          </button>
          <button
            className="rb-btn rb-large"
            title={t(lang, 'shr_cancel_tip')}
            aria-label={t(lang, 'shr_cancel')}
            onClick={onCancel}
          >
            <Ic>
              <path d="M7 7L25 25M25 7L7 25" fill="none" style={{ stroke: 'var(--danger)' }} strokeWidth={3.2} strokeLinecap="round" />
            </Ic>
            <span className="rb-lbl">{t(lang, 'shr_cancel')}</span>
          </button>
        </div>
        <div className="rb-title">{t(lang, 'shr_mode')}</div>
      </div>

      <div className="rb-panel" role="group" aria-label={t(lang, 'shr_preview')}>
        <div className="rb-cols">
          <div className="rb-stack" style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 8px', fontSize: '11px', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
            <span>{t(lang, 'shr_target_levels')}: {niveis}</span>
            <span>{t(lang, 'shr_total_copies')}: {preview.count}</span>
          </div>
        </div>
        <div className="rb-title">{t(lang, 'shr_preview')}</div>
      </div>
    </>
  );
}
