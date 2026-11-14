import { beforeEach, describe, expect, it } from 'vitest';
import { gravarToken, lerToken, mensagemDeCausa, politicaDoToken, tokenNoCofreDoSistema } from './pluginTokens.ts';

const T = 'f'.repeat(64);

beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
});

describe('tokens de pareamento no app', () => {
  it('guarda por plugin, recusa texto que não parece token e apaga', () => {
    expect(lerToken('a')).toBeUndefined();
    expect(gravarToken('a', `  ${T}\n`)).toBe(true);
    expect(lerToken('a')).toBe(T);
    expect(lerToken('b')).toBeUndefined();
    expect(gravarToken('a', 'curto')).toBe(false);
    expect(lerToken('a')).toBe(T); // a gravação recusada não altera o que já havia
    expect(gravarToken('a', null)).toBe(true);
    expect(lerToken('a')).toBeUndefined();
  });
  it('sem armazenamento disponível não lança', () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(lerToken('a')).toBeUndefined();
    expect(() => gravarToken('a', T)).not.toThrow();
  });
  it('política: obrigatória em uso real, opcional só em desenvolvimento; o armazenamento é o do navegador (com aviso)', () => {
    expect(politicaDoToken(false)).toBe('required');
    expect(politicaDoToken(true)).toBe('optional');
    expect(tokenNoCofreDoSistema()).toBe(false);
  });
  it('toda causa de falha tem mensagem nos dois idiomas', () => {
    for (const c of ['wrong_token', 'no_token', 'plugin_without_auth', 'timeout', 'locked', 'no_crypto'] as const) {
      expect(mensagemDeCausa(c, 'pt').length).toBeGreaterThan(10);
      expect(mensagemDeCausa(c, 'en').length).toBeGreaterThan(10);
      expect(mensagemDeCausa(c, 'pt')).not.toBe(mensagemDeCausa(c, 'en'));
    }
  });
});
