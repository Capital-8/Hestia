import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { ValidationIssue } from '@hestia/model';
import { goToIssue } from '../editor/goToIssue.ts';
import { useT } from '../editor/i18n.ts';
import { groupIssues, summarize, worstSeverity } from '../editor/issuesView.ts';
import { useIssues } from '../editor/useIssues.ts';

/** Botão de avisos da barra de status, com popover de lista agrupada por severidade. */
export function IssuesButton(): ReactElement {
  const { t } = useT();
  const issues = useIssues();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const popId = useId();

  const summary = summarize(issues);
  const groups = groupIssues(issues);
  const showPop = open && groups.length > 0;

  // Fecha com clique fora e com Esc. Esc é capturado antes do atalho global de cancelar ferramenta (listener da janela).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      const target = e.target;
      if (target instanceof Node && anchor.current && !anchor.current.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Ao abrir, o foco vai para o primeiro botão "Ir para" (ou para o próprio popover).
  useEffect(() => {
    if (!showPop) return;
    const first = pop.current?.querySelector<HTMLButtonElement>('button');
    (first ?? pop.current)?.focus();
  }, [showPop]);

  if (!summary) return <span className="issues-ok">{t('shc_issues_none')}</span>;

  const choose = (issue: ValidationIssue): void => {
    goToIssue(issue);
    setOpen(false);
    trigger.current?.focus();
  };

  const severity = worstSeverity(issues);
  return (
    <div className="issues-anchor" ref={anchor} aria-live="off">
      <button
        ref={trigger}
        type="button"
        className={`issues-btn${severity === 'error' ? ' err' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={showPop}
        aria-controls={showPop ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
        title={t('shc_issues_tip')}
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v4.5M12 17h.01" />
        </svg>
        <span>{summary}</span>
      </button>
      {showPop && (
        <div id={popId} ref={pop} role="dialog" aria-label={t('shc_issues_title')} className="issues-pop" tabIndex={-1}>
          {groups.map((g) => (
            <section key={g.severity} className={`issues-group ${g.severity}`}>
              <h3>{g.title} ({g.items.length})</h3>
              <ul>
                {g.items.map((issue, i) => (
                  <li key={`${issue.code}-${issue.elementId ?? ''}-${i}`} className="issues-item">
                    <span className="issues-msg">{issue.message}</span>
                    {issue.elementId && (
                      <button type="button" className="chiplink" onClick={() => choose(issue)} aria-label={t('shc_issues_goto_aria', { msg: issue.message })}>
                        {t('shc_issues_goto')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
