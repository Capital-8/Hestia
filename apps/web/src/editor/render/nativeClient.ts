/**
 * Cliente do renderizador nativo Rust/wgpu (`render-service` local).
 *
 * O navegador não faz o render final: ele envia o snapshot HSTR e recebe o PNG/MP4 do
 * serviço local. Sem serviço, a UI mostra "indisponível" — nunca cai para o path tracer de CPU.
 */
import { hashHstrNoWorker } from './workerRender.ts';
import { chaveSha256DoCorpo, TAMANHO_TRAILER_CAMERA } from './renderWorkerTarefas.ts';

/** Modo do job: rasterização (padrão, sem parâmetro na URL) ou path tracing (`modo=pt`). */
export type ModoRenderNativo = 'raster' | 'pt';

export const AMOSTRAS_PADRAO_PT = 64;
export const AMOSTRAS_MAXIMAS_PT = 4096;

export interface SaudeRenderNativo {
  ok: boolean;
  versao: string;
  backend: string;
  gpu: string;
  /** Modos que o serviço aceita. Serviço antigo (sem `modos` em /health) = só `raster`. */
  modos: ModoRenderNativo[];
  /** Versão do motor pt, ou `null` quando o modo pt não subiu. */
  versaoPt: string | null;
  /** Motivo de o modo pt não ter subido (`erro_pt` do serviço), ou `null`. */
  erroPt: string | null;
}

export interface OpcoesRenderNativo {
  largura: number;
  altura: number;
  /** Paradas de exposição (EV), como no estúdio. */
  exposicao?: number;
  sinal?: AbortSignal;
}

/**
 * Opções de criação de job. `modo` ausente é o raster. `amostras` (1 a 4096, padrão 64) e `denoise`
 * só valem com `modo: 'pt'`; fora dele são erro, como no serviço.
 */
