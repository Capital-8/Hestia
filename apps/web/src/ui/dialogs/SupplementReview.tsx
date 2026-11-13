import { useState, type ReactElement } from 'react';
import { useT, type Dict } from '../../editor/i18n.ts';
import { requiresOf, withDeps, withoutDependents } from '../../plugins/supDeps.ts';
import type { SupplementRow } from '../../plugins/supRuntime.ts';

/** Rótulo traduzido de uma permissão (`scene.read` -> chave `sup_cap_scene_read`); desconhecida mostra o próprio nome. */
export function useCapLabel(): (cap: string) => string {
  const { t } = useT();
  return (cap) => {
    const key = `sup_cap_${cap.replace(/\./g, '_')}` as keyof Dict;
    const label = t(key);
    return label === String(key) ? cap : label;
  };
}

interface Props {
  row: SupplementRow;
  /** Avisos de origem (pacote sem assinatura, pasta, atualização) já decididos pelo chamador. */
  warnings: Array<'unsigned' | 'folder' | 'replace'>;
  readme?: string;
  busy: boolean;
  error: string | null;
  onGrant: (grants: string[]) => void;
  onLater: () => void;
}

/**
 * Tela de revisão de permissões (spec 08 §7.2): o usuário vê o que o suplemento PEDE e marca o que CONCEDE. Nada vem
 * marcado de início, salvo o que já foi concedido numa versão anterior. Marcar uma permissão marca as que ela exige.
 */
export function SupplementReview({ row, warnings, readme, busy, error, onGrant, onLater }: Props): ReactElement {
  const { t } = useT();
  const capLabel = useCapLabel();
  const [sel, setSel] = useState<Set<string>>(() => new Set(row.grants.filter((g) => row.requested.includes(g))));
  const toggle = (cap: string): void => setSel((s) => (s.has(cap) ? withoutDependents(s, cap) : withDeps(s, cap, row.requested)));
  return (
    <section role="group" aria-label={t('sup_review_title')} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <h3 style={{ margin: '0 0 4px' }}>{t('sup_review_title')}</h3>
      <p>{t('sup_review_intro', { name: row.name, version: row.version })}</p>
      {warnings.map((w) => <p key={w} role="note" className="hint" style={{ color: '#b26a00' }}>{t(w === 'unsigned' ? 'sup_warn_unsigned' : w === 'folder' ? 'sup_warn_folder' : 'sup_warn_replace')}</p>)}
      {row.requested.length === 0 ? <p className="hint">{t('sup_review_none')}</p> : (
        <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
          {row.requested.map((cap) => {
            const deps = requiresOf(cap).filter((d) => row.requested.includes(d));
            return (
              <label key={cap} style={{ display: 'block', margin: '4px 0' }}>
                <input type="checkbox" checked={sel.has(cap)} onChange={() => toggle(cap)} disabled={busy} /> {capLabel(cap)}{' '}
                <span className="hint">({cap}{row.grants.includes(cap) ? ` · ${t('sup_review_granted')}` : ''}{deps.length ? ` · ${t('sup_review_requires', { dep: deps.join(', ') })}` : ''})</span>
              </label>
            );
          })}
        </fieldset>
      )}
      {readme ? (
        <details>
          <summary>{t('sup_review_readme')}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{readme}</pre>
        </details>
      ) : null}
      {error ? <div role="alert" style={{ color: '#c62828', margin: '6px 0' }}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn primary" disabled={busy} onClick={() => onGrant([...sel])}>{t('sup_review_grant')}</button>
        <button className="btn" disabled={busy} onClick={onLater}>{t('sup_review_later')}</button>
      </div>
    </section>
  );
}
