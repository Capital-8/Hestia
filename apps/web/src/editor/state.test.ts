import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, alternaFileMenu, toggleFileMenu, toggleGravidade, useUi } from './state.ts';
import { lerGravidade } from './sessao.ts';

afterEach(() => useUi.setState({ fileMenu: false, theme: DEFAULT_THEME }));

describe('botão H da barra de título: menu Arquivo', () => {
  it('fechado abre e aberto fecha', () => {
    expect(alternaFileMenu(false)).toBe(true);
    expect(alternaFileMenu(true)).toBe(false);
  });

  it('a ação do botão abre, fecha e abre de novo', () => {
    toggleFileMenu();
    expect(useUi.getState().fileMenu).toBe(true);
    toggleFileMenu();
    expect(useUi.getState().fileMenu).toBe(false);
    toggleFileMenu();
    expect(useUi.getState().fileMenu).toBe(true);
  });
});

describe('tema ao abrir o app', () => {
  it('inicia no claro, sem seguir a preferência escura do sistema', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(useUi.getState().theme).toBe('light');
  });

  it('a escolha manual de escuro ou sistema continua valendo na sessão', () => {
    useUi.setState({ theme: 'dark' });
    expect(useUi.getState().theme).toBe('dark');
    useUi.setState({ theme: 'system' });
    expect(useUi.getState().theme).toBe('system');
    useUi.setState({ theme: 'light' });
    expect(useUi.getState().theme).toBe('light');
  });
});

describe('Gravidade (G1): campo do estado', () => {
  afterEach(() => {
    useUi.setState({ gravidade: false });
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it('começa desligada; o botão liga e desliga o campo, avisa na barra e grava na sessão', () => {
    const dados = new Map<string, string>();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
    } as Storage;
    useUi.setState({ gravidade: false });
    expect(toggleGravidade()).toBe(true);
    expect(useUi.getState().gravidade).toBe(true);
    expect(useUi.getState().status).toEqual({ key: 'ui_gv_status_on' });
    expect(lerGravidade()).toBe(true);
    expect(toggleGravidade()).toBe(false);
    expect(useUi.getState().gravidade).toBe(false);
    expect(lerGravidade()).toBe(false);
  });
});
