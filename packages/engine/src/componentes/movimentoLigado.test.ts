import { describe, expect, it } from 'vitest';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { CORRUGADO, ELETRODUTO, CAIXA, aplicar, caixa, caixaTuboCaixa, comp, esgotoEmL, liga, L, mover, novo, porta, redeRuim, tubo, type V3 } from './movimentoLigadoCasos.ts';

/*
 * Mover com as peças ligadas acompanhando (ficha F4): `planejarMovimentoLigado` sobre redes de `movimentoLigadoCasos.ts`. Cada caso
 * aplica o plano num store e confere a rede com o MESMO `diagnosticarRede` que o botão Verificar rede usa.
 */

describe('mover a caixa com o eletroduto reto ligado', () => {
  it('estica o tubo e a rede fica sem ligação afastada', () => {
    const s = caixaTuboCaixa();
    const antes = L(s.project, 't1');
    const plano = mover(s, ['c2'], [0.5, 0, 0]);
    expect(plano.bloqueado).toBeUndefined();
    expect(plano.desfeitas).toEqual([]);
    expect(plano.alertas).toEqual([]);
    expect(plano.esticados.map((e) => e.id)).toEqual(['t1']);
    aplicar(s, plano);
    expect(comp(s.project, 'c2').x).toBeCloseTo(2.5, 9);
    expect(L(s.project, 't1')).toBeCloseTo(antes + 500, 6);
    expect(redeRuim(s.project)).toEqual([]);
    expect(diagnosticarRede(s.project).filter((d) => d.codigo === 'ligacao_aberta' && ((d.elementId === 'c1' && d.ligacaoId === 'd') || (d.elementId === 'c2' && d.ligacaoId === 'c')))).toEqual([]);
  });

  it('o mesmo movimento para o lado oposto encurta o tubo', () => {
    const s = caixaTuboCaixa();
    const antes = L(s.project, 't1');
    aplicar(s, mover(s, ['c2'], [-0.5, 0, 0]));
    expect(L(s.project, 't1')).toBeCloseTo(antes - 500, 6);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('o plano é puro: não altera o projeto e repete o mesmo resultado', () => {
    const s = caixaTuboCaixa();
    const foto = JSON.stringify(s.project);
    const a = mover(s, ['c2'], [0.5, 0, 0]);
    expect(JSON.stringify(s.project)).toBe(foto);
    expect(mover(s, ['c2'], [0.5, 0, 0])).toEqual(a);
  });

  it('sem deslocamento ou sem componente: plano vazio', () => {
    const s = caixaTuboCaixa();
    expect(mover(s, ['c2'], [0, 0, 0]).comandos).toEqual([]);
    expect(mover(s, ['nada'], [1, 0, 0]).comandos).toEqual([]);
  });

  it('conjunto fechado (duas caixas e o eletroduto): nada estica, tudo anda junto e as ligações ficam', () => {
    const s = caixaTuboCaixa();
    const L0 = L(s.project, 't1');
    const plano = mover(s, ['c1', 't1', 'c2'], [0.4, 0.7, 0]);
    expect(plano.esticados).toEqual([]);
    expect(plano.desfeitas).toEqual([]);
    aplicar(s, plano);
    expect(L(s.project, 't1')).toBeCloseTo(L0, 9);
    expect(comp(s.project, 'c1').x).toBeCloseTo(0.4, 9);
    expect(comp(s.project, 'c1').y).toBeCloseTo(0.7, 9);
    expect(comp(s.project, 't1').ligacoes?.a?.componenteId).toBe('c1');
    expect(comp(s.project, 't1').ligacoes?.b?.componenteId).toBe('c2');
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('as duas caixas selecionadas sem o tubo também andam juntas e o tubo acompanha sem esticar', () => {
    const s = caixaTuboCaixa();
    const L0 = L(s.project, 't1');
    const plano = mover(s, ['c1', 'c2'], [0.3, 0.2, 0]);
    aplicar(s, plano);
    expect(L(s.project, 't1')).toBeCloseTo(L0, 6);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('L acima de 6000 mm bloqueia com o motivo, o trecho e nenhum comando', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [5, 0, 0]);
    expect(plano.bloqueado).toMatch(/comprimento máximo da família/);
    expect(plano.trechoBloqueado).toBeDefined();
    expect(plano.comandos).toEqual([]);
  });

  it('só no limite exato do L máximo ainda passa; encurtar nunca bloqueia', () => {
    const s = caixaTuboCaixa();
    const ate = 6 - L(s.project, 't1') / 1000;
    expect(mover(s, ['c2'], [ate, 0, 0]).bloqueado).toBeUndefined();
    expect(mover(s, ['c2'], [-1.5, 0, 0]).bloqueado).toBeUndefined();
  });

  it('o tubo que ficaria menor que o mínimo solta a ligação do lado que andou, com alerta (sem conexão, o mínimo é o `L` da família)', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [-2, 0, 0]);
    expect(plano.desfeitas.length).toBeGreaterThan(0);
    expect(plano.alertas[0]?.codigo).toBe('ligacao_desfeita');
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });
});

describe('cota (z) e deslocamento lateral do eletroduto rígido reto', () => {
  it('mover a caixa em z com o tubo horizontal de declividade 0: o tubo NÃO vira inclinado, a ligação é desfeita com o alerta da prumada', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [0, 0, 0.3]);
    expect(plano.desfeitas).toHaveLength(1);
    expect(plano.alertas[0]?.motivo).toMatch(/declividade 0/);
    expect(plano.alertas[0]?.motivo).toMatch(/prumada/);
    aplicar(s, plano);
    expect(comp(s.project, 'c2').z).toBeCloseTo(0.6, 9);
    expect(comp(s.project, 't1').ligacoes?.b).toBeUndefined();
    expect(comp(s.project, 'c2').ligacoes?.c).toBeUndefined();
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('desnível de até 1 mm continua horizontal: o tubo estica e a ligação fica', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [0.2, 0, 0.0005]);
    expect(plano.desfeitas).toEqual([]);
    aplicar(s, plano);
    expect(comp(s.project, 't1').ligacoes?.b?.componenteId).toBe('c2');
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('tubo vertical entre caixas empilhadas (topo e base) estica com o movimento em z', () => {
    const s = novo(ELETRODUTO, CAIXA);
    caixa(s, 'c1', 0, 0, 0.3);
    caixa(s, 'c2', 0, 0, 1.3);
    tubo(s, 't1', ELETRODUTO, 20, porta(s.project, 'c1', 'a').posicaoMundo as V3, porta(s.project, 'c2', 'b').posicaoMundo as V3);
    liga(s, 'c1', 'a', 't1', 'a');
    liga(s, 'c2', 'b', 't1', 'b');
    const antes = L(s.project, 't1');
    const plano = mover(s, ['c2'], [0, 0, 0.5]);
    expect(plano.desfeitas).toEqual([]);
    aplicar(s, plano);
    expect(L(s.project, 't1')).toBeCloseTo(antes + 500, 6);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('mover a caixa para o lado, fora do eixo do tubo: a porta não aceita o tubo torto, então a ligação é desfeita com alerta', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [0, 0.5, 0]);
    expect(plano.desfeitas).toHaveLength(1);
    expect(plano.alertas[0]?.motivo).toMatch(/incompatível|apontar uma para a outra/);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('um deslocamento lateral de 1° no tubo é tolerado (a mesma tolerância da compatibilidade) e a ligação segue', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['c2'], [0, 0.03, 0]);
    expect(plano.desfeitas).toEqual([]);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });
});

describe('eletroduto corrugado (sem conexões)', () => {
  it('estica inclinado e de lado, sem desfazer nada, com o canto dentro do raio mínimo', () => {
    const s = caixaTuboCaixa(CORRUGADO, 3);
    const plano = mover(s, ['c2'], [0, 0.6, 0.4]);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.bloqueado).toBeUndefined();
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
    expect(comp(s.project, 't1').inclinacao?.[0]).not.toBeCloseTo(Math.PI / 2, 3);
  });

  it('com o trecho curto demais para o raio mínimo, o canto fechado desfaz a ligação com alerta', () => {
    const s = caixaTuboCaixa(CORRUGADO, 0.13);
    const plano = mover(s, ['c2'], [0, 0.05, 0]);
    expect(plano.desfeitas.length).toBeGreaterThan(0);
    expect(plano.alertas.some((a) => /raio mínimo/.test(a.motivo))).toBe(true);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });
});

describe('tubo pelo corpo', () => {
  it('mover o eletroduto entre duas caixas que ficaram: solta das duas, com um alerta por ligação, e o tubo anda', () => {
    const s = caixaTuboCaixa();
    const plano = mover(s, ['t1'], [0, 0.3, 0]);
    expect(plano.desfeitas).toHaveLength(2);
    expect(plano.alertas).toHaveLength(2);
    expect(plano.alertas[0]?.motivo).toMatch(/não foi movido/);
    aplicar(s, plano);
    expect(comp(s.project, 't1').y).toBeCloseTo(0.0235 + 0.3, 9);
    expect(comp(s.project, 't1').ligacoes).toBeUndefined();
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('esgoto em L: mover o tubo t0 pelo corpo (ao longo do t1) arrasta o joelho e encurta o t1; as duas pontas livres andam', () => {
    const s = esgotoEmL();
    const L1 = L(s.project, 't1');
    const plano = mover(s, ['t0'], [0, 0.3, 0]);
    expect(plano.movidos.sort()).toEqual(['p1', 't0']);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.esticados.map((e) => e.id)).toEqual(['t1']);
    aplicar(s, plano);
    expect(L(s.project, 't1')).toBeCloseTo(L1 - 300, 6);
    expect(comp(s.project, 'p1').y).toBeCloseTo(0.3, 9);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('esgoto em L: mover t0 pelo corpo no sentido que entorta o t1 (mais de 2,5°) desfaz só a ligação do joelho com o t1', () => {
    const s = esgotoEmL();
    const plano = mover(s, ['t0'], [0.3, 0, 0]);
    expect(plano.desfeitas).toHaveLength(1);
    expect(plano.desfeitas[0]?.elementId).toBe('p1');
    expect(plano.alertas[0]?.motivo).toMatch(/Ângulo de|sem conexão automática/);
    aplicar(s, plano);
    expect(comp(s.project, 'p1').ligacoes?.[plano.desfeitas[0]!.ligacaoId]).toBeUndefined();
    expect(redeRuim(s.project)).toEqual([]);
  });
});

