/**
 * Cliente do worker do render (`renderWorkerClient.ts`). O navegador não existe no ambiente `node`, então o `Worker` é
 * SIMULADO: cada pedido roda a mesma lógica do worker (`tratarPedidoRender`) e a mensagem atravessa o `structuredClone`
 * com `transfer`, que destaca os buffers da origem como uma transferência real. Assim, um bug de posse de buffer aparece aqui.
 * As imagens são sintéticas (`carregarTexturaRgba` é mockado), como nos outros testes de textura.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTemplate, view3dOf } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot } from '@hestia/render';
import { carregarTexturaRgba, gerarMips } from './texturaRender.ts';
import { comTexturasCarregadas, limparCacheDeTexturas } from './texturasCena.ts';
import { codificarCena, ErroRenderWasm, ehCancelamento } from './wasmClient.ts';
import { codificarCenaNoWorker, encerrarWorkerDeMips, gerarMipsNoWorker, type ProgressoCodificacao } from './renderWorkerClient.ts';
import { tratarPedidoRender, type PedidoRender, type RespostaRender } from './renderWorker.ts';

vi.mock('./texturaRender.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./texturaRender.ts')>();
  return { ...original, carregarTexturaRgba: vi.fn() };
});

const mockCarregar = vi.mocked(carregarTexturaRgba);

/** Imagem sintética, de lado ímpar (37×19) para exercitar o último pixel de cada nível de mip. Nova a cada chamada. */
function imagemSintetica(url: string): { largura: number; altura: number; rgba: Uint8Array } {
  const semente = [...url].reduce((soma, c) => soma + c.charCodeAt(0), 0);
  const largura = 37;
  const altura = 19;
  const rgba = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 31 + semente + (i >> 7)) & 0xff;
  return { largura, altura, rgba };
}

/** Worker simulado: roda `tratarPedidoRender` depois de um atraso e entrega as respostas por `onmessage`. */
const instancias: FakeWorker[] = [];
/** Atraso (ms) antes de cada worker simulado responder. Os testes de cancelamento o aumentam. */
let atrasoMs = 0;
/** Tipo de pedido que faz o worker simulado falhar em tempo de execução (dispara `onerror`); `null` = nenhum. */
let falharParaTipo: PedidoRender['tipo'] | null = null;

class FakeWorker {
  onmessage: ((evento: { data: RespostaRender }) => void) | null = null;
  onerror: ((evento: { message: string }) => void) | null = null;
  encerrado = false;
  readonly tipos: string[] = [];
  constructor(readonly url: URL, readonly opcoes?: WorkerOptions) {
    instancias.push(this);
  }
  postMessage(pedido: PedidoRender, transferir: ArrayBuffer[] = []): void {
    // Atravessa o clone com transferência: a origem perde os buffers, como no navegador.
    const copia = structuredClone(pedido, { transfer: transferir }) as PedidoRender;
    this.tipos.push(pedido.tipo);
    if (falharParaTipo === pedido.tipo) {
      setTimeout(() => this.onerror?.({ message: 'falha simulada' }), 0);
      return;
    }
    setTimeout(() => {
      if (this.encerrado) return;
      tratarPedidoRender(copia, (resposta, transf) => {
        const entregue = structuredClone(resposta, { transfer: transf }) as RespostaRender;
        setTimeout(() => {
          if (!this.encerrado) this.onmessage?.({ data: entregue });
        }, 0);
      });
    }, atrasoMs);
  }
  terminate(): void {
    this.encerrado = true;
  }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Cena do template de alto padrão (com as texturas pendentes da biblioteca), como o diálogo a exporta. */
function exportarTemplate(): RenderSceneSnapshot {
  const base = buildTemplate('house-premium');
  const p = { ...base, view3d: { ...view3dOf(base), style: 'realistic' as const, shadows: true, edges: true } };
  const cena = new ModelScene();
  try {
    cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { dark: false, edges: true, shadows: true });
    return cena.exportarCenaDeRender({ aspect: 16 / 9 });
  } finally {
    cena.dispose();
  }
}

/** Mesma cena, sem texturas (HSTR v2). */
function exportarSemTexturas(): RenderSceneSnapshot {
  const base = exportarTemplate();
  return { ...base, texturas: undefined, materials: base.materials.map((m) => ({ ...m, mapas: undefined })) };
}

