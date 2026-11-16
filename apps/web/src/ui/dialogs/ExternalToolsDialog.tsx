import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { type Capability, type PluginView } from '@hestia/plugin-api';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { pluginHost } from '../../plugins/appPorts.ts';
import { gravarToken, lerToken, mensagemDeCausa, tokenNoCofreDoSistema } from '../../plugins/pluginTokens.ts';
import { capabilityLabel, stateHelp, stateLabel } from '../../plugins/pluginLabels.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

const COR: Record<string, string> = { connected: '#2e7d32', connecting: '#b26a00', reconnecting: '#b26a00', incompatible: '#c62828', absent: '#757575', disconnected: '#757575' };

/** Campo do token de pareamento: guarda, apaga e mostra se há token; o valor nunca volta para a tela. */
function TokenField({ p, lang }: { p: PluginView; lang: string }): ReactElement {
  const host = pluginHost();
  const tx = (a: string, b: string): string => (lang === 'pt' ? a : b);
  const [texto, setTexto] = useState('');
  const [ruim, setRuim] = useState(false);
  const [tem, setTem] = useState(() => lerToken(p.key) !== undefined);
  const salvar = (): void => {
    const ok = gravarToken(p.key, texto);
    setRuim(!ok);
    if (!ok) return;
    setTexto('');
    setTem(true);
    host.tokenChanged(p.key);
  };
  const apagar = (): void => { gravarToken(p.key, null); setTem(false); host.tokenChanged(p.key); };
  const semAuth = p.state === 'connected' && p.authenticated === false;
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }} data-testid="token-field">
      <legend><b>{tx('Token de pareamento', 'Pairing token')}</b></legend>
      <div role="status" className="hint">{tem ? tx('Token configurado.', 'Token set.') : tx('Nenhum token configurado.', 'No token set.')}{p.authenticated ? ` ${tx('Conexão autenticada.', 'Connection authenticated.')}` : ''}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="password" autoComplete="off" spellCheck={false} aria-label={tx('Token de pareamento', 'Pairing token')} placeholder={tx('Cole o token do programa externo', 'Paste the external program token')} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ minWidth: 260 }} />
        <button className="btn" onClick={salvar} disabled={!texto.trim()}>{tx('Salvar token', 'Save token')}</button>
        {tem ? <button className="btn" onClick={apagar}>{tx('Apagar token', 'Delete token')}</button> : null}
      </div>
      {ruim ? <div role="alert" style={{ color: '#c62828' }}>{tx('Token inválido: use de 32 a 256 caracteres, sem espaços.', 'Invalid token: use 32 to 256 characters, no spaces.')}</div> : null}
      <div className="hint">{tx('O programa externo mostra o token uma única vez, na primeira execução (e o guarda num arquivo só seu). O token nunca é enviado pela rede: só prova que você o conhece.', 'The external program shows the token once, on first run (and keeps it in a file only you can read). The token is never sent over the network: it only proves you know it.')}</div>
      {!tokenNoCofreDoSistema() ? <div className="hint">{tx('Atenção: neste app o token fica guardado no armazenamento do navegador, que é menos seguro que o cofre do sistema.', 'Note: in this app the token is kept in browser storage, which is less secure than the system vault.')}</div> : null}
      {semAuth ? <div role="alert" style={{ color: '#b26a00' }}>{tx('Conectado SEM pareamento (modo de desenvolvimento). Qualquer programa deste computador poderia ler a cena. Não use assim no dia a dia.', 'Connected WITHOUT pairing (development mode). Any program on this computer could read the scene. Do not use it this way day to day.')}</div> : null}
    </fieldset>
  );
}

