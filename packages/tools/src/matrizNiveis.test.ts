import { describe, expect, it } from 'vitest';
import { SelectTool } from './selectTool.ts';
import { clickAt, drawWall, makeEnv, P, tool } from './testEnv.ts';
import { comNiveis, idDe, idsDoNivel, normCriacao, normSelecao, normSnap } from './testMatriz.ts';
import type { ToolEnv } from './types.ts';

/**
 * Caracterização comportamental do código ATUAL, por nível (decisão 0060, §9.2 oráculo 1 e 2).
 * O mesmo cenário (geometria comum: retângulo 6 m x 4 m e pilar em (2, 2)) roda em lv_0 e em lv_1. Os valores de
 * referência são LITERAIS calculados à mão; como são os mesmos nos dois níveis, a igualdade entre níveis fica provada.
 * Só o levelId da criação muda, e ele é o próprio nível do describe.
 */

/** Ambiente de um projeto de dois níveis, com a planta em `levelId` e, opcionalmente, elementos ocultos (ids de `idDe`). */
function cenario(levelId: string, opts: { hiddenIds?: string[] } = {}) {
  const { store } = comNiveis(2);
  return makeEnv(store, { levelId, ...opts });
}

/** Captura de uma parede pela ferramenta Parede (mesma entrada das ferramentas de desenho: move e inference). */
function snapEm(env: ToolEnv, x: number, y: number) {
  const t = tool('wall', env);
  t.move(P(x, y));
  return normSnap(t.inference());
}