/** HSTR pelo caminho direto (thread atual), a referência do resultado idêntico. */
async function hstrDireto(snapshot: RenderSceneSnapshot): Promise<Uint8Array> {
  limparCacheDeTexturas();
  return codificarCena(await comTexturasCarregadas(snapshot));
}

beforeEach(() => {
  mockCarregar.mockReset();
  mockCarregar.mockImplementation(async (url) => imagemSintetica(String(url)));
  limparCacheDeTexturas();
  encerrarWorkerDeMips();
  instancias.length = 0;
  atrasoMs = 0;
  falharParaTipo = null;
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  encerrarWorkerDeMips();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('gerarMipsNoWorker', () => {
  it('devolve os mesmos mips de gerarMips e transfere os pixels de entrada (o original fica sem bytes)', async () => {
    const rgba = imagemSintetica('mips.jpg').rgba;
    const copia = rgba.slice();
    const mips = await gerarMipsNoWorker(rgba, 37, 19);
    expect(mips.map(sha256)).toEqual(gerarMips(copia, 37, 19).map(sha256));
    expect(rgba.byteLength).toBe(0);
    expect(instancias.some((w) => w.tipos.includes('mips'))).toBe(true);
  });
});

describe('codificarCenaNoWorker: resultado idêntico ao caminho direto', () => {
  it('HSTR v3 com texturas: SHA-256 igual ao de codificarCena no caminho direto', async () => {
    const snap = exportarTemplate();
    expect(snap.texturas!.length).toBeGreaterThan(0);
    const direto = await hstrDireto(snap);
    limparCacheDeTexturas();
    const viaWorker = await codificarCenaNoWorker(snap);
    expect(new DataView(viaWorker.buffer, viaWorker.byteOffset, viaWorker.byteLength).getUint32(4, true)).toBe(3);
    expect(viaWorker.byteLength).toBe(direto.byteLength);
    expect(sha256(viaWorker)).toBe(sha256(direto));
    expect(instancias.some((w) => w.tipos.includes('codificar'))).toBe(true);
  });

  it('HSTR v2 sem texturas: mesmos bytes do caminho direto', async () => {
    const snap = exportarSemTexturas();
    const direto = codificarCena(snap);
    const viaWorker = await codificarCenaNoWorker(snap);
    expect(new DataView(viaWorker.buffer, viaWorker.byteOffset, viaWorker.byteLength).getUint32(4, true)).toBe(2);
    expect(sha256(viaWorker)).toBe(sha256(direto));
  });

  it('depois do worker, as texturas voltam à thread principal: a mesma lista do cache ainda codifica igual', async () => {
    const snap = exportarTemplate();
    const hstr = await codificarCenaNoWorker(snap);
    const cena = await comTexturasCarregadas(snap);
    expect(cena.texturas!.every((t) => t.mips.every((nivel) => nivel.length > 0))).toBe(true);
    expect(sha256(codificarCena(cena))).toBe(sha256(hstr));
  });

  it('pedidos seguidos na mesma lista: o segundo espera a devolução do primeiro e os dois dão o mesmo HSTR', async () => {
    atrasoMs = 15;
    const snap = exportarTemplate();
    const direto = await hstrDireto(snap);
    limparCacheDeTexturas();
    const [primeiro, segundo] = await Promise.all([codificarCenaNoWorker(snap), codificarCenaNoWorker(snap)]);
    expect(sha256(primeiro)).toBe(sha256(direto));
    expect(sha256(segundo)).toBe(sha256(direto));
  });

  it('erro de validação dentro do worker chega com o mesmo código e mensagem do caminho direto', async () => {
    const snap = exportarTemplate();
    const ruim: RenderSceneSnapshot = { ...snap, camera: { ...snap.camera, near: 0 } };
    limparCacheDeTexturas();
    const erroDireto = await (async () => codificarCena(await comTexturasCarregadas(ruim)))().catch((e: unknown) => e);
    expect(erroDireto).toBeInstanceOf(ErroRenderWasm);
    const erroWorker = await codificarCenaNoWorker(ruim).catch((e: unknown) => e);
    expect(erroWorker).toBeInstanceOf(ErroRenderWasm);
    expect((erroWorker as ErroRenderWasm).codigo).toBe((erroDireto as ErroRenderWasm).codigo);
    expect((erroWorker as Error).message).toBe((erroDireto as Error).message);
    // A falha não perde as texturas: a cena boa seguinte codifica igual.
    expect(sha256(await codificarCenaNoWorker(snap))).toBe(sha256(await hstrDireto(snap)));
  });
});

describe('progresso', () => {
  it('avisa as texturas (feitas de total) e depois a codificação', async () => {
    const eventos: ProgressoCodificacao[] = [];
    const snap = exportarTemplate();
    const total = snap.texturas!.length;
    await codificarCenaNoWorker(snap, {}, (p) => eventos.push(p));
    expect(eventos[0]).toEqual({ fase: 'texturas', feitas: 0, total });
    const feitas = eventos.filter((e) => e.fase === 'texturas').map((e) => e.feitas);
    expect(feitas[feitas.length - 1]).toBe(total);
    expect(eventos[eventos.length - 1]).toEqual({ fase: 'codificando', feitas: 0, total: 0 });
  });
});

describe('cancelamento', () => {
  it('cancelado durante a codificação: encerra o worker, rejeita com código de cancelamento e a próxima chamada recarrega', async () => {
    atrasoMs = 40;
    const snap = exportarTemplate();
    const controlador = new AbortController();
    const promessa = codificarCenaNoWorker(snap, {}, undefined, controlador.signal);
    await vi.waitFor(() => expect(instancias.some((w) => w.tipos.includes('codificar'))).toBe(true));
    const carregamentosAntes = mockCarregar.mock.calls.length;
    controlador.abort();
    const erro = await promessa.catch((e: unknown) => e);
    expect(ehCancelamento(erro)).toBe(true);
    const trabalhador = instancias.find((w) => w.tipos.includes('codificar'))!;
    expect(trabalhador.encerrado).toBe(true);
    // As imagens que estavam com o worker saíram do cache: a próxima chamada as busca de novo e dá o HSTR certo.
    atrasoMs = 0;
    const depois = await codificarCenaNoWorker(snap);
    expect(mockCarregar.mock.calls.length).toBeGreaterThan(carregamentosAntes);
    expect(sha256(depois)).toBe(sha256(await hstrDireto(snap)));
  });

  it('cancelado antes de começar: rejeita sem criar nenhum worker', async () => {
    const controlador = new AbortController();
    controlador.abort();
    const erro = await codificarCenaNoWorker(exportarTemplate(), {}, undefined, controlador.signal).catch((e: unknown) => e);
    expect(ehCancelamento(erro)).toBe(true);
    expect(instancias).toHaveLength(0);
  });
});

describe('ausência e falha do Worker', () => {
  it('sem Worker no ambiente: usa a função direta (mesmo HSTR) e avisa uma vez que está no modo sem worker', async () => {
    vi.stubGlobal('Worker', undefined);
    const snap = exportarTemplate();
    const direto = await hstrDireto(snap);
    limparCacheDeTexturas();
    const hstr = await codificarCenaNoWorker(snap);
    await codificarCenaNoWorker(snap);
    expect(sha256(hstr)).toBe(sha256(direto));
    expect(instancias).toHaveLength(0);
    expect(console.warn).toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toMatch(/sem worker|indisponível/);
  });

  it('worker de codificação que falha em tempo de execução: a promessa rejeita com a causa; a chamada seguinte dá o HSTR certo', async () => {
    falharParaTipo = 'codificar';
    const snap = exportarTemplate();
    const erro = await codificarCenaNoWorker(snap).catch((e: unknown) => e);
    expect((erro as Error).message).toMatch(/falha simulada/);
    falharParaTipo = null;
    expect(sha256(await codificarCenaNoWorker(snap))).toBe(sha256(await hstrDireto(snap)));
  });

  it('worker de mips que falha: a falha sobe com a mensagem da textura, e a chamada seguinte recria o worker', async () => {
    falharParaTipo = 'mips';
    const snap = exportarTemplate();
    const erro = await codificarCenaNoWorker(snap).catch((e: unknown) => e);
    expect((erro as Error).message).toMatch(/falha simulada/);
    falharParaTipo = null;
    expect(sha256(await codificarCenaNoWorker(snap))).toBe(sha256(await hstrDireto(snap)));
  });
});
