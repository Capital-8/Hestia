import { describe, expect, it } from 'vitest';
import { alinhar8, bytesDaColuna, bytesDaSecao, codificarSecao, definicaoDaSecao, escreverSecao, lerSaida, lerSecao } from './codec.ts';
import { colunasDeParedes, paredesDeTeste } from './paredes.ts';

const def = definicaoDaSecao('paredes');

describe('codec do kernel v2', () => {
  it('preenche cada coluna até múltiplo de 8 bytes', () => {
    expect(alinhar8(0)).toBe(0);
    expect(alinhar8(1)).toBe(8);
    expect(alinhar8(8)).toBe(8);
    expect(alinhar8(9)).toBe(16);
    expect(bytesDaColuna('u32', 3)).toBe(16); // 12 -> 16
    expect(bytesDaColuna('u32', 2)).toBe(8);
    expect(bytesDaColuna('u8', 5)).toBe(8);
    expect(bytesDaColuna('f64', 3)).toBe(24);
    // 2 colunas u32 (n=3) + 5 colunas f64 (n=3)
    expect(bytesDaSecao(def, 3)).toBe(2 * 16 + 5 * 24);
    expect(bytesDaSecao(def, 0)).toBe(0);
  });

  it('escreve column-major na ordem do esquema', () => {
    const ps = paredesDeTeste(1, 3);
    const bytes = codificarSecao(def, colunasDeParedes(ps), 3);
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(0, true)).toBe(ps[0]!.id);
    expect(dv.getUint32(8, true)).toBe(ps[2]!.id);
    expect(dv.getUint32(16, true)).toBe(ps[0]!.nivel); // coluna 2 começa em 16
    expect(dv.getFloat64(32, true)).toBe(ps[0]!.ax); // coluna 3 começa em 32
    expect(dv.getFloat64(32 + 8, true)).toBe(ps[1]!.ax);
  });

  it('ida e volta preserva os valores e o preenchimento fica zerado', () => {
    for (const n of [0, 1, 2, 3, 7, 100]) {
      const ps = paredesDeTeste(1, n);
      const bytes = codificarSecao(def, colunasDeParedes(ps), n);
      expect(bytes.byteLength % 8).toBe(0);
      const lido = lerSecao(bytes.buffer as ArrayBuffer, 0, def, n);
      expect(Array.from(lido.id_num!)).toEqual(ps.map((p) => p.id));
      expect(Array.from(lido.espessura!)).toEqual(ps.map((p) => p.espessura));
      expect(lido.ax).toBeInstanceOf(Float64Array);
      expect(lido.nivel_num).toBeInstanceOf(Uint32Array);
    }
    const b = codificarSecao(def, colunasDeParedes(paredesDeTeste(1, 1)), 1);
    expect(Array.from(b.subarray(4, 8))).toEqual([0, 0, 0, 0]); // padding da 1ª coluna
  });

  it('escreve em offset alinhado de um buffer maior e rejeita desalinhado/coluna errada', () => {
    const buf = new ArrayBuffer(1024);
    const ps = paredesDeTeste(1, 4);
    const n = escreverSecao(buf, 64, def, colunasDeParedes(ps), 4);
    expect(n).toBe(bytesDaSecao(def, 4));
    expect(Array.from(lerSecao(buf, 64, def, 4).id_num!)).toEqual(ps.map((p) => p.id));
    expect(() => escreverSecao(buf, 4, def, colunasDeParedes(ps), 4)).toThrow(RangeError);
    expect(() => escreverSecao(buf, 0, def, colunasDeParedes(ps), 5)).toThrow(/valores/);
    const { ax: _ax, ...semAx } = colunasDeParedes(ps) as Record<string, ArrayLike<number>>;
    expect(() => escreverSecao(buf, 0, def, semAx, 4)).toThrow(/ausente/);
  });

  it('lê saídas por código de tipo e devolve cópia', () => {
    const buf = new ArrayBuffer(64);
    new Uint32Array(buf, 8, 3).set([5, 6, 7]);
    new Float64Array(buf, 24, 2).set([1.5, -2]);
    new Int32Array(buf, 40, 2).set([-1, 9]);
    new Uint8Array(buf, 48, 3).set([1, 2, 3]);
    const u = lerSaida(buf, 1, 8, 3);
    expect(u).toBeInstanceOf(Uint32Array);
    expect(Array.from(u)).toEqual([5, 6, 7]);
    expect(Array.from(lerSaida(buf, 3, 24, 2))).toEqual([1.5, -2]);
    expect(Array.from(lerSaida(buf, 2, 40, 2))).toEqual([-1, 9]);
    expect(Array.from(lerSaida(buf, 4, 48, 3))).toEqual([1, 2, 3]);
    u[0] = 99;
    expect(new Uint32Array(buf, 8, 1)[0]).toBe(5); // cópia
    expect(lerSaida(buf, 1, 0, 0).length).toBe(0);
    expect(() => lerSaida(buf, 9, 0, 1)).toThrow(/tipo/);
    expect(() => lerSaida(buf, 3, 4, 1)).toThrow(/desalinhado/);
    expect(() => lerSaida(buf, 1, 60, 8)).toThrow(/fora da memória/);
  });
});
