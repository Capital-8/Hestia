import { useEffect, useId, useState, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import type { PluginLog, PluginLogLevel } from '../../plugins/pluginLog.ts';
import { filterLog, formatLog } from '../../plugins/supManage.ts';

const COR: Record<PluginLogLevel, string> = { info: 'inherit', warn: '#b26a00', error: '#c62828' };

/** Copia para a área de transferência; `false` quando o ambiente não deixa (nunca lança). */
async function copiar(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Log de UM suplemento (anel de 500 entradas, spec 08 §7.6): filtra por nível e texto, copia e limpa. O log só aparece
 * aqui (decisão do dono) e nunca traz dados do modelo.
 */
export function SupplementLog({ log, pluginId }: { log: PluginLog; pluginId: string }): ReactElement {
  const { t } = useT();
  const uid = useId();
  const [level, setLevel] = useState<PluginLogLevel | 'all'>('all');
  const [text, setText] = useState('');
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => log.subscribe((id) => { if (id === pluginId) setTick((n) => n + 1); }), [log, pluginId]);
  const all = log.entries(pluginId);
  const shown = filterLog(all, { level, text });
  return (
    <div role="group" aria-label={t('sup_log_title')} style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor={`${uid}-lv`}>{t('supj_log_level')}</label>
        <select id={`${uid}-lv`} value={level} onChange={(e) => setLevel(e.target.value as PluginLogLevel | 'all')}>
          <option value="all">{t('supj_filter_all')}</option>
          <option value="info">{t('supj_log_info')}</option>
          <option value="warn">{t('supj_log_warn')}</option>
          <option value="error">{t('supj_log_error')}</option>
        </select>
        <label htmlFor={`${uid}-tx`}>{t('supj_log_filter')}</label>
        <input id={`${uid}-tx`} type="search" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={shown.length === 0} onClick={() => void copiar(formatLog(shown)).then((ok) => setMsg(t(ok ? 'supj_log_copied' : 'supj_log_copy_fail')))}>{t('supj_log_copy')}</button>
        <button className="btn" disabled={all.length === 0} onClick={() => { log.clear(pluginId); setMsg(null); }}>{t('supj_log_clear')}</button>
      </div>
      <div className="hint" role="status" aria-live="polite">{msg ?? t('supj_log_count', { n: shown.length, total: all.length })}</div>
      <div role="log" tabIndex={0} aria-label={t('sup_log_title')} style={{ fontFamily: 'monospace', fontSize: 12, maxHeight: 160, overflow: 'auto', marginTop: 4 }}>
        {shown.length === 0 ? t('sup_log_empty') : shown.map((e, i) => <div key={i} style={{ color: COR[e.level] }}>{new Date(e.at).toLocaleTimeString()} [{e.level}] {e.text}</div>)}
      </div>
      <p className="hint">{t('supj_log_note')}</p>
    </div>
  );
}