function Card({ p, lang }: { p: PluginView; lang: string }): ReactElement {
  const host = pluginHost();
  const pt = lang === 'pt';
  const tx = (a: string, b: string): string => (pt ? a : b);
  // Antes de habilitar (ou se nada foi concedido ainda) a escolha começa pelo sugerido; depois, pelo que está concedido.
  const [draft, setDraft] = useState<Capability[]>(() => (p.enabled || p.grants.length ? p.grants : p.suggested));
  const shown: Capability[] = p.manifest ? p.manifest.capabilities : (p.suggested.length ? p.suggested : []);
  const dirty = draft.length !== p.grants.length || draft.some((c) => !p.grants.includes(c));
  const toggle = (c: Capability): void => setDraft((d) => (d.includes(c) ? d.filter((x) => x !== c) : [...d, c]));
  const live = p.state === 'connected';
  return (
    <section className="prow-card" aria-label={p.label} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{p.manifest?.name ?? p.label}</strong>
        {p.manifest ? <span className="hint">{tx('versão', 'version')} {p.manifest.version} · API {p.manifest.hestiaApi}</span> : null}
        <span role="status" data-state={p.state} style={{ marginLeft: 'auto', color: COR[p.state], fontWeight: 600 }}>● {stateLabel(p.state, lang)}</span>
      </div>
      <div className="hint">{stateHelp(p.state, lang, !!p.error)}</div>
      {p.error ? <div role="alert" style={{ color: '#c62828', margin: '4px 0' }}>{p.error.cause ? mensagemDeCausa(p.error.cause, lang) : p.error.message}</div> : null}
      <TokenField p={p} lang={lang} />
      <div className="hint">{tx('Endereço local', 'Local address')}: {p.endpoint.host}:{p.endpoint.port}</div>

      {shown.length > 0 ? (
        <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
          <legend><b>{tx('Permissões', 'Permissions')}</b></legend>
          {shown.map((c) => (
            <label key={c} style={{ display: 'block' }}>
              <input type="checkbox" checked={draft.includes(c)} onChange={() => toggle(c)} /> {capabilityLabel(c, lang)}
            </label>
          ))}
          {p.enabled && dirty ? <button className="btn" onClick={() => host.setGrants(p.key, draft)}>{tx('Aplicar permissões', 'Apply permissions')}</button> : null}
          {live && p.pending.length > 0 ? <div className="hint">{tx('O plugin pediu e ainda não tem:', 'Requested but not granted:')} {p.pending.map((c) => capabilityLabel(c, lang)).join('; ')}</div> : null}
        </fieldset>
      ) : null}

      {live ? (
        <div role="group" aria-label={tx('Câmera', 'Camera')} style={{ margin: '8px 0' }}>
          <b>{tx('Câmera', 'Camera')}: </b>
          <label><input type="radio" name={`cam-${p.key}`} checked={p.cameraMode === 'follow-hestia'} onChange={() => host.setCameraMode(p.key, 'follow-hestia')} /> {tx('Seguir o Hestia', 'Follow Hestia')}</label>{' '}
          <label><input type="radio" name={`cam-${p.key}`} disabled={!p.granted.includes('camera.write')} checked={p.cameraMode === 'plugin-drives'} onChange={() => host.setCameraMode(p.key, 'plugin-drives')} /> {tx('O renderizador dirige', 'Renderer drives')}</label>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {p.enabled
          ? <button className="btn" onClick={() => host.disable(p.key)}>{tx('Desabilitar', 'Disable')}</button>
          : <button className="btn primary" onClick={() => host.enable(p.key, draft)}>{tx('Habilitar', 'Enable')}</button>}
        {p.enabled && !live && p.state !== 'connecting' ? <button className="btn" onClick={() => void host.connect(p.key)}>{p.state === 'incompatible' || p.manifest ? tx('Reconectar', 'Reconnect') : tx('Conectar', 'Connect')}</button> : null}
        {p.enabled && (live || p.state === 'connecting' || p.state === 'reconnecting') ? <button className="btn" onClick={() => host.disconnect(p.key)}>{tx('Desconectar', 'Disconnect')}</button> : null}
        {!p.builtin ? <button className="btn" onClick={() => host.remove(p.key)}>{tx('Remover da lista', 'Remove from list')}</button> : null}
      </div>
    </section>
  );
}

/**
 * Suplementos › Ferramentas externas: lista os plugins de integração, mostra versão e estado e permite habilitar,
 * conectar, desconectar e conceder permissões. Não instala, baixa nem inicia programas (docs/plugins/04-runtime-web.md).
 */
export function ExternalToolsDialog(): ReactElement {
  const { lang } = useT();
  const host = pluginHost();
  const list = useSyncExternalStore((cb) => host.subscribe(cb), () => host.list());
  const [label, setLabel] = useState('');
  const [port, setPort] = useState('');
  const [bad, setBad] = useState(false);
  const pt = lang === 'pt';
  const tx = (a: string, b: string): string => (pt ? a : b);
  const add = (): void => {
    const key = host.add(label, { host: '127.0.0.1', port: Number(port) });
    setBad(key === null);
    if (key) { setLabel(''); setPort(''); }
  };
  return (
    <Dialog title={tx('Ferramentas externas', 'External Tools')} sub={tx('Plugins de integração', 'Integration plugins')} size="wide" onClose={fechar}
      footer={<button className="btn primary" onClick={fechar}>{tx('Fechar', 'Close')}</button>}>
      <p className="hint">
        {tx(
          'O Hestia só se conecta a programas que VOCÊ já abriu neste computador (endereço local). Ele não instala, baixa nem inicia programas. Cada plugin só recebe as permissões que você marcar.',
          'Hestia only connects to programs YOU already started on this computer (local address). It never installs, downloads or launches programs. Each plugin only gets the permissions you tick.',
        )}
      </p>
      {list.map((p) => <Card key={p.key} p={p} lang={lang} />)}
      <details style={{ marginTop: 12 }}>
        <summary>{tx('Adicionar plugin por porta local', 'Add a plugin by local port')}</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <input aria-label={tx('Nome', 'Name')} placeholder={tx('Nome', 'Name')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <span>127.0.0.1:</span>
          <input aria-label={tx('Porta', 'Port')} placeholder="47801" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 90 }} />
          <button className="btn" onClick={add} disabled={!label.trim() || !port}>{tx('Adicionar', 'Add')}</button>
        </div>
        {bad ? <div role="alert" style={{ color: '#c62828' }}>{tx('Use uma porta entre 1024 e 65535. Só endereços locais são aceitos.', 'Use a port between 1024 and 65535. Only local addresses are accepted.')}</div> : null}
      </details>
    </Dialog>
  );
}
