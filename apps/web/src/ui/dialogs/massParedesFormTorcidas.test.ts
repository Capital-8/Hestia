import { describe, expect, it } from 'vitest';
import type { DerivacaoParedesTorcidas } from '@hestia/engine';
import { projetoComMassas } from '@hestia/engine/src/fixtureMassa.ts';
import { CURTAIN_PRESET_ID } from '@hestia/model';
import { avisosDaDerivacao, fachadaDe, motivoNaoGerarParedes, opcoesDeTipoParede, tiposPorFachada } from './massParedesForm.ts';

const base = (over: Partial<DerivacaoParedesTorcidas> = {}): DerivacaoParedesTorcidas => ({
  porNivel: [],
  semFatia: [],
  semAltura: [],
  desvioMax: 0,
  desvioAproximacao: 0,
  nParedes: 0,
  nPassos: 0,
  nInclinadas: 0,
  avisos: { limiteDePassos: 0, inclinacaoLimitada: 0, segmentosFundidos: 0 },
  ...over,
});

describe('diálogo Paredes da massa: tipos, fachadas e avisos (frente massa-paredes-torcidas)', () => {
  it('a lista de tipos traz os do projeto, com a cortina de vidro marcada, e oferece os modelos de cortina que o projeto ainda não tem', () => {
    const p = projetoComMassas();
    const o = opcoesDeTipoParede(p);
    // O projeto novo já traz 5 tipos de alvenaria/gesso/concreto e os 3 modelos de cortina de vidro, na ordem dele.
    expect(o.map((x) => x.id)).toEqual(Object.keys(p.wallTypes));
    expect(o.filter((x) => x.cortina).map((x) => x.id)).toEqual([CURTAIN_PRESET_ID.vitrine, CURTAIN_PRESET_ID.fachada, CURTAIN_PRESET_ID.vidroColado]);
    expect(o.filter((x) => !x.cortina)).toHaveLength(5);
    expect(o.every((x) => x.grupo === 'projeto')).toBe(true);
    // Projeto sem a "fachada": ela aparece depois, no grupo dos modelos, pronta para entrar no projeto ao gerar.
    const { [CURTAIN_PRESET_ID.fachada]: _fora, ...semFachada } = p.wallTypes;
    const o2 = opcoesDeTipoParede({ ...p, wallTypes: semFachada });
    const modelos = o2.filter((x) => x.grupo === 'cortina');
    expect(modelos.map((x) => x.id)).toEqual([CURTAIN_PRESET_ID.fachada]);
    expect(modelos[0]!.novo?.family).toBe('curtain');
    expect(o2[o2.length - 1]!.id).toBe(CURTAIN_PRESET_ID.fachada);
  });

  it('fachada pela normal externa (esquerda de a→b): cadeia horária de um quadrado dá N, L, S, O', () => {
    // Quadrado horário a partir do canto (−1, 1): topo vai para +x (normal esquerda = +y = Norte).
    const q = [{ x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }];
    expect(q.map((a, i) => fachadaDe(a, q[(i + 1) % 4]!))).toEqual(['n', 'l', 's', 'o']);
    expect(tiposPorFachada(q, { n: 'A', l: 'B', s: 'A', o: 'B' })).toEqual(['A', 'B', 'A', 'B']);
  });

  it('desvio máximo e passos por nível: faixas do formulário', () => {
    const f = { niveis: ['x'], typeId: 't', tolerancia: 0.05, segmentoMinimo: 0.4 };
    expect(motivoNaoGerarParedes({ ...f, desvioMax: 0.05, maxPassos: 16 }, true)).toBeNull();
    expect(motivoNaoGerarParedes({ ...f, desvioMax: 0 }, true)).toBe('ui_mw_bad_desvio');
    expect(motivoNaoGerarParedes({ ...f, desvioMax: 1.5 }, true)).toBe('ui_mw_bad_desvio');
    expect(motivoNaoGerarParedes({ ...f, maxPassos: 0 }, true)).toBe('ui_mw_bad_passos');
    expect(motivoNaoGerarParedes({ ...f, maxPassos: 2.5 }, true)).toBe('ui_mw_bad_passos');
    expect(motivoNaoGerarParedes({ ...f, maxPassos: 65 }, true)).toBe('ui_mw_bad_passos');
  });

  it('avisos: limite de passos, inclinação limitada, fusão de segmentos, cortina fora do limite, passo baixo de cortina e aberturas removidas', () => {
    const d = base({
      avisos: { limiteDePassos: 3, inclinacaoLimitada: 2, segmentosFundidos: 5 },
      porNivel: [{ nivelId: 'a', topoNivelId: null, altura: 3, passos: [{ z0: 0, altura: 0.5, baseOffset: 0, topoNivelId: null, desvio: 0, cadeias: [{ pontos: [], tilts: [4] }] }] }],
    });
    expect(avisosDaDerivacao(d, false, 'porTolerancia', 0).map((a) => a.chave)).toEqual(['ui_mw_warn_limite', 'ui_mw_warn_incl', 'ui_mw_warn_fund']);
    expect(avisosDaDerivacao(d, true, 'porTolerancia', 2).map((a) => a.chave)).toEqual(['ui_mw_warn_limite', 'ui_mw_warn_incl', 'ui_mw_warn_fund', 'ui_mw_warn_cortina_limite', 'ui_mw_warn_cortina_passo', 'ui_mw_warn_aberturas']);
    // Cortina com um passo por nível: sem o aviso de passo baixo.
    expect(avisosDaDerivacao(d, true, 'porNivel', 0).map((a) => a.chave)).not.toContain('ui_mw_warn_cortina_passo');
    expect(avisosDaDerivacao(base(), false, 'porNivel', 0)).toEqual([]);
  });
});
