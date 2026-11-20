/** Resposta do comando Tauri `collab_iniciar_servidor`. */
export interface DesktopCollabServerInfo {
  port: number;
  lanIp: string;
  wsUrl: string;
  localWsUrl: string;
}

type Invoke = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

interface JanelaTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

function invokeDoTauri(): Invoke | null {
  const w = globalThis as JanelaTauri;
  const invoke = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

/** Retorna `true` quando executado dentro do runtime desktop Tauri. */
export function isDesktopRuntime(): boolean {
  return invokeDoTauri() !== null;
}

/** Inicia o servidor WebSocket embutido do Tauri para colaboração direta na rede local/VPN. */
export async function startDesktopCollabServer(port?: number): Promise<DesktopCollabServerInfo | null> {
  const invoke = invokeDoTauri();
  if (!invoke) return null;
  try {
    const args = typeof port === 'number' && Number.isFinite(port) ? { port } : undefined;
    const raw = await invoke('collab_iniciar_servidor', args);
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (
      typeof r.port !== 'number'
      || !Number.isFinite(r.port)
      || typeof r.lanIp !== 'string'
      || typeof r.wsUrl !== 'string'
      || typeof r.localWsUrl !== 'string'
    ) {
      return null;
    }
    return { port: r.port, lanIp: r.lanIp, wsUrl: r.wsUrl, localWsUrl: r.localWsUrl };
  } catch {
    return null;
  }
}

/** Encerra o servidor WebSocket embutido do Tauri com segurança. */
export async function stopDesktopCollabServer(): Promise<void> {
  const invoke = invokeDoTauri();
  if (!invoke) return;
  try {
    await invoke('collab_parar_servidor');
  } catch {
    // Ignora erros ao parar servidor já encerrado ou indisponível.
  }
}

/** Indica se a página roda dentro do WebView do Tauri (protocolo tauri: ou host tauri.localhost). */
export function isTauriLocation(): boolean {
  const loc = globalThis.location;
  return Boolean(loc && (loc.protocol === 'tauri:' || loc.hostname === 'tauri.localhost'
    || loc.origin?.startsWith('tauri://') || loc.origin?.includes('tauri.localhost')));
}
