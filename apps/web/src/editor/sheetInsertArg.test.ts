import { describe, expect, it } from 'vitest';
import { decodeInsertArg, encodeInsertArg } from './sheetInsertArg.ts';

describe('argumento da janela Inserir vistas', () => {
  it('id puro ida e volta', () => {
    expect(decodeInsertArg(encodeInsertArg({ sheetId: 'sh_1' }))).toEqual({ sheetId: 'sh_1' });
  });
  it('vista e ponto ida e volta', () => {
    const a = { sheetId: 'sh_1', view: { kind: 'plan' as const, levelId: 'lv_0' }, centre: { x: 120, y: 80 } };
    expect(decodeInsertArg(encodeInsertArg(a))).toEqual(a);
  });
  it('lixo não lança e cai no id', () => {
    expect(decodeInsertArg('{quebrado')).toEqual({ sheetId: '{quebrado' });
    expect(decodeInsertArg('{"sheetId":3}').sheetId).toBe('{"sheetId":3}');
    expect(decodeInsertArg('{"sheetId":"a","centre":{"x":"1","y":2}}')).toEqual({ sheetId: 'a' });
  });
});
