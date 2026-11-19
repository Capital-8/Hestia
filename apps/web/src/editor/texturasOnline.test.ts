import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validarCatalogo } from '@hestia/io';
import {
  baseTexturas,
  carregarCatalogo,
  ErroCatalogo,
  esquecerCatalogo,
  FetchTexturas,
  URL_CATALOGO as URL_PAGES,
  URL_TEXTURAS,
  urlDoMapa,
  urlsDoCatalogo,
} from './texturasOnline.ts';

const CATALOGO_OK = {
  versao: 1,
  gerado: '2026-11-17T00:00:00.000Z',
  miniaturas: { arquivo: 'miniaturas.ab12cd34.jpg', lado: 256, colunas: 10 },
  itens: [
    { id: 'Bricks003', nome: 'Bricks 003', categoria: 'Bricks', bytes: 3000, mapas: { cor: 'textures/Bricks003/Color.jpg' }, icone: 0 },
    { id: 'Wood012', nome: 'Wood 012', categoria: 'Wood', bytes: 500, mapas: { cor: 'textures/Wood012/Color.jpg' } },
  ],
};

/** `fetch` falso: devolve a resposta dada e guarda as URLs pedidas. */
function fetchFalso(resposta: { ok: boolean; status: number; corpo?: unknown; jsonErro?: boolean }) {
  const chamadas: string[] = [];
  const fn: FetchTexturas = async (url) => {
    chamadas.push(url);
    return {
      ok: resposta.ok,
      status: resposta.status,
      json: async () => {
        if (resposta.jsonErro) throw new SyntaxError('Unexpected token');
        return resposta.corpo;
      },
    };
  };
  return { fn: vi.fn(fn), chamadas };
}

const BASE = 'https://exemplo.test/bucket';
const URL_CATALOGO = `${BASE}/textures/_catalogo/catalogo.json`;

beforeEach(() => {
  esquecerCatalogo();
});

describe('carregarCatalogo', () => {
  it('baixa catalogo.json da base e devolve o catálogo validado', async () => {
    const f = fetchFalso({ ok: true, status: 200, corpo: CATALOGO_OK });
    const cat = await carregarCatalogo(f.fn, BASE);
    expect(f.chamadas).toEqual([URL_CATALOGO]);
    expect(cat.itens.map((i) => i.id)).toEqual(['Bricks003', 'Wood012']);
    // O atlas fica ao lado do catálogo baixado: o caminho vira URL absoluta a partir dele.
    expect(cat.miniaturas).toEqual({ arquivo: `${BASE}/textures/_catalogo/miniaturas.ab12cd34.jpg`, lado: 256, colunas: 10 });
  });

  it('guarda o catálogo válido em memória: a segunda chamada não baixa de novo', async () => {
    const f = fetchFalso({ ok: true, status: 200, corpo: CATALOGO_OK });
    await carregarCatalogo(f.fn, BASE);
    await carregarCatalogo(f.fn, BASE);
    expect(f.fn).toHaveBeenCalledTimes(1);
  });

  it('base diferente não usa o cache da base anterior', async () => {
    const f = fetchFalso({ ok: true, status: 200, corpo: CATALOGO_OK });
    await carregarCatalogo(f.fn, BASE);
    await carregarCatalogo(f.fn, 'https://outro.test');
    expect(f.fn).toHaveBeenCalledTimes(2);
  });

  it('HTTP 404 rejeita com erro de rede', async () => {
    const f = fetchFalso({ ok: false, status: 404 });
    const erro = await carregarCatalogo(f.fn, BASE).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroCatalogo);
    expect((erro as ErroCatalogo).motivo).toBe('rede');
    expect((erro as Error).message).toContain('404');
  });

  it('falha de rede (fetch lança) rejeita com erro de rede', async () => {
    const fn = vi.fn<FetchTexturas>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const erro = await carregarCatalogo(fn, BASE).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroCatalogo);
    expect((erro as ErroCatalogo).motivo).toBe('rede');
  });

  it('JSON inválido rejeita com erro de formato', async () => {
    const f = fetchFalso({ ok: true, status: 200, jsonErro: true });
    const erro = await carregarCatalogo(f.fn, BASE).catch((e: unknown) => e);
    expect((erro as ErroCatalogo).motivo).toBe('formato');
  });

  it('versão diferente da esperada rejeita com erro de formato', async () => {
    const f = fetchFalso({ ok: true, status: 200, corpo: { ...CATALOGO_OK, versao: 2 } });
    const erro = await carregarCatalogo(f.fn, BASE).catch((e: unknown) => e);
    expect((erro as ErroCatalogo).motivo).toBe('formato');
  });

  it('erro não fica em cache: depois de uma falha, a nova tentativa baixa de novo', async () => {
    const falhas = fetchFalso({ ok: false, status: 503 });
    await expect(carregarCatalogo(falhas.fn, BASE)).rejects.toBeInstanceOf(ErroCatalogo);
    const ok = fetchFalso({ ok: true, status: 200, corpo: CATALOGO_OK });
    const cat = await carregarCatalogo(ok.fn, BASE);
    expect(cat.itens).toHaveLength(2);
  });

  it('validarCatalogo do contrato aceita o JSON de teste (sanidade do fixture)', () => {
    expect(validarCatalogo(CATALOGO_OK)?.itens).toHaveLength(2);
  });
});

