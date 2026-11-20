import { afterEach, describe, expect, it } from 'vitest';
import { guardarGravidade, guardarSessao, lerGravidade, lerSessao, limparSessao, sessaoNoProjeto, sessaoValida, type Sessao } from './sessao.ts';

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

  it('aceita vista e aba do estúdio da face quando válidos', () => {
    expect(sessaoValida({
      view: 'face',
      levelId: 'lv_0',
      planKind: 'floor',
      faceView: { elementId: 'w_1', face: 'sideExt', layer: 0 },
      openViews: [{ kind: 'face', elementId: 'w_1', face: 'sideExt', layer: 'all' }],
    })).toEqual({
      pasta: null,
      view: 'face',
      levelId: 'lv_0',
      planKind: 'floor',
      areaPlanId: null,
      sectionId: null,
      faceView: { elementId: 'w_1', face: 'sideExt', layer: 0 },
      openViews: [{ kind: 'face', elementId: 'w_1', face: 'sideExt', layer: 'all' }],
    });
  });

  it('texto corrompido no armazenamento vira "sem sessão"', () => {
    const armazem = armazemFalso();
    armazem.setItem('hestia.sessao', '{{{');
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazem;
    expect(lerSessao()).toBeNull();
  });
});

describe('Gravidade na sessão (G1)', () => {
  const com = (): Storage => {
    const a = armazemFalso();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = a;
    return a;
  };

  it('sem nada guardado, ou sem armazenamento, a gravidade começa desligada', () => {
    com();
    expect(lerGravidade()).toBe(false);
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(() => guardarGravidade(true)).not.toThrow();
    expect(lerGravidade()).toBe(false);
  });

  it('guarda e restaura ligada e desligada; valor estranho vale desligada', () => {
    const a = com();
    guardarGravidade(true);
    expect(lerGravidade()).toBe(true);
    guardarGravidade(false);
    expect(lerGravidade()).toBe(false);
    a.setItem('hestia.sessao.gravidade', 'talvez');
    expect(lerGravidade()).toBe(false);
  });
});

describe('planta de disciplina na sessão (decisão 0060)', () => {
  const projeto = { planViews: [{ id: 'pv_a', levelId: 'lv_1', discipline: 'arquitetura' as const, name: 'A' }] };

  it('sessão ANTIGA (sem planViewId) abre na planta padrão: o campo não aparece', () => {
    const antiga = { pasta: null, view: 'plan', levelId: 'lv_1', planKind: 'floor', areaPlanId: null, sectionId: null, openViews: [{ kind: 'plan', levelId: 'lv_1' }] };
    const s = sessaoValida(antiga)!;
    expect('planViewId' in s).toBe(false);
    expect(s.openViews).toEqual([{ kind: 'plan', levelId: 'lv_1' }]);
    expect('planViewId' in sessaoNoProjeto(s, projeto)).toBe(false);
  });

  it('grava e lê de volta a planta ativa e a aba de planta de disciplina', () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazemFalso();
    const nova: Sessao = { ...SESSAO, levelId: 'lv_1', planViewId: 'pv_a', openViews: [{ kind: 'plan', levelId: 'lv_1' }, { kind: 'plan', levelId: 'lv_1', planViewId: 'pv_a' }] };
    guardarSessao(nova);
    expect(lerSessao()).toEqual(nova);
  });

  it('id que não existe mais no projeto (ou é de outro nível) vira planta padrão, na vista ativa e nas abas', () => {
    const s = sessaoValida({
      pasta: null, view: 'plan', levelId: 'lv_1', planKind: 'floor', planViewId: 'pv_sumiu',
      openViews: [{ kind: 'plan', levelId: 'lv_1', planViewId: 'pv_sumiu' }, { kind: 'plan', levelId: 'lv_2', planViewId: 'pv_a' }, { kind: 'plan', levelId: 'lv_1', planViewId: 'pv_a' }],
    })!;
    const r = sessaoNoProjeto(s, projeto);
    expect('planViewId' in r).toBe(false);
    expect(r.openViews).toEqual([{ kind: 'plan', levelId: 'lv_1' }, { kind: 'plan', levelId: 'lv_2' }, { kind: 'plan', levelId: 'lv_1', planViewId: 'pv_a' }]);
  });

  it('id que existe é mantido; em cobertura ou área é descartado', () => {
    expect(sessaoNoProjeto({ ...SESSAO, levelId: 'lv_1', planViewId: 'pv_a' }, projeto).planViewId).toBe('pv_a');
    expect('planViewId' in sessaoNoProjeto({ ...SESSAO, levelId: 'lv_1', planKind: 'roof', planViewId: 'pv_a' }, projeto)).toBe(false);
  });

  it('campo com tipo errado é ignorado, sem derrubar a sessão', () => {
    const s = sessaoValida({ pasta: null, view: 'plan', levelId: 'lv_1', planKind: 'floor', planViewId: 7, openViews: [{ kind: 'plan', levelId: 'lv_1', planViewId: 7 }] })!;
    expect('planViewId' in s).toBe(false);
    expect(s.openViews).toEqual([{ kind: 'plan', levelId: 'lv_1' }]);
  });
});
