import { describe, expect, it } from 'vitest';
import { pedidoConfirmacao, pedirConfirmacao, responderConfirmacao } from './confirmacaoPrompt.ts';
import { useUi } from './state.ts';

describe('pergunta de sim ou não das ferramentas (confirmacaoPrompt)', () => {
  it('abre o diálogo com a pergunta e resolve com a escolha do usuário (sim)', async () => {
    const resposta = pedirConfirmacao('Fundir as células vizinhas?');
    expect(pedidoConfirmacao()).toBe('Fundir as células vizinhas?');
    expect(useUi.getState().dialog).toBe('confirmacao');
    responderConfirmacao(true);
    await expect(resposta).resolves.toBe(true);
    expect(pedidoConfirmacao()).toBeNull();
    expect(useUi.getState().dialog).toBeNull();
  });

  it('não resolve com false e não deixa pergunta em aberto', async () => {
    const resposta = pedirConfirmacao('Fundir?');
    responderConfirmacao(false);
    await expect(resposta).resolves.toBe(false);
    expect(pedidoConfirmacao()).toBeNull();
  });

  it('um pedido novo recusa o anterior (que não fica pendurado)', async () => {
    const primeiro = pedirConfirmacao('Primeira?');
    const segundo = pedirConfirmacao('Segunda?');
    await expect(primeiro).resolves.toBe(false);
    expect(pedidoConfirmacao()).toBe('Segunda?');
    responderConfirmacao(true);
    await expect(segundo).resolves.toBe(true);
  });

  it('responder sem pedido em aberto não faz nada', () => {
    expect(() => responderConfirmacao(true)).not.toThrow();
    expect(pedidoConfirmacao()).toBeNull();
  });
});