export interface OpcoesJobNativo extends OpcoesRenderNativo {
  modo?: ModoRenderNativo;
  amostras?: number;
  denoise?: boolean;
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

/**
 * Lê `modos` do /health. Ausente = serviço antigo, só raster. Presente com valor fora de
 * `raster`/`pt` é erro explícito: não se inventa modo.
 */
function lerModosSaude(valor: unknown): ModoRenderNativo[] {
  if (valor === undefined || valor === null) return ['raster'];
  if (!Array.isArray(valor) || !valor.every((m) => m === 'raster' || m === 'pt')) {
    throw new Error(`render-service: /health com modos inválidos (${JSON.stringify(valor)})`);
  }
  return valor as ModoRenderNativo[];
}

/**
 * Consulta o serviço local. `null` = não está rodando/acessível. Forma inválida de `modos` lança
 * Error explícito (quem chama mostra o motivo).
 */
export async function saudeRenderNativo(sinal?: AbortSignal): Promise<SaudeRenderNativo | null> {
  let dados: Partial<Record<keyof SaudeRenderNativo | 'erro_pt' | 'versao_pt', unknown>>;
  try {
    const resposta = await fetch(`${urlRenderNativo()}/health`, { signal: sinal, cache: 'no-store' });
    if (!resposta.ok) return null;
    const lido: unknown = await resposta.json();
    if (typeof lido !== 'object' || lido === null) return null;
    dados = lido as typeof dados;
  } catch {
    return null;
  }
  const versaoPt = typeof dados.versao_pt === 'string' ? dados.versao_pt : null;
  const erroPt = typeof dados.erro_pt === 'string' && dados.erro_pt !== '' ? dados.erro_pt : null;
  return {
    ok: dados.ok !== false,
    versao: String(dados.versao ?? ''),
    backend: String(dados.backend ?? ''),
    gpu: String(dados.gpu ?? ''),
    modos: lerModosSaude(dados.modos),
    versaoPt,
    erroPt,
  };
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
    exposicao: String(opcoes.exposicao ?? 0),
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

export interface TileJobNativo {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StatusJobNativo {
  fase: string;
  fracao: number;
  pronto: boolean;
  cancelado: boolean;
  erro: string | null;
  /** Ausente em serviços antigos que não reportam tiles: a UI deve tratar `undefined`. */
  tiles?: { total: number; concluidos: TileJobNativo[] };
  /** Só nos jobs do modo pt: o modo e o andamento por amostra (sem tiles). */
  modo?: ModoRenderNativo;
  amostras?: { feitas: number; total: number };
  denoise?: boolean;
}

/** Mesmo limite do serviço (`LIMITE_CACHE` em main.rs). */
export const LIMITE_CACHE_CENAS_CLIENTE = 4;

/** `fetch` que traduz falha de rede em erro com a rota. Abort segue como veio (o chamador o trata). */
async function fetchRede(url: string, init: RequestInit, rota: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (erro) {
    if (init.signal?.aborted) throw erro;
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new Error(`render-service: falha de rede em ${rota} (${motivo})`);
  }
}

/**
 * Resposta de `POST /jobs*`. Erro HTTP lança Error com a mensagem `erro` do serviço, sem alterar o
 * texto (ex.: 507 com "necessário X MiB, orçamento Y MiB"). Sem `erro` no corpo, vale o status.
 */
async function lerRespostaJob<T>(resposta: Response): Promise<T> {
  if (resposta.ok) return (await resposta.json()) as T;
  const texto = await resposta.text().catch(() => '');
  let mensagem = '';
  try {
    const dados = JSON.parse(texto) as unknown;
    if (typeof dados === 'object' && dados !== null && typeof (dados as { erro?: unknown }).erro === 'string') {
      mensagem = (dados as { erro: string }).erro;
    }
  } catch {
    // corpo que não é JSON: cai na mensagem de status
  }
  throw new Error(mensagem || `render-service: HTTP ${resposta.status}`);
}

/** Valida as opções de modo antes de qualquer trabalho (e antes de transferir o HSTR ao worker). */
function validarOpcoesJob(opcoes: OpcoesJobNativo): void {
  const { modo, amostras, denoise } = opcoes;
  if (modo === undefined || modo === 'raster') {
    if (amostras !== undefined || denoise !== undefined) {
      throw new Error('render-service: amostras e denoise só valem com modo pt');
    }
    return;
  }
  if (modo !== 'pt') throw new Error(`render-service: modo desconhecido (${String(modo)})`);
  if (amostras !== undefined && (!Number.isInteger(amostras) || amostras < 1 || amostras > AMOSTRAS_MAXIMAS_PT)) {
    throw new Error(`render-service: amostras deve ser um inteiro de 1 a ${AMOSTRAS_MAXIMAS_PT} (recebido ${String(amostras)})`);
  }
  if (denoise !== undefined && typeof denoise !== 'boolean') {
    throw new Error('render-service: denoise deve ser verdadeiro ou falso');
  }
}

/** Acrescenta `modo`, `amostras` e `denoise` à URL. Raster não manda nada (URL igual à de antes). */
function acrescentarModo(q: URLSearchParams, opcoes: OpcoesJobNativo): void {
  if (opcoes.modo !== 'pt') return;
  q.set('modo', 'pt');
  q.set('amostras', String(opcoes.amostras ?? AMOSTRAS_PADRAO_PT));
  q.set('denoise', opcoes.denoise === true ? '1' : '0');
}

/** Cria um job com o HSTR completo; o serviço devolve `{id, hash}` e renderiza em background. */
async function postJobCompleto(
  cenaHstr: Uint8Array,
  opcoes: OpcoesJobNativo,
): Promise<{ id: string; hash?: string }> {
  const q = new URLSearchParams({
    largura: String(Math.round(opcoes.largura)),
    altura: String(Math.round(opcoes.altura)),
    exposicao: String(opcoes.exposicao ?? 0),
  });
  acrescentarModo(q, opcoes);
  const resposta = await fetchRede(`${urlRenderNativo()}/jobs?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(cenaHstr),
    signal: opcoes.sinal,
  }, 'POST /jobs');
  return await lerRespostaJob<{ id: string; hash?: string }>(resposta);
}

/** Cria um job progressivo; o serviço devolve `{id}` e renderiza em background. */
export async function criarJobNativo(
  cenaHstr: Uint8Array,
  opcoes: OpcoesJobNativo,
): Promise<string> {
  validarOpcoesJob(opcoes);
  return (await postJobCompleto(cenaHstr, opcoes)).id;
}

/**
 * Chave do conteúdo de um HSTR sem o trailer da câmera: SHA-256 em hex do corpo.
 *
 * NÃO é o hash do serviço. Ele usa `DefaultHasher` (SipHash-1-3 da std do Rust), que o JS não
 * replica de forma garantida. O cliente só usa esta chave para lembrar, por conteúdo, o hash que o
 * serviço devolveu em `/jobs`. SHA-256 evita colisão silenciosa (uma colisão faria o serviço
 * renderizar outra cena). `null` se não há `crypto.subtle` ou o corpo é menor que o trailer: nesses
 * casos o chamador envia o HSTR completo, como antes.
 *
 * Esta é a versão direta (thread atual). `criarJobComCache` usa a versão do worker quando há Worker
 * (`hashHstrNoWorker`); as duas dão a mesma chave.
 */
export async function hashHstrSemTrailer(bytes: Uint8Array): Promise<string | null> {
  return chaveSha256DoCorpo(bytes);
}

/**
 * Hash do serviço por conteúdo do cliente, em ordem de uso (LRU). Chave: `url|chaveConteudo`, para
 * que trocar o endereço do serviço não reaproveite hash de outro processo.
 */
const hashesServico = new Map<string, string>();

function hashServicoConhecido(chave: string): string | undefined {
  const hash = hashesServico.get(chave);
  if (hash !== undefined) {
    hashesServico.delete(chave);
    hashesServico.set(chave, hash);
  }
  return hash;
}

function registrarHashServico(chave: string, hash: string): void {
  hashesServico.delete(chave);
  hashesServico.set(chave, hash);
  while (hashesServico.size > LIMITE_CACHE_CENAS_CLIENTE) {
    const antiga = hashesServico.keys().next().value;
    if (antiga === undefined) break;
    hashesServico.delete(antiga);
  }
}

/**
 * `POST /jobs/cache`: só o trailer da câmera, com o hash da cena. `null` = 404 (a cena não está
 * mais no cache do serviço; também é a resposta de um serviço antigo sem essa rota).
 */
async function postJobCache(
  hash: string,
  trailer: Uint8Array,
  opcoes: OpcoesJobNativo,
): Promise<string | null> {
  const q = new URLSearchParams({
    hash,
    largura: String(Math.round(opcoes.largura)),
    altura: String(Math.round(opcoes.altura)),
    exposicao: String(opcoes.exposicao ?? 0),
  });
  acrescentarModo(q, opcoes);
  const resposta = await fetchRede(`${urlRenderNativo()}/jobs/cache?${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: corpoBinario(trailer),
    signal: opcoes.sinal,
  }, 'POST /jobs/cache');
  if (resposta.status === 404) {
    await resposta.arrayBuffer().catch(() => undefined);
    return null;
  }
  const dados = await lerRespostaJob<{ id?: unknown }>(resposta);
  if (typeof dados.id !== 'string') throw new Error('render-service: resposta de /jobs/cache sem id');
  return dados.id;
}

/**
 * Cria um job reaproveitando a cena já carregada na GPU quando possível.
 *
 * 0. A chave do conteúdo (SHA-256) sai no worker dedicado quando há Worker. O HSTR é TRANSFERIDO para ele: quem chama
 *    não deve reutilizar `cenaHstr` depois desta chamada (com Worker o buffer fica vazio; sem Worker não se altera).
 * 1. Se o hash do serviço para este conteúdo é conhecido, tenta `POST /jobs/cache` com só o trailer.
 * 2. Se o serviço responde 200, usa o id. Se responde 404, envia o HSTR completo em `POST /jobs`.
 * 3. Sem hash conhecido, envia o HSTR completo e guarda o `hash` devolvido.
 *
 * Erro de rede ou HTTP de erro (exceto 404 do cache) é propagado. Não há fallback silencioso. Sinal abortado durante o
 * hash encerra o worker e rejeita com cancelamento.
 */
export async function criarJobComCache(
  cenaHstr: Uint8Array,
  opcoes: OpcoesJobNativo,
): Promise<string> {
  // Valida antes do hash: opção inválida não transfere o HSTR ao worker.
  validarOpcoesJob(opcoes);
  const { chave: chaveConteudo, hstr } = await hashHstrNoWorker(cenaHstr, opcoes.sinal);
  if (chaveConteudo === null) return criarJobNativo(hstr, opcoes);

  const chave = `${urlRenderNativo()}|${chaveConteudo}`;
  const hashConhecido = hashServicoConhecido(chave);
  if (hashConhecido !== undefined) {
    const trailer = hstr.subarray(hstr.length - TAMANHO_TRAILER_CAMERA);
    const id = await postJobCache(hashConhecido, trailer, opcoes);
    if (id !== null) return id;
    hashesServico.delete(chave);
  }

  const { id, hash } = await postJobCompleto(hstr, opcoes);
  if (typeof hash === 'string' && hash !== '') registrarHashServico(chave, hash);
  return id;
}

/** Valida a forma do status; forma inválida é erro explícito, nunca valor inventado. */
function validarStatusJobNativo(dados: unknown): StatusJobNativo {
  if (typeof dados !== 'object' || dados === null) {
    throw new Error('render-service: status do job inválido (não é objeto)');
  }
  const d = dados as Record<string, unknown>;
  if (typeof d.fracao !== 'number' || !Number.isFinite(d.fracao) || d.fracao < 0 || d.fracao > 1) {
    throw new Error(`render-service: status do job com fracao inválida (${String(d.fracao)})`);
  }
  let tiles: StatusJobNativo['tiles'];
  if (d.tiles !== undefined && d.tiles !== null) {
    const t = d.tiles as Record<string, unknown>;
    if (typeof t !== 'object' || typeof t.total !== 'number' || !Number.isFinite(t.total)) {
      throw new Error('render-service: status do job com tiles.total inválido');
    }
    if (!Array.isArray(t.concluidos)) {
      throw new Error('render-service: status do job com tiles.concluidos não é array');
    }
    tiles = { total: t.total, concluidos: t.concluidos as TileJobNativo[] };
  }
  const modo = validarModoStatus(d);
  const amostras = validarAmostrasStatus(d.amostras);
  if (modo === 'pt' && (amostras === undefined || typeof d.denoise !== 'boolean')) {
    throw new Error('render-service: status de job pt sem amostras ou denoise');
  }
  return {
    fase: String(d.fase ?? ''),
    fracao: d.fracao,
    pronto: d.pronto === true,
    cancelado: d.cancelado === true,
    erro: typeof d.erro === 'string' ? d.erro : null,
    tiles,
    ...(modo !== undefined ? { modo } : {}),
    ...(amostras !== undefined ? { amostras } : {}),
    ...(typeof d.denoise === 'boolean' ? { denoise: d.denoise } : {}),
  };
}

function validarModoStatus(d: Record<string, unknown>): ModoRenderNativo | undefined {
  if (d.modo === undefined || d.modo === null) return undefined;
  if (d.modo !== 'raster' && d.modo !== 'pt') {
    throw new Error(`render-service: status do job com modo inválido (${String(d.modo)})`);
  }
  return d.modo;
}

function validarAmostrasStatus(valor: unknown): { feitas: number; total: number } | undefined {
  if (valor === undefined || valor === null) return undefined;
  const a = valor as Record<string, unknown>;
  const inteiroNaoNegativo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (typeof a !== 'object' || !inteiroNaoNegativo(a.feitas) || !inteiroNaoNegativo(a.total) || a.total < 1) {
    throw new Error(`render-service: status do job com amostras inválidas (${JSON.stringify(valor)})`);
  }
  return { feitas: a.feitas, total: a.total };
}

/**
 * Status de um job. `null` = serviço inacessível ou HTTP de erro (como antes).
 * Forma inválida do JSON lança Error explícito.
 */
export async function statusJobNativo(id: string, sinal?: AbortSignal): Promise<StatusJobNativo | null> {
  let resposta: Response;
  try {
    resposta = await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}`, { signal: sinal, cache: 'no-store' });
  } catch {
    return null;
  }
  if (!resposta.ok) return null;
  return validarStatusJobNativo(await resposta.json());
}

/** Um tile PNG já concluído do job progressivo. Erro HTTP lança Error com o status. */
export async function tileNativo(id: string, i: number, sinal?: AbortSignal): Promise<Blob> {
  const resposta = await fetch(`${urlRenderNativo()}/jobs/${encodeURIComponent(id)}/tile/${i}`, {
    signal: sinal,
    cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`render-service: HTTP ${resposta.status} ao buscar tile ${i}`);
  return await resposta.blob();
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
