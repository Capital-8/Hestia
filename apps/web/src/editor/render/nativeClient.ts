/**
 * Cliente do renderizador nativo Rust/wgpu (`render-service` local).
 *
 * O navegador não faz o render final: ele envia o snapshot HSTR e recebe o PNG/MP4 do
 * serviço local. Sem serviço, a UI mostra "indisponível" — nunca cai para o path tracer de CPU.
 */

export interface SaudeRenderNativo {
  ok: boolean;
  versao: string;
  backend: string;
  gpu: string;
}

export interface OpcoesRenderNativo {
  largura: number;
  altura: number;
  spp: number;
  /** Paradas de exposição (EV), como no estúdio. */
  exposicao?: number;
  denoise?: boolean;
  sinal?: AbortSignal;
}

const CHAVE_SERVICO = 'hestia:renderService';
const PADRAO = 'http://127.0.0.1:19787';

/** Endereço do serviço nativo (preferência da aplicação, não do projeto). */
export function urlRenderNativo(): string {
  try {
    return globalThis.localStorage?.getItem(CHAVE_SERVICO)?.trim() || PADRAO;
  } catch {
    return PADRAO;
  }
}

export function definirUrlRenderNativo(url: string): void {
  try {
    const limpo = url.trim();
    if (limpo) globalThis.localStorage?.setItem(CHAVE_SERVICO, limpo);
    else globalThis.localStorage?.removeItem(CHAVE_SERVICO);
  } catch {
    // sem storage: vale só a sessão
  }
}

function corpoBinario(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function json<T>(resposta: Response): Promise<T> {
  if (!resposta.ok) throw new Error(`render-service: HTTP ${resposta.status}`);
  return (await resposta.json()) as T;
}

/** Consulta o serviço local. `null` = não está rodando/acessível. */
export async function saudeRenderNativo(sinal?: AbortSignal): Promise<SaudeRenderNativo | null> {
  try {
    const resposta = await fetch(`${urlRenderNativo()}/health`, { signal: sinal, cache: 'no-store' });
    if (!resposta.ok) return null;
    const dados = await resposta.json() as Partial<SaudeRenderNativo>;
    return {
      ok: dados.ok !== false,
      versao: String(dados.versao ?? ''),
      backend: String(dados.backend ?? ''),
      gpu: String(dados.gpu ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * Render final de uma imagem. O corpo é o `scene.hstr` (HSTR v1) exatamente como o
 * `wasmClient.codificarCena` o produz; a resposta é `image/png`.
 */
export async function renderizarNativo(
  cenaHstr: Uint8Array,
  opcoes: OpcoesRenderNativo,
): Promise<Blob> {
  const q = new URLSearchParams({
    largura: String(Math.round(opcoes.largura)),
    altura: String(Math.round(opcoes.altura)),
    spp: String(Math.max(1, Math.round(opcoes.spp))),
    exposicao: String(opcoes.exposicao ?? 0),
    denoise: opcoes.denoise === false ? '0' : '1',
  });
  const resposta = await fetch(`${urlRenderNativo()}/render?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(cenaHstr),
    signal: opcoes.sinal,
  });
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '');
    throw new Error(`render-service: HTTP ${resposta.status}${texto ? ` — ${texto.slice(0, 160)}` : ''}`);
  }
  return await resposta.blob();
}

/** Health tipado para a UI; separado para não importar DOM em teste. */
export async function servicoNativoDisponivel(): Promise<boolean> {
  return (await saudeRenderNativo())?.ok === true;
}

export interface StatusJobNativo {
  fase: string;
  fracao: number;
  pronto: boolean;
  cancelado: boolean;
  erro: string | null;
}

/** Cria um job progressivo; o serviço devolve `{id}` e renderiza em background. */
export async function criarJobNativo(
  cenaHstr: Uint8Array,
  opcoes: OpcoesRenderNativo,
): Promise<string> {
  const q = new URLSearchParams({
    largura: String(Math.round(opcoes.largura)),
    altura: String(Math.round(opcoes.altura)),
    spp: String(Math.max(1, Math.round(opcoes.spp))),
    exposicao: String(opcoes.exposicao ?? 0),
  });
  const resposta = await fetch(`${urlRenderNativo()}/jobs?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(cenaHstr),
    signal: opcoes.sinal,
  });
  const dados = await json<{ id: string }>(resposta);
  return dados.id;
}

export async function statusJobNativo(id: string, sinal?: AbortSignal): Promise<StatusJobNativo | null> {
  try {
    const resposta = await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}`, { signal: sinal, cache: 'no-store' });
    if (!resposta.ok) return null;
    return await resposta.json() as StatusJobNativo;
  } catch {
    return null;
  }
}

/** Último PNG parcial do job, ou null se ainda não há imagem. */
export async function previewJobNativo(id: string, sinal?: AbortSignal): Promise<Blob | null> {
  try {
    const resposta = await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}/preview`, { signal: sinal, cache: 'no-store' });
    if (!resposta.ok) return null;
    return await resposta.blob();
  } catch {
    return null;
  }
}

export async function resultadoJobNativo(id: string, sinal?: AbortSignal): Promise<Blob | null> {
  try {
    const resposta = await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}/result`, { signal: sinal, cache: 'no-store' });
    if (!resposta.ok) return null;
    return await resposta.blob();
  } catch {
    return null;
  }
}

export async function criarCenaNativa(cenaHstr: Uint8Array): Promise<string> {
  const resposta = await fetch(`${urlRenderNativo()}/scenes`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(cenaHstr),
  });
  const dados = await json<{ id: string }>(resposta);
  return dados.id;
}

/** Renderiza um frame de vídeo com câmera já codificada (37 f32). */
export async function renderizarFrameNativo(
  cenaId: string,
  cameraPayload: Uint8Array,
  opcoes: { largura: number; altura: number; exposicao?: number; sinal?: AbortSignal },
): Promise<Blob> {
  const q = new URLSearchParams({
    largura: String(Math.round(opcoes.largura)),
    altura: String(Math.round(opcoes.altura)),
    exposicao: String(opcoes.exposicao ?? 0),
  });
  const resposta = await fetch(`${urlRenderNativo()}/scenes/${encodeURIComponent(cenaId)}/frame?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(cameraPayload),
    signal: opcoes.sinal,
  });
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '');
    throw new Error(`render-service: HTTP ${resposta.status}${texto ? ` — ${texto.slice(0, 160)}` : ''}`);
  }
  return await resposta.blob();
}

export async function removerCenaNativa(id: string): Promise<void> {
  try {
    await fetch(`${urlRenderNativo()}/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // serviço já saiu
  }
}

export async function cancelarJobNativo(id: string): Promise<void> {
  try {
    await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // serviço já saiu: nada a cancelar
  }
}

// Reexporta o helper de JSON para testes/uso futuro sem duplicar a checagem.
export { json as lerJsonRenderNativo };
