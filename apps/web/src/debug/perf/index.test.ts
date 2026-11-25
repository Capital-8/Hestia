import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contadores } from '@hestia/render';
import { alternarPerf, desinstalarPerf, instalarPerf, isPerfShortcut, PERF_LOCAL_KEY } from './index.ts';

/**
 * Ambiente: o teste roda em Node (padrão do repo), então `window`, `location`, `localStorage` e o
 * `document` mínimo do overlay são stubs globais; `instalarPerf` recebe a URL explícita quando importa.
 */
const g = globalThis as unknown as Record<string, unknown>;
const store = new Map<string, string>();
let overlaysPostos = 0;
let overlaysRemovidos = 0;

beforeEach(() => {
  store.clear();
  overlaysPostos = 0;
  overlaysRemovidos = 0;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = {};
  g.location = { href: 'http://hestia.test/' };
  g.document = {
    getElementById: () => null,
    createElement: () => ({
      id: '',
      style: { cssText: '' },
      textContent: '',
      setAttribute: () => undefined,
      remove: () => { overlaysRemovidos += 1; },
    }),
    body: { appendChild: () => { overlaysPostos += 1; } },
  };
  desinstalarPerf();
});

afterEach(() => {
  desinstalarPerf();
  contadores.desativar();
  delete g.localStorage;
  delete g.window;
  delete g.location;
  delete g.document;
});

const url = (query: string) => new URL(`http://hestia.test/${query}`);
const atalho = (extra: Partial<{ code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean }> = {}) => ({
  code: 'KeyP', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, repeat: false, ...extra,
});

describe('isPerfShortcut (Ctrl+Shift+P)', () => {
  it('só Ctrl+Shift+P (posição da tecla, sem AutoRepeat, sem Alt/Meta)', () => {
    expect(isPerfShortcut(atalho())).toBe(true);
    expect(isPerfShortcut(atalho({ ctrlKey: false }))).toBe(false);
    expect(isPerfShortcut(atalho({ shiftKey: false }))).toBe(false);
    expect(isPerfShortcut(atalho({ altKey: true }))).toBe(false);
    expect(isPerfShortcut(atalho({ metaKey: true }))).toBe(false);
    expect(isPerfShortcut(atalho({ repeat: true }))).toBe(false);
    expect(isPerfShortcut(atalho({ code: 'KeyB' }))).toBe(false);
  });
});

describe('instalarPerf com localStorage', () => {
  it("'hestia.perf'='1' liga medição e overlay sem nada na URL", () => {
    store.set(PERF_LOCAL_KEY, '1');
    const api = instalarPerf(url(''));
    expect(api?.ativo).toBe(true);
    expect(api?.overlay).toBe(true);
    expect(contadores.ativo).toBe(true);
    expect(overlaysPostos).toBe(1);
  });

  it('a URL manda: ?perf=0 com salvo=1 fica desligado (sem overlay)', () => {
    store.set(PERF_LOCAL_KEY, '1');
    const api = instalarPerf(url('?perf=0'));
    expect(api?.ativo).toBe(false);
    expect(overlaysPostos).toBe(0);
    expect(contadores.ativo).toBe(false);
  });

  it('?bench=orbit mede sem overlay (instrumenta antes do contexto nascer)', () => {
    const api = instalarPerf(url('?bench=orbit'));
    expect(api?.ativo).toBe(true);
    expect(api?.overlay).toBe(false);
    expect(contadores.ativo).toBe(true);
    expect(overlaysPostos).toBe(0);
  });

  it('sem URL, sem salvo e sem bench: nada é instalado', () => {
    expect(instalarPerf(url('?debug=1'))).toBeNull();
  });
});

describe('alternarPerf (atalho em runtime, sem recarregar)', () => {
  it('liga, persiste, desliga e limpa a escolha', () => {
    expect(alternarPerf()).toBe(true);
    expect(store.get(PERF_LOCAL_KEY)).toBe('1');
    expect(contadores.ativo).toBe(true);
    expect((g.window as { __hestiaPerf?: { ativo: boolean } }).__hestiaPerf?.ativo).toBe(true);
    expect(alternarPerf()).toBe(false);
    expect(store.get(PERF_LOCAL_KEY)).toBe('0');
    expect(contadores.ativo).toBe(false);
    expect((g.window as { __hestiaPerf?: unknown }).__hestiaPerf).toBeUndefined();
    expect(overlaysRemovidos).toBe(1);
  });

  it('?perf=0 na URL vence o atalho: não liga e não deixa 1 gravado em contraste', () => {
    g.location = { href: 'http://hestia.test/?perf=0' };
    expect(alternarPerf()).toBe(false);
    expect(store.get(PERF_LOCAL_KEY)).toBe('0');
    expect(overlaysPostos).toBe(0);
  });
});
