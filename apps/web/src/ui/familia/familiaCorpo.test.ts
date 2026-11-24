import { adicionarCorpo, criarCorpoPadrao, definirPerfil, definirRaio, FAMILIA_ARMARIO, type Familia } from '@hestia/model';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TIPOS_PERFIL,
  comCampo,
  criarCorpoNoEditor,
  criarPerfilPadrao,
  executarCorpo,
  pontoDeslocado,
  pontosParaTexto,
  proximoIdCorpo,
  quadroComEixo,
  selecionarCorpo,
  textoParaPontos,
  useCorpoSel,
} from './familiaCorpo.ts';
import { useFamilia } from './familiaStore.ts';

const clone = (): Familia => structuredClone(FAMILIA_ARMARIO);
const estado = () => useFamilia.getState();

beforeEach(() => {
  estado().novaFamilia(clone());
  estado().ocultar();
  selecionarCorpo(null);
});

describe('comCampo', () => {
  it('troca o campo sem alterar o objeto original', () => {
    const original = { tipo: 'circulo' as const, diametro: '50' };
    const novo = comCampo(original, 'diametro', '60');
    expect(novo).toEqual({ tipo: 'circulo', diametro: '60' });
    expect(original.diametro).toBe('50');
  });

  it('remove campo opcional vazio e mantém campo obrigatório vazio como texto', () => {
    const perfil = { tipo: 'circulo' as const, diametro: '50', segmentos: '32' };
    expect(comCampo(perfil, 'segmentos', '  ')).toEqual({ tipo: 'circulo', diametro: '50' });
    expect(comCampo(perfil, 'diametro', '')).toEqual({ tipo: 'circulo', diametro: '', segmentos: '32' });
  });
});

describe('pontos do polígono em texto', () => {
  it('lê "x, y; x, y" e volta ao mesmo texto', () => {
    const pontos = textoParaPontos('0, 0; 40, 0; L, 30');
    expect(pontos).toEqual([['0', '0'], ['40', '0'], ['L', '30']]);
    expect(typeof pontos === 'string' ? '' : pontosParaTexto(pontos)).toBe('0, 0; 40, 0; L, 30');
  });

  it('recusa um ponto sem as duas partes, com motivo em português', () => {
    expect(textoParaPontos('1; 2, 3')).toBe('cada ponto precisa de dois valores: x, y');
  });
});

describe('quadro e pontos do caminho', () => {
  const quadro = { origem: ['0', '0', '0'] as [string, string, string] };

  it('troca uma coordenada da origem e cria a rotação com zeros', () => {
    const novo = quadroComEixo(quadro, 'origem', 1, '120');
    expect(novo.origem).toEqual(['0', '120', '0']);
    expect(novo.rotacao).toBeUndefined();
    const girado = quadroComEixo(novo, 'rotacao', 2, '');
    expect(girado.rotacao).toEqual(['0', '0', '0']);
  });

  it('ponto novo do fim é o último deslocado 100 mm em X, como fórmula', () => {
    expect(pontoDeslocado(['500', '0', '0'])).toEqual(['(500)+100', '0', '0']);
  });
});

describe('perfis padrão', () => {
  it('cada tipo de perfil padrão é aceito pelo modelo numa extrusão', () => {
    for (const tipo of TIPOS_PERFIL) {
      const f = clone();
      expect(adicionarCorpo(f, criarCorpoPadrao('extrusao', 'c1'))).toBeNull();
      expect(definirPerfil(f, 'c1', criarPerfilPadrao(tipo)), tipo).toBeNull();
    }
  });
});

describe('criação pelo editor', () => {
  it('id novo é o primeiro corpo_n livre entre peças, aninhados e corpos', () => {
    const f = clone();
    expect(proximoIdCorpo(f)).toBe('corpo_1');
    adicionarCorpo(f, criarCorpoPadrao('extrusao', 'corpo_1'));
    expect(proximoIdCorpo(f)).toBe('corpo_2');
  });

  it('cria a varredura padrão no histórico, seleciona e aceita desfazer', () => {
    expect(criarCorpoNoEditor('varredura')).toBeNull();
    const corpos = estado().familia().corpos ?? [];
    expect(corpos.map((c) => [c.id, c.forma.tipo])).toEqual([['corpo_1', 'varredura']]);
    expect(useCorpoSel.getState().id).toBe('corpo_1');
    expect(estado().sel).toBeNull();
    expect(estado().desfazer()).toBe(true);
    expect(estado().familia().corpos ?? []).toHaveLength(0);
  });

  it('a recusa do modelo volta como motivo e não grava nada', () => {
    criarCorpoNoEditor('varredura');
    const antes = JSON.stringify(estado().familia().corpos);
    const motivo = executarCorpo('Definir raio', (f) => definirRaio(f, 'corpo_1', 5, '10'));
    expect(motivo).toBe('o vértice 5 não pode ter curva (use um vértice interior, de 1 a 1)');
    expect(JSON.stringify(estado().familia().corpos)).toBe(antes);
  });
});
