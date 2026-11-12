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
  planViewId: 'pv_lv_1',
  sectionId: null,
  openViews: [{ kind: 'plan', viewId: 'pv_lv_0' }, { kind: '3d' }],
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
      planViewId: 'pv_lv_0',
      sectionId: null,
      openViews: [],
    });
  });

  describe('sessão no formato antigo (levelId + planKind + areaPlanId) abre as mesmas abas', () => {
    const antiga = {
      pasta: 'Casa',
      view: 'plan',
      levelId: 'lv_1',
      planKind: 'area',
      areaPlanId: 'ap_x',
      sectionId: null,
      openViews: [
        { kind: 'plan', levelId: 'lv_0' },
        { kind: 'plan', levelId: 'lv_0', planKind: 'floor' },
        { kind: 'plan', levelId: 'lv_1', planKind: 'roof' },
        { kind: 'plan', levelId: 'lv_1', planKind: 'area', areaPlanId: 'ap_x' },
        { kind: 'section', viewId: 'sec1' },
        { kind: 'sheet', sheetId: 'sh1' },
        { kind: '3d' },
      ],
    };

    it('converte a planta de fundo e as abas para viewId', () => {
      const s = sessaoValida(antiga)!;
      expect(s.planViewId).toBe('ap_x');
      expect(s.levelId).toBe('lv_1');
      expect(s.openViews).toEqual([
        { kind: 'plan', viewId: 'pv_lv_0' },
        { kind: 'plan', viewId: 'pv_lv_0' },
        { kind: 'plan', viewId: 'pvr_lv_1' },
        { kind: 'plan', viewId: 'ap_x' },
        { kind: 'section', viewId: 'sec1' },
        { kind: 'sheet', sheetId: 'sh1' },
        { kind: '3d' },
      ]);
    });

    it('piso e cobertura do estado antigo viram os ids determinísticos', () => {
      expect(sessaoValida({ ...antiga, planKind: 'floor', areaPlanId: null })!.planViewId).toBe('pv_lv_1');
      expect(sessaoValida({ ...antiga, planKind: 'roof', areaPlanId: null })!.planViewId).toBe('pvr_lv_1');
    });

    it('planta de área sem id (estado que não abria nada) cai na planta de piso e a aba é descartada', () => {
      const s = sessaoValida({ ...antiga, areaPlanId: null, openViews: [{ kind: 'plan', levelId: 'lv_1', planKind: 'area' }, { kind: '3d' }] })!;
      expect(s.planViewId).toBe('pv_lv_1');
      expect(s.openViews).toEqual([{ kind: '3d' }]);
    });

    it('a sessão antiga relida depois de gravada no formato novo dá a mesma coisa', () => {
      const s = sessaoValida(antiga)!;
      expect(sessaoValida(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });
  });

  it('texto corrompido no armazenamento vira "sem sessão"', () => {
    const armazem = armazemFalso();
    armazem.setItem('hestia.sessao', '{{{');
    (globalThis as { sessionStorage?: Storage }).sessionStorage = armazem;
    expect(lerSessao()).toBeNull();
  });
});
