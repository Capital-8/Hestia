import { beforeEach, describe, expect, it } from 'vitest';
import { I18N, t, type Dict } from './i18n.ts';
import { chaveDicaGizmo, alternarModoGizmo, sincronizarModoGizmo, tabTrocaModoGizmo, useModoGizmo, type ContextoTab } from './modoGizmo.ts';
import { useUi } from './state.ts';
import { definirModoEncaixe, proximoModoEncaixe, useEncaixe, opcoesDeEncaixeAtuais } from './encaixeComponente.ts';

const BASE: ContextoTab = {
  key: 'Tab', ctrl: false, alt: false, meta: false, view: '3d', ferramenta: 'select', umComponente: true,
  dialogoAberto: false, alvoTag: 'CANVAS', alvoEditavel: false,
};

beforeEach(() => {
  useModoGizmo.setState({ modo: 'mover', id: null });
  definirModoEncaixe('parede');
});

describe('estado do modo do gizmo', () => {
  it('começa em Mover, Tab alterna e volta', () => {
    expect(useModoGizmo.getState().modo).toBe('mover');
    sincronizarModoGizmo('c1');
    expect(alternarModoGizmo()).toBe('redimensionar');
    expect(useModoGizmo.getState().modo).toBe('redimensionar');
    expect(alternarModoGizmo()).toBe('mover');
  });
  it('selecionar outro componente reinicia em Mover; o mesmo mantém', () => {
    sincronizarModoGizmo('c1');
    alternarModoGizmo();
    expect(sincronizarModoGizmo('c1')).toBe('redimensionar');
    expect(sincronizarModoGizmo('c2')).toBe('mover');
    alternarModoGizmo();
    expect(sincronizarModoGizmo(null)).toBe('mover');
  });
  it('alternar escreve a dica do modo na barra de status', () => {
    sincronizarModoGizmo('c1');
    alternarModoGizmo();
    expect(useUi.getState().status).toEqual({ key: 'ui_gz_dica_redim' });
    alternarModoGizmo();
    expect(useUi.getState().status).toEqual({ key: 'ui_gz_dica_mover' });
  });
});

describe('tabTrocaModoGizmo', () => {
  it('vale na 3D com Selecionar, um componente, sem diálogo e foco no canvas', () => {
    expect(tabTrocaModoGizmo(BASE)).toBe(true);
  });
  it('não vale em campos de texto, listas, botões ou elementos editáveis', () => {
    for (const alvoTag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'input']) expect(tabTrocaModoGizmo({ ...BASE, alvoTag })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, alvoEditavel: true })).toBe(false);
  });
  it('não vale com diálogo aberto, fora da 3D, outra ferramenta, sem componente ou com modificador/outra tecla', () => {
    expect(tabTrocaModoGizmo({ ...BASE, dialogoAberto: true })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, view: 'plan' })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, ferramenta: 'wall' })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, umComponente: false })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, ctrl: true })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, alt: true })).toBe(false);
    expect(tabTrocaModoGizmo({ ...BASE, key: 'r' })).toBe(false);
  });
});

describe('dica da barra de status por modo', () => {
  it('chaves por modo', () => {
    expect(chaveDicaGizmo('mover')).toBe('ui_gz_dica_mover');
    expect(chaveDicaGizmo('redimensionar')).toBe('ui_gz_dica_redim');
  });
  it('texto literal em PT e EN', () => {
    expect(t('pt', 'ui_gz_dica_mover')).toBe('Mover · Tab: redimensionar · R gira 90° · Alt solta o encaixe');
    expect(t('en', 'ui_gz_dica_mover')).toBe('Move · Tab: resize · R rotates 90° · Alt releases snapping');
    expect(t('pt', 'ui_gz_dica_redim')).toBe('Redimensionar · Tab: mover · arraste uma seta (L, P ou A) ou clique para digitar · Alt solta o encaixe');
    expect(t('en', 'ui_gz_dica_redim')).toBe('Resize · Tab: move · drag an arrow (W, D or H) or click to type · Alt releases snapping');
  });
  it('os 7 idiomas têm todas as chaves novas, com texto e sem repetir o PT (exceto nomes iguais)', () => {
    const chaves = Object.keys(I18N.pt).filter((k) => k.startsWith('ui_gz_') || k.startsWith('ui_en_')) as Array<keyof Dict>;
    expect(chaves.length).toBe(14);
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      for (const k of chaves) expect((I18N[lang] as Partial<Dict>)[k], `${lang} ${k}`).toBeTruthy();
    }
    expect(t('fr', 'ui_gz_dica_mover')).toBe("Déplacer · Tab : redimensionner · R pivote de 90° · Alt désactive l'accrochage");
    expect(t('it', 'ui_gz_dica_mover')).toBe("Sposta · Tab: ridimensiona · R ruota di 90° · Alt disattiva l'aggancio");
  });
});

describe('seletor de encaixe', () => {
  it('padrão Só parede e ciclo', () => {
    expect(useEncaixe.getState().modo).toBe('parede');
    expect(proximoModoEncaixe('parede')).toBe('parede_vizinho');
    expect(proximoModoEncaixe('parede_vizinho')).toBe('livre');
    expect(proximoModoEncaixe('livre')).toBe('parede');
    expect(t('pt', 'ui_en_parede')).toBe('Só parede');
    expect(t('pt', 'ui_en_parede_vizinho')).toBe('Parede + vizinho');
    expect(t('pt', 'ui_en_livre')).toBe('Livre');
  });
  it('o estado vira as opções do arrasto (tabela literal), Alt força semEncaixe', () => {
    definirModoEncaixe('parede');
    expect(opcoesDeEncaixeAtuais(false)).toEqual({ semEncaixe: false, encaixeVizinho: false });
    definirModoEncaixe('parede_vizinho');
    expect(opcoesDeEncaixeAtuais(false)).toEqual({ semEncaixe: false, encaixeVizinho: true });
    definirModoEncaixe('livre');
    expect(opcoesDeEncaixeAtuais(false)).toEqual({ semEncaixe: true, encaixeVizinho: false });
    definirModoEncaixe('parede');
    expect(opcoesDeEncaixeAtuais(true).semEncaixe).toBe(true);
  });
});
