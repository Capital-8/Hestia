import { afterEach, describe, expect, it, vi } from 'vitest';
import { despachoInstalado, KernelPendente, removerDespachoKernel } from '../kernelDespacho.ts';
import { instalarServidor, type EscopoServidor } from './servidor.ts';
import { colherBuffers, type PedidoResolucao, type RespostaResolucao } from './protocolo.ts';

/** Espera o servidor drenar a fila (cada tarefa é um `setTimeout` de 0; no Windows a resolução do timer é grosseira). */
const esperar = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function escopoFalso(): EscopoServidor & { respostas: RespostaResolucao[] } {
  const respostas: RespostaResolucao[] = [];
  return {
    respostas,
    onmessage: null,
    postMessage(m: unknown) {
      respostas.push(m as RespostaResolucao);
    },
  };
}

const pedido = (id: number, tipo: PedidoResolucao['tipo'], nivel: string): PedidoResolucao => ({
  id,
  tipo,
  nivel,
  projeto: { versao: 1, estrutura: {} as PedidoResolucao['projeto']['estrutura'] },
});

describe('instalarServidor', () => {
  it('responde com o resultado do executor e transfere os buffers do resultado', async () => {
    const escopo = escopoFalso();
    const buffer = new Float32Array([1, 2, 3]);
    instalarServidor(escopo, () => ({ pontos: buffer }));
    escopo.onmessage?.({ data: pedido(7, 'lajes', 'lv_0') });
    await esperar();
    expect(escopo.respostas).toEqual([{ id: 7, resultado: { pontos: buffer }, erro: null }]);
    expect(colherBuffers({ pontos: buffer })).toHaveLength(1);
  });

  it('erro do executor vira resposta com erro, sem derrubar o servidor', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, (tipo) => {
      if (tipo === 'pisos') throw new Error('falha de teste');
      return 'ok';
    });
    escopo.onmessage?.({ data: pedido(1, 'pisos', 'lv_0') });
    escopo.onmessage?.({ data: pedido(2, 'nivel', 'lv_0') });
    await esperar();
    expect(escopo.respostas).toEqual([
      { id: 1, resultado: null, erro: 'falha de teste' },
      { id: 2, resultado: 'ok', erro: null },
    ]);
  });

  it('só processa o pedido mais recente de cada tipo+nível (os da fila com a mesma chave saem)', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, (_t, _p, nivel) => nivel);
    escopo.onmessage?.({ data: pedido(1, 'nivel', 'lv_0') });
    escopo.onmessage?.({ data: pedido(2, 'nivel', 'lv_0') });
    escopo.onmessage?.({ data: pedido(3, 'nivel', 'lv_0') });
    await esperar();
    expect(escopo.respostas.map((r) => r.id)).toEqual([3]);
  });

  it('cancelamento tira da fila um pedido que ainda não começou', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, (_t, _p, nivel) => nivel);
    escopo.onmessage?.({ data: pedido(1, 'nivel', 'lv_0') });
    escopo.onmessage?.({ data: pedido(2, 'nivel', 'lv_1') });
    escopo.onmessage?.({ data: { id: 2, tipo: 'cancelar' } });
    await esperar();
    expect(escopo.respostas.map((r) => r.id)).toEqual([1]);
  });

  it('desinstalar limpa a fila e para de ouvir mensagens', async () => {
    const escopo = escopoFalso();
    const desinstalar = instalarServidor(escopo, (_t, _p, nivel) => nivel);
    escopo.onmessage?.({ data: pedido(1, 'nivel', 'lv_0') });
    desinstalar();
    await esperar();
    expect(escopo.respostas).toEqual([]);
    expect(escopo.onmessage).toBeNull();
  });
});

