import { BIBLIOTECA_BASE, FAMILIA_ARMARIO, FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Peca } from '@hestia/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { limparCacheMiniaturas, miniaturaDaFamilia } from './familiaMiniatura.ts';

function peca(extra: Partial<Peca> & Pick<Peca, 'id' | 'papel' | 'origem' | 'tamanho'>): Peca {
  return {
    nome: extra.id,
    eixo: 'z',
    espessura: '18',
    ...extra,
  };
}

function familiaComPecas(pecas: Peca[], id = 'fam_teste'): Familia {
  return {
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    id,
    nome: 'Família de teste',
    categoria: 'generico',
    unidade: 'mm',
    hospedagem: 'nivel',
    origem: 'canto',
    parametros: [
      { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 1000 },
      { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: 2000 },
      { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 600 },
    ],
    planos: [],
    pecas,
    aninhados: [],
    ferragens: [],
    tipos: [{ id: 't', nome: 'Padrão', valores: {} }],
    tipoPadrao: 't',
  };
}

beforeEach(() => limparCacheMiniaturas());

describe('miniaturaDaFamilia', () => {
  it('cabe na caixa pedida, com margem, para todas as famílias da biblioteca', () => {
    for (const f of BIBLIOTECA_BASE) {
      const m = miniaturaDaFamilia(f);
      expect(m.largura).toBe(150);
      expect(m.altura).toBe(78);
      expect(m.retangulos.length).toBeGreaterThan(0);
      for (const r of m.retangulos) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(150.000001);
        expect(r.y + r.h).toBeLessThanOrEqual(78.000001);
      }
    }
  });

  it('desenha as peças mais ao fundo primeiro', () => {
    const fundo = peca({ id: 'fundo', papel: 'fundo', eixo: 'y', origem: ['0', 'P - 18', '0'], tamanho: ['L', 'A'] });
    const porta = peca({ id: 'porta', papel: 'porta', eixo: 'y', origem: ['0', '0', '0'], tamanho: ['L', 'A'] });
    const m = miniaturaDaFamilia(familiaComPecas([porta, fundo]));
    expect(m.retangulos.map((r) => r.papel)).toEqual(['fundo', 'porta']);
  });

  it('usa escala uniforme nos dois eixos', () => {
    const bloco = peca({ id: 'bloco', papel: 'bloco', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A' });
    const [r] = miniaturaDaFamilia(familiaComPecas([bloco])).retangulos;
    expect(r).toBeDefined();
    expect(r!.w / r!.h).toBeCloseTo(0.5, 6);
  });

  it('marca as peças vazias', () => {
    const solido = peca({ id: 'bloco', papel: 'bloco', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A' });
    const vazio = peca({ id: 'recorte', papel: 'generica', vazio: true, origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A' });
    const m = miniaturaDaFamilia(familiaComPecas([solido, vazio]));
    expect(m.retangulos.filter((r) => r.vazio)).toHaveLength(1);
  });

  it('família que não resolve vira um único retângulo cinza', () => {
    const m = miniaturaDaFamilia(familiaComPecas([]));
    expect(m.retangulos).toHaveLength(1);
    expect(m.retangulos[0]!.papel).toBe('generica');
    expect(m.retangulos[0]!.x).toBeGreaterThanOrEqual(0);
    expect(m.retangulos[0]!.x + m.retangulos[0]!.w).toBeLessThanOrEqual(150.000001);
  });

  it('guarda no cache por família e por tamanho', () => {
    const a = miniaturaDaFamilia(FAMILIA_ARMARIO);
    expect(miniaturaDaFamilia(FAMILIA_ARMARIO)).toBe(a);
    const b = miniaturaDaFamilia(FAMILIA_ARMARIO, 300, 160);
    expect(b).not.toBe(a);
    expect(b.largura).toBe(300);
  });
});
