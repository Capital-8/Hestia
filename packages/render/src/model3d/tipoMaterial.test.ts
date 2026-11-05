import { describe, expect, it } from 'vitest';
import { tipoProceduralDoElemento } from './tipoMaterial.ts';

describe('tipoProceduralDoElemento', () => {
  it('parede e wall dão reboco (1)', () => {
    expect(tipoProceduralDoElemento('parede')).toEqual({ tipo: 1, escala: 1.0 });
    expect(tipoProceduralDoElemento('wall')).toEqual({ tipo: 1, escala: 1.0 });
  });

  it('telha e roof dão telha (3)', () => {
    expect(tipoProceduralDoElemento('telha')).toEqual({ tipo: 3, escala: 1.0 });
    expect(tipoProceduralDoElemento('roof')).toEqual({ tipo: 3, escala: 1.0 });
  });

  it('piso, floor, laje e slab dão piso (4)', () => {
    for (const kind of ['piso', 'floor', 'laje', 'slab']) {
      expect(tipoProceduralDoElemento(kind)).toEqual({ tipo: 4, escala: 1.0 });
    }
  });

  it('porta e door dão madeira (2)', () => {
    expect(tipoProceduralDoElemento('porta')).toEqual({ tipo: 2, escala: 1.0 });
    expect(tipoProceduralDoElemento('door')).toEqual({ tipo: 2, escala: 1.0 });
  });

  it('janela, window, vidro e glass dão vidro (6)', () => {
    for (const kind of ['janela', 'window', 'vidro', 'glass']) {
      expect(tipoProceduralDoElemento(kind)).toEqual({ tipo: 6, escala: 1.0 });
    }
  });

  it('chaminé e chimney dão tijolo (7)', () => {
    expect(tipoProceduralDoElemento('chaminé')).toEqual({ tipo: 7, escala: 1.0 });
    expect(tipoProceduralDoElemento('chimney')).toEqual({ tipo: 7, escala: 1.0 });
  });

  it('metal e esquadria metálica dão metal (5)', () => {
    expect(tipoProceduralDoElemento('metal')).toEqual({ tipo: 5, escala: 1.0 });
    expect(tipoProceduralDoElemento('esquadria metálica')).toEqual({ tipo: 5, escala: 1.0 });
    expect(tipoProceduralDoElemento('esquadria metalica')).toEqual({ tipo: 5, escala: 1.0 });
  });

  it('ignora caixa, espaços e acento nas pontas', () => {
    expect(tipoProceduralDoElemento('  Parede ')).toEqual({ tipo: 1, escala: 1.0 });
    expect(tipoProceduralDoElemento('WALL')).toEqual({ tipo: 1, escala: 1.0 });
    expect(tipoProceduralDoElemento('Chaminé')).toEqual({ tipo: 7, escala: 1.0 });
  });

  it('categorias sem regra e nomes desconhecidos dão liso (0)', () => {
    for (const kind of ['stair', 'room', 'annotation', 'generic', 'escada', 'xyz', '']) {
      expect(tipoProceduralDoElemento(kind)).toEqual({ tipo: 0, escala: 1.0 });
    }
  });

  it('sem nome dá liso (0)', () => {
    expect(tipoProceduralDoElemento(undefined)).toEqual({ tipo: 0, escala: 1.0 });
  });
});
