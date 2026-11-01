import { beforeEach, describe, expect, it } from 'vitest';
import { alertaPendente, fecharAlerta, pedirAlerta } from './alertaPrompt.ts';
import { useUi } from './state.ts';

describe('alerta modal (decisão 0044)', () => {
  beforeEach(() => {
    fecharAlerta();
    useUi.setState({ dialog: null, avisoParede: null });
  });

  it('pedir abre o diálogo "alerta", guarda a mensagem e a parede a realçar; fechar limpa tudo', () => {
    pedirAlerta('Não é possível: a parede ficaria em cima da parede "w1" (400 cm no mesmo nível). Nada foi alterado.', ['w1']);
    expect(alertaPendente()).toContain('em cima da parede');
    expect(useUi.getState().dialog).toBe('alerta');
    expect(useUi.getState().avisoParede).toBe('w1');
    fecharAlerta();
    expect(alertaPendente()).toBeNull();
    expect(useUi.getState().dialog).toBeNull();
    expect(useUi.getState().avisoParede).toBeNull();
  });

  it('um alerta novo substitui a mensagem e a parede do anterior', () => {
    pedirAlerta('primeiro', ['w1']);
    pedirAlerta('segundo', ['w2']);
    expect(alertaPendente()).toBe('segundo');
    expect(useUi.getState().avisoParede).toBe('w2');
    expect(useUi.getState().dialog).toBe('alerta');
  });

  it('fechar sem alerta aberto é inofensivo', () => {
    fecharAlerta();
    expect(alertaPendente()).toBeNull();
    expect(useUi.getState().dialog).toBeNull();
    expect(useUi.getState().avisoParede).toBeNull();
  });
});
