import { describe, expect, it } from 'vitest';
import { casosCamada, esperadoCamada, medir, projetoDaMatriz, type Intervalos } from '../../../tests/termino-camada-matriz.ts';

const arred = (a: Intervalos): number[][] => a.map((i) => i.map((v) => +v.toFixed(5)));

describe('matriz do término por camada (TypeScript): a borda sai das espessuras', () => {
  for (const c of casosCamada()) {
    it(`${c.grupo} ${c.nome}`, () => {
      const m = medir(projetoDaMatriz(c));
      const e = esperadoCamada(c);
      const por = (id: string) => m.find((x) => x.elemento === id)!;
      for (const id of ['lp', 'fp']) {
        expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.perimetroH));
        expect(arred(por(id).vertical), `${id} vertical`).toEqual(arred(e.perimetroV));
      }
      for (const id of ['ls', 'fs']) expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.salaH));
    });
  }
});
