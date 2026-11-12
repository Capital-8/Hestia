import { describe, expect, it } from 'vitest';
import type { CurtainInstance, GridAxisSpec } from '@hestia/model';
import { campoSobrescrito, comGrade, definirCampo, definirValor, eixoEfetivoDe, gradeComEixo, mudarModo, voltarAoTipo } from './curtainGridOverride.ts';

// Eixo do tipo usado nos testes: 4 células, sem deslocamento.
const tipo: GridAxisSpec = { mode: 'fixedNumber', count: 4 };

describe('sobrescrita de eixo: leitura do efetivo (decisão 0056, §4.3)', () => {
  it('a sobrescrita troca só os campos que traz; os demais vêm do tipo', () => {
    expect(eixoEfetivoDe(tipo, { offset: 0.1 })).toEqual({ mode: 'fixedNumber', count: 4, offset: 0.1 });
  });

  it('campo com valor undefined não sobrepõe o tipo', () => {
    expect(eixoEfetivoDe(tipo, { count: undefined })).toEqual({ mode: 'fixedNumber', count: 4 });
  });
});

describe('sobrescrita de eixo: campo sobrescrito e "Voltar ao tipo"', () => {
  it('o valor é o do modo efetivo: sobrescrever a contagem conta, a distância não', () => {
    expect(campoSobrescrito(tipo, { count: 6 }, 'value')).toBe(true);
    expect(campoSobrescrito(tipo, { distance: 1 }, 'value')).toBe(false);
    expect(campoSobrescrito(tipo, undefined, 'value')).toBe(false);
  });

  it('voltar ao tipo no valor tira só o valor do modo efetivo', () => {
    expect(voltarAoTipo(tipo, { count: 6, offset: 0.2 }, 'value')).toEqual({ offset: 0.2 });
  });

  it('voltar ao tipo no modo tira o modo e os valores de outros modos', () => {
    // o tipo é de número de células: a distância sobrescrita não vale mais e sai junto
    expect(voltarAoTipo(tipo, { mode: 'fixedDistance', distance: 1.2, count: 5, offset: 0.1 }, 'mode')).toEqual({ count: 5, offset: 0.1 });
  });

  it('justificação e deslocamento voltam ao tipo sozinhos', () => {
    expect(voltarAoTipo(tipo, { offset: 0.1, justify: 'end' }, 'offset')).toEqual({ justify: 'end' });
    expect(campoSobrescrito(tipo, { justify: 'end' }, 'justify')).toBe(true);
  });
});

describe('sobrescrita de eixo: troca de modo', () => {
  it('voltar ao modo do tipo tira a sobrescrita de modo e de valor; o deslocamento fica', () => {
    expect(mudarModo(tipo, { mode: 'manual', positions: [1], offset: 0.1 }, 'fixedNumber')).toEqual({ offset: 0.1 });
  });

  it('outro modo grava o valor que o eixo já tinha, quando o modo tem esse campo', () => {
    expect(mudarModo(tipo, {}, 'fixedDistance')).toEqual({ mode: 'fixedDistance', distance: 1.2 });
    expect(mudarModo(tipo, {}, 'manual')).toEqual({ mode: 'manual', positions: [] });
  });

  it('a distância que o eixo já tinha passa para a distância máxima; sem ela, vale o padrão', () => {
    expect(mudarModo(tipo, { mode: 'fixedDistance', distance: 0.9 }, 'maxDistance')).toEqual({ mode: 'maxDistance', distance: 0.9 });
    expect(mudarModo(tipo, {}, 'maxDistance')).toEqual({ mode: 'maxDistance', distance: 1.2 });
  });

  it('trocar de modo tira o valor do modo anterior (não fica contagem solta num modo de distância)', () => {
    const r = mudarModo(tipo, { count: 6 }, 'fixedDistance');
    expect(r).toEqual({ mode: 'fixedDistance', distance: 1.2 });
    expect(r).not.toHaveProperty('count');
  });
});

describe('sobrescrita de eixo: gravar valores', () => {
  it('valor por modo: contagem, distância ou posições', () => {
    expect(definirValor({}, 'fixedNumber', 6)).toEqual({ count: 6 });
    expect(definirValor({}, 'maxDistance', 1.5)).toEqual({ distance: 1.5 });
    expect(definirValor({}, 'manual', [2, 10])).toEqual({ positions: [2, 10] });
  });

  it('justificação e deslocamento', () => {
    expect(definirCampo({}, 'justify', 'center')).toEqual({ justify: 'center' });
    expect(definirCampo({ justify: 'end' }, 'offset', 0.25)).toEqual({ justify: 'end', offset: 0.25 });
  });
});

describe('grade da instância: eixos e "sem sobrescrita"', () => {
  it('gravar um eixo mantém o outro', () => {
    expect(gradeComEixo({ v: { offset: 0.1 } }, 'u', { count: 6 })).toEqual({ u: { count: 6 }, v: { offset: 0.1 } });
  });

  it('um eixo sem campos sai da grade; sem eixo nenhum, a grade some', () => {
    expect(gradeComEixo({ u: { count: 6 }, v: { offset: 0.1 } }, 'u', {})).toEqual({ v: { offset: 0.1 } });
    expect(gradeComEixo({ u: { count: 6 } }, 'u', {})).toBeUndefined();
  });

  it('campo undefined não entra na grade gravada', () => {
    expect(gradeComEixo(undefined, 'v', { offset: undefined, count: 3 })).toEqual({ v: { count: 3 } });
  });

  it('comGrade tira a chave quando não há grade e mantém o resto da instância', () => {
    const inst: CurtainInstance = { grid: { u: { count: 6 } }, defaultPanelTypeId: 'pnl_vidro_10' };
    expect(comGrade(inst, undefined)).toEqual({ defaultPanelTypeId: 'pnl_vidro_10' });
    expect(comGrade(inst, { u: { count: 2 } })).toEqual({ grid: { u: { count: 2 } }, defaultPanelTypeId: 'pnl_vidro_10' });
    expect(inst.grid).toEqual({ u: { count: 6 } });
  });
});