describe('instalarServidor: despacho das fatias A e B (kernelV2)', () => {
  afterEach(() => removerDespachoKernel());

  it('sem kernelV2 (o padrão) nada é instalado e a resposta é a de sempre, sem diagnóstico', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, () => 'ok');
    escopo.onmessage?.({ data: pedido(1, 'nivel', 'lv_0') });
    await esperar();
    expect(despachoInstalado()).toBe(false);
    expect(escopo.respostas).toEqual([{ id: 1, resultado: 'ok', erro: null }]);
    expect('kernelDiag' in escopo.respostas[0]!).toBe(false);
  });

  it('kernelV2 com a fatia desligada também não instala nada', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, () => 'ok');
    escopo.onmessage?.({ data: { ...pedido(1, 'nivel', 'lv_0'), kernelV2: { fatiaA: false, fatiaB: false, sombra: true } } });
    await esperar();
    expect(despachoInstalado()).toBe(false);
  });

  it('kernelV2 com a fatia A instala o despachante e a resposta leva o diagnóstico (wasm indisponível no Node; o executor falso responde)', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, () => 'ok');
    escopo.onmessage?.({ data: { ...pedido(1, 'nivel', 'lv_0'), kernelV2: { fatiaA: true, fatiaB: false, sombra: false } } });
    await esperar(150);
    expect(despachoInstalado()).toBe(true);
    const r = escopo.respostas[0]!;
    expect(r.resultado).toBe('ok');
    expect(r.kernelDiag).toMatchObject({ instalado: true, pronto: false, comparacoes: 0, divergencias: 0, config: { fatiaA: true, fatiaB: false, sombra: false } });
  });

  it('kernelV2 com urlWasm: o worker baixa o wasm daquele endereço (no dev o endereço do worker devolve o index.html, e os cortes saíam vazios)', async () => {
    const buscar = vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', buscar);
    try {
      const escopo = escopoFalso();
      instalarServidor(escopo, () => 'ok');
      escopo.onmessage?.({ data: { ...pedido(1, 'nivel', 'lv_0'), kernelV2: { fatiaA: true, fatiaB: true, sombra: false, urlWasm: 'http://localhost:5175/geom_wasm.wasm' } } });
      await esperar(150);
      expect(buscar).toHaveBeenCalledTimes(1);
      expect(String((buscar.mock.calls[0] as unknown[])[0])).toBe('http://localhost:5175/geom_wasm.wasm');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('kernelV2 só com a fatia B também instala o despachante e o diagnóstico leva a configuração da B', async () => {
    const escopo = escopoFalso();
    instalarServidor(escopo, () => 'ok');
    escopo.onmessage?.({ data: { ...pedido(1, 'pisos', 'lv_0'), kernelV2: { fatiaA: false, fatiaB: true, sombra: false } } });
    await esperar(150);
    expect(despachoInstalado()).toBe(true);
    const r = escopo.respostas[0]!;
    expect(r.resultado).toBe('ok');
    expect(r.kernelDiag).toMatchObject({ instalado: true, pronto: false, entreguesB: 0, config: { fatiaA: false, fatiaB: true, sombra: false } });
  });

  it('KernelPendente do executor: o pedido espera o wasm e roda de novo (uma vez), sem responder erro nem resultado do TS', async () => {
    const escopo = escopoFalso();
    let chamadas = 0;
    instalarServidor(escopo, () => {
      chamadas++;
      if (chamadas === 1) throw new KernelPendente('A', 'lv_0');
      return 'do-rust';
    });
    escopo.onmessage?.({ data: pedido(1, 'nivel', 'lv_0') });
    await esperar();
    expect(chamadas).toBe(2);
    expect(escopo.respostas).toEqual([{ id: 1, resultado: 'do-rust', erro: null }]);
  });

  it('KernelPendente que persiste depois da espera vira erro (não fica em laço)', async () => {
    const escopo = escopoFalso();
    let chamadas = 0;
    instalarServidor(escopo, () => {
      chamadas++;
      throw new KernelPendente('B', 'lv_0');
    });
    escopo.onmessage?.({ data: pedido(1, 'pisos', 'lv_0') });
    await esperar();
    expect(chamadas).toBe(2);
    expect(escopo.respostas).toHaveLength(1);
    expect(escopo.respostas[0]!.resultado).toBeNull();
    expect(escopo.respostas[0]!.erro).toContain('pendente');
  });
});
