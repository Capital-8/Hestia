import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { definirGerenciadorDaEstrutura } from '@hestia/engine';
import { perfilContorno } from '../ui/dialogs/perfilContorno.ts';
import { leituraEstr } from '../ui/estrLeitura.ts';
import { contornoParaUi, leituraParaUi, ligarEstrutura } from './estrLigacao.ts';

afterEach(() => definirGerenciadorDaEstrutura(() => null));

describe('ligarEstrutura', () => {
  it('sem kernel as duas funções da U1 seguem devolvendo null (nada de TypeScript no lugar)', () => {
    definirGerenciadorDaEstrutura(() => null);
    ligarEstrutura(() => createEmptyProject());
    expect(perfilContorno({ forma: 'retangular', b: 0.2, h: 0.4 })).toBeNull();
    expect(leituraEstr('p1')).toBeNull();
  });

  it('traduz o contorno e a leitura do adaptador para os tipos da interface', () => {
    expect(contornoParaUi(null)).toBeNull();
    const c = contornoParaUi({ anel: [[0, 0], [1, 0], [1, 1]], furos: [], area: 0.5, perimetro: 3.4 });
    expect(c).toEqual({ anel: [[0, 0], [1, 0], [1, 1]], furos: [] });
    expect(leituraParaUi(null)).toBeNull();
    expect(leituraParaUi({ volume: 0.24, areaForma: 3.6, comprimento: 3, areaSecao: 0.08 })).toEqual({ volume: 0.24, areaForma: 3.6, comprimento: 3 });
    expect(leituraParaUi({ volume: 1, areaForma: 2, comprimento: 3, areaSecao: 4, peso: 100 })).toMatchObject({ peso: 100 });
  });
});