describe('baseTexturas', () => {
  it('em produção ignora ?texturas= e usa o bucket padrão', () => {
    expect(baseTexturas('?texturas=https://outro.test', false)).toBe(URL_TEXTURAS);
  });

  it('em desenvolvimento aceita ?texturas= com http(s)', () => {
    expect(baseTexturas('?texturas=http://localhost:9000/b', true)).toBe('http://localhost:9000/b');
    expect(baseTexturas('?texturas=https://outro.test', true)).toBe('https://outro.test');
  });

  it('em desenvolvimento rejeita esquemas que não são http(s) e URL ausente', () => {
    expect(baseTexturas('?texturas=javascript:alert(1)', true)).toBe(URL_TEXTURAS);
    expect(baseTexturas('?texturas=ftp://x', true)).toBe(URL_TEXTURAS);
    expect(baseTexturas('', true)).toBe(URL_TEXTURAS);
  });
});

describe('urlDoMapa', () => {
  it('une base e caminho sem barras duplicadas', () => {
    expect(urlDoMapa(`${BASE}/`, '/textures/Wood012/Color.jpg')).toBe(`${BASE}/textures/Wood012/Color.jpg`);
    expect(urlDoMapa(BASE, 'textures/Wood012/Color.jpg')).toBe(`${BASE}/textures/Wood012/Color.jpg`);
  });
});

describe('catálogo no GitHub Pages com reserva no bucket', () => {
  it('base padrão: tenta o Pages primeiro e o bucket depois; base de desenvolvimento: só o bucket dela', () => {
    expect(urlsDoCatalogo(URL_TEXTURAS)).toEqual([`${URL_PAGES}/catalogo.json`, `${URL_TEXTURAS}/textures/_catalogo/catalogo.json`]);
    expect(urlsDoCatalogo(BASE)).toEqual([URL_CATALOGO]);
  });

  it('Pages respondeu: não toca no bucket e o atlas vem do Pages', async () => {
    const f = fetchFalso({ ok: true, status: 200, corpo: CATALOGO_OK });
    const cat = await carregarCatalogo(f.fn, URL_TEXTURAS);
    expect(f.chamadas).toEqual([`${URL_PAGES}/catalogo.json`]);
    expect(cat.miniaturas?.arquivo).toBe(`${URL_PAGES}/miniaturas.ab12cd34.jpg`);
  });

  it('Pages fora do ar: cai no bucket e o atlas vem do bucket', async () => {
    const chamadas: string[] = [];
    const fn: FetchTexturas = async (url) => {
      chamadas.push(url);
      if (url.startsWith(URL_PAGES)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => CATALOGO_OK };
    };
    const cat = await carregarCatalogo(fn, URL_TEXTURAS);
    expect(chamadas).toEqual([`${URL_PAGES}/catalogo.json`, `${URL_TEXTURAS}/textures/_catalogo/catalogo.json`]);
    expect(cat.miniaturas?.arquivo).toBe(`${URL_TEXTURAS}/textures/_catalogo/miniaturas.ab12cd34.jpg`);
  });

  it('os dois falham: rejeita com o erro do último', async () => {
    const f = fetchFalso({ ok: false, status: 503 });
    const erro = await carregarCatalogo(f.fn, URL_TEXTURAS).catch((e: unknown) => e);
    expect(f.fn).toHaveBeenCalledTimes(2);
    expect((erro as ErroCatalogo).message).toContain('503');
  });
});
