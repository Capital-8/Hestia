import { endpointUrl, type PluginEndpoint, type Transport } from '@hestia/plugin-api';

/**
 * Transporte WebSocket para o plugin em loopback. O Hestia é o CLIENTE: o plugin (processo separado, iniciado pelo
 * usuário) escuta numa porta local. Quadros recebidos antes de o protocolo registrar o receptor ficam guardados.
 * Só texto; quadros binários são ignorados (protocolo 1 é JSON).
 */
export function connectWebSocket(endpoint: PluginEndpoint, timeoutMs = 3000): Promise<Transport> {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === 'undefined') { reject(new Error('Este ambiente não tem WebSocket.')); return; }
    let ws: WebSocket;
    try { ws = new WebSocket(endpointUrl(endpoint)); } catch { reject(new Error('Endereço bloqueado pelo navegador.')); return; }
    const timer = setTimeout(() => { ws.close(); reject(new Error('Sem resposta no endereço local (o plugin está em execução?).')); }, timeoutMs);
    let handler: ((f: unknown) => void) | null = null;
    let onClose: ((r: string) => void) | null = null;
    const backlog: unknown[] = [];
    let open = false;
    let closedReason: string | null = null;
    ws.onmessage = (ev) => { if (typeof ev.data !== 'string') return; if (handler) handler(ev.data); else backlog.push(ev.data); };
    ws.onerror = () => { if (!open) { clearTimeout(timer); reject(new Error('Nenhum plugin atende neste endereço local.')); } };
    ws.onclose = (ev) => {
      clearTimeout(timer);
      open = false;
      closedReason = ev.reason || `código ${ev.code}`;
      onClose?.(closedReason);
    };
    ws.onopen = () => {
      clearTimeout(timer);
      open = true;
      resolve({
        send: (f) => ws.send(f),
        close: (reason) => { try { ws.close(1000, reason?.slice(0, 100)); } catch { /* já fechado */ } },
        onMessage: (cb) => { handler = cb; for (const f of backlog.splice(0)) cb(f); },
        onClose: (cb) => { onClose = cb; if (closedReason !== null) cb(closedReason); },
        get isOpen() { return open; },
      });
    };
  });
}
