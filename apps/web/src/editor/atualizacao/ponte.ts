/** Resposta dos comandos Rust `verificar_atualizacao` e `instalar_atualizacao`. */
export interface AtualizacaoDisponivel {
  versao: string;
  notas: string | null;
}

type Invoke = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

interface JanelaTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

/** `invoke` do Tauri, detectado sem dependência de pacote (o app web também roda no navegador). */
function invokeDoTauri(): Invoke | null {
  const w = globalThis as JanelaTauri;
  const invoke = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

/** Verdadeiro dentro da casca desktop; no navegador os controles de atualização ficam escondidos. */
export function emTauri(): boolean {
  return invokeDoTauri() !== null;
}

/** Consulta o updater do Tauri. `null` significa que já estamos na versão mais recente. */
export async function verificarAtualizacao(): Promise<AtualizacaoDisponivel | null> {
  const invoke = invokeDoTauri();
  if (!invoke) return null;
  const resposta = await invoke('verificar_atualizacao');
  if (!resposta || typeof resposta !== 'object') return null;
  const versao = (resposta as { versao?: unknown }).versao;
  if (typeof versao !== 'string' || versao.trim() === '') return null;
  const notas = (resposta as { notas?: unknown }).notas;
  return { versao, notas: typeof notas === 'string' && notas.trim() !== '' ? notas : null };
}

/** Baixa, instala e reinicia o app. O processo pode ser encerrado antes da promessa resolver. */
export async function instalarAtualizacao(): Promise<void> {
  const invoke = invokeDoTauri();
  if (!invoke) throw new Error('atualização disponível apenas no aplicativo desktop');
  await invoke('instalar_atualizacao');
}

let pendente: AtualizacaoDisponivel | null = null;

export function definirAtualizacaoPendente(info: AtualizacaoDisponivel | null): void {
  pendente = info;
}

export function lerAtualizacaoPendente(): AtualizacaoDisponivel | null {
  return pendente;
}
