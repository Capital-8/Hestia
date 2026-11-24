import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { ordemDeAvaliacao } from './grafo.ts';
import type { Familia } from './tipos.ts';
import type { Corpo } from './tiposCorpo.ts';
import { validarFamilia, type CodigoProblema } from './validar.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

/** Família de exemplo com estes corpos (os ids e as fórmulas são os do teste, não os da família). */
const comCorpos = (...corpos: unknown[]): Familia => {
  const f = nova();
  f.corpos = corpos as Corpo[];
  return f;
};

const quadro = { origem: ['0', '0', '0'] };
const extrusao = (perfil: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: 'extrusao',
  perfil,
  comprimento: 'L',
  ...extra,
});
const corpo = (id: string, forma: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  nome: id,
  papel: 'generico',
  quadro,
  forma,
  ...extra,
});
const circulo = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  corpo(id, extrusao({ tipo: 'circulo', diametro: '20' }), extra);

const achar = (f: Familia, codigo: CodigoProblema, onde: string) =>
  validarFamilia(f).filter((p) => p.codigo === codigo && p.onde === onde);

describe('validarCorpos (regra 10 de validarFamilia)', () => {
  it('família sem corpos não ganha diagnóstico de corpo', () => {
    const f = nova();
    expect(f.corpos).toBeUndefined();
    expect(validarFamilia(f)).toEqual([]);
    delete f.corpos;
    expect(validarFamilia(f)).toEqual([]);
  });

  it('corpo válido (extrusão de círculo com comprimento = L) passa limpo', () => {
    expect(validarFamilia(comCorpos(circulo('c1')))).toEqual([]);
  });

  it('id_invalido: id vazio', () => {
    expect(achar(comCorpos(circulo('')), 'id_invalido', 'corpos[]')).toHaveLength(1);
  });

  it('id_duplicado: dois corpos com o mesmo id, o segundo é apontado', () => {
    const f = comCorpos(circulo('c1'), circulo('c1'));
    expect(achar(f, 'id_duplicado', 'corpos[c1]')).toHaveLength(1);
  });

  it('id_duplicado: corpo com id de peça (o espaço de nomes é o mesmo)', () => {
    const idPeca = nova().pecas[0]!.id;
    expect(achar(comCorpos(circulo(idPeca)), 'id_duplicado', `corpos[${idPeca}]`)).toHaveLength(1);
  });

  it('limite: mais corpos que LIMITES_CORPO.corpos', () => {
    const muitos = Array.from({ length: 257 }, (_, i) => circulo(`c${i}`));
    expect(achar(comCorpos(...muitos), 'limite', 'familia')).toHaveLength(1);
  });

  it('tipo: forma desconhecida', () => {
    expect(achar(comCorpos(corpo('c1', { tipo: 'xyz' })), 'tipo', 'corpos[c1].forma')).toHaveLength(1);
  });

  it('obrigatorio: extrusão sem comprimento e corpo sem perfil', () => {
    const semComprimento = corpo('c1', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '20' } });
    expect(achar(comCorpos(semComprimento), 'obrigatorio', 'corpos[c1].forma.comprimento')).toHaveLength(1);
    const semPerfil = corpo('c1', { tipo: 'extrusao', comprimento: 'L' });
    expect(achar(comCorpos(semPerfil), 'obrigatorio', 'corpos[c1].forma.perfil')).toHaveLength(1);
  });

  it('obrigatorio: quadro sem origem', () => {
    const f = comCorpos(circulo('c1', { quadro: {} }));
    expect(achar(f, 'obrigatorio', 'corpos[c1].quadro.origem[0]')).toHaveLength(1);
  });

  it('faixa: medida literal ≤ 0 no perfil', () => {
    const f = comCorpos(corpo('c1', extrusao({ tipo: 'circulo', diametro: '0' }, {})));
    expect(achar(f, 'faixa', 'corpos[c1].forma.perfil.diametro')).toHaveLength(1);
  });

  it('faixa: diâmetro interno não menor que o externo (anel)', () => {
    const f = comCorpos(corpo('c1', extrusao({ tipo: 'anel', diametroExterno: '10', diametroInterno: '10' })));
    expect(achar(f, 'faixa', 'corpos[c1].forma.perfil.diametroInterno')).toHaveLength(1);
  });

  it('faixa: espessura do retângulo oco não cabe (2e ≥ menor lado)', () => {
    const f = comCorpos(corpo('c1', extrusao({ tipo: 'retanguloOco', largura: '20', altura: '30', espessura: '10' })));
    expect(achar(f, 'faixa', 'corpos[c1].forma.perfil.espessura')).toHaveLength(1);
  });

  it('faixa: mesa do I não cabe na altura e alma não menor que a largura', () => {
    const mesa = comCorpos(corpo('c1', extrusao({ tipo: 'perfilI', altura: '20', largura: '30', almaEsp: '4', mesaEsp: '10' })));
    expect(achar(mesa, 'faixa', 'corpos[c1].forma.perfil.mesaEsp')).toHaveLength(1);
    const alma = comCorpos(corpo('c1', extrusao({ tipo: 'perfilU', altura: '40', largura: '30', almaEsp: '30', mesaEsp: '4' })));
    expect(achar(alma, 'faixa', 'corpos[c1].forma.perfil.almaEsp')).toHaveLength(1);
  });

  it('faixa: polígono com menos de 3 pontos; limite: mais de 256', () => {
    const poucos = comCorpos(corpo('c1', extrusao({ tipo: 'poligono', pontos: [['0', '0'], ['1', '0']] })));
    expect(achar(poucos, 'faixa', 'corpos[c1].forma.perfil.pontos')).toHaveLength(1);
    const demais = Array.from({ length: 257 }, () => ['0', '0']);
    const muitos = comCorpos(corpo('c1', extrusao({ tipo: 'poligono', pontos: demais })));
    expect(achar(muitos, 'limite', 'corpos[c1].forma.perfil.pontos')).toHaveLength(1);
  });

  it('faixa: caminho com menos de 2 pontos; limite: mais de 64', () => {
    const curto = corpo('c1', { tipo: 'varredura', perfil: { tipo: 'circulo', diametro: '10' }, caminho: { pontos: [['0', '0', '0']] } });
    expect(achar(comCorpos(curto), 'faixa', 'corpos[c1].forma.caminho.pontos')).toHaveLength(1);
    const longo = Array.from({ length: 65 }, (_, i) => [String(i), '0', '0']);
    const comprido = corpo('c1', { tipo: 'varredura', perfil: { tipo: 'circulo', diametro: '10' }, caminho: { pontos: longo } });
    expect(achar(comCorpos(comprido), 'limite', 'corpos[c1].forma.caminho.pontos')).toHaveLength(1);
  });

  it('faixa: raios além de pontos − 2', () => {
    const caminho = { pontos: [['0', '0', '0'], ['100', '0', '0'], ['100', '100', '0']], raios: ['5', '5'] };
    const f = comCorpos(corpo('c1', { tipo: 'varredura', perfil: { tipo: 'circulo', diametro: '10' }, caminho }));
    expect(achar(f, 'faixa', 'corpos[c1].forma.caminho.raios')).toHaveLength(1);
  });

  it('faixa: ângulo de revolução fora de (0, 360]', () => {
    const perfil = { tipo: 'poligono', pontos: [['1', '0'], ['2', '0'], ['2', '1']] };
    const f = comCorpos(corpo('c1', { tipo: 'revolucao', perfil, angulo: '400' }));
    expect(achar(f, 'faixa', 'corpos[c1].forma.angulo')).toHaveLength(1);
  });

  it('faixa: revolução com u < 0 em polígono literal', () => {
    const perfil = { tipo: 'poligono', pontos: [['-1', '0'], ['2', '0'], ['2', '1']] };
    const f = comCorpos(corpo('c1', { tipo: 'revolucao', perfil, angulo: '360' }));
    expect(achar(f, 'faixa', 'corpos[c1].forma.perfil.pontos[0][0]')).toHaveLength(1);
  });

  it('tipo: transição não aceita perfil com furos', () => {
    const forma = {
      tipo: 'transicao',
      perfilA: { tipo: 'anel', diametroExterno: '20', diametroInterno: '10' },
      perfilB: { tipo: 'circulo', diametro: '12' },
      comprimento: 'L',
    };
    expect(achar(comCorpos(corpo('c1', forma)), 'tipo', 'corpos[c1].forma.perfilA')).toHaveLength(1);
  });

  it('formula: expressão que não compila', () => {
    const f = comCorpos(circulo('c1', { quando: 'L +' }));
    expect(achar(f, 'formula', 'corpos[c1].quando')).toHaveLength(1);
    const comprimento = corpo('c1', extrusao({ tipo: 'circulo', diametro: '20' }, { comprimento: 'L +' }));
    expect(achar(comCorpos(comprimento), 'formula', 'corpos[c1].forma.comprimento')).toHaveLength(1);
  });

  it('referencia: nome que não existe no escopo', () => {
    const f = comCorpos(corpo('c1', extrusao({ tipo: 'circulo', diametro: 'Zz * 2' })));
    expect(achar(f, 'referencia', 'corpos[c1].forma.perfil.diametro')).toHaveLength(1);
  });

  it('referencia: i e n só valem quando o corpo tem repetir, e nunca no próprio repetir', () => {
    const semRepetir = comCorpos(circulo('c1', { quando: 'i > 0' }));
    expect(achar(semRepetir, 'referencia', 'corpos[c1].quando')).toHaveLength(1);
    const comRepetir = comCorpos(circulo('c1', { repetir: '3', quando: 'i > 0' }));
    expect(validarFamilia(comRepetir)).toEqual([]);
    const repetirComI = comCorpos(circulo('c1', { repetir: 'i' }));
    expect(achar(repetirComI, 'referencia', 'corpos[c1].repetir')).toHaveLength(1);
  });

  it('a ordem de avaliação enxerga as fórmulas do corpo (grafo, prefixo corpo:)', () => {
    const f = comCorpos(circulo('c1', { quando: 'A > 0' }));
    const r = ordemDeAvaliacao(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordem).toContain('corpo:c1');
  });
});
