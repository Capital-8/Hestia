import { FAMILIA_ARMARIO, type Peca, type Usinagem } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  FACES_DE_BORDA,
  ROTULO_FACE,
  ROTULO_TIPO_USINAGEM,
  TIPOS_USINAGEM,
  ehBorda,
  facesDisponiveis,
  resumoUsinagem,
  rotulosDaFace,
  usinagemPadrao,
  validarUsinagem,
} from './familiaUsinagem.ts';

const peca = (): Peca => {
  const p = structuredClone(FAMILIA_ARMARIO).pecas.find((x) => x.id === 'latE')!;
  delete p.usinagens;
  return p;
};

const furo = (): Usinagem => ({
  id: 'furo',
  tipo: 'furo',
  face: 'a',
  posicao: ['L / 2', 'A / 2'],
  diametro: '8',
  profundidade: 'passante',
});

const rasgo = (): Usinagem => ({
  id: 'rasgo',
  tipo: 'rasgo',
  face: 'a',
  posicao: ['10', '10'],
  largura: '50',
  comprimento: '20',
  profundidade: '10',
});

describe('rótulos e faces', () => {
  it('rótulos de tipo e face em português', () => {
    expect(TIPOS_USINAGEM.map((t) => ROTULO_TIPO_USINAGEM[t])).toEqual(['Furo', 'Rasgo', 'Recorte']);
    expect(ROTULO_FACE.a).toBe('Face A');
    expect(ROTULO_FACE.n).toBe('Borda norte');
    expect(ROTULO_FACE.o).toBe('Borda oeste');
    expect(FACES_DE_BORDA).toEqual(['n', 's', 'l', 'o']);
    expect(FACES_DE_BORDA.every(ehBorda)).toBe(true);
    expect(ehBorda('a')).toBe(false);
    expect(ehBorda('b')).toBe(false);
  });

  it('furo aceita todas as faces; rasgo e recorte só A e B', () => {
    expect(facesDisponiveis('furo')).toEqual(['a', 'b', 'n', 's', 'l', 'o']);
    expect(facesDisponiveis('rasgo')).toEqual(['a', 'b']);
    expect(facesDisponiveis('recorte')).toEqual(['a', 'b']);
  });

  it('rótulos da posição mudam com o tipo e a borda', () => {
    expect(rotulosDaFace('furo', 'a')).toEqual(['Centro (u)', 'Centro (v)']);
    expect(rotulosDaFace('furo', 'b')).toEqual(['Centro (u)', 'Centro (v)']);
    expect(rotulosDaFace('furo', 'n')).toEqual(['Ao longo da borda', 'Distância da face A']);
    expect(rotulosDaFace('rasgo', 'a')).toEqual(['Canto mínimo (u)', 'Canto mínimo (v)']);
    expect(rotulosDaFace('recorte', 'b')).toEqual(['Canto mínimo (u)', 'Canto mínimo (v)']);
  });
});

describe('usinagemPadrao', () => {
  it('furo: diâmetro 8, passante e id único', () => {
    const u = usinagemPadrao('furo', 'a');
    expect(u).toMatchObject({ id: 'furo', tipo: 'furo', face: 'a', posicao: ['0', '0'], diametro: '8', profundidade: 'passante' });
    expect(usinagemPadrao('furo', 'n', ['furo']).id).toBe('furo_2');
    expect(usinagemPadrao('furo', 'n').face).toBe('n');
  });

  it('rasgo e recorte: largura e comprimento; borda vira face A', () => {
    const r = usinagemPadrao('rasgo', 'n');
    expect(r).toMatchObject({ id: 'rasgo', tipo: 'rasgo', face: 'a', largura: '50', comprimento: '20', profundidade: 'passante' });
    expect(r.diametro).toBeUndefined();
    expect(usinagemPadrao('recorte', 'b', ['recorte']).id).toBe('recorte_2');
    expect(usinagemPadrao('recorte', 'b').face).toBe('b');
  });
});

describe('validarUsinagem', () => {
  it('aceita usinagens completas', () => {
    const p = peca();
    expect(validarUsinagem(p, furo())).toBeNull();
    expect(validarUsinagem(p, rasgo())).toBeNull();
    expect(validarUsinagem(p, usinagemPadrao('furo', 's'))).toBeNull();
  });

  it('recusa id vazio e id repetido, liberando o original ao editar', () => {
    const p = peca();
    expect(validarUsinagem(p, { ...furo(), id: '  ' })).toMatch(/id da usinagem/);
    p.usinagens = [{ ...furo(), id: 'x' }];
    expect(validarUsinagem(p, { ...furo(), id: 'x' })).toMatch(/já existe uma usinagem “x”/);
    expect(validarUsinagem(p, { ...furo(), id: 'x' }, 'x')).toBeNull();
    expect(validarUsinagem(p, { ...furo(), id: 'y' })).toBeNull();
  });

  it('recusa rasgo/recorte em borda', () => {
    const p = peca();
    expect(validarUsinagem(p, { ...rasgo(), face: 'n' })).toMatch(/faces A ou B/);
    expect(validarUsinagem(p, { ...rasgo(), face: 'b' })).toBeNull();
  });

  it('exige diâmetro no furo e largura/comprimento no rasgo', () => {
    const p = peca();
    expect(validarUsinagem(p, { ...furo(), diametro: '' })).toMatch(/diâmetro/);
    expect(validarUsinagem(p, { ...furo(), diametro: undefined })).toMatch(/diâmetro/);
    expect(validarUsinagem(p, { ...rasgo(), largura: '' })).toMatch(/largura/);
    expect(validarUsinagem(p, { ...rasgo(), comprimento: undefined })).toMatch(/comprimento/);
  });

  it('exige posição e profundidade quando não é passante', () => {
    const p = peca();
    expect(validarUsinagem(p, { ...furo(), posicao: ['', 'A / 2'] })).toMatch(/posição u/);
    expect(validarUsinagem(p, { ...furo(), posicao: ['L / 2', ''] })).toMatch(/posição v/);
    expect(validarUsinagem(p, { ...furo(), profundidade: '' })).toMatch(/profundidade/);
    expect(validarUsinagem(p, { ...furo(), profundidade: '10' })).toBeNull();
  });

  it('recusa fórmula que não compila nos obrigatórios e nos opcionais', () => {
    const p = peca();
    expect(validarUsinagem(p, { ...furo(), diametro: '1 +' })).toMatch(/fórmula de diâmetro/);
    expect(validarUsinagem(p, { ...furo(), posicao: ['L /', 'A / 2'] })).toMatch(/fórmula de posição u/);
    expect(validarUsinagem(p, { ...furo(), quantidade: '1 +' })).toMatch(/quantidade/);
    expect(validarUsinagem(p, { ...furo(), quando: 'L >' })).toMatch(/existe se/);
    expect(validarUsinagem(p, { ...furo(), quantidade: '', quando: '  ' })).toBeNull();
  });
});

describe('resumoUsinagem', () => {
  it('furo mostra diâmetro e profundidade; rasgo mostra as duas medidas', () => {
    expect(resumoUsinagem(furo())).toBe('Ø 8 · passante');
    expect(resumoUsinagem({ ...furo(), diametro: '', profundidade: '10' })).toBe('Ø — · 10');
    expect(resumoUsinagem({ ...furo(), profundidade: 'passante' })).toBe('Ø 8 · passante');
    expect(resumoUsinagem(rasgo())).toBe('50 × 20');
    expect(resumoUsinagem({ ...rasgo(), largura: '', comprimento: '' })).toBe('— × —');
  });
});
