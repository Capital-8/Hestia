import { afterEach, describe, expect, it } from 'vitest';
import { guardarSessao, lerSessao, limparSessao, sessaoValida, type Sessao } from './sessao.ts';

/** `sessionStorage` de mentira: memória por chave, sem DOM. */
function armazemFalso(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (k: string) => dados.get(k) ?? null,
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => void dados.delete(k),
    setItem: (k: string, v: string) => void dados.set(k, v),
  } as Storage;
}

const SESSAO: Sessao = {
  pasta: 'Casa',
  view: 'plan',
  levelId: 'lv_1',
  planKind: 'floor',
  areaPlanId: null,
  sectionId: null,
  openViews: [{ kind: 'plan', levelId: 'lv_0' }, { kind: '3d' }],
};

afterEach(() => {
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
});

describe('sessão da aba', () => {
  it('grava e lê a sessão de volta', () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazemFalso();
    guardarSessao(SESSAO);
    expect(lerSessao()).toEqual(SESSAO);
  });

  it('esquecer a sessão devolve null (voltar de propósito para a tela de projetos)', () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazemFalso();
    guardarSessao(SESSAO);
    limparSessao();
    expect(lerSessao()).toBeNull();
  });

  it('sem armazenamento não quebra nem promete retomada', () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(() => guardarSessao(SESSAO)).not.toThrow();
    expect(lerSessao()).toBeNull();
  });

  it('sessão estragada ou de outra versão é descartada em vez de travar a abertura', () => {
    expect(sessaoValida(null)).toBeNull();
    expect(sessaoValida({ view: 'planta', levelId: 'lv_0', planKind: 'floor' })).toBeNull();
    expect(sessaoValida({ view: 'plan', levelId: '', planKind: 'floor' })).toBeNull();
    expect(sessaoValida({ view: 'plan', levelId: 'lv_0', planKind: 'floor' })).toEqual({
      pasta: null,
      view: 'plan',
      levelId: 'lv_0',
      planKind: 'floor',
      areaPlanId: null,
      sectionId: null,
      openViews: [],
    });
  });

  it('texto corrompido no armazenamento vira "sem sessão"', () => {
    const armazem = armazemFalso();
    armazem.setItem('hestia.sessao', '{{{');
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazem;
    expect(lerSessao()).toBeNull();
  });
});
