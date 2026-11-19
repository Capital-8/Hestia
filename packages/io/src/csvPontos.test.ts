import { describe, expect, it } from 'vitest';
import pontosCsv from '../../../tests/fixtures/terreno/pontos.csv?raw';
import { detectarSeparadorCsv, lerCsvPontos, type SeparadorCsv } from './csvPontos.ts';

const linhas = ['1;2;3', '4;5;6.5', '7;8;9'];
const esperado = [1, 2, 3, 4, 5, 6.5, 7, 8, 9];

describe('lerCsvPontos: separadores', () => {
  const casos: Array<[string, SeparadorCsv]> = [[';', ';'], [',', ','], ['\t', '\t'], [' ', ' ']];
  it.each(casos)('detecta o separador %j', (s, esperadoSep) => {
    const texto = linhas.map((l) => l.split(';').join(s)).join('\n');
    const r = lerCsvPontos(texto);
    expect(r.separador).toBe(esperadoSep);
    expect(r.pontos).toEqual(esperado);
    expect(r.invalidas).toBe(0);
  });

  it('aceita CRLF, BOM, linhas vazias e espaços repetidos', () => {
    const r = lerCsvPontos('﻿1   2\t3\r\n\r\n  4 5   6  \r\n');
    expect(r.separador).toBe(' ');
    expect(r.pontos).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('respeita o separador pedido', () => {
    const r = lerCsvPontos('1,5;2,5;3,5', { separador: ';' });
    expect(r.pontos).toEqual([1.5, 2.5, 3.5]);
  });
});

describe('lerCsvPontos: vírgula decimal', () => {
  it('detecta vírgula decimal com ponto e vírgula, tabulação ou espaço', () => {
    for (const s of [';', '\t', ' ']) {
      const r = lerCsvPontos(['1,5', '2,25', '3,75'].join(s));
      expect(r.separador).toBe(s);
      expect(r.virgulaDecimal).toBe(true);
      expect(r.pontos).toEqual([1.5, 2.25, 3.75]);
    }
  });

  it('com vírgula como separador o ponto é o decimal e a vírgula decimal é inválida', () => {
    const r = lerCsvPontos('1.5,2.5,3.5\n1,5,2,5,3,5');
    expect(r.separador).toBe(',');
    expect(r.virgulaDecimal).toBe(false);
    expect(r.pontos).toEqual([1.5, 2.5, 3.5, 1, 5, 2]);
  });
});

describe('lerCsvPontos: cabeçalho, ordem e linhas inválidas', () => {
  it('descarta o cabeçalho e o conta', () => {
    const r = lerCsvPontos('x;y;z\n1;2;3');
    expect(r.cabecalho).toBe(true);
    expect(r.ordem).toBe('xyz');
    expect(r.linhas).toBe(1);
    expect(r.pontos).toEqual([1, 2, 3]);
  });

  it('sem cabeçalho a primeira linha é dado', () => {
    const r = lerCsvPontos('1;2;3');
    expect(r.cabecalho).toBe(false);
    expect(r.linhas).toBe(1);
  });

  it('ordem n e z: norte, leste, cota viram x = leste e y = norte', () => {
    const r = lerCsvPontos('1;2;3\n4;5;6', { ordem: 'nez' });
    expect(r.pontos).toEqual([2, 1, 3, 5, 4, 6]);
  });

  it('o cabeçalho com N na primeira coluna indica a ordem nez, e a ordem pedida vale mais', () => {
    expect(lerCsvPontos('N;E;Z\n1;2;3').ordem).toBe('nez');
    expect(lerCsvPontos('Norte;Leste;Cota\n1;2;3').pontos).toEqual([2, 1, 3]);
    expect(lerCsvPontos('N;E;Z\n1;2;3', { ordem: 'xyz' }).pontos).toEqual([1, 2, 3]);
  });

  it('conta e pula as linhas inválidas; colunas além da terceira são ignoradas', () => {
    const r = lerCsvPontos('1;2;3;P1\nabc;2;3\n4;5\n6;7;8\n;;\n9;10;x');
    expect(r.pontos).toEqual([1, 2, 3, 6, 7, 8]);
    expect(r.linhas).toBe(6);
    expect(r.invalidas).toBe(4);
  });

  it('calcula a faixa de cota e devolve vazio para texto vazio', () => {
    const r = lerCsvPontos('1;2;5\n1;2;-3\n1;2;9');
    expect([r.zMin, r.zMax]).toEqual([-3, 9]);
    const v = lerCsvPontos('');
    expect(v.pontos).toEqual([]);
    expect(v.zMin).toBeNull();
    expect(detectarSeparadorCsv([])).toBe(';');
  });
});

describe('pontos.csv', () => {
  it('lê o arquivo de exemplo: cabeçalho, vírgula decimal, linhas inválidas puladas', () => {
    const r = lerCsvPontos(pontosCsv);
    expect(r.separador).toBe(';');
    expect(r.cabecalho).toBe(true);
    expect(r.virgulaDecimal).toBe(true);
    expect(r.ordem).toBe('xyz');
    expect(r.linhas).toBe(10);
    expect(r.invalidas).toBe(2);
    expect(r.pontos).toHaveLength(24);
    expect(r.pontos.slice(0, 3)).toEqual([1000.5, 2000.25, 100.5]);
    expect([r.zMin, r.zMax]).toEqual([100.5, 108.5]);
  });
});
