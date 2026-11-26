import { describe, expect, it } from 'vitest';
import { aplicar, comp, doisTubosDiretos, eletricoEmL, esgotoComTe, esgotoEmL, caixaTuboCaixa, L, mover, redeRuim, type V3 } from './movimentoLigadoCasos.ts';

/* Mover com as peças ligadas (ficha F4): conexões que acompanham (joelho, tê), declividade, ligação direta e desfazer. */

describe('conexões que acompanham (joelho, tê)', () => {
  it('mover o joelho um pouco ao longo do t0: os dois tubos acompanham, o joelho se reposiciona e a rede fica sem afastada', () => {
    const s = esgotoEmL();
    const L0 = L(s.project, 't0');
    const L1 = L(s.project, 't1');
    const plano = mover(s, ['p1'], [0.02, 0, 0]);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.esticados.map((e) => e.id).sort()).toEqual(['t0', 't1']);
    aplicar(s, plano);
    expect(L(s.project, 't0')).toBeGreaterThan(L0 + 15);
    expect(L(s.project, 't1')).toBeLessThan(L1 + 1);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('mover o joelho para onde o ângulo não tem peça: a ligação com o tubo que entortou é desfeita e o joelho vai com o outro tubo', () => {
    const s = esgotoEmL();
    const plano = mover(s, ['p1'], [0.4, 0, 0]);
    expect(plano.desfeitas.length).toBeGreaterThan(0);
    aplicar(s, plano);
    expect(comp(s.project, 'p1').x).toBeGreaterThan(1.3);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('mover o tê com derivação pelo lado do ramal: os dois tubos principais giram um pouco, o ramal encurta e o tê é refeito', () => {
    const s = esgotoComTe();
    const LR = L(s.project, 'tr');
    const plano = mover(s, ['te'], [0, 0.02, 0]);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.esticados.map((e) => e.id).sort()).toEqual(['ta', 'tb', 'tr']);
    aplicar(s, plano);
    expect(L(s.project, 'tr')).toBeLessThan(LR);
    expect(comp(s.project, 'te').ligacoes && Object.keys(comp(s.project, 'te').ligacoes!)).toHaveLength(3);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('mover o tê com derivação ao longo do principal: o ramal entorta além do aceitável e a ligação do ramal é desfeita', () => {
    const s = esgotoComTe();
    const plano = mover(s, ['te'], [0.3, 0, 0]);
    expect(plano.desfeitas.length).toBeGreaterThan(0);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('o tubo curto entre o joelho e a caixa não pode sumir: encurtar além do mínimo desfaz a ligação do lado fixo', () => {
    const s = eletricoEmL();
    const plano = mover(s, ['c1'], [0.85, 0, 0]);
    expect(plano.desfeitas.length).toBeGreaterThan(0);
    expect(plano.alertas[0]?.motivo).toMatch(/mínimo/);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('elétrico em L: mover a caixa c1 ao longo do t1 estica só o t1 e o joelho não mexe', () => {
    const s = eletricoEmL();
    const joelho = JSON.stringify(comp(s.project, 'p1'));
    const plano = mover(s, ['c1'], [-0.3, 0, 0]);
    expect(plano.desfeitas).toEqual([]);
    aplicar(s, plano);
    expect(JSON.stringify(comp(s.project, 'p1'))).toBe(joelho);
    expect(redeRuim(s.project)).toEqual([]);
  });
});

describe('declividade livre e ligação direta entre tubos', () => {
  it('tubo já inclinado (declividade livre) estica inclinado quando o vizinho sobe pouco', () => {
    const s = doisTubosDiretos(0.01);
    const plano = mover(s, ['t1'], [0, 0, 0.01]);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.esticados.map((e) => e.id)).toEqual(['t0']);
    aplicar(s, plano);
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('tubo horizontal ligado direto a outro: subir o vizinho em z desfaz a ligação (declividade 0 não vira inclinado)', () => {
    const s = doisTubosDiretos(0);
    const plano = mover(s, ['t1'], [0, 0, 0.05]);
    expect(plano.desfeitas).toHaveLength(1);
    expect(plano.alertas[0]?.motivo).toMatch(/declividade 0/);
    aplicar(s, plano);
    expect(comp(s.project, 't0').ligacoes).toBeUndefined();
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('mover o vizinho ao longo do eixo mantém a ligação direta e estica o tubo', () => {
    const s = doisTubosDiretos(0);
    const L0 = L(s.project, 't0');
    aplicar(s, mover(s, ['t1'], [0.2, 0, 0]));
    expect(L(s.project, 't0')).toBeCloseTo(L0 + 200, 6);
    expect(comp(s.project, 't0').ligacoes?.b?.componenteId).toBe('t1');
    expect(redeRuim(s.project)).toEqual([]);
  });

  it('esgoto com declividade dentro da faixa (4 %) que sai dela (7 %) ganha aviso de declividade, sem desfazer nada', () => {
    const s = doisTubosDiretos(0.04);
    const plano = mover(s, ['t1'], [0, 0, -0.03]);
    expect(plano.desfeitas).toEqual([]);
    expect(plano.alertas.map((q) => q.codigo)).toEqual(['declividade_fora_do_limite']);
    expect(plano.alertas[0]?.motivo).toMatch(/CONFERIR/);
  });

  it('declividade que continua dentro da faixa (1 % -> 2 %) não avisa', () => {
    const s = doisTubosDiretos(0.01);
    expect(mover(s, ['t1'], [0, 0, 0.01]).alertas).toEqual([]);
  });
});

describe('desfazer e consistência do plano', () => {
  it('os comandos do plano rodam todos numa transação e um undo devolve o projeto inteiro', () => {
    const s = caixaTuboCaixa();
    const foto = JSON.stringify(s.project);
    const plano = mover(s, ['c2'], [0.5, 0, 0]);
    s.transaction('Mover', () => { for (const c of plano.comandos) s.exec(c); });
    expect(JSON.stringify(s.project)).not.toBe(foto);
    s.undo();
    expect(JSON.stringify(s.project)).toBe(foto);
  });

  it('um plano com ligação desfeita também volta inteiro com um undo (as ligações voltam)', () => {
    const s = caixaTuboCaixa();
    const foto = JSON.stringify(s.project);
    const plano = mover(s, ['c2'], [0, 0, 0.3]);
    s.transaction('Mover', () => { for (const c of plano.comandos) s.exec(c); });
    expect(comp(s.project, 't1').ligacoes?.b).toBeUndefined();
    s.undo();
    expect(JSON.stringify(s.project)).toBe(foto);
  });

  it('o plano nunca grava ligação afastada em silêncio: em todos os casos acima a rede fica limpa; aqui, um passeio de vetores', () => {
    for (const d of [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.1], [-0.3, 0.2, 0], [0.5, 0.5, 0.5], [1.2, 0, 0]] as V3[]) {
      const s = caixaTuboCaixa();
      const plano = mover(s, ['c2'], d);
      if (plano.bloqueado === undefined) aplicar(s, plano);
      expect(redeRuim(s.project)).toEqual([]);
    }
  });

  it('o resultado nunca deixa uma conexão sem tubo entre peças: elétrico em L, vários vetores', () => {
    for (const d of [[0.05, 0, 0], [0, 0.05, 0], [-0.4, 0, 0], [0, -0.4, 0], [0.2, 0.2, 0]] as V3[]) {
      const s = eletricoEmL();
      const plano = mover(s, ['c2'], d);
      if (plano.bloqueado === undefined) aplicar(s, plano);
      expect(redeRuim(s.project)).toEqual([]);
    }
  });
});
