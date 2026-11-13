import { describe, expect, it } from 'vitest';
import { FORMAS_DE_PERFIL, PERFIS_CATALOGO, validarPerfil, type PerfilForma } from '@hestia/model';
import { CORRIDA, ESTACA, ISOLADA, PARAMETROS_DA_FORMA, aneloRetangular, camposDaForma, comParametro, dimensoesDe, formasDaBase, furosParaTexto, parametroDe, perfilParaForma, textoParaFuros, textoParaVertices, verticesParaTexto } from './perfilForm.ts';

/** Um perfil de cada forma, válido (os mesmos do catálogo e um personalizado em L). */
const EXEMPLOS: Record<string, PerfilForma> = {
  retangular: { forma: 'retangular', b: 0.2, h: 0.4 },
  circular: { forma: 'circular', d: 0.3 },
  L: { forma: 'L', b: 0.1, h: 0.1, tf: 0.01 },
  T: { forma: 'T', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 },
  I: { forma: 'I', b: 0.1, h: 0.2, tf: 0.008, tw: 0.005 },
  U: { forma: 'U', b: 0.05, h: 0.1, tf: 0.0085, tw: 0.006 },
  tuboRetangular: { forma: 'tuboRetangular', b: 0.1, h: 0.1, t: 0.005 },
  tuboCircular: { forma: 'tuboCircular', d: 0.1143, t: 0.0045 },
  personalizado: { forma: 'personalizado', anel: [[0, 0], [0.2, 0], [0.2, 0.05], [0.05, 0.05], [0.05, 0.3], [0, 0.3]] },
};

describe('perfilForm: campos de cada forma', () => {
  it('cada uma das 9 formas declara os parâmetros que pede (e só esses existem no perfil)', () => {
    expect(Object.keys(PARAMETROS_DA_FORMA).sort()).toEqual([...FORMAS_DE_PERFIL].sort());
    for (const forma of FORMAS_DE_PERFIL) {
      const perfil = EXEMPLOS[forma]!;
      for (const nome of camposDaForma(forma)) expect(parametroDe(perfil, nome), `${forma}.${nome}`).toBeGreaterThan(0);
      const numericos = Object.keys(perfil).filter((k) => k !== 'forma' && typeof (perfil as unknown as Record<string, unknown>)[k] === 'number');
      expect(numericos.sort(), forma).toEqual([...camposDaForma(forma)].sort());
    }
  });

  it('comParametro troca só o parâmetro pedido e não toca o personalizado', () => {
    expect(comParametro(EXEMPLOS['I']!, 'tf', 0.01)).toEqual({ ...EXEMPLOS['I'], tf: 0.01 });
    expect(comParametro(EXEMPLOS['personalizado']!, 'b', 1)).toBe(EXEMPLOS['personalizado']);
  });
});

describe('perfilParaForma: troca de forma completa valores válidos', () => {
  it('de qualquer forma para qualquer forma o perfil resultante passa em validarPerfil e tem a forma pedida', () => {
    for (const de of FORMAS_DE_PERFIL) {
      for (const para of FORMAS_DE_PERFIL) {
        const novo = perfilParaForma(EXEMPLOS[de]!, para);
        expect(novo.forma).toBe(para);
        expect(validarPerfil(novo), `${de} -> ${para}`).toBeNull();
      }
    }
  });

  it('o resultado traz exatamente os parâmetros que a nova forma pede', () => {
    for (const para of FORMAS_DE_PERFIL) {
      const novo = perfilParaForma(EXEMPLOS['retangular']!, para);
      const numericos = Object.keys(novo).filter((k) => k !== 'forma' && typeof (novo as unknown as Record<string, unknown>)[k] === 'number');
      expect(numericos.sort(), para).toEqual([...camposDaForma(para)].sort());
    }
  });

  it('carrega o tamanho e mantém as espessuras que a nova forma também usa', () => {
    expect(perfilParaForma({ forma: 'retangular', b: 0.2, h: 0.4 }, 'I')).toMatchObject({ forma: 'I', b: 0.2, h: 0.4 });
    expect(perfilParaForma(EXEMPLOS['I']!, 'T')).toMatchObject({ forma: 'T', b: 0.1, h: 0.2, tf: 0.008, tw: 0.005 });
    expect(perfilParaForma({ forma: 'tuboRetangular', b: 0.1, h: 0.1, t: 0.005 }, 'L')).toMatchObject({ forma: 'L', tf: 0.005 });
    expect(perfilParaForma({ forma: 'retangular', b: 0.2, h: 0.4 }, 'circular')).toEqual({ forma: 'circular', d: 0.2 });
  });

  it('a mesma forma devolve o próprio perfil; personalizado vira a semente retangular da caixa', () => {
    expect(perfilParaForma(EXEMPLOS['I']!, 'I')).toBe(EXEMPLOS['I']);
    expect(perfilParaForma({ forma: 'retangular', b: 0.2, h: 0.4 }, 'personalizado')).toEqual({ forma: 'personalizado', anel: aneloRetangular(0.2, 0.4) });
    expect(dimensoesDe(EXEMPLOS['personalizado']!)).toEqual({ b: 0.2, h: 0.3 });
  });

  it('espessura herdada que não cabe na nova forma cai nas proporções padrão (continua válido)', () => {
    const grosso: PerfilForma = { forma: 'tuboRetangular', b: 0.05, h: 0.05, t: 0.02 };
    for (const para of FORMAS_DE_PERFIL) expect(validarPerfil(perfilParaForma(grosso, para)), para).toBeNull();
  });

  it('todo preset do catálogo vira qualquer outra forma com perfil válido', () => {
    for (const preset of PERFIS_CATALOGO) {
      for (const para of FORMAS_DE_PERFIL) expect(validarPerfil(perfilParaForma(preset.perfil, para)), `${preset.id} -> ${para}`).toBeNull();
    }
  });
});

describe('perfilForm: texto dos vértices', () => {
  it('ida e volta de vértices e de furos', () => {
    const anel = aneloRetangular(0.2, 0.4);
    expect(textoParaVertices(verticesParaTexto(anel))).toEqual(anel);
    const furos = [aneloRetangular(0.05, 0.05)];
    expect(textoParaFuros(furosParaTexto(furos))).toEqual(furos);
    expect(textoParaFuros(furosParaTexto(undefined))).toEqual([]);
  });

  it('aceita vírgula decimal e espaço como separador; recusa linha malformada', () => {
    expect(textoParaVertices('0,1; 0,2\n0.3 0.4')).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(textoParaVertices('1; x')).toBeNull();
    expect(textoParaVertices('1; 2; 3')).toBeNull();
    expect(textoParaVertices('1;')).toBeNull();
    expect(textoParaFuros('0;0\n1;0\n1;1\n\n0;0\nfoo')).toBeNull();
  });
});

describe('perfilForm: formas da base de fundação', () => {
  it('corrida só retangular; estaca circular ou tubo; sapata e bloco isolados livres', () => {
    expect(formasDaBase({ modo: 'corrida', forma: 'sapata' })).toBe(CORRIDA);
    expect(formasDaBase({ modo: 'isolada', forma: 'estaca' })).toBe(ESTACA);
    expect(formasDaBase({ modo: 'isolada', forma: 'bloco' })).toBe(ISOLADA);
  });
});
