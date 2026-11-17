import { useState, type ReactElement } from 'react';
import type { Capability, PluginHost, PluginView } from '@hestia/plugin-api';
import { useT, type Dict } from '../../editor/i18n.ts';
import { stateHelp, stateLabel } from '../../plugins/pluginLabels.ts';
import type { ManagerState } from '../../plugins/supManage.ts';
import { STATE_COLOR } from './SupplementCard.tsx';
import { SupplementGrants } from './SupplementGrants.tsx';
import { SupplementLog } from './SupplementLog.tsx';
import type { PluginLog } from '../../plugins/pluginLog.ts';

interface Props {
  p: PluginView;
  state: ManagerState;
  host: PluginHost;
  log: PluginLog;
}

/**
 * Cartão de um suplemento de PROCESSO EXTERNO ("Ferramentas externas") no gerenciador unificado: o mesmo estado,
 * versão, permissões e ações do cartão de pacote. A conexão continua sendo feita pelo `PluginHost`; o Hestia só se
 * conecta a programas que o usuário já abriu neste computador (endereço local).
 */
export function ExternalCard({ p, state, host, log }: Props): ReactElement {
  const { t, lang } = useT();
  const [panel, setPanel] = useState<'perms' | 'log' | null>(null);
  const name = p.manifest?.name ?? p.label;
  const requested: Capability[] = p.manifest ? p.manifest.capabilities : p.suggested;
  const live = p.state === 'connected';
  return (
    <section className="prow-card" aria-label={name} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{name}</strong>
        <span className="hint">{p.manifest ? `${p.manifest.version} · ` : ''}{t('sup_runtime_external')}</span>
        <span role="status" data-state={state} style={{ marginLeft: 'auto', color: STATE_COLOR[state], fontWeight: 600 }}>● {t(`sup_state_${state}` as keyof Dict)}</span>
      </div>
      {p.manifest?.description ? <div>{p.manifest.description}</div> : null}
      <div className="hint">{t('supj_ext_conn', { state: stateLabel(p.state, lang) })} · {t('supj_ext_local', { addr: `${p.endpoint.host}:${p.endpoint.port}` })}</div>
      <div className="hint">{stateHelp(p.state, lang, !!p.error)}</div>
      {p.error ? <div role="alert" style={{ color: '#c62828' }}>{t('supj_fail_reason', { detail: p.error.message })}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {p.enabled
          ? <button className="btn" onClick={() => host.disable(p.key)}>{t('sup_btn_disable')}</button>
          : <button className="btn primary" onClick={() => host.enable(p.key, p.grants.length ? p.grants : p.suggested)}>{t('sup_btn_enable')}</button>}
        {p.enabled && !live && p.state !== 'connecting' ? <button className="btn" onClick={() => void host.connect(p.key)}>{t(p.state === 'incompatible' ? 'supj_btn_reactivate' : 'supj_ext_connect')}</button> : null}
        {p.enabled && (live || p.state === 'connecting' || p.state === 'reconnecting') ? <button className="btn" onClick={() => host.disconnect(p.key)}>{t('supj_ext_disconnect')}</button> : null}
        <button className="btn" aria-expanded={panel === 'perms'} onClick={() => setPanel((c) => (c === 'perms' ? null : 'perms'))}>{t('supj_btn_perms')}</button>
        <button className="btn" aria-expanded={panel === 'log'} onClick={() => setPanel((c) => (c === 'log' ? null : 'log'))}>{t('sup_btn_log')}</button>
        {!p.builtin ? <button className="btn" onClick={() => host.remove(p.key)}>{t('supj_ext_remove')}</button> : null}
      </div>
      {panel === 'perms' ? <SupplementGrants requested={requested} granted={p.grants} onApply={async (g) => { host.setGrants(p.key, g as Capability[]); return null; }} /> : null}
      {panel === 'log' ? <SupplementLog log={log} pluginId={p.key} /> : null}
    </section>
  );
}
