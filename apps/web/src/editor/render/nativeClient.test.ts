import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarJobComCache,
  hashHstrSemTrailer,
  renderizarNativo,
  saudeRenderNativo,
  statusJobNativo,
  tileNativo,
  urlRenderNativo,
} from './nativeClient.ts';
import { ehCancelamento } from './erroRender.ts';
import { tratarPedidoRender, type PedidoRender, type RespostaRender } from './renderWorker.ts';
import { encerrarWorkerCompartilhado, hashHstrNoWorker } from './workerRender.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  encerrarWorkerCompartilhado();
});

describe('cliente do render nativo', () => {
  it('monta a URL padrão do serviço local', () => {
    expect(urlRenderNativo()).toContain('127.0.0.1');
  });

  it('envia HSTR como corpo binário e recebe PNG', async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const cena = new Uint8Array([9, 8, 7]);
    const blob = await renderizarNativo(cena, { largura: 1280, altura: 720, exposicao: 0.5 });
    expect(await blob.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/render?');
    expect(url).toContain('largura=1280');
    expect(url).toContain('altura=720');
    expect(url).not.toContain('spp=');
    expect(url).not.toContain('denoise=');
    expect(url).toContain('exposicao=0.5');
    expect(init.method).toBe('POST');
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(cena);
  });

  it('falha com mensagem clara quando o serviço responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sem GPU', { status: 503 })));
    await expect(renderizarNativo(new Uint8Array([1]), { largura: 10, altura: 10 }))
      .rejects.toThrow(/503/);
  });

  it('health devolve null quando o serviço não está rodando', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await saudeRenderNativo()).toBeNull();
  });

  it('T1: status com tiles devolve os tiles tipados', async () => {
    const corpo = {
      fase: 'Renderizando',
      fracao: 0.5,
      pronto: false,
      cancelado: false,
      erro: null,
      tiles: { total: 4, concluidos: [{ i: 0, x: 0, y: 0, w: 64, h: 64 }] },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    const status = await statusJobNativo('job1');
    expect(status?.tiles).toEqual({ total: 4, concluidos: [{ i: 0, x: 0, y: 0, w: 64, h: 64 }] });
    expect(status?.fracao).toBe(0.5);
  });

  it('T2: status sem tiles (serviço antigo) devolve tiles undefined', async () => {
    const corpo = { fase: 'Renderizando', fracao: 0.2, pronto: false, cancelado: false, erro: null };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    const status = await statusJobNativo('job1');
    expect(status).not.toBeNull();
    expect(status?.tiles).toBeUndefined();
  });

  it('T3: fracao inválida (NaN ou 2) lança erro', async () => {
    // JSON não representa NaN; o serviço poderia mandar null/string, então usamos 2 e uma string.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ fase: 'x', fracao: 2, pronto: false, cancelado: false, erro: null }),
      { status: 200 },
    )));
    await expect(statusJobNativo('job1')).rejects.toThrow(/fracao/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ fase: 'x', fracao: 'NaN', pronto: false, cancelado: false, erro: null }),
      { status: 200 },
    )));
    await expect(statusJobNativo('job1')).rejects.toThrow(/fracao/);
  });

  it('T3b: tiles.concluidos que não é array lança erro', async () => {
    const corpo = { fase: 'x', fracao: 0.1, pronto: false, cancelado: false, erro: null, tiles: { total: 4, concluidos: 'x' } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status: 200 })));
    await expect(statusJobNativo('job1')).rejects.toThrow(/concluidos/);
  });

  it('T4: tileNativo faz GET na URL certa e devolve Blob', async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([5, 6]), { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const blob = await tileNativo('job 1', 3);
    expect(blob).toBeInstanceOf(Blob);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([5, 6]));
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${urlRenderNativo()}/jobs/job%201/tile/3`);
    expect(init.method).toBeUndefined();
  });

  it('T5: tileNativo com HTTP 404 lança erro com o status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('não existe', { status: 404 })));
    await expect(tileNativo('job1', 9)).rejects.toThrow(/404/);
  });
});

const TAMANHO_TRAILER_TESTE = 148;
const opcoesCache = { largura: 640, altura: 360 };

/** Item de índice fixo; índice ausente é falha explícita do teste. */
function item<T>(lista: readonly T[], i: number): T {
  const v = lista[i];
  if (v === undefined) throw new Error(`índice ${i} ausente`);
  return v;
}

/** HSTR falso: corpo de `corpo` bytes mais trailer de 148 bytes, com conteúdo da semente. */
function hstrDe(semente: number, corpo = 300): Uint8Array {
  const bytes = new Uint8Array(corpo + TAMANHO_TRAILER_TESTE);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + semente) & 0xff;
  return bytes;
}

/** Mesmo HSTR com outra câmera (só o trailer muda). */
function comCamera(hstr: Uint8Array, semente: number): Uint8Array {
  const copia = hstr.slice();
  for (let i = copia.length - TAMANHO_TRAILER_TESTE; i < copia.length; i++) {
    copia[i] = (i + semente) & 0xff;
  }
  return copia;
}

/** Hash simulado do serviço (só para o teste; o real é SipHash no Rust). */
function hashSimulado(corpo: Uint8Array): string {
  let h = 0;
  for (const b of corpo) h = (Math.imul(h, 31) + b) >>> 0;
  return h.toString(16).padStart(16, '0');
}

/** Serviço simulado: `/jobs` registra o hash; `/jobs/cache` responde 200 só se o hash é conhecido. */
function servicoSimulado() {
  const conhecidos = new Set<string>();
  const chamadas: { rota: 'jobs' | 'cache'; query: string; corpo: number }[] = [];
  let n = 0;
  const fetchFalso = vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const corpo = new Uint8Array(init.body as ArrayBuffer);
    if (u.pathname === '/jobs/cache') {
      const hash = u.searchParams.get('hash') ?? '';
      chamadas.push({ rota: 'cache', query: u.search, corpo: corpo.length });
      if (!conhecidos.has(hash)) return new Response('cena fora do cache', { status: 404 });
      return new Response(JSON.stringify({ id: `cache-${++n}`, hash }), { status: 200 });
    }
    if (u.pathname === '/jobs') {
      const hash = hashSimulado(corpo.subarray(0, corpo.length - TAMANHO_TRAILER_TESTE));
      chamadas.push({ rota: 'jobs', query: u.search, corpo: corpo.length });
      conhecidos.add(hash);
      return new Response(JSON.stringify({ id: `job-${++n}`, hash }), { status: 200 });
    }
    return new Response('rota desconhecida', { status: 500 });
  });
  return { fetchFalso, conhecidos, chamadas };
}

describe('criarJobComCache: cena reaproveitada na GPU', () => {
  it('(a) segunda chamada com o mesmo HSTR usa /jobs/cache com só o trailer', async () => {
    const { fetchFalso, chamadas } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    const hstr = hstrDe(1);
    expect(await criarJobComCache(hstr, opcoesCache)).toBe('job-1');
    // Câmera diferente, mesmo conteúdo: a câmera fica fora da chave.
    expect(await criarJobComCache(comCamera(hstr, 9), opcoesCache)).toBe('cache-2');
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(item(chamadas, 0)).toEqual({ rota: 'jobs', query: expect.any(String), corpo: hstr.length });
    const cache = item(chamadas, 1);
    expect(cache.rota).toBe('cache');
    expect(cache.corpo).toBe(TAMANHO_TRAILER_TESTE);
    expect(cache.query).toContain('hash=');
    expect(cache.query).toContain('largura=640');
    expect(cache.query).toContain('altura=360');
  });

  it('(b) 404 do cache cai para POST /jobs com o HSTR completo', async () => {
    const { fetchFalso, conhecidos, chamadas } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    const hstr = hstrDe(2);
    expect(await criarJobComCache(hstr, opcoesCache)).toBe('job-1');
    conhecidos.clear(); // o serviço descartou a cena
    expect(await criarJobComCache(hstr, opcoesCache)).toBe('job-2');
    expect(chamadas.map((c) => c.rota)).toEqual(['jobs', 'cache', 'jobs']);
    expect(item(chamadas, 2).corpo).toBe(hstr.length);
    // Depois do reenvio, a cena volta a ser reaproveitada.
    expect(await criarJobComCache(hstr, opcoesCache)).toBe('cache-3');
  });

  it('(c) erro de rede é propagado com a rota, sem cair em silêncio', async () => {
    const { fetchFalso } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    const hstr = hstrDe(3);
    await criarJobComCache(hstr, opcoesCache);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(criarJobComCache(hstr, opcoesCache))
      .rejects.toThrow(/falha de rede em POST \/jobs\/cache/);
    await expect(criarJobComCache(hstrDe(4), opcoesCache))
      .rejects.toThrow(/falha de rede em POST \/jobs/);
  });

  it('(d) LRU de 4: a quinta cena expulsa a menos usada', async () => {
    const { fetchFalso, chamadas } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    const cenas = [11, 12, 13, 14, 15].map((s) => hstrDe(s));
    for (const cena of cenas) await criarJobComCache(cena, opcoesCache);
    // A foi expulsa ao entrar a quinta: volta a ir completa (e expulsa B).
    await criarJobComCache(item(cenas, 0), opcoesCache);
    // E ainda está no mapa do cliente: cache.
    await criarJobComCache(item(cenas, 4), opcoesCache);
    // B foi expulsa: completa.
    await criarJobComCache(item(cenas, 1), opcoesCache);
    expect(chamadas.map((c) => c.rota)).toEqual([
      'jobs', 'jobs', 'jobs', 'jobs', 'jobs', 'jobs', 'cache', 'jobs',
    ]);
  });
});

describe('hashHstrSemTrailer', () => {
  it('(e) mesmo conteúdo dá a mesma chave; conteúdo diferente, chave diferente; a câmera fica de fora', async () => {
    const a = hstrDe(1);
    const chave = await hashHstrSemTrailer(a);
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashHstrSemTrailer(a.slice())).toBe(chave);
    expect(await hashHstrSemTrailer(comCamera(a, 5))).toBe(chave);
    expect(await hashHstrSemTrailer(hstrDe(2))).not.toBe(chave);
  });

  it('sem trailer completo, devolve null', async () => {
    expect(await hashHstrSemTrailer(new Uint8Array(10))).toBeNull();
  });
});

/* ------------------------------------------------------------------ hash no worker dedicado ------------------------------------------------------------------ */

/** Atraso (ms) antes de o worker simulado responder. O teste de cancelamento o aumenta. */
let atrasoWorkerMs = 0;
const instanciasWorker: WorkerSimulado[] = [];

/**
 * Worker simulado: roda `tratarPedidoRender` (a mesma lógica do worker real) e atravessa as mensagens com `structuredClone`
 * e `transfer`, que destaca os buffers da origem como uma transferência real: quem enviou perde os bytes.
 */
class WorkerSimulado {
  onmessage: ((evento: { data: RespostaRender }) => void) | null = null;
  onerror: ((evento: { message: string }) => void) | null = null;
  encerrado = false;
  constructor() {
    instanciasWorker.push(this);
  }
  postMessage(pedido: PedidoRender, transferir: ArrayBuffer[] = []): void {
    const copia = structuredClone(pedido, { transfer: transferir }) as PedidoRender;
    setTimeout(() => {
      if (this.encerrado) return;
      void tratarPedidoRender(copia, (resposta, transf) => {
        const entregue = structuredClone(resposta, { transfer: transf as ArrayBuffer[] }) as RespostaRender;
        setTimeout(() => {
          if (!this.encerrado) this.onmessage?.({ data: entregue });
        }, 0);
      });
    }, atrasoWorkerMs);
  }
  terminate(): void {
    this.encerrado = true;
  }
}

/** SHA-256 em hex do corpo (sem o trailer) de um HSTR de referência. */
const sha256DoCorpo = (hstr: Uint8Array): string =>
  createHash('sha256').update(hstr.subarray(0, hstr.length - 148)).digest('hex');

describe('hash do HSTR no worker dedicado', () => {
  beforeEach(() => {
    atrasoWorkerMs = 0;
    instanciasWorker.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('mesma chave com e sem Worker (SHA-256 do mesmo HSTR); o HSTR é transferido e volta na resposta', async () => {
    const direto = await hashHstrSemTrailer(hstrDe(1));
    expect(direto).toBe(sha256DoCorpo(hstrDe(1)));
    vi.stubGlobal('Worker', WorkerSimulado);
    const bytes = hstrDe(1);
    const via = await hashHstrNoWorker(bytes);
    expect(via.chave).toBe(direto);
    // Transferido: quem chamou perdeu o buffer; o que volta é o HSTR inteiro, com os mesmos bytes.
    expect(bytes.byteLength).toBe(0);
    expect(via.hstr.byteLength).toBe(hstrDe(1).byteLength);
    expect(Buffer.from(via.hstr).equals(Buffer.from(hstrDe(1)))).toBe(true);
    expect(instanciasWorker).toHaveLength(1);
    expect(instanciasWorker[0]!.encerrado).toBe(true);
  });

  it('criarJobComCache com Worker: mesma chave da versão direta, então o segundo envio usa /jobs/cache', async () => {
    const { fetchFalso, chamadas } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    vi.stubGlobal('Worker', WorkerSimulado);
    expect(await criarJobComCache(hstrDe(1), opcoesCache)).toBe('job-1');
    expect(await criarJobComCache(comCamera(hstrDe(1), 9), opcoesCache)).toBe('cache-2');
    expect(chamadas.map((c) => c.rota)).toEqual(['jobs', 'cache']);
    // Um worker dedicado por chamada de hash.
    expect(instanciasWorker).toHaveLength(2);
  });

  it('cancelar durante o hash encerra o worker, rejeita com cancelamento e não chega ao serviço', async () => {
    const { fetchFalso } = servicoSimulado();
    vi.stubGlobal('fetch', fetchFalso);
    vi.stubGlobal('Worker', WorkerSimulado);
    atrasoWorkerMs = 50;
    const controlador = new AbortController();
    const promessa = criarJobComCache(hstrDe(3), { ...opcoesCache, sinal: controlador.signal }).catch((e: unknown) => e);
    await vi.waitFor(() => expect(instanciasWorker).toHaveLength(1));
    controlador.abort();
    const erro = await promessa;
    expect(ehCancelamento(erro)).toBe(true);
    expect(instanciasWorker[0]!.encerrado).toBe(true);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('sinal já abortado: rejeita sem criar nenhum worker', async () => {
    vi.stubGlobal('Worker', WorkerSimulado);
    const controlador = new AbortController();
    controlador.abort();
    const erro = await hashHstrNoWorker(hstrDe(4), controlador.signal).catch((e: unknown) => e);
    expect(ehCancelamento(erro)).toBe(true);
    expect(instanciasWorker).toHaveLength(0);
  });
});
