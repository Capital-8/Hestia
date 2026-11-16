import { useId, useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { requiresOf, withDeps, withoutDependents } from '../../plugins/supDeps.ts';
import { useCapLabel } from './SupplementReview.tsx';

interface Props {
  /** Permissões que o suplemento PEDE (manifesto). */
  requested: readonly string[];
  /** Permissões concedidas agora. */
  granted: readonly string[];
  busy?: boolean;
  /** Grava o novo conjunto. Devolve o motivo da recusa, ou `null` quando deu certo. */
  onApply: (grants: string[]) => Promise<string | null>;
}

const igual = (a: ReadonlySet<string>, b: readonly string[]): boolean => a.size === b.length && b.every((x) => a.has(x));

/**
 * Concede ou revoga permissões depois da instalação (spec 08 §3 regra 3: mudar a concessão reinicia o suplemento).
 * Marcar uma permissão marca as que ela exige; desmarcar uma desmarca as que dependem dela. Serve ao suplemento de
 * pacote e ao de processo externo: quem chama decide como gravar.
 */
export function SupplementGrants({ requested, granted, busy = false, onApply }: Props): ReactElement {
  const { t } = useT();
  const capLabel = useCapLabel();
  const uid = useId();
  const [sel, setSel] = useState<Set<string>>(() => new Set(granted.filter((g) => requested.includes(g))));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = !igual(sel, granted.filter((g) => requested.includes(g)));
  const faltam = requested.filter((c) => !granted.includes(c));
  const toggle = (cap: string): void => {
    setMsg(null);
    setSel((s) => (s.has(cap) ? withoutDependents(s, cap) : withDeps(s, cap, requested)));
  };
  const aplicar = async (): Promise<void> => {
    const erro = await onApply([...sel]);
    setMsg(erro ? { ok: false, text: erro } : { ok: true, text: t('supj_perm_saved') });
  };
  return (
    <div role="group" aria-label={t('supj_perm_title')} style={{ marginTop: 8 }}>
      {requested.length === 0 ? <p className="hint">{t('supj_perm_none')}</p> : (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><b>{t('supj_perm_title')}</b> <span className="hint">{t('supj_perm_count', { n: granted.filter((g) => requested.includes(g)).length, total: requested.length })}</span></legend>
          {requested.map((cap) => {
            const deps = requiresOf(cap).filter((d) => requested.includes(d));
            const id = `${uid}-${cap}`;
            return (
              <div key={cap} style={{ margin: '4px 0' }}>
                <input id={id} type="checkbox" checked={sel.has(cap)} disabled={busy} onChange={() => toggle(cap)} aria-describedby={`${id}-d`} />{' '}
                <label htmlFor={id}>{capLabel(cap)}</label>{' '}
                <span id={`${id}-d`} className="hint">({cap}{deps.length ? ` · ${t('sup_review_requires', { dep: deps.join(', ') })}` : ''})</span>
              </div>
            );
          })}
        </fieldset>
      )}
      {faltam.length > 0 ? <p className="hint">{t('supj_perm_missing', { list: faltam.join(', ') })}</p> : null}
      <p className="hint">{t('supj_perm_note')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy || !dirty} onClick={() => void aplicar()}>{t('supj_perm_apply')}</button>
        <button className="btn" disabled={busy || !dirty} onClick={() => { setSel(new Set(granted.filter((g) => requested.includes(g)))); setMsg(null); }}>{t('supj_perm_discard')}</button>
      </div>
      {msg ? <div role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? undefined : '#c62828', marginTop: 4 }}>{msg.text}</div> : null}
    </div>
  );
}
