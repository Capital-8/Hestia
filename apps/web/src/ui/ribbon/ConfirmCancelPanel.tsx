import type { ReactElement, ReactNode } from 'react';
import type { Lang } from '../../editor/i18n.ts';
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
  const pt = lang === 'pt';
  const niveis = levelNames.length ? levelNames.join(', ') : '—';
  return (
    <>
      <div className="rb-panel" role="group" aria-label={pt ? 'Modo' : 'Mode'}>
        <div className="rb-cols">
          <button
            className="rb-btn rb-large"
            title={pt ? 'Colar nos níveis selecionados (um passo de desfazer)' : 'Paste to the selected levels (one undo step)'}
            aria-label={pt ? 'Colar' : 'Paste'}
            onClick={onConfirm}
          >
            <Ic>
              <path d="M5 17L12.5 24.5L27 7" fill="none" style={{ stroke: 'var(--revit-green)' }} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Ic>
            <span className="rb-lbl">{pt ? 'Colar' : 'Paste'}</span>
          </button>
          <button
            className="rb-btn rb-large"
            title={pt ? 'Cancelar (volta à vista, sem alterar o modelo)' : 'Cancel (return to the view without changing the model)'}
            aria-label={pt ? 'Cancelar' : 'Cancel'}
            onClick={onCancel}
          >
            <Ic>
              <path d="M7 7L25 25M25 7L7 25" fill="none" style={{ stroke: 'var(--danger)' }} strokeWidth={3.2} strokeLinecap="round" />
            </Ic>
            <span className="rb-lbl">{pt ? 'Cancelar' : 'Cancel'}</span>
          </button>
        </div>
        <div className="rb-title">{pt ? 'Modo' : 'Mode'}</div>
      </div>

      <div className="rb-panel" role="group" aria-label={pt ? 'Prévia' : 'Preview'}>
        <div className="rb-cols">
          <div className="rb-stack" style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 8px', fontSize: '11px', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
            <span>{pt ? 'Níveis de destino' : 'Target levels'}: {niveis}</span>
            <span>{pt ? 'Total de cópias' : 'Total copies'}: {preview.count}</span>
          </div>
        </div>
        <div className="rb-title">{pt ? 'Prévia' : 'Preview'}</div>
      </div>
    </>
  );
}