describe.each(['lv_0', 'lv_1'])('matriz de níveis, planta %s', (levelId) => {
  describe('(a) snap em extremidade e ponto médio', () => {
    it('canto compartilhado por duas paredes: endpoint em (6, 0)', () => {
      const { env } = cenario(levelId);
      const s = snapEm(env, 6, 0);
      expect(s.tipo).toBe('endpoint');
      expect(s.ponto).toEqual({ x: 6, y: 0 });
      // Duas paredes têm essa extremidade (sul e leste): o desempate é do código, então o literal é o conjunto.
      expect(['sul', 'leste']).toContain(s.id);
    });

    it('ponto médio da parede sul: midpoint em (3, 0) (o eixo a 0 m vence os cortes das faces a 0,092 m)', () => {
      const { env } = cenario(levelId);
      const s = snapEm(env, 3, 0);
      expect(s).toEqual({ tipo: 'midpoint', ponto: { x: 3, y: 0 }, id: 'sul', chave: 'midpoint:sul' });
    });

    it('ponto médio da parede leste: midpoint em (6, 2)', () => {
      const { env } = cenario(levelId);
      const s = snapEm(env, 6, 2);
      expect(s).toEqual({ tipo: 'midpoint', ponto: { x: 6, y: 2 }, id: 'leste', chave: 'midpoint:leste' });
    });

    it('ponto livre (2,5; 1,2), fora de tolerância e de qualquer linha de alinhamento: nenhuma captura', () => {
      const { env } = cenario(levelId);
      const s = snapEm(env, 2.5, 1.2);
      expect(s).toEqual({ tipo: 'none', ponto: { x: 2.5, y: 1.2 }, id: null, chave: 'none:-' });
    });

    it('cursor sobre a horizontal do centro do pilar (y = 2): captura de alinhamento, sem dono', () => {
      // O pilar está em (2, 2); (3, 2) cai na mesma linha y = 2, então o rastreio de alinhamento vence o vazio.
      const { env } = cenario(levelId);
      const s = snapEm(env, 3, 2);
      expect(s.tipo).toBe('alignment');
      expect(s.ponto).toEqual({ x: 3, y: 2 });
      expect(s.id).toBeNull();
    });
  });

  describe('(b) criação por gesto', () => {
    it('parede por dois cliques cria uma parede no nível do ambiente', () => {
      const { store, env } = cenario(levelId);
      const antes = idsDoNivel(store, levelId);
      drawWall(env, [10, 0], [14, 0]);
      const novos = idsDoNivel(store, levelId).filter((id) => !antes.includes(id));
      expect(normCriacao(store, novos)).toEqual({ kinds: ['parede'], pontos: [[{ x: 10, y: 0 }, { x: 14, y: 0 }]], levelId });
    });

    it('pilar por clique cria um pilar no nível do ambiente', () => {
      const { store, env } = cenario(levelId);
      const antes = idsDoNivel(store, levelId);
      clickAt(tool('column', env), 12, 3);
      const novos = idsDoNivel(store, levelId).filter((id) => !antes.includes(id));
      expect(normCriacao(store, novos)).toEqual({ kinds: ['pilar'], pontos: [[{ x: 12, y: 3 }]], levelId });
    });
  });

  describe('(c) seleção por clique e por caixa', () => {
    it('clique sobre a parede sul seleciona só a parede sul', () => {
      const ctx = cenario(levelId);
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(3, 0));
      sel.up(P(3, 0));
      expect(normSelecao(ctx.sel())).toEqual(['sul']);
    });

    it('clique sobre o pilar seleciona só o pilar', () => {
      const ctx = cenario(levelId);
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(2, 2));
      sel.up(P(2, 2));
      expect(normSelecao(ctx.sel())).toEqual(['pilar']);
    });

    it('caixa cobrindo o retângulo inteiro seleciona as quatro paredes e o pilar', () => {
      const ctx = cenario(levelId);
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(-1, -1));
      sel.drag(P(7, 5));
      sel.up(P(7, 5));
      expect(normSelecao(ctx.sel())).toEqual(['leste', 'norte', 'oeste', 'pilar', 'sul']);
    });

    it('caixa só sobre o pilar seleciona só o pilar (as paredes não estão inteiras dentro)', () => {
      const ctx = cenario(levelId);
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(1, 1));
      sel.drag(P(3, 3));
      sel.up(P(3, 3));
      expect(normSelecao(ctx.sel())).toEqual(['pilar']);
    });
  });

  describe('(d) elemento oculto na vista (hiddenIds da parede leste)', () => {
    const ocultaLeste = [idDe('leste', levelId)];

    it('a parede oculta não captura pela face: o cursor fica no alinhamento do pilar (y = 2), sem dono', () => {
      // Com a face filtrada por `hiddenIds`, o ponto médio da face externa (x = 6,092) deixa de existir. O que sobra no
      // cursor (6,05; 2,02) é a linha horizontal do centro do pilar em y = 2: alinhamento, sem dono (não é a parede leste).
      const { env } = cenario(levelId, { hiddenIds: ocultaLeste });
      const s = snapEm(env, 6.05, 2.02);
      // A captura que sobra é de outro elemento (alinhamento), nunca o ponto médio da face da parede oculta.
      expect(s.tipo).toBe('alignment');
      expect(s.id).toBeNull();
      expect(s.ponto.y).toBeCloseTo(2, 2);
    });

    it('o canto do oculto não captura: (6, 0) é endpoint da parede sul', () => {
      const { env } = cenario(levelId, { hiddenIds: ocultaLeste });
      const s = snapEm(env, 6, 0);
      expect(s).toEqual({ tipo: 'endpoint', ponto: { x: 6, y: 0 }, id: 'sul', chave: 'endpoint:sul' });
    });

    it('clique sobre o oculto não seleciona nada', () => {
      const ctx = cenario(levelId, { hiddenIds: ocultaLeste });
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(6, 2));
      sel.up(P(6, 2));
      expect(normSelecao(ctx.sel())).toEqual([]);
    });

    it('caixa cobrindo tudo seleciona os visíveis e deixa a parede oculta de fora', () => {
      const ctx = cenario(levelId, { hiddenIds: ocultaLeste });
      const sel = new SelectTool(ctx.env);
      sel.start();
      sel.down(P(-1, -1));
      sel.drag(P(7, 5));
      sel.up(P(7, 5));
      expect(normSelecao(ctx.sel())).toEqual(['norte', 'oeste', 'pilar', 'sul']);
    });
  });
});
