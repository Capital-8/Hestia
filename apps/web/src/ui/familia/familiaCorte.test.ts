import type { ChapaParaCorte, PecaParaCorte } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { explicarNaoCoube, pecasForaDoPlano } from './familiaCorte.ts';

const chapa: ChapaParaCorte = {
  largura: 1850,
  altura: 2750,
  refilo: 10,
  veio: true,
  kerf: 3,
};

const peca = (id: string, comprimento: number, largura: number, veio: PecaParaCorte['veio']): PecaParaCorte => ({
  id,
  comprimento,
  largura,
  veio,
});

describe('explicarNaoCoube', () => {
  it('aponta o veio quando a peça só caberia girada (1844 mm em 1830 mm úteis)', () => {
    const fora = explicarNaoCoube(peca('Lateral #1', 1844, 600, 'comprimento'), chapa);
    expect(fora.veioTravou).toBe(true);
    expect(fora.nome).toBe('Lateral #1');
    expect(fora.medida).toBe('1844 × 600 mm');
    expect(fora.motivo).toContain('veio trava a rotação');
    expect(fora.dica).toContain('girar');
  });

  it('aponta a medida quando a peça não cabe em nenhuma orientação', () => {
    const fora = explicarNaoCoube(peca('Tampo #1', 2000, 3000, 'livre'), chapa);
    expect(fora.veioTravou).toBe(false);
    expect(fora.motivo).toContain('maior que a área útil');
    expect(fora.motivo).toContain('1830 × 2730 mm');
    expect(fora.dica).toContain('Troque a chapa');
  });

  it('sem veio na chapa, a peça que cabe girada não é acusada de veio travado', () => {
    const fora = explicarNaoCoube(peca('Lateral #1', 1844, 600, 'comprimento'), { ...chapa, veio: false });
    expect(fora.veioTravou).toBe(false);
  });
});

describe('pecasForaDoPlano', () => {
  it('detalha na ordem dos índices e ignora índice inexistente', () => {
    const pecas = [peca('A', 2000, 3000, 'livre'), peca('B', 1844, 600, 'comprimento')];
    const fora = pecasForaDoPlano(pecas, [1, 0, 9], chapa);
    expect(fora.map((item) => item.nome)).toEqual(['B', 'A']);
    expect(fora[0]!.veioTravou).toBe(true);
    expect(fora[1]!.veioTravou).toBe(false);
  });

  it('lista vazia quando nada ficou de fora', () => {
    expect(pecasForaDoPlano([], [], chapa)).toEqual([]);
  });
});
